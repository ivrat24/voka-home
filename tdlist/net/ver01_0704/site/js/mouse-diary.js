import { escapeHtml } from "./layout.js";
import {
  ANNOUNCE_CATEGORY,
  MOOD_CATEGORY,
  MOOD_MAX_LENGTH,
  PLAN_CATEGORY,
  TODO_CATEGORY,
  TODO_TYPES,
  TODO_VISIBLE_LIMIT,
  createMemo,
  createMoodSticker,
  defaultPlannedInputValue,
  defaultTodoDateValue,
  deleteMemo,
  detectDiaryStorage,
  exportEditorAnnouncementsToReader,
  fromDateInputValue,
  fromDatetimeLocalValue,
  getDiaryStorageMode,
  listAnnouncements,
  listMemos,
  listMoods,
  listPlans,
  listTodos,
  setMoodFeatured,
  storageModeLabel,
  toDateInputValue,
  toDatetimeLocalValue,
  updateMemo,
} from "./mouse-diary-api.js";
import { canEditNotes } from "./runtime.js";

/** @type {SpeechRecognition | null} */
let recognition = null;
let micOn = false;
let interimText = "";
let speechBase = "";
let speechFinal = "";
let interimCommitTimer = null;
let micRestartTimer = null;
let speechWatchdogTimer = null;
let speechGotResult = false;
/** @type {object | null} */
let editingMemo = null;
/** @type {object | null} */
let editingPlan = null;
/** @type {object | null} */
let editingTodo = null;
/** @type {object | null} */
let editingAnnounce = null;
/** @type {object | null} */
let editingMood = null;

/** @type {object[]} */
let memos = [];
/** @type {object[]} */
let plans = [];
/** @type {object[]} */
let todos = [];
/** @type {object[]} */
let announcements = [];
/** @type {object[]} */
let moods = [];

let filterCategory = "全部";
let activePanel = "tdlist";
let tdlistExpanded = false;

function formatTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function setStatus(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg || "";
}

