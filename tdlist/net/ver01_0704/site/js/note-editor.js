import { escapeHtml } from "./layout.js";
import {
  buildFrontmatter,
  defaultNoteContent,
  parseFrontmatter,
  slugFromPath,
  titleFromSlug,
} from "./markdown.js";
import {
  connectNotesDirectory,
  connectSiteDirectory,
  createNoteFile,
  createNoteFolder,
  deleteNoteFile,
  deleteNoteFolder,
  deleteSiteNotePage,
  detectNotesStorage,
  fetchNotesTree,
  getNotesStorageMode,
  hasSiteDirectory,
  moveNoteFile,
  readNoteFile,
  renameNoteFile,
  renameNoteFolder,
  rebuildNotesIndex,
  saveNoteFile,
  storageModeLabel,
} from "./notes-api.js";
import { canEditNotes, isFileProtocol } from "./runtime.js";
import { publishSavedNote } from "./note-publish.js";
import { renderOptimizedNoteHtml } from "./note-layout.js";
import { fetchNoteManifest } from "./course-notes.js";

/** @type {object} */
let state = {
  open: false,
  tree: { folders: [], files: [] },
  currentPath: null,
  content: "",
  dirty: false,
  saving: false,
  preview: true,
  status: "",
};

let rootEl = null;
let sourceEl = null;
let previewEl = null;
let statusEl = null;
let bound = false;
let previewRaf = null;
/** @type {Map<string, string>} */
let courseTitles = new Map();

function displayTitleFromContent(content, path) {
  const { meta } = parseFrontmatter(content || "");
  if (meta.title) return String(meta.title).trim();
  const slug = path.replace(/\.md$/i, "");
  return titleFromSlug(slug);
}

function getFileDisplayTitle(file) {
  if (state.currentPath === file.path && state.content) {
    return displayTitleFromContent(state.content, file.path);
  }
  return file.title || titleFromSlug(file.slug || file.path.replace(/\.md$/i, ""));
}

function syncCurrentTreeFileTitle() {
  if (!state.currentPath || !rootEl) return;
  const title = displayTitleFromContent(state.content, state.currentPath);
  const file = state.tree.files?.find((item) => item.path === state.currentPath);
  if (file) file.title = title;
  rootEl.querySelectorAll("button.note-editor-tree-file[data-note-path]").forEach((btn) => {
    if (btn.getAttribute("data-note-path") === state.currentPath) {
      btn.textContent = `📄 ${title}`;
    }
  });
}

function applyManifestTitlesToTree(tree, manifest) {
  if (!manifest) return;
  const titleBySlug = new Map(
    (Array.isArray(manifest.notes) ? manifest.notes : [])
      .filter((note) => note?.slug && note?.title)
      .map((note) => [note.slug, String(note.title)]),
  );
  tree.files = tree.files.map((file) => ({
    ...file,
    title: titleBySlug.get(file.slug) || file.title,
  }));
  courseTitles = new Map(
    (Array.isArray(manifest.courses) ? manifest.courses : [])
      .filter((course) => course?.slug && course?.title)
      .map((course) => [course.slug, String(course.title)]),
  );
}

async function afterTreeMutation(message) {
  await refreshTree();
  setStatus(message);
}

