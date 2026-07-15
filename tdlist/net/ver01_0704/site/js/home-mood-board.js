import { escapeHtml } from "./layout.js";
import { fetchMoodForHome } from "./mouse-diary-api.js";
import { isPublishedSite } from "./runtime.js";

function formatMoodTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function renderMoodBoard(mood) {
  const body = document.getElementById("hero-mood-body");
  if (!body) return;

  const diaryHref = "pages/mouse-diary.html";
  const emptyLink = isPublishedSite()
    ? ""
    : `<a class="hero-mood-link muted" href="${diaryHref}">去写一条 →</a>`;
  const moodLink = isPublishedSite()
    ? ""
    : `<a class="hero-mood-link muted" href="${diaryHref}">管理心情贴 →</a>`;

  if (!mood?.content) {
    body.innerHTML = `
      <p class="hero-side-placeholder">暂无心情贴</p>
      ${emptyLink}
    `;
    return;
  }

  const time = formatMoodTime(mood.createdAt || mood.updatedAt);
  body.innerHTML = `
    <div class="hero-mood-card">
      <p class="hero-mood-text">${escapeHtml(mood.content)}</p>
      <div class="hero-mood-meta">
        <time datetime="${escapeHtml(mood.createdAt || mood.updatedAt || "")}">${escapeHtml(time)}</time>
        ${mood.featured ? '<span class="hero-mood-pin">指定</span>' : '<span class="hero-mood-pin hero-mood-pin--auto">最新</span>'}
      </div>
    </div>
    ${moodLink}
  `;
}

export async function initHomeMoodBoard() {
  const board = document.getElementById("hero-mood-board");
  if (!board) return;

  try {
    const mood = await fetchMoodForHome();
    renderMoodBoard(mood);
  } catch {
    renderMoodBoard(null);
  }
}

export function refreshHomeMoodBoard() {
  void initHomeMoodBoard();
}
