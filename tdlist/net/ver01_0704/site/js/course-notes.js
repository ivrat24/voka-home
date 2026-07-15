import { escapeHtml } from "./layout.js";
import { canEditNotes, fetchJson } from "./runtime.js";
import { bindNoteDownloadButtons } from "./note-download.js";
import { initCourseMaterials } from "./course-materials.js";
import { fetchDevManifestJson } from "./notes-api.js";

export function resolveNotePageHref(slug, fromUrl = window.location.href) {
  const path = new URL(fromUrl, window.location.href).pathname;
  const file = `${slug}.html`;
  if (path.includes("/pages/notes/")) return file;
  if (path.includes("/pages/")) return `notes/${file}`;
  return `pages/notes/${file}`;
}

export function resolveCourseDetailHref(courseSlug, fromUrl = window.location.href) {
  const path = new URL(fromUrl, window.location.href).pathname;
  const query = `course-detail.html?course=${encodeURIComponent(courseSlug)}`;
  if (path.includes("/pages/")) return query;
  return `pages/${query}`;
}

export function resolveNoteEditHref(slug, basePath = "") {
  return `${basePath}pages/course.html?edit=${encodeURIComponent(slug)}#note-editor`;
}

export function getCourseSlugFromNote(note) {
  if (note?.courseSlug) return note.courseSlug;
  const slug = note?.slug || "";
  const parts = slug.split("/");
  return parts.length > 1 ? parts[0] : "未分类";
}

function deriveCoursesFromNotes(notes) {
  const map = new Map();
  for (const note of notes) {
    const slug = getCourseSlugFromNote(note);
    const entry = map.get(slug) || {
      slug,
      title: slug.replace(/_/g, " "),
      noteCount: 0,
      latestDate: "",
    };
    entry.noteCount += 1;
    const date = note.date || "";
    if (date && date > entry.latestDate) entry.latestDate = date;
    map.set(slug, entry);
  }
  return [...map.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

function renderNoteTags(tags = []) {
  if (!tags.length) return "";
  return tags.map((tag) => `<span class="note-tag">${escapeHtml(tag)}</span>`).join("");
}

function renderNoteCard(note, href, editHref) {
  const date = note.date
    ? `<time class="note-card-date" datetime="${escapeHtml(note.date)}">${escapeHtml(note.date)}</time>`
    : "";
  const description = note.description
    ? `<p class="note-card-desc">${escapeHtml(note.description)}</p>`
    : "";
  const tags = renderNoteTags(note.tags);
  const editBtn = canEditNotes()
    ? `<a class="note-card-edit btn btn-ghost btn-sm local-only" href="${escapeHtml(editHref)}">编辑</a>`
    : "";
  const downloadBtn = `<button type="button" class="note-card-download btn btn-ghost btn-sm" data-note-download="${escapeHtml(note.slug)}">PDF</button>`;

  return `
    <article class="note-card note-entry">
      <a class="note-card-hit" href="${escapeHtml(href)}" aria-label="打开笔记：${escapeHtml(note.title)}"></a>
      <div class="note-card-body">
        <div class="note-entry-top">
          <h3 class="note-card-title">${escapeHtml(note.title)}</h3>
          ${date}
        </div>
        ${description}
        ${tags ? `<div class="note-card-tags">${tags}</div>` : ""}
      </div>
      <div class="note-card-actions">
        ${editBtn}
        ${downloadBtn}
        <span class="note-card-arrow" aria-hidden="true">阅读</span>
      </div>
    </article>
  `;
}

function renderCourseCard(course, href) {
  const count = course.noteCount || 0;
  const meta = [
    `${count} 篇笔记`,
    course.latestDate ? `更新于 ${escapeHtml(course.latestDate)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return `
    <article class="course-folder-card notes-vault-item">
      <a class="course-folder-card__hit" href="${escapeHtml(href)}" aria-label="进入课程：${escapeHtml(course.title)}"></a>
      <div class="course-folder-card__mark" aria-hidden="true"></div>
      <div class="course-folder-card__body">
        <h3 class="course-folder-card__title">${escapeHtml(course.title)}</h3>
        <p class="course-folder-card__meta muted">${meta}</p>
      </div>
      <span class="course-folder-card__count" aria-hidden="true">${count}</span>
      <span class="course-folder-card__arrow" aria-hidden="true">进入</span>
    </article>
  `;
}

export async function fetchNoteManifest(basePath = "") {
  const dev = await fetchDevManifestJson();
  if (dev) return dev;
  const data = await fetchJson(`${basePath}note_content/manifest.json`, "noteManifest");
  if (!data) throw new Error("无法加载笔记索引");
  return data;
}

function renderCourseIndex(container, manifest) {
  const notes = Array.isArray(manifest?.notes) ? manifest.notes : [];
  const courses = Array.isArray(manifest?.courses) && manifest.courses.length
    ? manifest.courses
    : deriveCoursesFromNotes(notes);

  if (!courses.length) {
    container.innerHTML = `
      <div class="note-index-empty content-card">
        <p class="muted">暂无课程文件夹。</p>
        <p>在笔记编辑器中新建课程文件夹并保存笔记，或于 <code>note_content/</code> 添加 Markdown 后运行 <code>python sync/build-notes.py</code>。</p>
      </div>
    `;
    return;
  }

  const cards = courses
    .map((course) => renderCourseCard(course, resolveCourseDetailHref(course.slug)))
    .join("");

  const generated = manifest.generatedAt
    ? `<p class="note-index-meta muted">共 ${courses.length} 门课程 · 索引 ${escapeHtml(manifest.generatedAt)}</p>`
    : `<p class="note-index-meta muted">共 ${courses.length} 门课程</p>`;

  container.innerHTML = `${generated}<div class="course-folder-grid notes-vault-list">${cards}</div>`;
}

function renderNoteIndex(container, manifest, basePath = "", courseSlug = null) {
  const notes = Array.isArray(manifest?.notes) ? manifest.notes : [];
  const filtered = courseSlug
    ? notes.filter((note) => getCourseSlugFromNote(note) === courseSlug)
    : notes;

  if (!filtered.length) {
    container.innerHTML = `
      <div class="note-index-empty content-card">
        <p class="muted">该课程下暂无笔记。</p>
        <p class="local-only">可在课程页打开笔记工作区新建文档，或运行 <code>python sync/build-notes.py</code> 重建索引。</p>
      </div>
    `;
    return;
  }

  const cards = filtered
    .map((note) => {
      const href = resolveNotePageHref(note.slug);
      const editHref = `course.html?edit=${encodeURIComponent(note.slug)}#note-editor`;
      return renderNoteCard(note, href, editHref);
    })
    .join("");

  container.innerHTML = `<div class="note-index-grid notes-entry-list">${cards}</div>`;
  bindNoteDownloadButtons(container, basePath);
}

export async function loadCourseNoteIndex(basePath = "", containerId = "course-note-index", manifestOverride = null) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const manifest = manifestOverride || (await fetchNoteManifest(basePath));
    renderCourseIndex(container, manifest);
  } catch {
    container.innerHTML = `
      <div class="note-index-empty content-card">
        <p class="muted">无法加载课程索引。</p>
        <p>请运行 <code>python sync/build-all.py</code> 后刷新页面。</p>
      </div>
    `;
  }
}