export async function initNoteEditor(options = {}) {
  if (!canEditNotes()) return;
  rootEl = document.getElementById(options.rootId || "note-editor-root");
  if (!rootEl || bound) return;
  bound = true;

  rootEl.innerHTML = `
    <div class="note-editor-offline-banner" id="note-editor-offline-banner" hidden>
      <p>
        <strong>双击打开模式：</strong>
        请先连接 <code>site/note_content</code> 文件夹（首次需浏览器授权），即可新建、编辑并保存笔记。
      </p>
      <button type="button" class="btn btn-primary btn-sm" id="note-editor-connect-fs-banner">连接 note_content 文件夹</button>
    </div>
    <div class="note-editor-shell">
      <aside class="note-editor-sidebar" aria-label="笔记文件树">
        <div class="note-editor-sidebar-head">
          <span class="note-editor-sidebar-title">笔记库</span>
          <div class="note-editor-sidebar-actions">
            <button type="button" class="btn-icon note-editor-icon-btn" id="note-editor-new-folder" title="新建文件夹">📁+</button>
            <button type="button" class="btn-icon note-editor-icon-btn" id="note-editor-new-file" title="新建文档">📄+</button>
          </div>
        </div>
        <div class="note-editor-tree" id="note-editor-tree"></div>
        <div class="note-editor-storage">
          <p class="note-editor-storage-label" id="note-editor-storage-label">检测存储…</p>
          <button type="button" class="btn btn-ghost btn-sm" id="note-editor-connect-fs" hidden>连接 note_content 文件夹</button>
          <button type="button" class="btn btn-ghost btn-sm" id="note-editor-connect-site" hidden>连接 site 文件夹（生成网页）</button>
        </div>
      </aside>
      <div class="note-editor-main">
        <header class="note-editor-toolbar">
          <div class="note-editor-toolbar-left">
            <span class="note-editor-doc-path" id="note-editor-doc-path">未打开文档</span>
            <span class="note-editor-dirty" id="note-editor-dirty" hidden>●</span>
          </div>
          <div class="note-editor-toolbar-actions note-editor-md-tools">
            <button type="button" class="btn btn-ghost btn-sm" id="note-editor-rename" title="重命名文档">重命名</button>
            <button type="button" class="btn btn-ghost btn-sm" id="note-editor-move" title="移动文档">移动</button>
            <button type="button" class="btn btn-ghost btn-sm" id="note-editor-delete" title="删除文档">删除</button>
            <button type="button" class="btn btn-ghost btn-sm" id="note-editor-toggle-preview">仅源码</button>
            <div class="note-editor-dropdown" data-dropdown="heading">
              <button type="button" class="btn btn-ghost btn-sm note-editor-dropdown-toggle" aria-expanded="false">标题 ▾</button>
              <div class="note-editor-dropdown-panel" hidden>
                <button type="button" data-heading="1">标题 1 <span class="muted">#</span></button>
                <button type="button" data-heading="2">标题 2 <span class="muted">##</span></button>
                <button type="button" data-heading="3">标题 3 <span class="muted">###</span></button>
                <button type="button" data-heading="4">标题 4 <span class="muted">####</span></button>
                <button type="button" data-heading="5">标题 5 <span class="muted">#####</span></button>
              </div>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" id="note-editor-md-bold" title="粗体"><strong>B</strong></button>
            <button type="button" class="btn btn-ghost btn-sm" id="note-editor-md-list" title="无序列表 (- )">• 列表</button>
            <button type="button" class="btn btn-ghost btn-sm" id="note-editor-md-math" title="插入公式块">∑ 公式</button>
            <div class="note-editor-dropdown" data-dropdown="fence">
              <button type="button" class="btn btn-ghost btn-sm note-editor-dropdown-toggle" aria-expanded="false">块 ▾</button>
              <div class="note-editor-dropdown-panel" hidden>
                <button type="button" data-fence="math">公式块 <span class="muted">$$</span></button>
                <button type="button" data-fence="">代码块 <span class="muted">···</span></button>
              </div>
            </div>
            <button type="button" class="btn btn-primary btn-sm" id="note-editor-save">保存</button>
          </div>
        </header>
        <div class="note-editor-panes ${state.preview ? "is-split" : "is-source-only"}">
          <div class="note-editor-source-wrap">
            <textarea class="note-editor-source" id="note-editor-source" spellcheck="false" placeholder="在此撰写 Markdown…"></textarea>
          </div>
          <div class="note-editor-preview-wrap">
            <div class="note-editor-preview-label">实时预览</div>
            <div class="note-editor-preview content-body" id="note-editor-preview"></div>
          </div>
        </div>
        <footer class="note-editor-statusbar">
          <span id="note-editor-status">就绪</span>
          <span class="note-editor-hint muted">Ctrl+S 保存 · Tab/Shift+Tab 列表缩进 · 右侧实时预览</span>
        </footer>
      </div>
    </div>
  `;

  sourceEl = rootEl.querySelector("#note-editor-source");
  previewEl = rootEl.querySelector("#note-editor-preview");
  statusEl = rootEl.querySelector("#note-editor-status");

  bindMarkdownToolbar();
  bindEditorEvents();
  await refreshStorageInfo();
  await refreshTree();

  const editSlug = getEditSlugFromLocation();
  if (editSlug) {
    setEditorOpen(true);
    scrollEditorSectionIntoView();
    await openNoteFromSlug(editSlug);
  }
}

function getEditSlugFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const edit = params.get("edit");
  if (edit) return edit.trim();
  if (window.location.hash === "#note-editor") return "";
  return "";
}