function switchPanel(panel) {
  activePanel = panel;
  document.querySelectorAll("[data-diary-panel]").forEach((el) => {
    el.hidden = el.dataset.diaryPanel !== panel;
  });
  document.querySelectorAll("[data-diary-tab]").forEach((btn) => {
    const active = btn.dataset.diaryTab === panel;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function renderCard(item, { timeLabel, timeValue, categoryTag }) {
  const preview = (item.content || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const time = formatTime(timeValue);
  return `
    <article class="diary-memo-card${item.favorite ? " is-favorite" : ""}" data-path="${escapeHtml(item.path)}" data-board="${escapeHtml(categoryTag)}">
      <div class="diary-memo-card__head">
        <button type="button" class="diary-fav-btn${item.favorite ? " is-active" : ""}" data-action="favorite" title="${item.favorite ? "取消收藏" : "收藏"}" aria-label="${item.favorite ? "取消收藏" : "收藏"}">★</button>
        <h3 class="diary-memo-card__title">${escapeHtml(item.title || "未命名")}</h3>
        <span class="zone-tag">${escapeHtml(categoryTag)}</span>
      </div>
      <p class="diary-memo-card__preview">${escapeHtml(preview)}${(item.content || "").length > 120 ? "…" : ""}</p>
      <div class="diary-memo-card__foot">
        <time class="muted" title="${escapeHtml(timeLabel)}">${escapeHtml(time)}</time>
        <div class="diary-memo-card__actions">
          <button type="button" class="btn btn-ghost btn-sm" data-action="open">打开</button>
          ${canEditNotes() ? `<button type="button" class="btn btn-ghost btn-sm" data-action="edit">修改</button>` : ""}
          ${canEditNotes() ? `<button type="button" class="btn btn-ghost btn-sm diary-btn-danger" data-action="delete">删除</button>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderList(listEl, items, emptyText, mapItem) {
  if (!listEl) return;
  if (!items.length) {
    listEl.innerHTML = `<p class="diary-empty muted">${escapeHtml(emptyText)}</p>`;
    return;
  }
  listEl.innerHTML = items.map(mapItem).join("");
}

function openDetail(item, { categoryLabel, metaExtra = "" }) {
  const dialog = document.getElementById("diary-detail-dialog");
  const title = document.getElementById("diary-detail-title");
  const meta = document.getElementById("diary-detail-meta");
  const body = document.getElementById("diary-detail-body");
  if (!dialog || !body) return;

  if (title) title.textContent = item.title || "未命名";
  if (meta) {
    meta.innerHTML = `
      <span class="zone-tag">${escapeHtml(categoryLabel)}</span>
      ${item.favorite ? '<span class="diary-fav-badge">★ 已收藏</span>' : ""}
      ${metaExtra}
      <time>更新 ${escapeHtml(formatTime(item.updatedAt || item.createdAt))}</time>
    `;
  }
  body.textContent = item.content || "";
  dialog.showModal();
}

async function handleToggleFavorite(item, refreshFn) {
  if (!canEditNotes()) return;
  try {
    await updateMemo({ path: item.path, favorite: !item.favorite });
    await refreshFn();
  } catch (error) {
    setStatus("diary-status", error.message || "操作失败");
  }
}

async function handleDelete(item, refreshFn, resetFn, statusId = "diary-status") {
  if (!canEditNotes()) return;
  const label = item.title || item.content?.slice(0, 20) || "未命名";
  if (!window.confirm(`确定删除「${label}」？`)) return;
  try {
    await deleteMemo(item.path);
    resetFn?.(item);
    await refreshFn();
    setStatus(statusId, "已删除。");
  } catch (error) {
    setStatus(statusId, error.message || "删除失败");
  }
}

function bindBoardList(listId, getItems, refreshFn, options) {
  const list = document.getElementById(listId);
  if (!list) return;

  list.addEventListener("click", (event) => {
    const card = event.target.closest(".diary-memo-card");
    if (!card) return;
    const path = card.dataset.path;
    const items = getItems();
    const item = items.find((m) => m.path === path);
    if (!item) return;

    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "favorite") {
      void handleToggleFavorite(item, refreshFn);
    } else if (action === "open") {
      const detailOpts = typeof options.detail === "function" ? options.detail(item) : options.detail;
      openDetail(item, detailOpts);
    } else if (action === "edit") {
      options.onEdit(item);
    } else if (action === "delete") {
      void handleDelete(item, refreshFn, options.onDelete);
    }
  });
}

// ── 随手备忘（含语音） ──

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function describeMicEnvironment() {
  if (!getSpeechRecognition()) {
    return "当前浏览器不支持语音识别，请使用 Chrome 或 Edge。";
  }
  if (!window.isSecureContext) {
    return "麦克风无法在双击打开的 file:// 页面使用，请运行 python sync/server.py 后访问 http://127.0.0.1:8765/pages/mouse-diary.html";
  }
  return "";
}

function clearSpeechWatchdog() {
  if (speechWatchdogTimer) {
    window.clearTimeout(speechWatchdogTimer);
    speechWatchdogTimer = null;
  }
}

function startSpeechWatchdog() {
  clearSpeechWatchdog();
  speechGotResult = false;
  speechWatchdogTimer = window.setTimeout(() => {
    speechWatchdogTimer = null;
    if (!micOn || speechGotResult) return;
    setStatus(
      "diary-status",
      "未识别到语音。Chrome/Edge 需联网并使用 Google 云端识别；若网络受限可换 Edge 浏览器或检查麦克风是否被占用。",
    );
  }, 6000);
}

function applySpeechTranscript(transcript, isFinal) {
  const text = transcript.trim();
  if (!text) return;
  speechGotResult = true;
  clearSpeechWatchdog();
  if (isFinal) {
    speechFinal += speechFinal && !speechFinal.endsWith("\n") && !speechFinal.endsWith(" ") ? ` ${text}` : text;
    interimText = "";
    clearInterimCommitTimer();
    setStatus("diary-status", "已录入语音，请继续说话…");
  } else {
    interimText = text;
    scheduleInterimCommit();
    setStatus("diary-status", "正在识别…");
  }
  syncComposerFromSpeech();
  refreshLivePreview();
}

function clearInterimCommitTimer() {
  if (interimCommitTimer) {
    window.clearTimeout(interimCommitTimer);
    interimCommitTimer = null;
  }
}

function clearMicRestartTimer() {
  if (micRestartTimer) {
    window.clearTimeout(micRestartTimer);
    micRestartTimer = null;
  }
}

function commitInterimSpeech() {
  const chunk = interimText.trim();
  if (!chunk) return;
  speechFinal += speechFinal && !speechFinal.endsWith("\n") && !speechFinal.endsWith(" ") ? ` ${chunk}` : chunk;
  interimText = "";
  syncComposerFromSpeech();
}

function scheduleInterimCommit() {
  clearInterimCommitTimer();
  if (!interimText.trim()) return;
  interimCommitTimer = window.setTimeout(() => {
    interimCommitTimer = null;
    commitInterimSpeech();
    refreshLivePreview();
  }, 900);
}

function syncComposerFromSpeech() {
  const textarea = document.getElementById("diary-composer-input");
  if (!textarea) return;
  const next = getComposerText();
  if (textarea.value !== next) {
    textarea.value = next;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function beginSpeechSession() {
  const textarea = document.getElementById("diary-composer-input");
  speechBase = textarea?.value || "";
  speechFinal = "";
  interimText = "";
  clearInterimCommitTimer();
}

function finalizeSpeechSession() {
  commitInterimSpeech();
  const textarea = document.getElementById("diary-composer-input");
  if (textarea) {
    speechBase = textarea.value;
    speechFinal = "";
    interimText = "";
  }
  clearInterimCommitTimer();
}

function setupSpeech() {
  const Ctor = getSpeechRecognition();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "zh-CN";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.onstart = () => {
    setStatus("diary-status", "正在听取，请说话…");
    startSpeechWatchdog();
  };
  rec.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript = result?.[0]?.transcript || "";
      if (!transcript) continue;
      applySpeechTranscript(transcript, Boolean(result.isFinal));
    }
  };
  rec.onspeechstart = () => {
    setStatus("diary-status", "听到声音了，正在识别…");
  };
  rec.onspeechend = () => {
    commitInterimSpeech();
    refreshLivePreview();
  };
  rec.onerror = (event) => {
    const messages = {
      "not-allowed": "麦克风权限被拒绝，请在浏览器地址栏旁允许麦克风。",
      "service-not-allowed": "语音识别不可用，请用 Chrome/Edge 并通过 http://127.0.0.1:8765 访问。",
      "network": "语音识别需要网络（Chrome 使用 Google 云端服务），请检查网络后重试。",
      "audio-capture": "未检测到麦克风设备，或麦克风正被其他程序占用。",
      "aborted": "",
    };
    if (event.error === "no-speech") {
      scheduleInterimCommit();
      return;
    }
    const msg = messages[event.error];
    if (msg) setStatus("diary-status", msg);
    if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "audio-capture" || event.error === "network") {
      stopMic(false);
    }
  };
  rec.onend = () => {
    commitInterimSpeech();
    refreshLivePreview();
    if (!micOn) return;
    // 不在 onend 里自动 start()，否则浏览器会反复弹出麦克风授权
    micOn = false;
    clearSpeechWatchdog();
    updateMicButton();
    setStatus("diary-status", "语音识别已结束。如需继续录入，请再次点击麦克风。");
  };
  return rec;
}

function startRecognition() {
  if (!recognition) recognition = setupSpeech();
  if (!recognition) throw new Error(describeMicEnvironment() || "无法创建语音识别。");
  recognition.start();
}

function appendToComposer(text) {
  const textarea = document.getElementById("diary-composer-input");
  if (!textarea) return;
  if (micOn) {
    speechFinal += speechFinal && !speechFinal.endsWith("\n") && !speechFinal.endsWith(" ") ? ` ${text}` : text;
    syncComposerFromSpeech();
    return;
  }
  const prefix = textarea.value && !textarea.value.endsWith("\n") && !textarea.value.endsWith(" ") ? " " : "";
  textarea.value += `${prefix}${text}`;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function getComposerText() {
  const textarea = document.getElementById("diary-composer-input");
  if (!micOn) return textarea?.value || "";
  const base = `${speechBase}${speechFinal}`;
  if (!interimText) return base;
  const gap = base && !base.endsWith("\n") && !base.endsWith(" ") ? " " : "";
  return `${base}${gap}${interimText}`;
}

function refreshLivePreview() {
  const preview = document.getElementById("diary-live-preview");
  if (!preview) return;
  const text = getComposerText();
  if (!text.trim()) {
    preview.innerHTML = '<p class="diary-preview-placeholder muted">输入文字或开启麦克风，内容将实时显示在这里…</p>';
    return;
  }
  preview.textContent = text;
}

function updateMicButton() {
  const btn = document.getElementById("diary-mic-toggle");
  if (!btn) return;
  btn.classList.toggle("is-active", micOn);
  btn.setAttribute("aria-pressed", micOn ? "true" : "false");
  btn.textContent = micOn ? "🎙 录音中" : "🎤 麦克风";
}

function stopMic(showClosedMessage = true) {
  micOn = false;
  clearMicRestartTimer();
  clearSpeechWatchdog();
  finalizeSpeechSession();
  if (recognition) {
    try {
      recognition.stop();
    } catch {
      /* ignore */
    }
    recognition = null;
  }
  updateMicButton();
  refreshLivePreview();
  if (showClosedMessage) {
    setStatus("diary-status", "麦克风已关闭");
  }
}

function toggleMic() {
  if (micOn) {
    stopMic();
    return;
  }

  const envError = describeMicEnvironment();
  if (envError) {
    setStatus("diary-status", envError);
    return;
  }

  try {
    beginSpeechSession();
    recognition = setupSpeech();
    startRecognition();
    micOn = true;
    updateMicButton();
    setStatus("diary-status", "正在启动语音识别…");
  } catch (error) {
    stopMic(false);
    if (error?.name === "InvalidStateError") {
      setStatus("diary-status", "语音识别正在运行，请稍后再试。");
      return;
    }
    setStatus("diary-status", error?.message || "无法启动麦克风");
  }
}

function resetMemoComposer() {
  document.getElementById("diary-composer-input").value = "";
  document.getElementById("diary-title-input").value = "";
  editingMemo = null;
  stopMic();
  refreshLivePreview();
  document.getElementById("diary-save-btn").textContent = "存入栏目";
  setStatus("diary-status", "");
}

async function handleMemoSave() {
  if (!canEditNotes()) return;
  const content = getComposerText().trim();
  if (!content) {
    setStatus("diary-status", "请先输入内容。");
    return;
  }
  const category = document.getElementById("diary-save-category")?.value || "备忘";
  const title = document.getElementById("diary-title-input")?.value?.trim() || "";
  try {
    if (editingMemo) {
      await updateMemo({ path: editingMemo.path, content, title: title || undefined, category });
      setStatus("diary-status", "已更新备忘。");
    } else {
      await createMemo({ category, content, title: title || undefined });
      setStatus("diary-status", `已存入「${category}」。`);
    }
    resetMemoComposer();
    await refreshMemoList();
  } catch (error) {
    setStatus("diary-status", error.message || "保存失败");
  }
}

function renderMemoList() {
  const filtered = filterCategory === "全部" ? memos : memos.filter((m) => m.category === filterCategory);
  renderList(
    document.getElementById("diary-memo-list"),
    filtered,
    "暂无备忘，在上方输入或说话后存入栏目。",
    (memo) => renderCard(memo, {
      timeLabel: "更新时间",
      timeValue: memo.updatedAt || memo.createdAt,
      categoryTag: memo.category || "备忘",
    }),
  );
}

async function refreshMemoList() {
  try {
    memos = await listMemos();
    renderMemoList();
  } catch (error) {
    const list = document.getElementById("diary-memo-list");
    if (list) list.innerHTML = `<p class="diary-empty muted">加载失败：${escapeHtml(error.message)}</p>`;
  }
}

// ── 更新计划 ──

function resetPlanComposer() {
  document.getElementById("plan-content-input").value = "";
  document.getElementById("plan-title-input").value = "";
  document.getElementById("plan-date-input").value = defaultPlannedInputValue();
  editingPlan = null;
  document.getElementById("plan-save-btn").textContent = "保存计划";
  setStatus("plan-status", "");
}

async function handlePlanSave() {
  if (!canEditNotes()) return;
  const content = document.getElementById("plan-content-input")?.value?.trim();
  const title = document.getElementById("plan-title-input")?.value?.trim() || "";
  const plannedAt = fromDatetimeLocalValue(document.getElementById("plan-date-input")?.value);
  if (!content) {
    setStatus("plan-status", "请填写计划内容。");
    return;
  }
  if (!plannedAt) {
    setStatus("plan-status", "请选择计划时间。");
    return;
  }
  try {
    if (editingPlan) {
      await updateMemo({
        path: editingPlan.path,
        content,
        title: title || undefined,
        category: PLAN_CATEGORY,
        plannedAt,
      });
      setStatus("plan-status", "计划已更新。");
    } else {
      await createMemo({ category: PLAN_CATEGORY, content, title: title || undefined, plannedAt });
      setStatus("plan-status", "计划已保存。");
    }
    resetPlanComposer();
    await refreshPlanList();
  } catch (error) {
    setStatus("plan-status", error.message || "保存失败");
  }
}

function renderPlanList() {
  renderList(
    document.getElementById("plan-list"),
    plans,
    "暂无更新计划，在上方写入未来将要更新的内容。",
    (plan) => renderCard(plan, {
      timeLabel: "计划时间",
      timeValue: plan.plannedAt || plan.updatedAt,
      categoryTag: "计划",
    }),
  );
}

async function refreshPlanList() {
  try {
    plans = await listPlans();
    renderPlanList();
  } catch (error) {
    const list = document.getElementById("plan-list");
    if (list) list.innerHTML = `<p class="diary-empty muted">加载失败：${escapeHtml(error.message)}</p>`;
  }
}

function handlePlanEdit(plan) {
  document.getElementById("plan-content-input").value = plan.content || "";
  document.getElementById("plan-title-input").value = plan.title || "";
  document.getElementById("plan-date-input").value = toDatetimeLocalValue(plan.plannedAt || plan.updatedAt);
  editingPlan = plan;
  document.getElementById("plan-save-btn").textContent = "保存修改";
  switchPanel("plan");
  document.getElementById("diary-panel-plan")?.scrollIntoView({ behavior: "smooth", block: "start" });
  setStatus("plan-status", "正在编辑计划…");
}

// ── tdlist 待办 ──

function formatTodoDate(value) {
  const date = toDateInputValue(value);
  if (!date) return "";
  return date;
}

function resetTodoComposer() {
  document.getElementById("tdlist-content-input").value = "";
  document.getElementById("tdlist-date-input").value = defaultTodoDateValue();
  document.getElementById("tdlist-type-input").value = TODO_TYPES[0];
  editingTodo = null;
  document.getElementById("tdlist-save-btn").textContent = "添加待办";
  setStatus("tdlist-status", "");
}

async function handleTodoSave() {
  if (!canEditNotes()) return;
  const content = document.getElementById("tdlist-content-input")?.value?.trim();
  const plannedAt = fromDateInputValue(document.getElementById("tdlist-date-input")?.value);
  const todoType = document.getElementById("tdlist-type-input")?.value || "";
  if (!plannedAt) {
    setStatus("tdlist-status", "请选择日期。");
    return;
  }
  if (!TODO_TYPES.includes(todoType)) {
    setStatus("tdlist-status", "请选择类型：课程 / 实验室 / 组织 / 生活。");
    return;
  }
  if (!content) {
    setStatus("tdlist-status", "请填写待办事项。");
    return;
  }
  try {
    if (editingTodo) {
      await updateMemo({
        path: editingTodo.path,
        content,
        category: TODO_CATEGORY,
        plannedAt,
        todoType,
      });
      setStatus("tdlist-status", "待办已更新。");
    } else {
      await createMemo({ category: TODO_CATEGORY, content, plannedAt, todoType });
      setStatus("tdlist-status", "待办已添加。");
    }
    resetTodoComposer();
    await refreshTodoList();
  } catch (error) {
    setStatus("tdlist-status", error.message || "保存失败");
  }
}

function renderTodoCard(item) {
  const dateLabel = formatTodoDate(item.plannedAt);
  const typeLabel = item.todoType || "待办";
  return `
    <article class="diary-todo-card" data-path="${escapeHtml(item.path)}">
      <div class="diary-todo-card__main">
        <time class="diary-todo-card__date">${escapeHtml(dateLabel)}</time>
        <span class="diary-todo-card__type zone-tag">${escapeHtml(typeLabel)}</span>
        <p class="diary-todo-card__text">${escapeHtml(item.content || "")}</p>
      </div>
      <div class="diary-todo-card__actions">
        ${canEditNotes() ? `<button type="button" class="btn btn-ghost btn-sm" data-action="edit">修改</button>` : ""}
        ${canEditNotes() ? `<button type="button" class="btn btn-ghost btn-sm diary-btn-danger" data-action="delete">删除</button>` : ""}
      </div>
    </article>
  `;
}

function renderTodoList() {
  const list = document.getElementById("tdlist-list");
  if (!list) return;

  if (!todos.length) {
    list.innerHTML = '<p class="diary-empty muted">暂无待办，在上方填写日期与事项后添加。</p>';
    return;
  }

  const visible = todos.slice(0, TODO_VISIBLE_LIMIT);
  const hidden = todos.slice(TODO_VISIBLE_LIMIT);
  const visibleHtml = visible.map(renderTodoCard).join("");

  let foldHtml = "";
  if (hidden.length) {
    foldHtml = `
      <div class="diary-tdlist-fold${tdlistExpanded ? " is-open" : ""}">
        <button type="button" class="btn btn-ghost diary-tdlist-fold__toggle" id="tdlist-fold-toggle" aria-expanded="${tdlistExpanded ? "true" : "false"}">
          ${tdlistExpanded ? `收起其余 ${hidden.length} 条` : `展开其余 ${hidden.length} 条`}
        </button>
        <div class="diary-tdlist-fold__body" ${tdlistExpanded ? "" : "hidden"}>
          ${hidden.map(renderTodoCard).join("")}
        </div>
      </div>
    `;
  }

  list.innerHTML = `<div class="diary-tdlist__items">${visibleHtml}</div>${foldHtml}`;
}

async function refreshTodoList() {
  try {
    todos = await listTodos();
    if (todos.length <= TODO_VISIBLE_LIMIT) tdlistExpanded = false;
    renderTodoList();
  } catch (error) {
    const list = document.getElementById("tdlist-list");
    if (list) list.innerHTML = `<p class="diary-empty muted">加载失败：${escapeHtml(error.message)}</p>`;
  }
}

function handleTodoEdit(item) {
  document.getElementById("tdlist-content-input").value = item.content || "";
  document.getElementById("tdlist-date-input").value = toDateInputValue(item.plannedAt) || defaultTodoDateValue();
  document.getElementById("tdlist-type-input").value = TODO_TYPES.includes(item.todoType) ? item.todoType : TODO_TYPES[0];
  editingTodo = item;
  document.getElementById("tdlist-save-btn").textContent = "保存修改";
  switchPanel("tdlist");
  document.getElementById("diary-panel-tdlist")?.scrollIntoView({ behavior: "smooth", block: "start" });
  setStatus("tdlist-status", "正在编辑待办…");
}

// ── 更新公告 ──

function resetAnnounceComposer() {
  document.getElementById("announce-content-input").value = "";
  document.getElementById("announce-title-input").value = "";
  editingAnnounce = null;
  document.getElementById("announce-save-btn").textContent = "发布公告";
  setStatus("announce-status", "");
}

async function handleAnnounceSave() {
  if (!canEditNotes()) return;
  const content = document.getElementById("announce-content-input")?.value?.trim();
  const title = document.getElementById("announce-title-input")?.value?.trim() || "";
  if (!content) {
    setStatus("announce-status", "请填写公告内容。");
    return;
  }
  try {
    if (editingAnnounce) {
      await updateMemo({
        path: editingAnnounce.path,
        content,
        title: title || undefined,
        category: ANNOUNCE_CATEGORY,
      });
      setStatus("announce-status", "公告已更新。");
    } else {
      await createMemo({ category: ANNOUNCE_CATEGORY, content, title: title || undefined });
      setStatus("announce-status", "公告已发布，时间已自动记录。");
    }
    resetAnnounceComposer();
    await refreshAnnounceList();
  } catch (error) {
    setStatus("announce-status", error.message || "保存失败");
  }
}

async function handleExportAnnouncements() {
  if (!canEditNotes()) return;
  const statusEl = document.getElementById("export-announce-status");
  const setExportStatus = (message) => {
    if (statusEl) statusEl.textContent = message;
  };

  setExportStatus("正在导出你写的更新公告…");
  try {
    const result = await exportEditorAnnouncementsToReader();
    const titles = (result.announcements || []).map((a) => a.title).filter(Boolean);
    setExportStatus(
      [
        `已覆盖读者端数据（${result.count} 条，精选优先最多 5 条）。`,
        titles.length ? `首页将展示：${titles.join("；")}` : "",
        "请告诉 Agent「已导出」，即可推送到 GitHub。",
      ]
        .filter(Boolean)
        .join(" "),
    );
    await refreshAnnounceList();
  } catch (error) {
    setExportStatus(error.message || "导出失败");
  }
}

function renderAnnounceList() {
  renderList(
    document.getElementById("announce-list"),
    announcements,
    "暂无更新公告，发布后将在首页展示。",
    (item) => renderCard(item, {
      timeLabel: "发布时间",
      timeValue: item.updatedAt || item.createdAt,
      categoryTag: "公告",
    }),
  );
}

async function refreshAnnounceList() {
  try {
    announcements = await listAnnouncements();
    renderAnnounceList();
  } catch (error) {
    const list = document.getElementById("announce-list");
    if (list) list.innerHTML = `<p class="diary-empty muted">加载失败：${escapeHtml(error.message)}</p>`;
  }
}

function handleAnnounceEdit(item) {
  document.getElementById("announce-content-input").value = item.content || "";
  document.getElementById("announce-title-input").value = item.title || "";
  editingAnnounce = item;
  document.getElementById("announce-save-btn").textContent = "保存修改";
  switchPanel("announce");
  document.getElementById("diary-panel-announce")?.scrollIntoView({ behavior: "smooth", block: "start" });
  setStatus("announce-status", "正在编辑公告…");
}

// ── 心情贴 ──

function updateMoodCharCount() {
  const input = document.getElementById("mood-content-input");
  const counter = document.getElementById("mood-char-count");
  if (!input || !counter) return;
  const len = input.value.length;
  counter.textContent = `${len} / ${MOOD_MAX_LENGTH}`;
  counter.classList.toggle("is-limit", len >= MOOD_MAX_LENGTH);
}

function resetMoodComposer() {
  const input = document.getElementById("mood-content-input");
  const featured = document.getElementById("mood-featured-input");
  if (input) input.value = "";
  if (featured) featured.checked = false;
  editingMood = null;
  document.getElementById("mood-save-btn").textContent = "贴一条";
  updateMoodCharCount();
  setStatus("mood-status", "");
}

async function handleMoodSave() {
  if (!canEditNotes()) return;
  const content = document.getElementById("mood-content-input")?.value?.trim() || "";
  const featured = Boolean(document.getElementById("mood-featured-input")?.checked);
  if (!content) {
    setStatus("mood-status", "请写点什么。");
    return;
  }
  if (content.length > MOOD_MAX_LENGTH) {
    setStatus("mood-status", `不能超过 ${MOOD_MAX_LENGTH} 字。`);
    return;
  }
  try {
    if (editingMood) {
      await updateMemo({
        path: editingMood.path,
        content,
        category: MOOD_CATEGORY,
        featured,
      });
      setStatus("mood-status", "心情贴已更新。");
    } else {
      await createMoodSticker({ content, featured });
      setStatus("mood-status", featured ? "已发布并设为事件板展示。" : "心情贴已保存。");
    }
    resetMoodComposer();
    await refreshMoodList();
  } catch (error) {
    setStatus("mood-status", error.message || "保存失败");
  }
}

function renderMoodList() {
  const list = document.getElementById("mood-list");
  if (!list) return;

  if (!moods.length) {
    list.innerHTML = '<p class="diary-empty muted">还没有心情贴，在上方写一句吧。</p>';
    return;
  }

  list.innerHTML = moods
    .map((mood) => {
      const time = formatTime(mood.createdAt || mood.updatedAt);
      return `
        <article class="diary-mood-card${mood.featured ? " is-featured" : ""}" data-path="${escapeHtml(mood.path)}">
          <p class="diary-mood-card__text">${escapeHtml(mood.content || "")}</p>
          <div class="diary-mood-card__foot">
            <time class="muted">${escapeHtml(time)}</time>
            <div class="diary-mood-card__actions">
              ${canEditNotes() ? `<button type="button" class="btn btn-ghost btn-sm diary-mood-pin-btn${mood.featured ? " is-active" : ""}" data-action="feature" title="${mood.featured ? "已在首页展示，点击取消" : "在首页事件板展示"}" aria-label="${mood.featured ? "取消首页展示" : "在首页事件板展示"}">${mood.featured ? "📌 已指定" : "📌 指定"}</button>` : ""}
              ${canEditNotes() ? `<button type="button" class="btn btn-ghost btn-sm" data-action="edit">修改</button>` : ""}
              ${canEditNotes() ? `<button type="button" class="btn btn-ghost btn-sm diary-btn-danger" data-action="delete">删除</button>` : ""}
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

async function refreshMoodList() {
  try {
    moods = await listMoods();
    renderMoodList();
  } catch (error) {
    const list = document.getElementById("mood-list");
    if (list) list.innerHTML = `<p class="diary-empty muted">加载失败：${escapeHtml(error.message)}</p>`;
  }
}

function handleMoodEdit(mood) {
  const input = document.getElementById("mood-content-input");
  const featured = document.getElementById("mood-featured-input");
  if (input) input.value = mood.content || "";
  if (featured) featured.checked = Boolean(mood.featured);
  editingMood = mood;
  document.getElementById("mood-save-btn").textContent = "保存修改";
  updateMoodCharCount();
  switchPanel("mood");
  setStatus("mood-status", "正在编辑心情贴…");
}

async function handleMoodFeature(mood) {
  if (!canEditNotes()) return;
  try {
    await setMoodFeatured(mood.path, !mood.featured);
    await refreshMoodList();
    setStatus("mood-status", mood.featured ? "已取消事件板指定。" : "已设为首页事件板展示。");
  } catch (error) {
    setStatus("mood-status", error.message || "操作失败");
  }
}

function bindEvents() {
  document.querySelectorAll("[data-diary-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchPanel(btn.dataset.diaryTab || "memo"));
  });

  document.getElementById("diary-composer-input")?.addEventListener("input", refreshLivePreview);
  document.getElementById("diary-mic-toggle")?.addEventListener("click", toggleMic);
  document.getElementById("diary-save-btn")?.addEventListener("click", () => void handleMemoSave());
  document.getElementById("diary-clear-btn")?.addEventListener("click", resetMemoComposer);

  document.getElementById("plan-save-btn")?.addEventListener("click", () => void handlePlanSave());
  document.getElementById("plan-clear-btn")?.addEventListener("click", resetPlanComposer);

  document.getElementById("tdlist-save-btn")?.addEventListener("click", () => void handleTodoSave());
  document.getElementById("tdlist-clear-btn")?.addEventListener("click", resetTodoComposer);
  document.getElementById("tdlist-list")?.addEventListener("click", (event) => {
    const foldBtn = event.target.closest("#tdlist-fold-toggle");
    if (foldBtn) {
      tdlistExpanded = !tdlistExpanded;
      renderTodoList();
      return;
    }
    const card = event.target.closest(".diary-todo-card");
    if (!card) return;
    const item = todos.find((m) => m.path === card.dataset.path);
    if (!item) return;
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "edit") handleTodoEdit(item);
    else if (action === "delete") {
      void handleDelete(item, refreshTodoList, (deleted) => {
        if (editingTodo?.path === deleted.path) resetTodoComposer();
      }, "tdlist-status");
    }
  });

  document.getElementById("announce-save-btn")?.addEventListener("click", () => void handleAnnounceSave());
  document.getElementById("announce-clear-btn")?.addEventListener("click", resetAnnounceComposer);
  document.getElementById("export-announce-btn")?.addEventListener("click", () => void handleExportAnnouncements());

  document.getElementById("mood-content-input")?.addEventListener("input", updateMoodCharCount);
  document.getElementById("mood-save-btn")?.addEventListener("click", () => void handleMoodSave());
  document.getElementById("mood-clear-btn")?.addEventListener("click", resetMoodComposer);

  document.getElementById("mood-list")?.addEventListener("click", (event) => {
    const card = event.target.closest(".diary-mood-card");
    if (!card) return;
    const mood = moods.find((m) => m.path === card.dataset.path);
    if (!mood) return;
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "feature") void handleMoodFeature(mood);
    else if (action === "edit") handleMoodEdit(mood);
    else if (action === "delete") {
      void handleDelete(mood, refreshMoodList, (item) => {
        if (editingMood?.path === item.path) resetMoodComposer();
      }, "mood-status");
    }
  });

  document.getElementById("diary-filter-bar")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-filter]");
    if (!btn) return;
    filterCategory = btn.dataset.filter || "全部";
    document.querySelectorAll("#diary-filter-bar [data-filter]").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.filter === filterCategory);
    });
    renderMemoList();
  });

  bindBoardList("diary-memo-list", () => memos, refreshMemoList, {
    detail: (memo) => ({ categoryLabel: memo.category || "备忘" }),
    onEdit: (memo) => {
      document.getElementById("diary-composer-input").value = memo.content || "";
      document.getElementById("diary-title-input").value = memo.title || "";
      document.getElementById("diary-save-category").value = memo.category || "备忘";
      editingMemo = memo;
      document.getElementById("diary-save-btn").textContent = "保存修改";
      switchPanel("memo");
      refreshLivePreview();
      setStatus("diary-status", "正在编辑…");
    },
    onDelete: (memo) => { if (editingMemo?.path === memo.path) resetMemoComposer(); },
  });

  bindBoardList("plan-list", () => plans, refreshPlanList, {
    detail: (plan) => ({
      categoryLabel: "更新计划",
      metaExtra: plan.plannedAt
        ? `<time>计划 ${escapeHtml(formatTime(plan.plannedAt))}</time>`
        : "",
    }),
    onEdit: handlePlanEdit,
    onDelete: (plan) => { if (editingPlan?.path === plan.path) resetPlanComposer(); },
  });

  bindBoardList("announce-list", () => announcements, refreshAnnounceList, {
    detail: (item) => ({
      categoryLabel: "更新公告",
      metaExtra: `<time>发布 ${escapeHtml(formatTime(item.createdAt || item.updatedAt))}</time>`,
    }),
    onEdit: handleAnnounceEdit,
    onDelete: (item) => { if (editingAnnounce?.path === item.path) resetAnnounceComposer(); },
  });

  document.getElementById("diary-detail-close")?.addEventListener("click", () => {
    document.getElementById("diary-detail-dialog")?.close();
  });
}

export async function initMouseDiary() {
  const root = document.getElementById("diary-workspace");
  if (!root) return;

  await detectDiaryStorage();
  const modeEl = document.getElementById("diary-storage-mode");
  if (modeEl) modeEl.textContent = storageModeLabel(getDiaryStorageMode());

  const planDate = document.getElementById("plan-date-input");
  if (planDate && !planDate.value) planDate.value = defaultPlannedInputValue();

  const todoDate = document.getElementById("tdlist-date-input");
  if (todoDate && !todoDate.value) todoDate.value = defaultTodoDateValue();

  if (!canEditNotes()) {
    root.querySelectorAll("textarea, input:not([type=checkbox])").forEach((el) => {
      if (el.id !== "plan-date-input" && el.id !== "tdlist-date-input") el.setAttribute("readonly", "readonly");
    });
    root.querySelectorAll("button[id$='-save-btn']").forEach((btn) => btn.setAttribute("disabled", "disabled"));
    document.getElementById("diary-mic-toggle")?.setAttribute("disabled", "disabled");
    document.getElementById("tdlist-type-input")?.setAttribute("disabled", "disabled");
  } else {
    const micHint = describeMicEnvironment();
    const micBtn = document.getElementById("diary-mic-toggle");
    if (micHint && micBtn) {
      micBtn.title = micHint;
      setStatus("diary-status", micHint);
    }
  }

  bindEvents();
  switchPanel("tdlist");
  refreshLivePreview();
  updateMoodCharCount();
  await Promise.all([
    refreshMemoList(),
    refreshTodoList(),
    refreshPlanList(),
    refreshAnnounceList(),
    refreshMoodList(),
  ]);
}
