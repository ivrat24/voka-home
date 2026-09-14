/** Lightweight Markdown → HTML (matches sync/build-notes.py subset). */

import { renderMathBlockHtml, renderMathInlineHtml } from "./math-render.js";

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function looksLikeDiagram(codeLang, body) {
  const lang = String(codeLang || "").trim().toLowerCase();
  if (["diagram", "flow", "ascii"].includes(lang)) return true;
  if (!["", "text", "txt", "plain"].includes(lang)) return false;
  const sample = String(body || "").trim();
  if (!sample) return false;
  const markers = ["→", "▼", "│", "──", "├", "└", "↔", "=>", "->"];
  const hits = markers.filter((m) => sample.includes(m)).length;
  const lines = sample.split(/\n/).filter((ln) => ln.trim());
  return hits >= 1 && lines.length >= 2;
}

function diagramStepClass(label, index, total) {
  const text = String(label || "").toLowerCase();
  const classes = ["note-flow-step"];
  if (/(核心|core|ip 云|ip云|骨干)/.test(text)) classes.push("note-flow-step--core");
  else if (/(接入|ran|bras|边缘|access|olt|onu)/.test(text)) classes.push("note-flow-step--accent");
  else if (index === 0 || index === total - 1) classes.push("note-flow-step--accent");
  return classes.join(" ");
}

function renderFlowSteps(steps, labels = []) {
  if (!steps.length) return "";
  const parts = ['<div class="note-flow" role="list">'];
  steps.forEach((step, i) => {
    parts.push(`<div class="${diagramStepClass(step, i, steps.length)}" role="listitem">${escapeHtml(step)}</div>`);
    if (i < steps.length - 1) {
      const label = labels[i] || "";
      const labelHtml = label
        ? `<span class="note-flow-arrow-label">${escapeHtml(label)}</span>`
        : "";
      parts.push(
        `<div class="note-flow-arrow" aria-hidden="true"><span class="note-flow-arrow-line"></span><span class="note-flow-arrow-head">▼</span>${labelHtml}</div>`,
      );
    }
  });
  parts.push("</div>");
  return parts.join("");
}