function scrollEditorSectionIntoView() {
  const section = document.getElementById("note-editor") || document.querySelector(".note-editor-section");
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function openNoteFromSlug(slug) {
  const path = slug.endsWith(".md") ? slug : `${slug}.md`;
  await openNote(path);
}

function bindEditorEvents() {
  document.getElementById("note-editor-open-btn")?.addEventListener("click", () => {
    setEditorOpen(!state.open);
  });

  rootEl.querySelector("#note-editor-save")?.addEventListener("click", () => void saveCurrent());
  rootEl.querySelector("#note-editor-toggle-preview")?.addEventListener("click", togglePreview);
  rootEl.querySelector("#note-editor-new-folder")?.addEventListener("click", () => void promptNewFolder());
  rootEl.querySelector("#note-editor-new-file")?.addEventListener("click", () => void promptNewFile());
  rootEl.querySelector("#note-editor-rename")?.addEventListener("click", () => void promptRenameCurrent());
  rootEl.querySelector("#note-editor-move")?.addEventListener("click", () => void promptMoveCurrent());
  rootEl.querySelector("#note-editor-delete")?.addEventListener("click", () => void promptDeleteCurrent());
  rootEl.querySelector("#note-editor-connect-fs")?.addEventListener("click", () => void connectFolder());
  rootEl.querySelector("#note-editor-connect-fs-banner")?.addEventListener("click", () => void connectFolder());
  rootEl.querySelector("#note-editor-connect-site")?.addEventListener("click", () => void connectSiteFolder());

  sourceEl?.addEventListener("input", () => {
    const scrollSnapshot = captureSourceScrollSnapshot();
    state.content = sourceEl.value;
    state.dirty = true;
    updateDirtyIndicator();
    updateDocPath();
    syncCurrentTreeFileTitle();
    schedulePreview();
    stabilizeSourceScroll(scrollSnapshot);
  });

  sourceEl?.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveCurrent();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      handleListTab(event.shiftKey);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      if (handleListEnter(event)) return;
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (state.dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}

function setEditorOpen(open) {
  state.open = open;
  rootEl.hidden = !open;
  document.getElementById("note-editor-open-btn")?.setAttribute("aria-expanded", open ? "true" : "false");
  document.querySelector(".note-editor-section")?.classList.toggle("is-workspace-open", open);
  if (open) {
    void refreshOfflineBanner();
    schedulePreview();
    sourceEl?.focus();
  }
}

async function refreshOfflineBanner() {
  const banner = rootEl.querySelector("#note-editor-offline-banner");
  if (!banner) return;
  const mode = await detectNotesStorage();
  const show = isFileProtocol() && mode === "embedded";
  banner.hidden = !show;
}

async function connectSiteFolder() {
  try {
    const name = await connectSiteDirectory();
    setStatus(`已连接 site 文件夹：${name} · 保存后将自动生成笔记网页`);
    await refreshStorageInfo();
  } catch (error) {
    if (error?.name !== "AbortError") {
      setStatus(error.message, true);
    }
  }
}

async function refreshStorageInfo() {
  const mode = await detectNotesStorage();
  const label = rootEl.querySelector("#note-editor-storage-label");
  const connectBtn = rootEl.querySelector("#note-editor-connect-fs");
  const siteBtn = rootEl.querySelector("#note-editor-connect-site");
  if (label) label.textContent = storageModeLabel(mode);
  if (connectBtn) {
    connectBtn.hidden = mode === "server" || mode === "filesystem";
    if (isFileProtocol() && mode === "embedded") {
      connectBtn.hidden = false;
    }
  }
  if (siteBtn) {
    siteBtn.hidden = mode === "server" || hasSiteDirectory();
  }
  await refreshOfflineBanner();
}

async function connectFolder() {
  try {
    const name = await connectNotesDirectory();
    setStatus(`已连接文件夹：${name} · 现在可以保存笔记`);
    await refreshStorageInfo();
    await refreshTree();
  } catch (error) {
    if (error?.name !== "AbortError") {
      setStatus(error.message, true);
    }
  }
}

async function ensureWritableStorage() {
  const mode = getNotesStorageMode() || (await detectNotesStorage());
  if (mode !== "embedded") return true;
  if (!isFileProtocol()) return false;
  const ok = window.confirm(
    "保存笔记需要先连接 site/note_content 文件夹（浏览器会弹出授权窗口）。\n\n是否现在连接？",
  );
  if (!ok) return false;
  await connectFolder();
  return getNotesStorageMode() === "filesystem";
}

async function refreshTree() {
  try {
    const tree = await fetchNotesTree();
    try {
      const manifest = await fetchNoteManifest();
      applyManifestTitlesToTree(tree, manifest);
    } catch {
      courseTitles = new Map();
    }
    if (state.currentPath && state.content) {
      const file = tree.files.find((item) => item.path === state.currentPath);
      if (file) file.title = displayTitleFromContent(state.content, state.currentPath);
    }
    state.tree = tree;
    renderTree();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function renderTree() {
  const container = rootEl.querySelector("#note-editor-tree");
  if (!container) return;

  const { folders, files } = state.tree;
  if (!folders.length && !files.length) {
    container.innerHTML = `
      <p class="muted note-editor-tree-empty">暂无笔记，点击 📄+ 新建</p>
      <div class="note-editor-tree-root-drop note-editor-tree-drop" data-drop-folder="">拖到此处移至根目录</div>
    `;
    bindTreeDragDrop(container);
    return;
  }

  const rootFiles = files.filter((f) => !f.path.includes("/"));
  const nestedFiles = files.filter((f) => f.path.includes("/"));

  let html = "";

  for (const folder of folders) {
    const depth = folder.split("/").length - 1;
    html += renderTreeFolder(folder, depth);
    const inFolder = nestedFiles.filter((f) => {
      const parent = f.path.split("/").slice(0, -1).join("/");
      return parent === folder;
    });
    html += inFolder.map((f) => renderTreeFile(f, depth + 1)).join("");
  }

  html += rootFiles.map((f) => renderTreeFile(f, 0)).join("");
  html += `<div class="note-editor-tree-root-drop note-editor-tree-drop" data-drop-folder="">拖到此处移至根目录</div>`;

  container.innerHTML = html;
  container.querySelectorAll("[data-note-path]").forEach((btn) => {
    btn.addEventListener("click", () => {
      void openNote(btn.getAttribute("data-note-path"));
    });
  });
  bindTreeDragDrop(container);
  container.querySelectorAll("[data-rename-file]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      void promptRenameFile(btn.getAttribute("data-rename-file"));
    });
  });
  container.querySelectorAll("[data-rename-folder]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      void promptRenameFolder(btn.getAttribute("data-rename-folder"));
    });
  });
  container.querySelectorAll("[data-move-file]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      void promptMoveFile(btn.getAttribute("data-move-file"));
    });
  });
  container.querySelectorAll("[data-delete-file]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      void deleteFile(btn.getAttribute("data-delete-file"));
    });
  });
  container.querySelectorAll("[data-delete-folder]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      void deleteFolder(btn.getAttribute("data-delete-folder"));
    });
  });
}

