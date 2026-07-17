import { escapeHtml, getSiteBasePath } from "./layout.js";
import { parseFrontmatter, titleFromSlug } from "./markdown.js";
import { renderOptimizedNoteHtml } from "./note-layout.js";
import { typesetMathIn } from "./math-render.js";
import { isFileProtocol, loadEmbeddedJson, canEditNotes, siteBrandLabel } from "./runtime.js";
import { readNoteFile } from "./notes-api.js";
import { fetchNoteManifest, getCourseSlugFromNote } from "./course-notes.js";
import { noteMetaFromContent } from "./note-publish.js";

const PDF_EXPORT_TIMEOUT_MS = 120000;

export function resolveNoteMarkdownHref(slug, basePath = getSiteBasePath()) {
  return `${basePath}note_content/${slug}.md`;
}

async function loadMarkdownContent(slug, basePath = getSiteBasePath()) {
  const fileName = `${slug}.md`;

  try {
    const res = await fetch(resolveNoteMarkdownHref(slug, basePath), { cache: "no-store" });
    if (res.ok) return res.text();
  } catch {
    /* fall through */
  }

  const sources = await loadEmbeddedJson("noteSources");
  const content = sources?.[fileName];
  if (content) return content;

  throw new Error("无法读取该笔记内容");
}

function extractBodyHtml(bodyEl) {
  if (!bodyEl) return "";
  const main = bodyEl.querySelector(".note-layout-main");
  if (main) return main.innerHTML;
  const clone = bodyEl.cloneNode(true);
  clone.querySelector(".note-toc--side")?.remove();
  return clone.innerHTML;
}

async function renderBodyHtmlFromMarkdown(md, fallbackTitle = "note") {
  const { meta, body } = parseFrontmatter(md);
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-9999px;top:0;width:794px;visibility:hidden;pointer-events:none";
  document.body.appendChild(host);
  host.className = "note-body note-body--optimized";
  host.innerHTML = renderOptimizedNoteHtml(body);
  typesetMathIn(host);
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  const bodyHtml = extractBodyHtml(host);
  host.remove();
  return {
    title: String(meta.title || fallbackTitle),
    bodyHtml,
  };
}

function pdfFileName(slug) {
  const base = slug.split("/").pop() || "note";
  return `${base.replace(/\.md$/i, "")}.pdf`;
}

let pdfExportCssTextPromise = null;
const scriptLoaders = new Map();

function loadVendorScript(basePath, fileName) {
  const src = new URL(`${basePath}js/vendor/${fileName}`, window.location.href).href;
  if (scriptLoaders.has(src)) return scriptLoaders.get(src);

  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-voka-pdf="${fileName}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`无法加载 ${fileName}`)), { once: true });
      if (existing.dataset.loaded === "1") resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.vokaPdf = fileName;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error(`无法加载 ${fileName}`));
    document.head.appendChild(script);
  });

  scriptLoaders.set(src, promise);
  return promise;
}

async function loadPdfLibs(basePath = getSiteBasePath()) {
  await loadVendorScript(basePath, "html2canvas.min.js");
  await loadVendorScript(basePath, "jspdf.umd.min.js");
  const html2canvas = window.html2canvas;
  const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
  if (!html2canvas || !jsPDF) throw new Error("PDF 生成库未就绪");
  return { html2canvas, jsPDF };
}

function cssFileUrl(basePath, name) {
  return new URL(`${basePath}css/${name}`, window.location.href).href;
}

