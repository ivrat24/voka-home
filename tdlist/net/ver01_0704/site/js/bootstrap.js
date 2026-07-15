import { initCursorTrail } from "./cursor-trail.js";
import { initGitHubSync } from "./github-sync.js";
import {
  applyBackground,
  escapeHtml,
  getPageIdFromUrl,
  getSiteBasePath,
  initTheme,
  initSiteHeaderOffset,
  loadSiteConfig,
  refreshSiteHeaderOffset,
  updateNavActive,
} from "./layout.js";
import { initMusicPlayer, refreshHeroNowPlaying } from "./music-player.js";
import { initTimerWidget } from "./timer-widget.js";
import { initArrangeInstruments, resetArrangeInstrumentBoards } from "./piano-keyboard.js";
import { loadCourseNoteIndex, loadCoursePreviewFromManifest } from "./course-notes.js";
import { fetchJson, applySiteAccessMode, canEditNotes, isPublishedSite } from "./runtime.js";
import { initSpaNavigation } from "./spa-nav.js";
import { redirectPublishedMouseDiaryAway } from "./access-gate.js";

let siteConfig = null;
let shellReady = false;
let live2dShellPromise = null;

export async function bootstrap(pageId) {
  applySiteAccessMode();
  await ensureShell();

  const resolvedPageId = pageId || getPageIdFromUrl();
  updateNavActive(resolvedPageId);
  await enterPage(resolvedPageId);
}

async function ensureShell() {
  if (shellReady) return;
  shellReady = true;

  initCursorTrail();

  try {
    await initMusicPlayer();
  } catch (error) {
    console.warn("[Music] 播放器初始化失败:", error);
  }

  try {
    initTimerWidget();
  } catch (error) {
    console.warn("[Timer] 计时器初始化失败:", error);
  }

  initTheme(null);
  initSiteHeaderOffset();

  siteConfig = await loadSiteConfig(getSiteBasePath());
  if (siteConfig) {
    initTheme(siteConfig);
    applyBackground(siteConfig, getSiteBasePath());
  }

  initSpaNavigation(async (nextPageId, context) => {
    await enterPage(nextPageId, context);
  });

  void ensureLive2DShell();
}

function ensureLive2DShell() {
  if (!live2dShellPromise) {
    live2dShellPromise = (async () => {
      const { mountLive2DNav, loadLive2DPet } = await import("./live2d-settings.js");
      mountLive2DNav();
      refreshSiteHeaderOffset();
      await loadLive2DPet(getSiteBasePath());
      refreshSiteHeaderOffset();
    })().catch((error) => {
      console.warn("[Live2D] 设置初始化失败:", error);
      live2dShellPromise = null;
    });
  }
  return live2dShellPromise;
}

function waitForDomPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

async function mountArrangeInstruments() {
  await waitForDomPaint();
  if (!document.getElementById("keyboard-piano")) return;
  resetArrangeInstrumentBoards();
  try {
    initArrangeInstruments();
  } catch (error) {
    console.warn("[Arrange] 乐器模块初始化失败:", error);
  }
}

async function refreshShellLive2D() {
  try {
    const { mountLive2DNav } = await import("./live2d-settings.js");
    const { isLive2DPetReady, refreshLive2DPetLayout } = await import("./live2d-pet.js");
    mountLive2DNav();
    refreshSiteHeaderOffset();
    await ensureLive2DShell();
    if (isLive2DPetReady()) {
      refreshLive2DPetLayout();
    }
  } catch (error) {
    console.warn("[Live2D] 桌宠刷新失败:", error);
  }
}

async function enterPage(pageId, context = {}) {
  const basePath = getSiteBasePath(context.url || window.location.href);

  if (siteConfig) {
    applyBackground(siteConfig, basePath);
  }

  if (pageId === "home" && context.doc) {
    ensureHomeExtras(context.doc);
  }

  refreshHeroNowPlaying();

  if (pageId === "virtual-arrange") {
    await mountArrangeInstruments();
  }

  if (pageId === "home") {
    await loadCoursePreview(basePath);
    if (canEditNotes()) {
      initGitHubSync(siteConfig);
    }
    const { initHomeUpdates } = await import("./home-updates.js");
    await initHomeUpdates();
    const { initHomeMoodBoard } = await import("./home-mood-board.js");
    await initHomeMoodBoard();
  } else if (pageId === "course") {
    await loadCourseNoteIndex(basePath);
    if (canEditNotes()) {
      const { initNoteEditor } = await import("./note-editor.js");
      await initNoteEditor();
    }
  } else if (pageId === "course-detail") {
    const { loadCourseDetail } = await import("./course-notes.js");
    await loadCourseDetail(basePath);
  } else if (pageId === "notebook-view") {
    const { loadNotebookView } = await import("./notebook-view.js");
    await loadNotebookView(basePath);
  } else if (pageId === "course-note") {
    const { initNotePageActions, hydrateNotePageMeta } = await import("./note-download.js");
    initNotePageActions(basePath);
    await hydrateNotePageMeta(basePath);
    const { typesetMathIn } = await import("./math-render.js");
    typesetMathIn(document.querySelector(".note-body"));
  } else if (pageId === "agent-lab") {
    if (canEditNotes()) {
      await loadAgentLabUpdates(basePath);
    }
  } else if (pageId === "mouse-diary") {
    if (isPublishedSite()) {
      await redirectPublishedMouseDiaryAway();
      return;
    }
    const { initMouseDiary } = await import("./mouse-diary.js");
    await initMouseDiary();
  }

  void refreshShellLive2D();
}

function ensureHomeExtras(doc) {
  if (!document.getElementById("github-sync-dialog")) {
    const dialog = doc.getElementById("github-sync-dialog");
    if (dialog) {
      document.body.appendChild(document.importNode(dialog, true));
    }
  }
  if (!document.getElementById("home-update-dialog")) {
    const updateDialog = doc.getElementById("home-update-dialog");
    if (updateDialog) {
      document.body.appendChild(document.importNode(updateDialog, true));
    }
  }
}

async function loadCoursePreview(basePath = "") {
  await loadCoursePreviewFromManifest(basePath);
}

async function loadAgentLabUpdates(basePath = "") {
  const list = document.getElementById("agent-updates-list");
  if (!list) return;

  try {
    const data = await fetchJson(`${basePath}content/agent-lab/updates.json`, "agentUpdates");
    const items = Array.isArray(data?.items) ? data.items : [];

    if (!items.length) {
      list.innerHTML = `
        <li class="agent-update-item agent-update-item--placeholder">
          <p class="muted">暂无更新情报，后续进展将在此滚动展示。</p>
        </li>
      `;
      return;
    }

    list.innerHTML = items
      .map((item) => {
        const date = item?.date ? `<time datetime="${escapeHtml(item.date)}">${escapeHtml(item.date)}</time>` : "";
        const text = escapeHtml(item?.text ?? "").replace(/\n/g, "<br>");
        return `<li class="agent-update-item">${date}<p>${text}</p></li>`;
      })
      .join("");
  } catch {
    list.innerHTML = `
      <li class="agent-update-item agent-update-item--placeholder">
        <p class="muted">更新情报暂不可用，请运行 <code>python sync/build-all.py</code> 后刷新。</p>
      </li>
    `;
  }
}