function renderTreeFolder(folder, depth) {
  const displayName = courseTitles.get(folder) || folder.split("/").pop();
  return `
    <div class="note-editor-tree-item note-editor-tree-item--folder note-editor-tree-drop" data-drop-folder="${escapeHtml(folder)}" style="--depth:${depth}">
      <span class="note-editor-tree-folder">📁 ${escapeHtml(displayName)}</span>
      <div class="note-editor-tree-item-actions">
        <button type="button" class="note-editor-tree-action note-editor-tree-action--rename" data-rename-folder="${escapeHtml(folder)}" title="重命名">✎</button>
        <button type="button" class="note-editor-tree-action" data-delete-folder="${escapeHtml(folder)}" title="删除文件夹">×</button>
      </div>
    </div>
  `;
}

function renderTreeFile(file, depth) {
  const active = state.currentPath === file.path ? " is-active" : "";
  return `
    <div class="note-editor-tree-item note-editor-tree-item--file" data-drag-path="${escapeHtml(file.path)}" draggable="true" style="--depth:${depth}">
      <button type="button" class="note-editor-tree-file${active}" data-note-path="${escapeHtml(file.path)}">
        📄 ${escapeHtml(getFileDisplayTitle(file))}
      </button>
      <div class="note-editor-tree-item-actions">
        <button type="button" class="note-editor-tree-action note-editor-tree-action--rename" data-rename-file="${escapeHtml(file.path)}" title="重命名">✎</button>
        <button type="button" class="note-editor-tree-action" data-move-file="${escapeHtml(file.path)}" title="移动">↦</button>
        <button type="button" class="note-editor-tree-action" data-delete-file="${escapeHtml(file.path)}" title="删除">×</button>
      </div>
    </div>
  `;
}

function bindTreeDragDrop(container) {
  let draggingPath = null;

  container.querySelectorAll("[data-drag-path]").forEach((item) => {
    item.addEventListener("dragstart", (event) => {
      draggingPath = item.getAttribute("data-drag-path");
      event.dataTransfer?.setData("text/plain", draggingPath || "");
      event.dataTransfer.effectAllowed = "move";
      item.classList.add("is-dragging");
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("is-dragging");
      draggingPath = null;
      container.querySelectorAll(".is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
    });
  });

  container.querySelectorAll(".note-editor-tree-drop").forEach((target) => {
    target.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      target.classList.add("is-drop-target");
    });
    target.addEventListener("dragleave", (event) => {
      if (!target.contains(event.relatedTarget)) {
        target.classList.remove("is-drop-target");
      }
    });
    target.addEventListener("drop", (event) => {
      event.preventDefault();
      target.classList.remove("is-drop-target");
      const from = event.dataTransfer?.getData("text/plain") || draggingPath;
      const folder = target.getAttribute("data-drop-folder") ?? "";
      if (from) void dragMoveFile(from, folder);
    });
  });
}