function absolutizeCssUrls(css, basePath = getSiteBasePath()) {
  const cssBase = new URL(`${basePath}css/`, window.location.href).href;
  return css.replace(/url\((['"]?)(?!data:|https?:|blob:|file:)([^)'"]+)\1?\)/gi, (_match, _quote, rel) => {
    try {
      return `url("${new URL(rel.trim(), cssBase).href}")`;
    } catch {
      return _match;
    }
  });
}

async function loadPdfExportCssText(basePath = getSiteBasePath()) {
  if (pdfExportCssTextPromise) return pdfExportCssTextPromise;

  pdfExportCssTextPromise = (async () => {
    let cssText = "";
    if (isFileProtocol()) {
      cssText = await loadEmbeddedJson("pdfExportCss");
      if (!cssText) throw new Error("离线 PDF 样式未就绪，请运行 python sync/build-site-data.py");
    } else {
      const loadText = async (name) => {
        const res = await fetch(cssFileUrl(basePath, name), { cache: "force-cache" });
        if (!res.ok) throw new Error(`无法读取 ${name}`);
        return res.text();
      };
      const [katexCss, pdfCss] = await Promise.all([loadText("katex.min.css"), loadText("pdf-export.css")]);
      cssText = `${katexCss}\n${pdfCss}`;
    }
    return absolutizeCssUrls(cssText, basePath);
  })();

  return pdfExportCssTextPromise;
}

function buildExportArticle(title, bodyHtml) {
  const article = document.createElement("article");
  article.className = "note-article note-article--reading note-pdf-export";
  article.innerHTML = `
    <header class="note-article-head">
      <h1>${escapeHtml(title)}</h1>
    </header>
    <div class="note-body note-body--optimized">${bodyHtml}</div>
  `;
  return article;
}

function escapeStyleText(css) {
  return css.replace(/<\/style/gi, "<\\/style");
}

async function createExportFrame(pdfCssText) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");
  iframe.style.cssText =
    "position:fixed;left:-120vw;top:0;width:794px;height:100vh;border:0;pointer-events:none;z-index:-1;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>${escapeStyleText(pdfCssText)}</style>
</head>
<body style="margin:0;background:#ffffff;"></body>
</html>`);
  doc.close();

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return { iframe, doc };
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

function saveCanvasToPdf(canvas, jsPDF, filename) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const margin = { top: 12, right: 14, bottom: 14, left: 14 };
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const innerWidth = pageWidth - margin.left - margin.right;
  const innerHeight = pageHeight - margin.top - margin.bottom;

  const pxFullHeight = canvas.height;
  const pxPageHeight = Math.floor(canvas.width * (innerHeight / innerWidth));
  const nPages = Math.max(1, Math.ceil(pxFullHeight / pxPageHeight));

  const pageCanvas = document.createElement("canvas");
  const pageCtx = pageCanvas.getContext("2d");
  pageCanvas.width = canvas.width;

  for (let page = 0; page < nPages; page += 1) {
    let sliceHeight = pxPageHeight;
    if (page === nPages - 1 && pxFullHeight % pxPageHeight !== 0) {
      sliceHeight = pxFullHeight % pxPageHeight;
    }
    pageCanvas.height = sliceHeight;
    pageCtx.fillStyle = "#ffffff";
    pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    pageCtx.drawImage(
      canvas,
      0,
      page * pxPageHeight,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight
    );

    const imgData = pageCanvas.toDataURL("image/jpeg", 0.92);
    const renderHeight = (sliceHeight * innerWidth) / canvas.width;
    if (page > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", margin.left, margin.top, innerWidth, renderHeight);
  }

  pdf.save(filename);
}

async function exportNodeToPdf(exportNode, iframe, fileName, basePath) {
  const { html2canvas, jsPDF } = await loadPdfLibs(basePath);
  const win = iframe.contentWindow;

  const canvas = await html2canvas(exportNode, {
    backgroundColor: "#ffffff",
    scale: 1.5,
    useCORS: true,
    logging: false,
    windowWidth: exportNode.scrollWidth || 794,
    windowHeight: exportNode.scrollHeight || 1123,
    scrollX: 0,
    scrollY: 0,
    ...(win ? { window: win } : {}),
  });

  if (canvas.width < 2 || canvas.height < 2) {
    throw new Error("PDF 内容为空，请刷新页面后重试");
  }

  saveCanvasToPdf(canvas, jsPDF, fileName);
}

async function prepareRenderedContent(slug, basePath) {
  if (document.body.dataset.noteSlug === slug) {
    const title = document.querySelector(".note-article-head h1")?.textContent?.trim() || pdfFileName(slug);
    const bodyEl = document.querySelector(".note-body");
    if (bodyEl?.innerHTML) {
      return { title, bodyHtml: extractBodyHtml(bodyEl) };
    }
  }

  const md = await loadMarkdownContent(slug, basePath);
  return renderBodyHtmlFromMarkdown(md, slug.split("/").pop() || slug);
}

export async function downloadNotePdf(slug, basePath = getSiteBasePath()) {
  const fileName = pdfFileName(slug);
  const { title, bodyHtml } = await prepareRenderedContent(slug, basePath);
  const pdfCssText = await loadPdfExportCssText(basePath);

  let iframe = null;
  try {
    const frame = await createExportFrame(pdfCssText);
    iframe = frame.iframe;
    const exportNode = buildExportArticle(title, bodyHtml);
    frame.doc.body.appendChild(exportNode);

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    if (exportNode.offsetHeight < 20) {
      throw new Error("PDF 内容布局失败，请刷新页面后重试");
    }

    await withTimeout(
      exportNodeToPdf(exportNode, iframe, fileName, basePath),
      PDF_EXPORT_TIMEOUT_MS,
      "PDF 生成超时，请稍后重试"
    );
    return true;
  } finally {
    iframe?.remove();
  }
}

/** @deprecated */
export async function downloadNoteRendered(slug, basePath = getSiteBasePath()) {
  return downloadNotePdf(slug, basePath);
}

/** @deprecated */
export async function downloadNoteMarkdown(slug, basePath = getSiteBasePath()) {
  return downloadNotePdf(slug, basePath);
}

function bindDownloadButton(btn, slug, basePath) {
  btn.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "生成 PDF…";
    try {
      await downloadNotePdf(slug, basePath);
    } catch (error) {
      window.alert(error.message || "PDF 下载失败");
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });
}

function applyNotePageMeta(note, basePath = getSiteBasePath()) {
  const { title, date, tags, description, slug } = note;

  const titleEl = document.getElementById("note-page-title") || document.querySelector(".note-article-head h1");
  if (titleEl) titleEl.textContent = title;

  const breadcrumbTitle =
    document.getElementById("note-page-breadcrumb-title") ||
    [...document.querySelectorAll(".breadcrumb > span:not([aria-hidden])")].at(-1);
  if (breadcrumbTitle) breadcrumbTitle.textContent = title;

  document.title = `${title} · 课程笔记 · ${siteBrandLabel()}`;

  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", description || title);

  const head = document.querySelector(".note-article-head");
  if (!head) return;

  let dateEl = head.querySelector(".note-meta");
  if (date) {
    if (!dateEl) {
      dateEl = document.createElement("p");
      dateEl.className = "note-meta";
      titleEl?.after(dateEl);
    }
    dateEl.innerHTML = `<time datetime="${escapeHtml(date)}">${escapeHtml(date)}</time>`;
  } else {
    dateEl?.remove();
  }

  let tagsEl = head.querySelector(".note-tags");
  if (tags.length) {
    const tagHtml = tags.map((tag) => `<span class="note-tag">${escapeHtml(tag)}</span>`).join("");
    if (!tagsEl) {
      tagsEl = document.createElement("div");
      tagsEl.className = "note-tags";
      const descEl = head.querySelector(".note-description");
      if (descEl) head.insertBefore(tagsEl, descEl);
      else head.appendChild(tagsEl);
    }
    tagsEl.innerHTML = tagHtml;
  } else {
    tagsEl?.remove();
  }

  let descEl = head.querySelector(".note-description");
  if (description) {
    if (!descEl) {
      descEl = document.createElement("p");
      descEl.className = "note-description";
      head.appendChild(descEl);
    }
    descEl.textContent = description;
  } else {
    descEl?.remove();
  }

  void syncCourseBreadcrumbTitle(slug, basePath);
}

async function syncCourseBreadcrumbTitle(slug, basePath = getSiteBasePath()) {
  try {
    const courseSlug = getCourseSlugFromNote({ slug });
    const manifest = await fetchNoteManifest(basePath);
    const courses = Array.isArray(manifest?.courses) ? manifest.courses : [];
    const course = courses.find((item) => item.slug === courseSlug);
    const courseTitle = course?.title || titleFromSlug(courseSlug);
    const link = document.querySelector('.breadcrumb a[href*="course-detail"]');
    if (link) link.textContent = courseTitle;
  } catch {
    /* keep static breadcrumb */
  }
}

export async function hydrateNotePageMeta(basePath = getSiteBasePath()) {
  const slug = document.body.dataset.noteSlug?.trim();
  if (!slug) return;

  try {
    const { content } = await readNoteFile(`${slug}.md`);
    applyNotePageMeta(noteMetaFromContent(`${slug}.md`, content), basePath);
    return;
  } catch {
    /* fall through */
  }

  try {
    const manifest = await fetchNoteManifest(basePath);
    const note = (manifest?.notes || []).find((item) => item.slug === slug);
    if (note) {
      applyNotePageMeta(
        {
          slug,
          title: note.title,
          date: note.date || "",
          tags: Array.isArray(note.tags) ? note.tags : [],
          description: note.description || "",
        },
        basePath,
      );
    }
  } catch {
    /* keep baked HTML */
  }
}

export function initNotePageActions(basePath = getSiteBasePath()) {
  const slug = document.body.dataset.noteSlug;
  if (!slug) return;

  const downloadBtn = document.getElementById("note-download-btn");
  if (downloadBtn) bindDownloadButton(downloadBtn, slug, basePath);

  const editLink = document.getElementById("note-edit-link");
  if (editLink) {
    editLink.hidden = !canEditNotes();
    if (canEditNotes()) {
      const editHref = `${basePath}pages/course.html?edit=${encodeURIComponent(slug)}#note-editor`;
      editLink.href = editHref;
      editLink.addEventListener("click", (event) => {
        event.preventDefault();
        window.location.assign(editHref);
      });
    }
  }
}

export function bindNoteDownloadButtons(root = document, basePath = getSiteBasePath()) {
  root.querySelectorAll("[data-note-download]").forEach((btn) => {
    const slug = btn.getAttribute("data-note-download");
    if (slug) bindDownloadButton(btn, slug, basePath);
  });
}