function renderNoteDiagramHtml(codeLang, body) {
  const lines = String(body || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let mode = "auto";
  const raw = [];
  for (const ln of lines) {
    const stripped = ln.trim();
    if (!raw.length && ["flow", "tree", "split", "auto"].includes(stripped.toLowerCase())) {
      mode = stripped.toLowerCase();
      continue;
    }
    raw.push(ln);
  }
  while (raw.length && !raw[0].trim()) raw.shift();
  while (raw.length && !raw[raw.length - 1].trim()) raw.pop();

  const lang = String(codeLang || "").trim().toLowerCase();
  if (lang === "flow") mode = "flow";
  if (lang === "tree") mode = "tree";

  const nonEmpty = raw.filter((ln) => ln.trim());
  const mostlyFlow = nonEmpty.every(
    (ln) => ln.includes("→") || ln.includes("->") || !/[│├└╲]/.test(ln),
  );

  if (mode === "flow" || (mode === "auto" && mostlyFlow && nonEmpty.length >= 2)) {
    const steps = [];
    const edgeLabels = [];
    for (const ln of raw) {
      let s = ln.trim();
      if (!s) continue;
      s = s.replace(/^[→\-\s▼│]+/, "").trim().replace(/^\[|\]$/g, "");
      if (s.includes("|") && !s.startsWith("http")) {
        const [left, right] = s.split("|", 2);
        if (steps.length) {
          edgeLabels[edgeLabels.length - 1] = left.trim();
          steps.push(right.trim());
          edgeLabels.push("");
        } else {
          steps.push((right || left).trim());
          edgeLabels.push("");
        }
      } else {
        steps.push(s);
        edgeLabels.push("");
      }
    }
    const cleaned = steps.filter(Boolean);
    if (cleaned.length >= 2) {
      return `<figure class="note-diagram note-diagram--flow"><div class="note-diagram-title">流程示意</div>${renderFlowSteps(cleaned, edgeLabels)}</figure>`;
    }
  }

  if (mode === "tree" || /[├└┬]/.test(body)) {
    let root = "";
    const children = [];
    for (const ln of raw) {
      const s = ln.trim();
      if (!s) continue;
      if (/[├└┬]/.test(ln)) {
        const child = s.replace(/^[─\s│├└┬─]+/, "").replace(/^──\s*/, "").replace(/[ ·.…]+$/g, "").trim();
        if (child) children.push(child);
      } else if (s.includes("──") && (s.includes("分光") || s.includes("OLT") || (s.match(/──/g) || []).length >= 2)) {
        const parts = s.split(/─{2,}/).map((p) => p.replace(/^[┬├└│\s]+/, "").trim()).filter((p) => p && p !== "…" && p !== "...");
        if (parts.length) {
          root = parts[0];
          children.push(...parts.slice(1));
        }
      } else if (!root) {
        root = s.replace(/^\[|\]$/g, "").trim();
      } else {
        children.push(s.replace(/^\[|\]$/g, "").trim());
      }
    }
    if (root && children.length) {
      const kids = children
        .map((c, i) => `<div class="${diagramStepClass(c, i, children.length)}">${escapeHtml(c)}</div>`)
        .join("");
      return `<figure class="note-diagram note-diagram--tree"><div class="note-diagram-title">结构示意</div><div class="note-tree"><div class="${diagramStepClass(root, 0, 1)} note-tree-root">${escapeHtml(root)}</div><div class="note-flow-arrow" aria-hidden="true"><span class="note-flow-arrow-line"></span><span class="note-flow-arrow-head">▼</span></div><div class="note-tree-branch">${kids}</div></div></figure>`;
    }
  }

  const steps = [];
  for (const ln of raw) {
    let s = ln.trim();
    if (!s) continue;
    if (/^[│┼┤├└┌┐┘┴┬─═\\|/\-\s]+$/.test(s)) continue;
    if (s.startsWith("╲") || s.startsWith("╱")) continue;
    s = s.replace(/^[│\s▼→\-─=]+/, "").replace(/[│╲].*$/, "").trim().replace(/^\[|\]$/g, "").replace(/^=+|=+$/g, "").trim();
    if (s.length >= 2) steps.push(s);
  }
  const deduped = [];
  for (const st of steps) {
    if (!deduped.length || deduped[deduped.length - 1] !== st) deduped.push(st);
  }
  if (deduped.length >= 2) {
    return `<figure class="note-diagram note-diagram--flow"><div class="note-diagram-title">结构示意</div>${renderFlowSteps(deduped)}</figure>`;
  }

  return `<figure class="note-diagram note-diagram--fallback"><div class="note-diagram-title">示意</div><pre class="note-code-block note-diagram-pre"><code>${escapeHtml(String(body || "").trim())}</code></pre></figure>`;
}

function parseNetworkMapSource(body) {
  const meta = { title: "网络图", id: "", default: "local", collapsed: "true" };
  const views = {};
  let current = null;
  let nodes = [];
  let edges = [];
  let focus = [];
  let preset = "";

  const flush = () => {
    if (!current) return;
    views[current] = { nodes, edges, focus };
    if (current === "global" && preset) views[current].preset = preset;
    nodes = [];
    edges = [];
    focus = [];
    preset = "";
  };

  for (const raw of String(body || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const section = line.match(/^\[(local|global)\]$/i);
    if (section) {
      flush();
      current = section[1].toLowerCase();
      continue;
    }
    if (line.includes("=") && !/[>→]/.test(line) && !line.includes("|")) {
      const idx = line.indexOf("=");
      const key = line.slice(0, idx).trim().toLowerCase();
      const val = line.slice(idx + 1).trim();
      if (current == null) {
        if (key === "defaultview") meta.default = val;
        else if (["title", "id", "default", "collapsed", "expanded"].includes(key)) meta[key] = val;
        continue;
      }
      if (key === "preset") {
        preset = val.toLowerCase();
        continue;
      }
    }
    if (current == null) current = "local";
    const edge = line.match(/^([\w\-.]+)\s*(?:->|>|→)\s*([\w\-.]+)(?:\|(.*))?$/);
    if (edge) {
      edges.push({ from: edge[1], to: edge[2], label: (edge[3] || "").trim() });
      continue;
    }
    if (line.toLowerCase().startsWith("focus:")) {
      focus = line.split(":")[1].split(",").map((p) => p.trim()).filter(Boolean);
      continue;
    }
    const node = line.match(/^([\w\-.]+)(?:\|([^|]*))?(?:\|([\w\-]*))?$/);
    if (node) {
      nodes.push({
        id: node[1],
        label: (node[2] || node[1]).trim(),
        role: (node[3] || "default").trim() || "default",
      });
    }
  }
  flush();
  if (!Object.keys(views).length) return null;
  const collapsed =
    String(meta.expanded || "").toLowerCase() === "true"
      ? false
      : String(meta.collapsed ?? "true").toLowerCase() !== "false";
  return {
    title: meta.title || "网络图",
    id: meta.id || "",
    defaultView: (meta.default || "local").toLowerCase(),
    collapsed,
    views,
  };
}

function renderNetworkMapHtml(body) {
  const data = parseNetworkMapSource(body);
  if (!data?.views) {
    return `<figure class="note-diagram note-diagram--fallback"><div class="note-diagram-title">网络图（解析失败）</div><pre class="note-code-block"><code>${escapeHtml(String(body || "").trim())}</code></pre></figure>`;
  }
  let defaultView = data.defaultView || "local";
  if (!data.views[defaultView]) {
    defaultView = data.views.local ? "local" : Object.keys(data.views)[0];
  }
  const payload = JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  const collapsedClass = data.collapsed === false ? "is-expanded" : "is-collapsed";
  return (
    `<figure class="note-network-map ${collapsedClass}" data-network-map data-default-view="${escapeHtml(defaultView)}" data-map-id="${escapeHtml(data.id || "")}" data-expanded="${data.collapsed === false ? "1" : "0"}">` +
    `<div class="note-network-map__toolbar"><div class="note-network-map__heading">` +
    `<span class="note-network-map__kicker">Network Transmit</span><strong class="note-network-map__title">${escapeHtml(data.title)}</strong>` +
    `<span class="note-network-map__hint muted">默认折叠 · 点击展开交互示意</span></div></div>` +
    `<div class="note-network-map__viewport" data-view="${escapeHtml(defaultView)}" hidden><div class="note-network-map__stage"></div></div>` +
    `<script type="application/json" class="note-network-map__data">${payload}</script>` +
    `</figure>`
  );
}

const INLINE_PATTERN = /(\$[^$\n]+\$|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function renderInlineNonMath(text) {
  const parts = text.split(INLINE_PATTERN);
  return parts
    .map((part) => {
      if (!part) return "";
      if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
        return renderMathInlineHtml(part.slice(1, -1));
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return `<em>${escapeHtml(part.slice(1, -1))}</em>`;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        return `<a href="${escapeHtml(link[2])}">${escapeHtml(link[1])}</a>`;
      }
      return escapeHtml(part);
    })
    .join("");
}

function renderInline(text) {
  const parts = text.split(/(\\\([\s\S]*?\\\))/g);
  return parts
    .map((part) => {
      if (!part) return "";
      if (part.startsWith("\\(") && part.endsWith("\\)")) {
        return renderMathInlineHtml(part.slice(2, -2));
      }
      return renderInlineNonMath(part);
    })
    .join("");
}

export function extractMathBlocks(md) {
  const blocks = [];
  const register = (inner) => {
    const index = blocks.length;
    blocks.push(inner.trim());
    return `\n@@MATH${index}@@\n`;
  };

  let text = md.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => register(inner));
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => register(inner));
  return { text, blocks };
}