async function dragMoveFile(from, toFolder) {
  if (!(await ensureWritableStorage())) return;
  const currentFolder = from.includes("/") ? from.split("/").slice(0, -1).join("/") : "";
  if (currentFolder === toFolder) return;
  const fileName = from.split("/").pop();
  const destPath = toFolder ? `${toFolder}/${fileName}` : fileName;
  if (destPath === from) return;
  try {
    const result = await moveNoteFile(from, toFolder);
    if (state.currentPath === from) {
      state.currentPath = result.path;
      state.dirty = false;
      updateDocPath();
      updateDirtyIndicator();
    }
    const { content } = await readNoteFile(result.path);
    await publishSavedNote(result.path, content);
    await afterTreeMutation(`已移动至 ${result.path}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function openNote(path) {
  if (state.dirty && !window.confirm("当前文档未保存，是否放弃更改？")) {
    return;
  }
  try {
    const data = await readNoteFile(path);
    state.currentPath = data.path;
    state.content = data.content;
    state.dirty = false;
    if (sourceEl) sourceEl.value = state.content;
    if (sourceEl) sourceEl.scrollTop = 0;
    updateDocPath();
    updateDirtyIndicator();
    renderPreview();
    if (state.tree.files?.length) {
      const file = state.tree.files.find((item) => item.path === data.path);
      if (file) file.title = displayTitleFromContent(state.content, data.path);
    }
    renderTree();
    setStatus(`已打开 ${data.path}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function schedulePreview() {
  if (previewRaf) cancelAnimationFrame(previewRaf);
  previewRaf = requestAnimationFrame(() => {
    previewRaf = null;
    renderPreview();
  });
}

function captureSourceScrollSnapshot() {
  if (!sourceEl) return null;
  const max = Math.max(0, sourceEl.scrollHeight - sourceEl.clientHeight);
  return {
    top: sourceEl.scrollTop,
    atBottom: max <= 0 || sourceEl.scrollTop >= max - 8,
  };
}

function stabilizeSourceScroll(snapshot) {
  if (!sourceEl || !snapshot) return;
  const apply = () => {
    const max = Math.max(0, sourceEl.scrollHeight - sourceEl.clientHeight);
    if (snapshot.atBottom) {
      sourceEl.scrollTop = max;
      return;
    }
    if (sourceEl.scrollTop + 4 < snapshot.top) {
      sourceEl.scrollTop = Math.min(snapshot.top, max);
    }
  };
  apply();
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
}

function getPreviewScrollEl() {
  return rootEl?.querySelector(".note-editor-preview-wrap") || previewEl?.parentElement || null;
}

function renderPreview() {
  if (!previewEl) return;
  const previewWrap = getPreviewScrollEl();
  const savedScrollTop = previewWrap?.scrollTop ?? 0;
  const { body } = parseFrontmatter(state.content);
  previewEl.innerHTML = renderOptimizedNoteHtml(body, { minHeadings: 2 });
  previewEl.classList.add("note-body--optimized");
  if (previewWrap) previewWrap.scrollTop = savedScrollTop;
  void import("./math-render.js").then(({ typesetMathIn }) => {
    typesetMathIn(previewEl);
    if (previewWrap) previewWrap.scrollTop = savedScrollTop;
  });
  void import("./note-network-map.js").then(({ initNoteNetworkMaps }) => {
    initNoteNetworkMaps(previewEl);
    if (previewWrap) previewWrap.scrollTop = savedScrollTop;
  });
}

function updateDocPath() {
  const el = rootEl.querySelector("#note-editor-doc-path");
  if (!el) return;
  if (!state.currentPath) {
    el.textContent = "未打开文档";
    return;
  }
  const { meta } = parseFrontmatter(state.content || "");
  const displayTitle = meta.title ? String(meta.title).trim() : "";
  el.textContent = displayTitle ? `${displayTitle} · ${state.currentPath}` : state.currentPath;
}

function updateDirtyIndicator() {
  const el = rootEl.querySelector("#note-editor-dirty");
  if (el) el.hidden = !state.dirty;
}

function togglePreview() {
  state.preview = !state.preview;
  const panes = rootEl.querySelector(".note-editor-panes");
  panes?.classList.toggle("is-split", state.preview);
  panes?.classList.toggle("is-source-only", !state.preview);
  rootEl.querySelector("#note-editor-toggle-preview").textContent = state.preview ? "仅源码" : "分栏预览";
  if (state.preview) schedulePreview();
}

async function saveCurrent() {
  if (!state.currentPath || state.saving) return;
  if (!(await ensureWritableStorage())) {
    setStatus("未连接 note_content 文件夹，无法保存", true);
    return;
  }
  state.saving = true;
  setStatus("保存中…");
  try {
    await saveNoteFile(state.currentPath, state.content);
    state.dirty = false;
    updateDirtyIndicator();
    await refreshTree();
    const published = await publishSavedNote(state.currentPath, state.content);
    if (published.published) {
      setStatusHtml(
        `已保存 ${state.currentPath} · <a class="note-editor-status-link" href="${escapeHtml(published.pageHref)}" target="_blank" rel="noopener">查看笔记</a>`,
      );
    } else {
      setStatus(published.message);
    }
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    state.saving = false;
  }
}

async function promptNewFolder() {
  if (!(await ensureWritableStorage())) {
    setStatus("请先连接 note_content 文件夹", true);
    return;
  }
  const name = window.prompt("新建文件夹名称（可含子路径，如 数学/线性代数）");
  if (!name?.trim()) return;
  try {
    await createNoteFolder(name.trim().replace(/\\/g, "/"));
    await refreshTree();
    setStatus(`已创建文件夹 ${name.trim()}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function promptNewFile() {
  if (!(await ensureWritableStorage())) {
    setStatus("请先连接 note_content 文件夹", true);
    return;
  }
  const name = window.prompt("新建文档名称（不含 .md，可含文件夹路径）");
  if (!name?.trim()) return;
  const slug = name.trim().replace(/\\/g, "/").replace(/\.md$/i, "");
  const path = `${slug}.md`;
  const title = titleFromSlug(slug);
  const folder = slug.includes("/") ? slug.split("/").slice(0, -1).join("/") : "";
  const content = defaultNoteContent(title, folder);

  try {
    const result = await createNoteFile(path, content);
    await refreshTree();
    await openNote(result.path || path);
    if (result.downloaded) {
      setStatus("已创建并下载，请将文件放入 note_content/ 后运行 build-all.py", true);
    } else {
      const published = await publishSavedNote(result.path || path, content);
      setStatus(published.published ? `已创建 ${path}` : published.message);
    }
  } catch (error) {
    setStatus(error.message, true);
  }
}

function bindMarkdownToolbar() {
  rootEl.querySelector("#note-editor-md-bold")?.addEventListener("click", () => wrapSelection("**", "**"));
  rootEl.querySelector("#note-editor-md-list")?.addEventListener("click", () => toggleBulletLine());
  rootEl.querySelector("#note-editor-md-math")?.addEventListener("click", () => insertMathBlock());

  rootEl.querySelectorAll(".note-editor-dropdown-toggle").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const dropdown = btn.closest(".note-editor-dropdown");
      const panel = dropdown?.querySelector(".note-editor-dropdown-panel");
      if (!panel) return;
      const willOpen = panel.hidden;
      closeAllDropdowns();
      if (willOpen) {
        panel.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        dropdown?.classList.add("is-open");
      }
    });
  });

  rootEl.querySelectorAll("[data-heading]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyHeading(Number(btn.getAttribute("data-heading")));
      closeAllDropdowns();
    });
  });

  rootEl.querySelectorAll("[data-fence]").forEach((btn) => {
    btn.addEventListener("click", () => {
      insertFenceBlock(btn.getAttribute("data-fence") || "");
      closeAllDropdowns();
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".note-editor-dropdown")) {
      closeAllDropdowns();
    }
  });
}

function closeAllDropdowns() {
  rootEl?.querySelectorAll(".note-editor-dropdown").forEach((dropdown) => {
    dropdown.classList.remove("is-open");
    const panel = dropdown.querySelector(".note-editor-dropdown-panel");
    if (panel) panel.hidden = true;
    dropdown.querySelector(".note-editor-dropdown-toggle")?.setAttribute("aria-expanded", "false");
  });
}

function getCursorLine() {
  const text = sourceEl.value;
  const pos = sourceEl.selectionStart;
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const lineEnd = text.indexOf("\n", pos);
  const end = lineEnd === -1 ? text.length : lineEnd;
  return { text, pos, lineStart, lineEnd: end, line: text.slice(lineStart, end) };
}

function replaceLineRange(lineStart, lineEnd, newLine) {
  const scrollSnapshot = captureSourceScrollSnapshot();
  const text = sourceEl.value;
  const next = `${text.slice(0, lineStart)}${newLine}${text.slice(lineEnd)}`;
  sourceEl.value = next;
  state.content = next;
  state.dirty = true;
  updateDirtyIndicator();
  schedulePreview();
  stabilizeSourceScroll(scrollSnapshot);
}

function applyHeading(level) {
  if (!sourceEl) return;
  const { lineStart, lineEnd, line } = getCursorLine();
  const stripped = line.replace(/^#{1,6}\s+/, "");
  const content = stripped.trim() ? stripped : "标题";
  const hashes = "#".repeat(level);
  replaceLineRange(lineStart, lineEnd, `${hashes} ${content}`);
  const newPos = lineStart + hashes.length + 1 + content.length;
  sourceEl.setSelectionRange(newPos, newPos);
  sourceEl.focus();
}

function toggleBulletLine() {
  if (!sourceEl) return;
  const { lineStart, lineEnd, line } = getCursorLine();
  const match = line.match(/^(\s*)([-*+]\s+)?(.*)$/);
  if (!match) return;
  const indent = match[1] ?? "";
  const content = match[3] ?? "";
  if (match[2]) {
    replaceLineRange(lineStart, lineEnd, content ? `${indent}${content}` : indent);
    sourceEl.setSelectionRange(lineStart + indent.length + content.length, lineStart + indent.length + content.length);
  } else {
    const nextLine = `${indent}- ${content || "列表项"}`;
    replaceLineRange(lineStart, lineEnd, nextLine);
    const cursor = lineStart + indent.length + 2 + (content ? content.length : 3);
    sourceEl.setSelectionRange(content ? cursor : lineStart + indent.length + 2, content ? cursor : lineStart + indent.length + 5);
  }
  sourceEl.focus();
}

function handleListTab(shiftKey) {
  if (!sourceEl) return;
  const { lineStart, lineEnd, line } = getCursorLine();
  const listMatch = line.match(/^(\s*)([-*+]\s+)(.*)$/);
  if (listMatch) {
    const indent = listMatch[1];
    const marker = listMatch[2];
    const body = listMatch[3];
    if (shiftKey) {
      if (indent.length >= 2) {
        replaceLineRange(lineStart, lineEnd, `${indent.slice(2)}${marker}${body}`);
        sourceEl.setSelectionRange(Math.max(lineStart, sourceEl.selectionStart - 2), Math.max(lineStart, sourceEl.selectionEnd - 2));
      }
    } else {
      replaceLineRange(lineStart, lineEnd, `  ${indent}${marker}${body}`);
      sourceEl.setSelectionRange(sourceEl.selectionStart + 2, sourceEl.selectionEnd + 2);
    }
    sourceEl.focus();
    return;
  }
  if (!shiftKey) {
    insertAtCursor("  ");
  }
}

function handleListEnter(event) {
  if (!sourceEl) return false;
  const { lineStart, lineEnd, line } = getCursorLine();
  const match = line.match(/^(\s*)([-*+]\s+)(.*)$/);
  if (!match) return false;
  const indent = match[1];
  const body = match[3];
  if (!body.trim()) {
    event.preventDefault();
    replaceLineRange(lineStart, lineEnd, "");
    insertAtCursor("\n");
    return true;
  }
  event.preventDefault();
  insertAtCursor(`\n${indent}- `);
  return true;
}

function insertMathBlock() {
  if (!sourceEl) return;
  const scrollSnapshot = captureSourceScrollSnapshot();
  const start = sourceEl.selectionStart;
  const end = sourceEl.selectionEnd;
  const selected = sourceEl.value.slice(start, end);
  const placeholder =
    selected ||
    "Q(s, a) \\leftarrow Q(s, a) + \\alpha \\left[ r + \\gamma \\max_{a'} Q(s', a') - Q(s, a) \\right]";
  const block = `\n$$\n${placeholder}\n$$\n`;
  const next = `${sourceEl.value.slice(0, start)}${block}${sourceEl.value.slice(end)}`;
  sourceEl.value = next;
  state.content = next;
  state.dirty = true;
  updateDirtyIndicator();
  schedulePreview();
  if (selected) {
    sourceEl.setSelectionRange(start, start + block.length);
  } else {
    const innerStart = start + 4;
    sourceEl.setSelectionRange(innerStart, innerStart + placeholder.length);
  }
  sourceEl.focus();
  stabilizeSourceScroll(scrollSnapshot);
}

function insertFenceBlock(lang) {
  if (!sourceEl) return;
  const start = sourceEl.selectionStart;
  const end = sourceEl.selectionEnd;
  const selected = sourceEl.value.slice(start, end);
  if (lang === "math") {
    const body = selected || "E = mc^2";
    const block = `$$\n${body}\n$$`;
    const next = `${sourceEl.value.slice(0, start)}${block}${sourceEl.value.slice(end)}`;
    sourceEl.value = next;
    state.content = next;
    state.dirty = true;
    updateDirtyIndicator();
    schedulePreview();
    if (selected) {
      sourceEl.setSelectionRange(start, start + block.length);
    } else {
      const innerStart = start + 3;
      sourceEl.setSelectionRange(innerStart, innerStart + body.length);
    }
    sourceEl.focus();
    return;
  }
  const langLine = lang ? lang : "";
  const placeholder = "代码内容";
  const body = selected || placeholder;
  const block = `\`\`\`${langLine}\n${body}\n\`\`\``;
  const next = `${sourceEl.value.slice(0, start)}${block}${sourceEl.value.slice(end)}`;
  sourceEl.value = next;
  state.content = next;
  state.dirty = true;
  updateDirtyIndicator();
  schedulePreview();
  if (selected) {
    sourceEl.setSelectionRange(start, start + block.length);
  } else {
    const innerStart = start + langLine.length + 4;
    sourceEl.setSelectionRange(innerStart, innerStart + placeholder.length);
  }
  sourceEl.focus();
}

function wrapSelection(before, after) {
  if (!sourceEl) return;
  const start = sourceEl.selectionStart;
  const end = sourceEl.selectionEnd;
  const selected = sourceEl.value.slice(start, end) || "文本";
  const next = `${sourceEl.value.slice(0, start)}${before}${selected}${after}${sourceEl.value.slice(end)}`;
  sourceEl.value = next;
  state.content = next;
  state.dirty = true;
  updateDirtyIndicator();
  schedulePreview();
  sourceEl.focus();
  sourceEl.setSelectionRange(start + before.length, start + before.length + selected.length);
}

function insertAtCursor(text) {
  if (!sourceEl) return;
  const scrollSnapshot = captureSourceScrollSnapshot();
  const start = sourceEl.selectionStart;
  const end = sourceEl.selectionEnd;
  const next = `${sourceEl.value.slice(0, start)}${text}${sourceEl.value.slice(end)}`;
  sourceEl.value = next;
  state.content = next;
  state.dirty = true;
  updateDirtyIndicator();
  schedulePreview();
  const pos = start + text.length;
  sourceEl.setSelectionRange(pos, pos);
  sourceEl.focus();
  stabilizeSourceScroll(scrollSnapshot);
}

async function promptMoveCurrent() {
  if (!state.currentPath) {
    setStatus("请先打开要移动的文档", true);
    return;
  }
  await promptMoveFile(state.currentPath);
}

function defaultRenameName(path, isFolder) {
  const base = path.split("/").pop();
  if (isFolder) return base;
  return base.replace(/\.md$/i, "");
}

function remapPathUnderFolder(path, oldFolder, newFolder) {
  if (!path) return path;
  if (path === oldFolder || path.startsWith(`${oldFolder}/`)) {
    return `${newFolder}${path.slice(oldFolder.length)}`;
  }
  return path;
}

function filesUnderFolder(folder, files) {
  const prefix = `${folder}/`;
  return files.filter((f) => f.path.startsWith(prefix));
}

async function syncPublishAfterFileRename(oldPath, newPath) {
  const oldSlug = oldPath.replace(/\.md$/i, "");
  const { content } = await readNoteFile(newPath);
  await publishSavedNote(newPath, content);
  if (hasSiteDirectory()) {
    await deleteSiteNotePage(oldSlug);
  }
}

async function syncPublishAfterFolderRename(oldFolder, newFolder, affectedFiles) {
  const rebuilt = await rebuildNotesIndex();
  if (rebuilt) return;

  for (const file of affectedFiles) {
    const oldPath = file.path;
    const newPath = `${newFolder}/${oldPath.slice(oldFolder.length + 1)}`;
    const oldSlug = oldPath.replace(/\.md$/i, "");
    try {
      const { content } = await readNoteFile(newPath);
      await publishSavedNote(newPath, content);
      if (hasSiteDirectory()) {
        await deleteSiteNotePage(oldSlug);
      }
    } catch {
      /* skip unreadable */
    }
  }
}

async function promptRenameCurrent() {
  if (!state.currentPath) {
    setStatus("请先打开要重命名的文档", true);
    return;
  }
  await promptRenameFile(state.currentPath);
}

async function promptRenameFile(path) {
  if (!(await ensureWritableStorage())) return;
  const currentName = defaultRenameName(path, false);
  const newName = window.prompt("重命名文档（不含 .md）", currentName);
  if (!newName?.trim() || newName.trim() === currentName) return;
  try {
    const result = await renameNoteFile(path, newName.trim());
    if (state.currentPath === path) {
      state.currentPath = result.path;
      state.dirty = false;
      updateDocPath();
      updateDirtyIndicator();
    }
    await syncPublishAfterFileRename(path, result.path);
    await afterTreeMutation(`已重命名为 ${result.path}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function promptRenameFolder(folder) {
  if (!(await ensureWritableStorage())) return;
  const currentName = defaultRenameName(folder, true);
  const newName = window.prompt("重命名文件夹", currentName);
  if (!newName?.trim() || newName.trim() === currentName) return;
  const affected = filesUnderFolder(folder, state.tree.files);
  try {
    const result = await renameNoteFolder(folder, newName.trim());
    if (state.currentPath) {
      state.currentPath = remapPathUnderFolder(state.currentPath, folder, result.path);
      updateDocPath();
    }
    await syncPublishAfterFolderRename(folder, result.path, affected);
    await afterTreeMutation(`已重命名文件夹为 ${result.path}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function promptMoveFile(path) {
  if (!(await ensureWritableStorage())) return;
  const toFolder = window.prompt(
    "移动到文件夹（留空表示根目录）\n例如：数学/线性代数",
    path.includes("/") ? path.split("/").slice(0, -1).join("/") : "",
  );
  if (toFolder === null) return;
  try {
    const result = await moveNoteFile(path, toFolder.trim());
    if (state.currentPath === path) {
      state.currentPath = result.path;
      state.dirty = false;
      updateDocPath();
      updateDirtyIndicator();
    }
    const { content } = await readNoteFile(result.path);
    await publishSavedNote(result.path, content);
    await afterTreeMutation(`已移动至 ${result.path}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function promptDeleteCurrent() {
  if (!state.currentPath) {
    setStatus("请先打开要删除的文档", true);
    return;
  }
  await deleteFile(state.currentPath);
}

async function deleteFile(path) {
  if (!(await ensureWritableStorage())) return;
  if (!window.confirm(`确定删除文档「${path}」？此操作不可撤销。`)) return;
  try {
    await deleteNoteFile(path);
    if (state.currentPath === path) {
      state.currentPath = null;
      state.content = "";
      state.dirty = false;
      if (sourceEl) sourceEl.value = "";
      updateDocPath();
      updateDirtyIndicator();
      if (previewEl) previewEl.innerHTML = "";
    }
    await afterTreeMutation(`已删除 ${path}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function deleteFolder(folder) {
  if (!(await ensureWritableStorage())) return;
  if (!window.confirm(`确定删除文件夹「${folder}」及其全部内容？此操作不可撤销。`)) return;
  try {
    await deleteNoteFolder(folder);
    if (state.currentPath?.startsWith(`${folder}/`)) {
      state.currentPath = null;
      state.content = "";
      state.dirty = false;
      if (sourceEl) sourceEl.value = "";
      if (previewEl) previewEl.innerHTML = "";
      updateDocPath();
      updateDirtyIndicator();
    }
    await afterTreeMutation(`已删除文件夹 ${folder}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function setStatus(text, isError = false) {
  state.status = text;
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.classList.toggle("is-error", isError);
  }
}

function setStatusHtml(html, isError = false) {
  state.status = html;
  if (statusEl) {
    statusEl.innerHTML = html;
    statusEl.classList.toggle("is-error", isError);
  }
}

export function openNoteEditorWorkspace() {
  setEditorOpen(true);
}

export async function openNoteInEditor(slug) {
  setEditorOpen(true);
  scrollEditorSectionIntoView();
  await openNoteFromSlug(slug);
}
