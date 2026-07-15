import { isPublishedSite } from "./runtime.js";
import { getSiteBasePath } from "./layout.js";

const DIALOG_ID = "editor-only-gate-dialog";

export function isMouseDiaryHref(href, base = window.location.href) {
  try {
    const url = new URL(href, base);
    const path = decodeURIComponent(url.pathname || "");
    return /(^|\/)mouse-diary\.html$/i.test(path);
  } catch {
    return typeof href === "string" && /mouse-diary\.html/i.test(href);
  }
}

function ensureEditorOnlyDialog() {
  let dialog = document.getElementById(DIALOG_ID);
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = DIALOG_ID;
  dialog.className = "sync-dialog editor-only-gate-dialog";
  dialog.setAttribute("aria-labelledby", "editor-only-gate-title");
  dialog.innerHTML = `
    <form method="dialog" class="editor-only-gate-form">
      <header class="dialog-header">
        <h2 id="editor-only-gate-title">鼠の事件簿</h2>
        <button class="btn-icon dialog-close" type="submit" value="ok" aria-label="关闭">×</button>
      </header>
      <div class="dialog-body">
        <p class="editor-only-gate-message">
          该功能界面限编辑者使用喵~<br>
          体验编辑者视角的网页模板请联系作者喵~
        </p>
      </div>
      <footer class="dialog-footer">
        <button class="btn btn-primary" type="submit" value="ok">知道了</button>
      </footer>
    </form>
  `;
  document.body.appendChild(dialog);
  return dialog;
}

/** @returns {Promise<void>} */
export function showEditorOnlyGateDialog() {
  const dialog = ensureEditorOnlyDialog();
  return new Promise((resolve) => {
    const onClose = () => {
      dialog.removeEventListener("close", onClose);
      resolve();
    };
    dialog.addEventListener("close", onClose);
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
      resolve();
    }
  });
}

export async function gateMouseDiaryNavigation(href, base = window.location.href) {
  if (!isPublishedSite() || !isMouseDiaryHref(href, base)) {
    return false;
  }
  await showEditorOnlyGateDialog();
  return true;
}

/** Readers who land on mouse-diary.html are sent home after the notice. */
export async function redirectPublishedMouseDiaryAway() {
  if (!isPublishedSite()) return false;

  const main = document.querySelector("main");
  if (main) {
    main.innerHTML = `
      <section class="module-section editor-only-gate-placeholder">
        <p class="editor-only-gate-message">
          该功能界面限编辑者使用喵~<br>
          体验编辑者视角的网页模板请联系作者喵~
        </p>
      </section>
    `;
  }

  await showEditorOnlyGateDialog();

  const basePath = getSiteBasePath();
  const homeUrl = `${basePath}index.html`;
  try {
    window.history.replaceState({ vokaSpa: true }, "", homeUrl);
  } catch {
    /* ignore */
  }
  window.location.replace(homeUrl);
  return true;
}
