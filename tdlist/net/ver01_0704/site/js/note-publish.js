import { escapeHtml, getSiteBasePath, notePathPrefixesFromSlug } from "./layout.js";
import { parseFrontmatter, titleFromSlug } from "./markdown.js";
import { renderOptimizedNoteHtml } from "./note-layout.js";
import {
  fetchNotesTree,
  readNoteFile,
  tryLocalRebuild,
  writeFsManifest,
  writeSiteNotePage,
  hasSiteDirectory,
  fetchDevManifestJson,
} from "./notes-api.js";
import { loadCourseNoteIndex, resolveNotePageHref, getCourseSlugFromNote } from "./course-notes.js";

export function noteMetaFromContent(path, content) {
  const { meta, body } = parseFrontmatter(content);
  const slug = path.replace(/\.md$/i, "");
  const description = String(meta.description || "");
  return {
    slug,
    title: String(meta.title || titleFromSlug(slug)),
    date: String(meta.date || ""),
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    description,
    body,
    source: `note_content/${path}`,
    href: `pages/notes/${slug}.html`,
  };
}

export function renderNotePageHtml(note) {
  const { site: sitePrefix, pages: pagesPrefix } = notePathPrefixesFromSlug(note.slug);
  const tagHtml = note.tags
    .map((tag) => `<span class="note-tag">${escapeHtml(tag)}</span>`)
    .join("");
  const descHtml = note.description
    ? `<p class="note-description">${escapeHtml(note.description)}</p>`
    : "";
  const bodyHtml = renderOptimizedNoteHtml(note.body);
  const safeTitle = escapeHtml(note.title);
  const safeDate = escapeHtml(note.date);
  const safeSlug = escapeHtml(note.slug);
  const courseSlug = getCourseSlugFromNote(note);
  const safeCourseTitle = escapeHtml(titleFromSlug(courseSlug));
  const courseHref = `${pagesPrefix}course-detail.html?course=${encodeURIComponent(courseSlug)}`;

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(note.description || note.title)}">
  <title>${safeTitle} · 课程笔记 · 鼠窝</title>
  <link rel="icon" href="${sitePrefix}static/icons/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="${sitePrefix}static/icons/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="${sitePrefix}static/icons/favicon.png">
  <link rel="stylesheet" href="${sitePrefix}css/style.css">
</head>
<body data-note-slug="${safeSlug}">
  <div class="page-bg" aria-hidden="true">
    <img class="page-bg-image" src="${sitePrefix}static/image/image01.jpg" alt="">
    <div class="page-bg-overlay"></div>
  </div>
  <header class="site-header">
    <nav class="nav" aria-label="主导航">
      <a class="nav-brand" href="${sitePrefix}index.html">
        <span class="nav-brand-text"><span class="local-only">Alstr<span class="call-sign">（Call Sign ☘ VLinv）</span></span><span class="published-only">鼠窝</span></span>
        <span class="nav-version">v0.12.0</span>
      </a>
      <ul class="nav-links" id="nav-links">
        <li><a href="${sitePrefix}index.html">首页</a></li>
        <li><a href="${pagesPrefix}course.html" class="is-active">课程</a></li>
        <li><a href="${pagesPrefix}agent-lab.html">智能体试验</a></li>
        <li><a href="${pagesPrefix}virtual-arrange.html">虚拟编曲</a></li>
        <li><a href="${pagesPrefix}mouse-diary.html">鼠の事件簿</a></li>
      </ul>
      <div class="nav-actions">
        <button class="btn-icon btn-icon--trail is-active" id="cursor-trail-toggle" type="button" aria-label="关闭红叶李拖尾效果" aria-pressed="true" title="红叶李拖尾：开">✿</button>
        <button class="btn-icon" id="theme-toggle" type="button" aria-label="切换主题" title="切换主题">◐</button>
      </div>
    </nav>
  </header>
  <main class="main-layout module-page note-page">
    <nav class="breadcrumb" aria-label="面包屑">
      <a href="${sitePrefix}index.html">首页</a>
      <span aria-hidden="true">/</span>
      <a href="${pagesPrefix}course.html">课程</a>
      <span aria-hidden="true">/</span>
      <a href="${courseHref}">${safeCourseTitle}</a>
      <span aria-hidden="true">/</span>
      <span id="note-page-breadcrumb-title">${safeTitle}</span>
    </nav>
    <article class="note-article note-article--reading content-card">
      <header class="note-article-head">
        <h1 id="note-page-title">${safeTitle}</h1>
        ${safeDate ? `<p class="note-meta"><time datetime="${safeDate}">${safeDate}</time></p>` : ""}
        ${tagHtml ? `<div class="note-tags">${tagHtml}</div>` : ""}
        ${descHtml}
      </header>
      <div class="note-body note-body--optimized content-body">${bodyHtml}</div>
    </article>
    <div class="note-page-actions">
      <button type="button" class="btn btn-ghost btn-sm" id="note-download-btn">下载 PDF</button>
      <a class="btn btn-ghost btn-sm local-only" id="note-edit-link" href="${pagesPrefix}course.html?edit=${encodeURIComponent(note.slug)}#note-editor">编辑</a>
      <a class="btn btn-ghost btn-sm" href="${courseHref}">← 返回课程</a>
    </div>
  </main>
  <footer class="site-footer">
    <p><span class="local-only">© 2026 Alstr（Call Sign ☘ VLinv）· v0.12.0</span><span class="published-only">© 2026 鼠窝 · v0.12.0</span></p>
  </footer>
  <script src="${sitePrefix}js/boot.js" data-page="course-note"></script>
</body>
</html>`;
}

export async function buildManifestFromStorage() {
  const tree = await fetchNotesTree();
  const notes = [];
  for (const file of tree.files) {
    try {
      const { content } = await readNoteFile(file.path);
      const meta = noteMetaFromContent(file.path, content);
      notes.push({
        slug: meta.slug,
        title: meta.title,
        date: meta.date,
        tags: meta.tags,
        description: meta.description,
        source: meta.source,
        href: meta.href,
      });
    } catch {
      /* skip unreadable */
    }
  }
  notes.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (a.title || "").localeCompare(b.title || ""));
  return {
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 19).replace("T", "T"),
    contentDir: "note_content",
    notes,
  };
}

export async function publishSavedNote(mdPath, content) {
  const slug = mdPath.replace(/\.md$/i, "");
  const basePath = getSiteBasePath();
  const pageHref = resolveNotePageHref(slug);

  const serverRebuild = await tryLocalRebuild();
  if (serverRebuild) {
    const manifest = await fetchServerManifest();
    await loadCourseNoteIndex(basePath, "course-note-index", manifest);
    return {
      slug,
      pageHref,
      published: true,
      message: "已保存并生成笔记网页",
    };
  }

  const meta = noteMetaFromContent(mdPath, content);
  const manifest = await buildManifestFromStorage();
  await writeFsManifest(JSON.stringify(manifest, null, 2) + "\n");

  let pageWritten = false;
  if (hasSiteDirectory()) {
    const html = renderNotePageHtml(meta);
    pageWritten = await writeSiteNotePage(slug, html);
  }

  await loadCourseNoteIndex(basePath, "course-note-index", manifest);

  if (pageWritten) {
    return {
      slug,
      pageHref,
      published: true,
      message: "已保存并生成笔记网页",
    };
  }

  return {
    slug,
    pageHref,
    published: false,
    message: "已保存。连接 site 文件夹或运行 python sync/server.py 可自动生成笔记网页",
  };
}

async function fetchServerManifest() {
  const dev = await fetchDevManifestJson();
  if (dev) return dev;
  return buildManifestFromStorage();
}