export async function loadCourseDetail(basePath = "", courseSlug = "") {
  const slug = (courseSlug || new URLSearchParams(window.location.search).get("course") || "").trim();
  const titleEl = document.getElementById("course-detail-title");
  const breadcrumbEl = document.getElementById("course-detail-breadcrumb-name");
  const noteContainer = document.getElementById("course-detail-notes");
  const metaEl = document.getElementById("course-detail-meta");

  if (!slug) {
    if (noteContainer) {
      noteContainer.innerHTML = `<p class="muted">未指定课程，请从<a href="course.html">课程索引</a>进入。</p>`;
    }
    return;
  }

  try {
    const manifest = await fetchNoteManifest(basePath);
    const courses = Array.isArray(manifest?.courses) ? manifest.courses : deriveCoursesFromNotes(manifest.notes || []);
    const course = courses.find((item) => item.slug === slug) || { slug, title: slug.replace(/_/g, " "), noteCount: 0 };
    const displayTitle = course.title || slug;

    if (titleEl) titleEl.textContent = displayTitle;
    if (breadcrumbEl) breadcrumbEl.textContent = displayTitle;
    document.title = `${displayTitle} · 课程 · Alstr（Call Sign ☘ VLinv）`;

    if (metaEl) {
      metaEl.textContent = `${course.noteCount || 0} 篇笔记${course.latestDate ? ` · 最近更新 ${course.latestDate}` : ""}`;
    }

    if (noteContainer) {
      renderNoteIndex(noteContainer, manifest, basePath, slug);
    }

    await initCourseMaterials(slug, basePath, manifest);
  } catch {
    if (noteContainer) {
      noteContainer.innerHTML = `<p class="muted">无法加载课程内容。</p>`;
    }
  }
}

export async function loadCoursePreviewFromManifest(basePath = "", containerId = "course-list") {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const manifest = await fetchNoteManifest(basePath);
    const notes = Array.isArray(manifest?.notes) ? manifest.notes : [];
    const courses = Array.isArray(manifest?.courses) && manifest.courses.length
      ? manifest.courses.slice(0, 2)
      : deriveCoursesFromNotes(notes).slice(0, 2);

    if (!courses.length) {
      container.innerHTML = `<li class="zone-placeholder">暂无课程</li>`;
      return;
    }

    container.innerHTML = courses
      .map((course) => {
        const href = resolveCourseDetailHref(course.slug);
        const date = course.latestDate ? ` · ${escapeHtml(course.latestDate)}` : "";
        return `<li><a class="zone-note-link" href="${escapeHtml(href)}">${escapeHtml(course.title)}</a>${date}</li>`;
      })
      .join("");
  } catch {
    container.innerHTML = `<li class="zone-placeholder">课程预览暂不可用</li>`;
  }
}