function isTableRow(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2;
}

function isTableSeparator(line) {
  if (!isTableRow(line)) return false;
  return parseTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")));
}

function parseTableRow(line) {
  const cells = [];
  let current = "";
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  let inParenMath = false;
  let inDollarMath = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    const next = trimmed[i + 1] ?? "";
    const prev = trimmed[i - 1] ?? "";

    if (!inDollarMath && char === "\\" && next === "(") {
      inParenMath = true;
      current += char + next;
      i += 1;
      continue;
    }
    if (inParenMath && char === "\\" && next === ")") {
      inParenMath = false;
      current += char + next;
      i += 1;
      continue;
    }
    if (!inParenMath && char === "$" && prev !== "\\") {
      inDollarMath = !inDollarMath;
    }
    if (char === "|" && prev !== "\\" && !inParenMath && !inDollarMath) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function renderTableHtml(tableLines, sourceLine = null) {
  if (tableLines.length < 2) return "";
  const lineAttr = sourceLine != null ? ` data-source-line="${sourceLine}"` : "";
  const header = parseTableRow(tableLines[0]);
  const bodyRows = tableLines.slice(2).map(parseTableRow);
  const headHtml = header.map((cell) => `<th>${renderInline(cell)}</th>`).join("");
  const bodyHtml = bodyRows
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="note-table-wrap"${lineAttr}><table class="note-table"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
}

function isRatLine(trimmed) {
  return /^#rat1#$/i.test(trimmed) || /^#rat2#$/i.test(trimmed);
}

function ratVariant(trimmed) {
  return /^#rat2#$/i.test(trimmed) ? "thick" : "thin";
}

export function parseFrontmatter(raw) {
  const text = raw.replace(/\r\n/g, "\n");
  if (!text.startsWith("---")) {
    return { meta: {}, body: text };
  }
  const parts = text.split("---");
  if (parts.length < 3) {
    return { meta: {}, body: text };
  }
  const fmBlock = parts[1];
  const body = parts.slice(2).join("---").replace(/^\n/, "");
  const meta = {};
  for (const line of fmBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes(":")) continue;
    const idx = trimmed.indexOf(":");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      meta[key] = inner
        ? inner.split(",").map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
        : [];
    } else {
      meta[key] = value.replace(/^['"]|['"]$/g, "");
    }
  }
  return { meta, body };
}

export function buildFrontmatter(meta, body) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(meta)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(", ")}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---", "");
  return `${lines.join("\n")}${body.replace(/^\n+/, "")}`;
}

