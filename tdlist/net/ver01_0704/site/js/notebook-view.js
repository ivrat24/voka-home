import { escapeHtml } from "./layout.js";
import { markdownToHtml, titleFromSlug } from "./markdown.js";
import { typesetMathIn } from "./math-render.js";
import { fetchNoteManifest, resolveCourseDetailHref } from "./course-notes.js";
import { resolveMaterialUrl, isNotebookMaterial, readCourseMaterialFile } from "./notes-api.js";
import { siteBrandLabel } from "./runtime.js";

function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, iframe, object, embed, link[rel='import']").forEach((el) => el.remove());
  return doc.body.innerHTML;
}

function joinOutputText(value) {
  if (Array.isArray(value)) return value.join("");
  return String(value ?? "");
}

function renderOutputData(data) {
  if (!data || typeof data !== "object") return "";

  if (data["image/png"]) {
    return `<img class="nb-output-image" src="data:image/png;base64,${data["image/png"]}" alt="">`;
  }
  if (data["image/jpeg"]) {
    return `<img class="nb-output-image" src="data:image/jpeg;base64,${data["image/jpeg"]}" alt="">`;
  }
  if (data["text/html"]) {
    return `<div class="nb-output-html">${sanitizeHtml(joinOutputText(data["text/html"]))}</div>`;
  }
  if (data["text/markdown"]) {
    return `<div class="nb-output-markdown content-body">${markdownToHtml(joinOutputText(data["text/markdown"]))}</div>`;
  }
  if (data["text/plain"]) {
    return `<pre class="nb-output-text">${escapeHtml(joinOutputText(data["text/plain"]))}</pre>`;
  }
  if (data["application/json"]) {
    return `<pre class="nb-output-text">${escapeHtml(joinOutputText(data["application/json"]))}</pre>`;
  }

  const mime = Object.keys(data)[0];
  if (!mime) return "";
  return `<pre class="nb-output-text muted">[${escapeHtml(mime)} 输出]</pre>`;
}

function renderCellOutputs(outputs = []) {
  if (!outputs.length) return "";
  const blocks = outputs
    .map((output) => {
      if (output.output_type === "stream") {
        const text = escapeHtml(joinOutputText(output.text));
        const name = output.name === "stderr" ? "stderr" : "stdout";
        return `<pre class="nb-output-stream nb-output-stream--${name}">${text}</pre>`;
      }
      if (output.output_type === "error") {
        const trace = escapeHtml(joinOutputText(output.traceback || output.ename || "Error"));
        return `<pre class="nb-output-error">${trace}</pre>`;
      }
      if (output.output_type === "execute_result" || output.output_type === "display_data") {
        return renderOutputData(output.data);
      }
      return "";
    })
    .filter(Boolean)
    .join("");

  return blocks ? `<div class="nb-cell-output">${blocks}</div>` : "";
}

function renderNotebookCell(cell, codeIndex) {
  const cellType = cell.cell_type || "code";
  const source = joinOutputText(cell.source);

  if (cellType === "markdown") {
    return `
      <section class="nb-cell nb-cell--markdown content-card">
        <div class="nb-cell-body content-body">${markdownToHtml(source)}</div>
      </section>
    `;
  }

  if (cellType === "raw") {
    return `
      <section class="nb-cell nb-cell--raw content-card">
        <pre class="nb-cell-raw">${escapeHtml(source)}</pre>
      </section>
    `;
  }

  const lang = cell.metadata?.language || "python";
  const outputs = renderCellOutputs(cell.outputs);
  const label = codeIndex >= 0 ? `In [${codeIndex + 1}]` : "In [ ]";
  return `
    <section class="nb-cell nb-cell--code content-card">
      <div class="nb-cell-label muted">${label}</div>
      <pre class="nb-cell-code"><code class="language-${escapeHtml(lang)}">${escapeHtml(source)}</code></pre>
      ${outputs}
    </section>
  `;
}

export async function loadNotebookView(basePath = "") {
  const params = new URLSearchParams(window.location.search);
  const courseSlug = (params.get("course") || "").trim();
  const filename = (params.get("file") || "").trim();
  const titleEl = document.getElementById("notebook-view-title");
  const breadcrumbCourse = document.getElementById("notebook-breadcrumb-course");
  const breadcrumbFile = document.getElementById("notebook-breadcrumb-file");
  const container = document.getElementById("notebook-view-body");
  const downloadBtn = document.getElementById("notebook-download-btn");
  const backLink = document.getElementById("notebook-back-link");

  if (!courseSlug || !filename || !isNotebookMaterial(filename)) {
    if (container) {
      container.innerHTML = `<p class="muted">无效的 Notebook 参数，请从<a href="course.html">课程页</a>进入。</p>`;
    }
    return;
  }

  const materialUrl = resolveMaterialUrl(`note_content/${courseSlug}/materials/${filename}`, basePath);
  const courseHref = resolveCourseDetailHref(courseSlug);
  let courseTitle = titleFromSlug(courseSlug);

  try {
    const manifest = await fetchNoteManifest(basePath);
    const course = (manifest?.courses || []).find((item) => item.slug === courseSlug);
    if (course?.title) courseTitle = course.title;
  } catch {
    /* use slug title */
  }

  if (titleEl) titleEl.textContent = filename;
  if (breadcrumbCourse) {
    breadcrumbCourse.textContent = courseTitle;
    breadcrumbCourse.href = courseHref;
  }
  if (breadcrumbFile) breadcrumbFile.textContent = filename;
  if (backLink) backLink.href = courseHref;
  if (downloadBtn) {
    downloadBtn.href = materialUrl;
    downloadBtn.setAttribute("download", filename);
  }
  document.title = `${filename} · Notebook · ${siteBrandLabel()}`;

  if (!container) return;
  container.innerHTML = `<p class="muted">加载 Notebook…</p>`;

  try {
    const raw = await readCourseMaterialFile(courseSlug, filename, basePath);
    const notebook = JSON.parse(raw);
    const cells = Array.isArray(notebook.cells) ? notebook.cells : [];

    if (!cells.length) {
      container.innerHTML = `<p class="muted">Notebook 中没有单元格。</p>`;
      return;
    }

    let codeIndex = 0;
    container.innerHTML = cells
      .map((cell) => {
        if ((cell.cell_type || "code") === "code") {
          const html = renderNotebookCell(cell, codeIndex);
          codeIndex += 1;
          return html;
        }
        return renderNotebookCell(cell, -1);
      })
      .join("");
    typesetMathIn(container);
  } catch (error) {
    const message = error.message || "未知错误";
    container.innerHTML = `<p class="muted">无法打开 Notebook：${escapeHtml(message)}</p>`;
  }
}