export function markdownToHtml(md) {
  const { text, blocks } = extractMathBlocks(md);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inCode = false;
  let codeLang = "";
  let codeLines = [];
  let listType = null;
  /** @type {string[]} */
  let listStack = [];
  let inMathBlock = false;
  let mathBlockLines = [];
  let mathBlockStartLine = -1;
  let codeStartLine = -1;
  let moduleOpen = false;
  let olOpen = false;

  const nextNonBlankTrimmed = (fromIndex) => {
    for (let j = fromIndex + 1; j < lines.length; j += 1) {
      const candidate = lines[j].trim();
      if (candidate) return candidate;
    }
    return "";
  };

  const openModule = () => {
    if (!moduleOpen) {
      out.push('<section class="note-module">');
      moduleOpen = true;
    }
  };

  const closeModule = () => {
    if (moduleOpen) {
      out.push("</section>");
      moduleOpen = false;
    }
  };

  const emitRatDivider = (variant) => {
    closeModule();
    out.push(`<div class="note-rat-divider note-rat--${variant}" role="separator" aria-hidden="true"></div>`);
  };

  const closeMathBlock = () => {
    if (!inMathBlock) return;
    openModule();
    const lineAttr = mathBlockStartLine >= 0 ? ` data-source-line="${mathBlockStartLine}"` : "";
    out.push(renderMathBlockHtml(mathBlockLines.join("\n")).replace(
      /^<div class="note-math-block"/,
      `<div class="note-math-block"${lineAttr}`,
    ));
    inMathBlock = false;
    mathBlockLines = [];
    mathBlockStartLine = -1;
  };

  const closeListsToDepth = (depth) => {
    while (listStack.length > depth + 1) {
      out.push("</ul>");
      listStack.pop();
    }
    listType = listStack.length ? "ul" : null;
  };

  const closeUlLists = () => {
    closeListsToDepth(-1);
    if (listType === "ul") listType = null;
  };

  const closeOlList = () => {
    if (olOpen) {
      out.push("</ol>");
      olOpen = false;
    }
    if (listType === "ol") listType = null;
  };

  const closeAllLists = () => {
    closeUlLists();
    closeOlList();
  };

  const listDepthFromIndent = (spaces) => Math.floor(spaces.length / 2);

  const closeCode = () => {
    if (!inCode) return;
    openModule();
    const isMath = codeLang === "math" || codeLang === "latex";
    const lineAttr = codeStartLine >= 0 ? ` data-source-line="${codeStartLine}"` : "";
    const body = codeLines.join("\n");
    if (isMath) {
      out.push(renderMathBlockHtml(body).replace(
        /^<div class="note-math-block"/,
        `<div class="note-math-block"${lineAttr}`,
      ));
    } else if (["network", "netmap", "nmap"].includes(String(codeLang || "").trim().toLowerCase())) {
      const html = renderNetworkMapHtml(body);
      out.push(lineAttr ? html.replace("<figure ", `<figure${lineAttr} `) : html);
    } else if (looksLikeDiagram(codeLang, body)) {
      const html = renderNoteDiagramHtml(codeLang, body);
      out.push(lineAttr ? html.replace("<figure ", `<figure${lineAttr} `) : html);
    } else {
      const langClass = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : "";
      out.push(`<pre${lineAttr}><code${langClass}>${escapeHtml(body)}</code></pre>`);
    }
    inCode = false;
    codeLines = [];
    codeLang = "";
    codeStartLine = -1;
  };

  const pushContent = (html) => {
    openModule();
    out.push(html);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const mathToken = trimmed.match(/^@@MATH(\d+)@@$/);
    if (mathToken) {
      closeAllLists();
      pushContent(renderMathBlockHtml(blocks[Number(mathToken[1])] || ""));
      continue;
    }

    if (
      isTableRow(line) &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      closeAllLists();
      const tableLines = [line, lines[i + 1]];
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j]) && !isTableSeparator(lines[j])) {
        tableLines.push(lines[j]);
        j += 1;
      }
      pushContent(renderTableHtml(tableLines, i));
      i = j - 1;
      continue;
    }

    if (inMathBlock) {
      if (trimmed.endsWith("$$")) {
        const beforeClose = trimmed.slice(0, -2);
        if (beforeClose) mathBlockLines.push(beforeClose);
        closeAllLists();
        closeMathBlock();
      } else {
        mathBlockLines.push(line);
      }
      continue;
    }

    const singleMath = line.match(/^\s*\$\$(.+)\$\$\s*$/);
    if (singleMath) {
      closeAllLists();
      pushContent(renderMathBlockHtml(singleMath[1]).replace(
        /^<div class="note-math-block"/,
        `<div class="note-math-block" data-source-line="${i}"`,
      ));
      continue;
    }

    const openMath = line.match(/^\s*\$\$(.+)$/);
    if (openMath && !trimmed.endsWith("$$")) {
      closeAllLists();
      inMathBlock = true;
      mathBlockStartLine = i;
      mathBlockLines = [openMath[1]];
      continue;
    }

    if (trimmed === "$$") {
      closeAllLists();
      inMathBlock = true;
      mathBlockStartLine = i;
      mathBlockLines = [];
      continue;
    }

    if (trimmed.startsWith("```")) {
      if (inCode) closeCode();
      else {
        closeAllLists();
        inCode = true;
        codeStartLine = i;
        codeLang = trimmed.slice(3).trim();
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (!trimmed) {
      const next = nextNonBlankTrimmed(i);
      const continuesOl = olOpen && /^\d+\.\s/.test(next);
      const continuesUl = listType === "ul" && /^[-*+]\s/.test(next);
      if (!continuesOl && !continuesUl) closeAllLists();
      continue;
    }
    if (isRatLine(trimmed)) {
      closeAllLists();
      emitRatDivider(ratVariant(trimmed));
      continue;
    }
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      closeAllLists();
      pushContent(`<hr data-source-line="${i}">`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeAllLists();
      const level = heading[1].length;
      pushContent(`<h${level} data-source-line="${i}">${renderInline(heading[2].trim())}</h${level}>`);
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeAllLists();
      pushContent(`<blockquote data-source-line="${i}"><p>${renderInline(quote[1])}</p></blockquote>`);
      continue;
    }
    const ul = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ul) {
      openModule();
      const depth = listDepthFromIndent(ul[1]);
      closeListsToDepth(depth);
      while (listStack.length <= depth) {
        out.push('<ul class="note-list">');
        listStack.push("ul");
      }
      listType = "ul";
      out.push(`<li data-source-line="${i}">${renderInline(ul[2])}</li>`);
      continue;
    }
    const ol = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (ol) {
      openModule();
      closeUlLists();
      if (!olOpen) {
        out.push('<ol class="note-list">');
        olOpen = true;
      }
      listType = "ol";
      out.push(`<li data-source-line="${i}">${renderInline(ol[2])}</li>`);
      continue;
    }
    closeAllLists();
    pushContent(`<p data-source-line="${i}">${renderInline(line)}</p>`);
  }
  closeAllLists();
  closeCode();
  closeMathBlock();
  closeModule();
  return out.join("\n");
}

export function slugFromPath(path) {
  return path.replace(/\.md$/i, "").replace(/\\/g, "/");
}

export function titleFromSlug(slug) {
  const name = slug.split("/").pop() || slug;
  return name.replace(/[_-]+/g, " ").trim() || slug;
}

export function defaultNoteContent(title, folder = "") {
  const today = new Date().toISOString().slice(0, 10);
  const body = `#rat2#\n\n## ${title}\n\n在此撰写课程笔记…\n`;
  return buildFrontmatter(
    {
      title,
      date: today,
      tags: folder ? [folder.split("/")[0]] : ["course"],
      description: "",
    },
    body,
  );
}
