#!/usr/bin/env python3
"""Scan site/note_content and generate manifest + static note pages (Quartz-style)."""

from __future__ import annotations

import html
import json
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
NOTE_DIR = ROOT / "site" / "note_content"
NOTES_OUT = ROOT / "site" / "pages" / "notes"
MANIFEST_FILE = NOTE_DIR / "manifest.json"
MATERIALS_DIR_NAME = "materials"


def parse_frontmatter(raw: str) -> tuple[dict, str]:
    text = raw.replace("\r\n", "\n")
    if not text.startswith("---"):
        return {}, text

    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text

    meta: dict = {}
    for line in parts[1].strip().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            meta[key] = [item.strip().strip("'\"") for item in inner.split(",") if item.strip()] if inner else []
        else:
            meta[key] = value.strip("'\"")

    return meta, parts[2].lstrip("\n")


def slug_from_path(path: Path) -> str:
    rel = path.relative_to(NOTE_DIR).with_suffix("")
    return str(rel).replace("\\", "/")


def title_from_slug(slug: str) -> str:
    name = slug.split("/")[-1]
    return re.sub(r"[_\-]+", " ", name).strip() or slug


def normalize_rat_markers(md: str) -> str:
    md = re.sub(r"[ \t]*#rat1#[ \t]*", "\n#rat1#\n", md, flags=re.IGNORECASE)
    md = re.sub(r"[ \t]*#rat2#[ \t]*", "\n#rat2#\n", md, flags=re.IGNORECASE)
    return re.sub(r"\n{3,}", "\n\n", md)


def optimize_note_markdown(md: str) -> str:
    if not md:
        return ""
    md = normalize_rat_markers(md)
    lines = md.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out: list[str] = []
    prev_blank = True
    prev_was_heading = False
    prev_was_bold = False
    in_fence = False
    in_math = False

    i = 0
    while i < len(lines):
        line = re.sub(r"[ \t]+$", "", lines[i])
        trimmed = line.strip()

        if trimmed.startswith("```"):
            in_fence = not in_fence
            if not prev_blank and out:
                out.append("")
                prev_blank = True
            out.append(line)
            prev_blank = False
            prev_was_heading = False
            prev_was_bold = False
            i += 1
            continue
        if in_fence:
            out.append(line)
            i += 1
            continue

        if in_math:
            out.append(line)
            if trimmed.endswith("$$"):
                in_math = False
            i += 1
            continue

        if trimmed.startswith("$$"):
            if trimmed != "$$" and trimmed.endswith("$$"):
                out.append(line)
                prev_blank = False
                prev_was_heading = False
                i += 1
                continue
            if not prev_blank and out:
                out.append("")
                prev_blank = True
            in_math = True
            out.append(line)
            prev_blank = False
            prev_was_heading = False
            i += 1
            continue

        is_heading = bool(re.match(r"^#{1,6}\s", trimmed))
        is_hr = trimmed in ("---", "***", "___")
        is_rat = bool(re.match(r"^#rat[12]#$", trimmed, re.IGNORECASE))
        is_list = bool(re.match(r"^([-*+]|\d+\.)\s", trimmed))
        is_blank = not trimmed
        is_bold = bool(re.match(r"^\*\*.+\*\*\s*$", trimmed))

        if is_heading and not prev_blank and out:
            out.append("")
            prev_blank = True
        if (is_list or is_hr or is_rat) and not prev_blank and out:
            out.append("")
            prev_blank = True
        if is_list and prev_was_bold:
            out.append("")
            prev_blank = True

        if is_blank:
            while i + 1 < len(lines) and not lines[i + 1].strip():
                i += 1
            if not prev_blank:
                out.append("")
            prev_blank = True
            prev_was_heading = False
            prev_was_bold = False
            i += 1
            continue

        out.append(line)
        prev_blank = False
        prev_was_heading = is_heading
        prev_was_bold = is_bold
        i += 1

    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()


def extract_note_description(body: str, max_len: int = 160) -> str:
    text = optimize_note_markdown(body)
    text = re.sub(r"^#{1,6}\s+.+$", "", text, flags=re.MULTILINE)
    text = re.sub(r"\$\$[\s\S]*?\$\$", "", text)
    text = re.sub(r"```[\s\S]*?```", "", text)
    text = re.sub(r"#rat[12]#", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[*_`>#\-]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""
    return text if len(text) <= max_len else text[: max_len - 1] + "…"


def annotate_note_body_html(body_html: str) -> str:
    slug_counts: dict[str, int] = {}

    def heading_repl(match: re.Match[str]) -> str:
        level = match.group(1)
        text = match.group(2)
        base = re.sub(r"[^\w\u4e00-\u9fff-]", "", text.strip().lower().replace(" ", "-"))[:48] or "section"
        count = slug_counts.get(base, 0)
        slug_counts[base] = count + 1
        hid = base if count == 0 else f"{base}-{count + 1}"
        return f'<h{level} id="{html.escape(hid)}" class="note-heading note-heading--h{level}">{text}</h{level}>'

    body_html = re.sub(r"<h([1-6])>([^<]+)</h\1>", heading_repl, body_html)
    body_html = body_html.replace("<p>", '<p class="note-paragraph">')
    body_html = body_html.replace("<ul>", '<ul class="note-list">')
    body_html = body_html.replace("<ol>", '<ol class="note-list">')
    body_html = body_html.replace("<blockquote>", '<blockquote class="note-quote">')
    body_html = re.sub(r"<pre(?![^>]*note-math-block)", '<pre class="note-code-block"', body_html)
    return body_html


def wrap_note_page_layout(body_html: str, min_headings: int = 2) -> str:
    headings = re.findall(r'<h([2-4]) id="([^"]+)" class="note-heading">([^<]+)</h\1>', body_html)
    if len(headings) < min_headings:
        return body_html
    toc_items = "".join(
        f'<li class="note-toc-item note-toc-item--h{level}"><a href="#{html.escape(hid, quote=True)}">{html.escape(title)}</a></li>'
        for level, hid, title in headings
    )
    toc = (
        f'<aside class="note-toc note-toc--side" aria-label="目录">'
        f'<p class="note-toc-title">目录</p><ol class="note-toc-list">{toc_items}</ol></aside>'
    )
    return f'<div class="note-layout-with-toc"><div class="note-layout-main">{body_html}</div>{toc}</div>'


def render_optimized_note_html(md: str) -> str:
    body = annotate_note_body_html(markdown_to_html(optimize_note_markdown(md)))
    return wrap_note_page_layout(body)


def parse_network_map_source(body: str) -> dict:
    """Parse ```network fence into {title, id, defaultView, collapsed, views:{local,global}}."""
    meta: dict[str, str] = {"title": "网络图", "id": "", "default": "local", "collapsed": "true"}
    views: dict[str, dict] = {}
    current: str | None = None
    nodes: list[dict] = []
    edges: list[dict] = []
    focus: list[str] = []
    preset = ""

    def flush() -> None:
        nonlocal nodes, edges, focus, preset
        if not current:
            return
        views[current] = {
            "nodes": nodes,
            "edges": edges,
            "focus": focus,
        }
        if current == "global" and preset:
            views[current]["preset"] = preset
        nodes, edges, focus, preset = [], [], [], ""

    for raw in body.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        section = re.match(r"^\[(local|global)\]$", line, re.I)
        if section:
            flush()
            current = section.group(1).lower()
            continue
        if "=" in line and not re.search(r"[>→]", line) and "|" not in line:
            key, _, val = line.partition("=")
            key = key.strip().lower()
            val = val.strip()
            if current is None:
                if key == "defaultview":
                    meta["default"] = val
                elif key in {"title", "id", "default", "collapsed", "expanded"}:
                    meta[key] = val
                continue
            if key == "preset":
                preset = val.lower()
                continue
        if current is None:
            current = "local"
        edge = re.match(r"^([\w\-.]+)\s*(?:->|>|→)\s*([\w\-.]+)(?:\|(.*))?$", line)
        if edge:
            edges.append(
                {
                    "from": edge.group(1),
                    "to": edge.group(2),
                    "label": (edge.group(3) or "").strip(),
                }
            )
            continue
        if line.lower().startswith("focus:"):
            focus = [p.strip() for p in line.split(":", 1)[1].split(",") if p.strip()]
            continue
        node = re.match(r"^([\w\-.]+)(?:\|([^|]*))?(?:\|([\w\-]*))?$", line)
        if node:
            nodes.append(
                {
                    "id": node.group(1),
                    "label": (node.group(2) or node.group(1)).strip(),
                    "role": (node.group(3) or "default").strip() or "default",
                }
            )
    flush()
    if not views:
        return {}
    collapsed = True
    if str(meta.get("expanded", "")).lower() == "true":
        collapsed = False
    elif str(meta.get("collapsed", "true")).lower() == "false":
        collapsed = False
    return {
        "title": meta.get("title") or "网络图",
        "id": meta.get("id") or "",
        "defaultView": (meta.get("default") or "local").lower(),
        "collapsed": collapsed,
        "views": views,
    }


def _layout_network_nodes(nodes: list[dict], edges: list[dict], width: float, height: float) -> dict[str, dict[str, float]]:
    ids = [n["id"] for n in nodes]
    indeg = {i: 0 for i in ids}
    outs: dict[str, list[str]] = {i: [] for i in ids}
    for e in edges:
        if e["to"] in indeg:
            indeg[e["to"]] += 1
        if e["from"] in outs:
            outs[e["from"]].append(e["to"])

    layers: list[list[str]] = []
    placed: set[str] = set()
    frontier = [i for i in ids if indeg[i] == 0] or list(ids)
    while len(placed) < len(ids):
        layer = [i for i in frontier if i not in placed]
        if not layer:
            rest = [i for i in ids if i not in placed]
            if not rest:
                break
            layers.append(rest)
            placed.update(rest)
            break
        layers.append(layer)
        placed.update(layer)
        nxt: list[str] = []
        for i in layer:
            for to in outs.get(i, []):
                if to not in placed and to not in nxt:
                    nxt.append(to)
        frontier = nxt or [i for i in ids if i not in placed]

    pad_x, pad_y = 56.0, 48.0
    positions: dict[str, dict[str, float]] = {}
    col_w = width / 2 if len(layers) <= 1 else (width - pad_x * 2) / max(len(layers) - 1, 1)
    for li, layer in enumerate(layers):
        x = width / 2 if len(layers) == 1 else pad_x + li * col_w
        row_h = height / 2 if len(layer) <= 1 else (height - pad_y * 2) / max(len(layer) - 1, 1)
        for ni, nid in enumerate(layer):
            y = height / 2 if len(layer) == 1 else pad_y + ni * row_h
            positions[nid] = {"x": x, "y": y}
    return positions


_ROLE_STROKE = {
    "host": "#60a5fa",
    "cpe": "#38bdf8",
    "access": "#34d399",
    "edge": "#fbbf24",
    "core": "#a78bfa",
    "peer": "#f472b6",
    "default": "#94a3b8",
}


def _render_network_view_svg(view: dict, *, mode: str, title: str) -> str:
    nodes = view.get("nodes") or []
    edges = view.get("edges") or []
    focus = set(view.get("focus") or [])
    width = 920 if mode == "global" else 640
    height = max(220, 72 + max(len(nodes), 3) * 42)
    positions = _layout_network_nodes(nodes, edges, width, height)

    edge_svg = []
    for e in edges:
        a = positions.get(e["from"])
        b = positions.get(e["to"])
        if not a or not b:
            continue
        muted = focus and e["from"] not in focus and e["to"] not in focus
        cls = "nmap-edge is-muted" if muted else "nmap-edge"
        edge_svg.append(
            f'<line class="{cls}" x1="{a["x"]:.1f}" y1="{a["y"]:.1f}" x2="{b["x"]:.1f}" y2="{b["y"]:.1f}" />'
        )

    node_svg = []
    for n in nodes:
        p = positions.get(n["id"], {"x": width / 2, "y": height / 2})
        role = n.get("role") or "default"
        color = _ROLE_STROKE.get(role, _ROLE_STROKE["default"])
        focused = (not focus) or n["id"] in focus
        label = n.get("label") or n["id"]
        tw = min(160, max(72, len(label) * 12 + 24))
        cls = "nmap-node is-focus" if focused else "nmap-node is-muted"
        node_svg.append(
            f'<g class="{cls}" data-node-id="{html.escape(n["id"], quote=True)}" '
            f'transform="translate({p["x"]:.1f}, {p["y"]:.1f})">'
            f'<rect x="{-tw/2:.1f}" y="-18" width="{tw:.1f}" height="36" rx="12" '
            f'fill="{color}" fill-opacity="0.18" stroke="{color}" stroke-width="1.6" />'
            f'<text text-anchor="middle" dominant-baseline="middle" class="nmap-label">'
            f'{html.escape(label)}</text></g>'
        )

    return (
        f'<svg class="note-network-map__canvas" viewBox="0 0 {width} {height}" width="100%" height="100%" '
        f'role="img" aria-label="{html.escape(title, quote=True)}">'
        f'{"".join(edge_svg)}{"".join(node_svg)}</svg>'
    )


def render_network_map_html(body: str) -> str:
    data = parse_network_map_source(body)
    if not data or not data.get("views"):
        return (
            f'<figure class="note-diagram note-diagram--fallback">'
            f'<div class="note-diagram-title">网络图（解析失败）</div>'
            f'<pre class="note-code-block"><code>{html.escape(body.strip())}</code></pre></figure>'
        )

    default_view = data.get("defaultView") or "local"
    if default_view not in data["views"]:
        default_view = "local" if "local" in data["views"] else next(iter(data["views"]))
    # Keep JSON safe inside <script> (avoid breaking on </script>)
    payload = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e")
    map_id = html.escape(data.get("id") or "", quote=True)
    collapsed = data.get("collapsed", True)
    collapsed_cls = "is-collapsed" if collapsed else "is-expanded"
    expanded_attr = "0" if collapsed else "1"
    return (
        f'<figure class="note-network-map {collapsed_cls}" data-network-map '
        f'data-default-view="{html.escape(default_view, quote=True)}" '
        f'data-map-id="{map_id}" data-expanded="{expanded_attr}">'
        f'<div class="note-network-map__toolbar">'
        f'<div class="note-network-map__heading"><span class="note-network-map__kicker">Network Transmit</span>'
        f'<strong class="note-network-map__title">{html.escape(data["title"])}</strong>'
        f'<span class="note-network-map__hint muted">默认折叠 · 点击展开交互示意</span></div></div>'
        f'<div class="note-network-map__viewport" data-view="{html.escape(default_view, quote=True)}" hidden>'
        f'<div class="note-network-map__stage"></div></div>'
        f'<script type="application/json" class="note-network-map__data">{payload}</script>'
        f"</figure>"
    )


def looks_like_diagram(code_lang: str, body: str) -> bool:
    lang = (code_lang or "").strip().lower()
    if lang in {"diagram", "flow", "ascii"}:
        return True
    if lang not in {"", "text", "txt", "plain"}:
        return False
    sample = body.strip()
    if not sample:
        return False
    markers = ("→", "▼", "│", "──", "├", "└", "↔", "=>", "->")
    hits = sum(1 for m in markers if m in sample)
    lines = [ln for ln in sample.splitlines() if ln.strip()]
    return hits >= 1 and len(lines) >= 2


def _diagram_step_class(label: str, index: int, total: int) -> str:
    text = label.lower()
    classes = ["note-flow-step"]
    if any(k in text for k in ("核心", "core", "ip 云", "ip云", "骨干")):
        classes.append("note-flow-step--core")
    elif any(k in text for k in ("接入", "ran", "bras", "边缘", "access", "olt", "onu")):
        classes.append("note-flow-step--accent")
    elif index == 0 or index == total - 1:
        classes.append("note-flow-step--accent")
    return " ".join(classes)


def _render_flow_steps(steps: list[str], labels: list[str] | None = None) -> str:
    if not steps:
        return ""
    labels = labels or [""] * len(steps)
    parts: list[str] = ['<div class="note-flow" role="list">']
    for i, step in enumerate(steps):
        cls = _diagram_step_class(step, i, len(steps))
        parts.append(f'<div class="{cls}" role="listitem">{html.escape(step)}</div>')
        if i < len(steps) - 1:
            label = (labels[i] if i < len(labels) else "") or ""
            label_html = (
                f'<span class="note-flow-arrow-label">{html.escape(label)}</span>' if label else ""
            )
            parts.append(
                '<div class="note-flow-arrow" aria-hidden="true">'
                '<span class="note-flow-arrow-line"></span>'
                '<span class="note-flow-arrow-head">▼</span>'
                f"{label_html}"
                "</div>"
            )
    parts.append("</div>")
    return "".join(parts)


def _parse_diagram_lines(body: str) -> tuple[str, list[str]]:
    lines = [ln.rstrip() for ln in body.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    mode = "auto"
    content: list[str] = []
    for ln in lines:
        stripped = ln.strip()
        if not content and stripped.lower() in {"flow", "tree", "split", "auto"}:
            mode = stripped.lower()
            continue
        content.append(ln)
    while content and not content[0].strip():
        content.pop(0)
    while content and not content[-1].strip():
        content.pop()
    return mode, content


def render_note_diagram_html(code_lang: str, body: str) -> str:
    mode, raw_lines = _parse_diagram_lines(body)
    lang = (code_lang or "").strip().lower()
    if lang == "flow":
        mode = "flow"
    elif lang == "tree":
        mode = "tree"

    # Explicit flow: one node per non-empty line; "label|node" optional
    if mode == "flow" or (
        mode == "auto"
        and all(
            ("→" in ln or "->" in ln or not any(ch in ln for ch in "│├└╲"))
            for ln in raw_lines
            if ln.strip()
        )
        and sum(1 for ln in raw_lines if ln.strip()) >= 2
    ):
        steps: list[str] = []
        edge_labels: list[str] = []
        for ln in raw_lines:
            s = ln.strip()
            if not s:
                continue
            s = re.sub(r"^[→\-\s▼│]+", "", s).strip()
            s = s.strip("[]")
            if "|" in s and not s.startswith("http"):
                left, right = s.split("|", 1)
                if steps:
                    edge_labels[-1] = left.strip()
                    steps.append(right.strip())
                    edge_labels.append("")
                else:
                    steps.append(right.strip() or left.strip())
                    edge_labels.append("")
            else:
                steps.append(s)
                edge_labels.append("")
        # Collapse accidental empties
        steps = [st for st in steps if st]
        if len(steps) >= 2:
            inner = _render_flow_steps(steps, edge_labels)
            return f'<figure class="note-diagram note-diagram--flow"><div class="note-diagram-title">流程示意</div>{inner}</figure>'

    # Tree: first non-empty = root; remaining lines (or ├── style) = children
    if mode == "tree" or any(x in body for x in ("├", "└", "┬")):
        root = ""
        children: list[str] = []
        for ln in raw_lines:
            s = ln.strip()
            if not s:
                continue
            if any(m in ln for m in ("├", "└", "┬")):
                child = re.sub(r"^[─\s│├└┬───]+", "", s)
                child = re.sub(r"^──\s*", "", child).strip(" ·.…")
                if child:
                    children.append(child)
            elif "──" in s and ("分光" in s or "OLT" in s or s.count("──") >= 2):
                parts = [p.strip() for p in re.split(r"─{2,}", s) if p.strip()]
                cleaned = []
                for p in parts:
                    p = re.sub(r"^[┬├└│\s]+", "", p).strip()
                    if p and p not in {"…", "..."}:
                        cleaned.append(p)
                if cleaned:
                    root = cleaned[0]
                    children.extend(cleaned[1:])
            elif not root:
                root = re.sub(r"^[\[\]\s]+|[\[\]\s]+$", "", s)
            else:
                children.append(re.sub(r"^[\[\]\s]+|[\[\]\s]+$", "", s))
        if root and children:
            kids = "".join(
                f'<div class="{_diagram_step_class(c, i, len(children))}">{html.escape(c)}</div>'
                for i, c in enumerate(children)
            )
            return (
                f'<figure class="note-diagram note-diagram--tree">'
                f'<div class="note-diagram-title">结构示意</div>'
                f'<div class="note-tree">'
                f'<div class="{_diagram_step_class(root, 0, 1)} note-tree-root">{html.escape(root)}</div>'
                f'<div class="note-flow-arrow" aria-hidden="true"><span class="note-flow-arrow-line"></span>'
                f'<span class="note-flow-arrow-head">▼</span></div>'
                f'<div class="note-tree-branch">{kids}</div>'
                f"</div></figure>"
            )

    # Generic vertical extraction: keep lines that look like nodes
    steps = []
    for ln in raw_lines:
        s = ln.strip()
        if not s:
            continue
        if set(s) <= set("│┼┤├└┌┐┘┴┬─═\\|/- "):
            continue
        if s.startswith("╲") or s.startswith("╱"):
            continue
        s = re.sub(r"^[│\s▼→\-─=]+", "", s)
        s = re.sub(r"[│╲]+.*$", "", s).strip()
        s = s.strip("[]= ")
        if len(s) >= 2:
            steps.append(s)
    # de-dup consecutive
    deduped: list[str] = []
    for st in steps:
        if not deduped or deduped[-1] != st:
            deduped.append(st)
    if len(deduped) >= 2:
        inner = _render_flow_steps(deduped)
        return f'<figure class="note-diagram note-diagram--flow"><div class="note-diagram-title">结构示意</div>{inner}</figure>'

    # Fallback: readable pre
    return (
        f'<figure class="note-diagram note-diagram--fallback">'
        f'<div class="note-diagram-title">示意</div>'
        f'<pre class="note-code-block note-diagram-pre"><code>{html.escape(body.strip())}</code></pre>'
        f"</figure>"
    )


def math_block_placeholder(latex: str) -> str:
    trimmed = latex.strip()
    if not trimmed:
        return ""
    return f'<div class="note-math-block" data-math-display="{html.escape(trimmed, quote=True)}"></div>'


def math_inline_placeholder(latex: str) -> str:
    trimmed = latex.strip()
    if not trimmed:
        return ""
    return f'<span class="note-math-inline" data-math-inline="{html.escape(trimmed, quote=True)}"></span>'


def extract_math_blocks(md: str) -> tuple[str, list[str]]:
    blocks: list[str] = []

    def repl(match: re.Match[str]) -> str:
        blocks.append(match.group(1).strip())
        return f"\n@@MATH{len(blocks) - 1}@@\n"

    text = re.sub(r"\\\[([\s\S]*?)\\\]", repl, md)
    text = re.sub(r"\$\$([\s\S]*?)\$\$", repl, text)
    return text, blocks


def is_table_row(line: str) -> bool:
    trimmed = line.strip()
    return trimmed.startswith("|") and trimmed.endswith("|") and len(trimmed) > 2


def is_table_separator(line: str) -> bool:
    if not is_table_row(line):
        return False
    return all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in parse_table_row(line))


def parse_table_row(line: str) -> list[str]:
    cells: list[str] = []
    current = ""
    trimmed = line.strip().strip("|")
    in_paren_math = False
    in_dollar_math = False
    i = 0
    while i < len(trimmed):
        char = trimmed[i]
        nxt = trimmed[i + 1] if i + 1 < len(trimmed) else ""
        prev = trimmed[i - 1] if i > 0 else ""

        if not in_dollar_math and char == "\\" and nxt == "(":
            in_paren_math = True
            current += char + nxt
            i += 2
            continue
        if in_paren_math and char == "\\" and nxt == ")":
            in_paren_math = False
            current += char + nxt
            i += 2
            continue
        if not in_paren_math and char == "$" and prev != "\\":
            in_dollar_math = not in_dollar_math
        if char == "|" and prev != "\\" and not in_paren_math and not in_dollar_math:
            cells.append(current.strip())
            current = ""
        else:
            current += char
        i += 1
    cells.append(current.strip())
    return cells


def render_table_html(table_lines: list[str], render_inline_fn) -> str:
    if len(table_lines) < 2:
        return ""
    header = parse_table_row(table_lines[0])
    body_rows = [parse_table_row(row) for row in table_lines[2:]]
    head_html = "".join(f"<th>{render_inline_fn(cell)}</th>" for cell in header)
    body_html = "".join(
        "<tr>" + "".join(f"<td>{render_inline_fn(cell)}</td>" for cell in row) + "</tr>"
        for row in body_rows
    )
    return (
        f'<div class="note-table-wrap"><table class="note-table">'
        f"<thead><tr>{head_html}</tr></thead><tbody>{body_html}</tbody></table></div>"
    )


def markdown_to_html(md: str) -> str:
    md, math_blocks = extract_math_blocks(md)
    lines = md.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    in_code = False
    code_lang = ""
    code_lines: list[str] = []
    list_type: str | None = None
    ol_open = False
    in_math_block = False
    math_block_lines: list[str] = []
    module_open = False

    def open_module() -> None:
        nonlocal module_open
        if not module_open:
            out.append('<section class="note-module">')
            module_open = True

    def close_module() -> None:
        nonlocal module_open
        if module_open:
            out.append("</section>")
            module_open = False

    def emit_rat_divider(variant: str) -> None:
        close_module()
        out.append(f'<div class="note-rat-divider note-rat--{variant}" role="separator" aria-hidden="true"></div>')

    def push_content(html: str) -> None:
        open_module()
        out.append(html)

    def close_ul() -> None:
        nonlocal list_type
        if list_type == "ul":
            out.append("</ul>")
            list_type = None

    def close_ol() -> None:
        nonlocal list_type, ol_open
        if ol_open:
            out.append("</ol>")
            ol_open = False
        if list_type == "ol":
            list_type = None

    def close_list() -> None:
        close_ul()
        close_ol()

    def next_nonblank(from_i: int) -> str:
        for j in range(from_i + 1, len(lines)):
            candidate = lines[j].strip()
            if candidate:
                return candidate
        return ""

    def close_math_block() -> None:
        nonlocal in_math_block, math_block_lines
        if not in_math_block:
            return
        push_content(math_block_placeholder("\n".join(math_block_lines)))
        in_math_block = False
        math_block_lines = []

    def close_code() -> None:
        nonlocal in_code, code_lines, code_lang
        if not in_code:
            return
        open_module()
        body = "\n".join(code_lines)
        if code_lang in ("math", "latex"):
            out.append(math_block_placeholder(body))
        elif code_lang.strip().lower() in {"network", "netmap", "nmap"}:
            out.append(render_network_map_html(body))
        elif looks_like_diagram(code_lang, body):
            out.append(render_note_diagram_html(code_lang, body))
        else:
            lang_class = f' class="language-{html.escape(code_lang)}"' if code_lang else ""
            out.append(f"<pre><code{lang_class}>{html.escape(body)}</code></pre>")
        in_code = False
        code_lines = []
        code_lang = ""

    inline_pattern = re.compile(
        r"(!\[[^\]]*\]\([^)]+\)|\$[^$\n]+\$|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))"
    )

    def render_inline(text: str) -> str:
        parts = re.split(r"(\\\([\s\S]*?\\\))", text)
        rendered: list[str] = []
        for part in parts:
            if not part:
                continue
            if part.startswith("\\(") and part.endswith("\\)"):
                rendered.append(math_inline_placeholder(part[2:-2]))
                continue
            for chunk in inline_pattern.split(part):
                if not chunk:
                    continue
                if chunk.startswith("$") and chunk.endswith("$") and len(chunk) > 2:
                    rendered.append(math_inline_placeholder(chunk[1:-1]))
                elif chunk.startswith("![") and "](" in chunk and chunk.endswith(")"):
                    match = re.match(r"!\[([^\]]*)\]\(([^)]+)\)", chunk)
                    if match:
                        alt = html.escape(match.group(1), quote=True)
                        src = html.escape(match.group(2), quote=True)
                        rendered.append(
                            f'<img class="note-embed-image" src="{src}" alt="{alt}" loading="lazy">'
                        )
                    else:
                        rendered.append(html.escape(chunk))
                elif chunk.startswith("**") and chunk.endswith("**"):
                    rendered.append(f"<strong>{html.escape(chunk[2:-2])}</strong>")
                elif chunk.startswith("*") and chunk.endswith("*"):
                    rendered.append(f"<em>{html.escape(chunk[1:-1])}</em>")
                elif chunk.startswith("`") and chunk.endswith("`"):
                    rendered.append(f"<code>{html.escape(chunk[1:-1])}</code>")
                elif chunk.startswith("[") and "](" in chunk and chunk.endswith(")"):
                    match = re.match(r"\[([^\]]+)\]\(([^)]+)\)", chunk)
                    if match:
                        rendered.append(
                            f'<a href="{html.escape(match.group(2), quote=True)}">{html.escape(match.group(1))}</a>'
                        )
                    else:
                        rendered.append(html.escape(chunk))
                else:
                    rendered.append(html.escape(chunk))
        return "".join(rendered)

    i = 0
    while i < len(lines):
        line = lines[i]
        trimmed = line.strip()
        math_token = re.match(r"^@@MATH(\d+)@@$", trimmed)
        if math_token:
            close_list()
            index = int(math_token.group(1))
            push_content(math_block_placeholder(math_blocks[index] if index < len(math_blocks) else ""))
            i += 1
            continue

        if (
            is_table_row(line)
            and i + 1 < len(lines)
            and is_table_separator(lines[i + 1])
        ):
            close_list()
            table_lines = [line, lines[i + 1]]
            j = i + 2
            while j < len(lines) and is_table_row(lines[j]) and not is_table_separator(lines[j]):
                table_lines.append(lines[j])
                j += 1
            push_content(render_table_html(table_lines, render_inline))
            i = j
            continue

        if in_math_block:
            trimmed = line.strip()
            if trimmed.endswith("$$"):
                before_close = trimmed[:-2]
                if before_close:
                    math_block_lines.append(before_close)
                close_list()
                close_math_block()
            else:
                math_block_lines.append(line)
            i += 1
            continue

        single_math = re.match(r"^\s*\$\$(.+)\$\$\s*$", line)
        if single_math:
            close_list()
            push_content(math_block_placeholder(single_math.group(1)))
            i += 1
            continue

        open_math = re.match(r"^\s*\$\$(.+)$", line)
        if open_math and not line.strip().endswith("$$"):
            close_list()
            in_math_block = True
            math_block_lines = [open_math.group(1)]
            i += 1
            continue

        if line.strip() == "$$":
            close_list()
            in_math_block = True
            math_block_lines = []
            i += 1
            continue

        if line.strip().startswith("```"):
            if in_code:
                close_code()
            else:
                close_list()
                in_code = True
                code_lang = line.strip()[3:].strip()
            i += 1
            continue

        if in_code:
            code_lines.append(line)
            i += 1
            continue

        if not line.strip():
            nxt = next_nonblank(i)
            continues_ol = ol_open and bool(re.match(r"^\d+\.\s", nxt))
            continues_ul = list_type == "ul" and bool(re.match(r"^[-*+]\s", nxt))
            if not continues_ol and not continues_ul:
                close_list()
            i += 1
            continue

        if line.strip() in ("---", "***", "___"):
            close_list()
            out.append("<hr>")
            i += 1
            continue

        rat = trimmed.lower()
        if rat == "#rat1#":
            close_list()
            emit_rat_divider("thin")
            i += 1
            continue
        if rat == "#rat2#":
            close_list()
            emit_rat_divider("thick")
            i += 1
            continue

        heading = re.match(r"^(#{1,6})\s+(.+)$", line)
        if heading:
            close_list()
            level = len(heading.group(1))
            push_content(f"<h{level}>{render_inline(heading.group(2).strip())}</h{level}>")
            i += 1
            continue

        quote = re.match(r"^>\s?(.*)$", line)
        if quote:
            close_list()
            push_content(f"<blockquote><p>{render_inline(quote.group(1))}</p></blockquote>")
            i += 1
            continue

        ul = re.match(r"^[-*+]\s+(.+)$", line)
        if ul:
            open_module()
            if list_type != "ul":
                close_ul()
                out.append('<ul class="note-list">')
                list_type = "ul"
            out.append(f"<li>{render_inline(ul.group(1))}</li>")
            i += 1
            continue

        ol = re.match(r"^\d+\.\s+(.+)$", line)
        if ol:
            open_module()
            close_ul()
            if not ol_open:
                out.append('<ol class="note-list">')
                ol_open = True
            list_type = "ol"
            out.append(f"<li>{render_inline(ol.group(1))}</li>")
            i += 1
            continue

        close_list()
        push_content(f"<p>{render_inline(line)}</p>")
        i += 1

    close_list()
    close_code()
    close_math_block()
    close_module()
    return "\n".join(out)


def course_slug_from_note_slug(slug: str) -> str:
    parts = slug.replace("\\", "/").split("/")
    return parts[0] if len(parts) > 1 else "未分类"


def collect_materials() -> list[dict]:
    materials: list[dict] = []
    if not NOTE_DIR.exists():
        return materials

    for course_dir in sorted(NOTE_DIR.iterdir()):
        if not course_dir.is_dir():
            continue
        mat_dir = course_dir / MATERIALS_DIR_NAME
        if not mat_dir.exists():
            continue
        for path in sorted(mat_dir.iterdir()):
            if not path.is_file():
                continue
            if path.name.startswith(".") or path.name == ".gitkeep":
                continue
            rel = f"note_content/{course_dir.name}/{MATERIALS_DIR_NAME}/{path.name}"
            materials.append(
                {
                    "course": course_dir.name,
                    "filename": path.name,
                    "path": rel,
                    "size": path.stat().st_size,
                }
            )
    return materials


def collect_courses(notes: list[dict]) -> list[dict]:
    grouped: dict[str, dict] = {}
    for note in notes:
        course = course_slug_from_note_slug(note["slug"])
        entry = grouped.setdefault(
            course,
            {
                "slug": course,
                "title": title_from_slug(course),
                "noteCount": 0,
                "latestDate": "",
            },
        )
        entry["noteCount"] += 1
        note_date = str(note.get("date") or "")
        if note_date and note_date > entry["latestDate"]:
            entry["latestDate"] = note_date

    courses = list(grouped.values())
    courses.sort(key=lambda item: item["slug"])
    return courses


def note_path_prefixes(slug: str) -> tuple[str, str]:
    depth = len(slug.replace("\\", "/").split("/"))
    return "../" * (depth + 1), "../" * depth


def render_note_page(
    *,
    title: str,
    slug: str,
    date: str,
    tags: list[str],
    description: str,
    body_html: str,
) -> str:
    tag_html = "".join(f'<span class="note-tag">{html.escape(tag)}</span>' for tag in tags)
    desc_html = (
        f'<p class="note-description">{html.escape(description)}</p>' if description else ""
    )
    safe_title = html.escape(title)
    safe_date = html.escape(date) if date else ""
    site_prefix, pages_prefix = note_path_prefixes(slug)
    course_slug = course_slug_from_note_slug(slug)
    safe_course = html.escape(course_slug)
    safe_course_title = html.escape(title_from_slug(course_slug))
    course_href = f"{pages_prefix}course-detail.html?course={html.escape(course_slug, quote=True)}"

    return f"""<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{html.escape(description or title)}">
  <title>{safe_title} · 课程笔记 · 鼠窝</title>
  <link rel="icon" href="{site_prefix}static/icons/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="{site_prefix}static/icons/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="{site_prefix}static/icons/favicon.png">
  <link rel="stylesheet" href="{site_prefix}css/style.css">
</head>
<body data-note-slug="{html.escape(slug)}">
  <div class="page-bg" aria-hidden="true">
    <img class="page-bg-image" src="{site_prefix}static/image/image01.jpg" alt="">
    <div class="page-bg-overlay"></div>
  </div>

  <header class="site-header">
    <nav class="nav" aria-label="主导航">
      <a class="nav-brand" href="{site_prefix}index.html">
        <span class="nav-brand-text"><span class="local-only">Alstr<span class="call-sign">（Call Sign ☘ VLinv）</span></span><span class="published-only">鼠窝</span></span>
        <span class="nav-version">v0.12.0</span>
      </a>
      <ul class="nav-links" id="nav-links">
        <li><a href="{site_prefix}index.html">首页</a></li>
        <li><a href="{pages_prefix}course.html" class="is-active">课程</a></li>
        <li><a href="{pages_prefix}agent-lab.html">智能体试验</a></li>
        <li><a href="{pages_prefix}virtual-arrange.html">虚拟编曲</a></li>
        <li><a href="{pages_prefix}mouse-diary.html">鼠の事件簿</a></li>
      </ul>
      <div class="nav-actions">
        <button class="btn-icon btn-icon--trail is-active" id="cursor-trail-toggle" type="button" aria-label="关闭红叶李拖尾效果" aria-pressed="true" title="红叶李拖尾：开">✿</button>
        <button class="btn-icon" id="theme-toggle" type="button" aria-label="切换主题" title="切换主题">◐</button>
      </div>
    </nav>
  </header>

  <main class="main-layout module-page note-page">
    <nav class="breadcrumb" aria-label="面包屑">
      <a href="{site_prefix}index.html">首页</a>
      <span aria-hidden="true">/</span>
      <a href="{pages_prefix}course.html">课程</a>
      <span aria-hidden="true">/</span>
      <a href="{course_href}">{safe_course_title}</a>
      <span aria-hidden="true">/</span>
      <span id="note-page-breadcrumb-title">{safe_title}</span>
    </nav>

    <article class="note-article note-article--reading content-card">
      <header class="note-article-head">
        <h1 id="note-page-title">{safe_title}</h1>
        {f'<p class="note-meta"><time datetime="{safe_date}">{safe_date}</time></p>' if safe_date else ''}
        {f'<div class="note-tags">{tag_html}</div>' if tag_html else ''}
        {desc_html}
      </header>
      <div class="note-body note-body--optimized content-body">
        {body_html}
      </div>
    </article>

    <div class="note-page-actions">
      <button type="button" class="btn btn-ghost btn-sm" id="note-download-btn">下载 PDF</button>
      <a class="btn btn-ghost btn-sm local-only" id="note-edit-link" href="{pages_prefix}course.html?edit={quote(slug, safe='')}#note-editor">编辑</a>
      <a class="btn btn-ghost btn-sm" href="{course_href}">← 返回课程</a>
    </div>
  </main>

  <footer class="site-footer">
    <p><span class="local-only">© 2026 Alstr（Call Sign ☘ VLinv）· v0.12.0</span><span class="published-only">© 2026 鼠窝 · v0.12.0</span></p>
  </footer>

  <script src="{site_prefix}js/boot.js" data-page="course-note"></script>
</body>
</html>
"""


def collect_notes() -> list[dict]:
    notes: list[dict] = []
    if not NOTE_DIR.exists():
        return notes

    for path in sorted(NOTE_DIR.rglob("*.md")):
        rel = path.relative_to(NOTE_DIR).as_posix()
        if f"/{MATERIALS_DIR_NAME}/" in f"/{rel}/" or rel.startswith(f"{MATERIALS_DIR_NAME}/"):
            continue
        raw = path.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(raw)
        slug = slug_from_path(path)
        title = str(meta.get("title") or title_from_slug(slug))
        date = str(meta.get("date") or "")
        tags = meta.get("tags") if isinstance(meta.get("tags"), list) else []
        description = str(meta.get("description") or "")

        notes.append(
            {
                "slug": slug,
                "title": title,
                "date": date,
                "tags": tags,
                "description": description,
                "source": f"note_content/{slug}.md",
                "href": f"pages/notes/{slug}.html",
                "body": body,
            }
        )

    def chapter_num(slug: str) -> int | None:
        name = slug.split("/")[-1]
        m = re.match(r"ch(\d+)", name, flags=re.I)
        return int(m.group(1)) if m else None

    # 按课程聚合：课内 chN- 升序，其余按日期新→旧
    by_course: dict[str, list] = {}
    for note in notes:
        course = course_slug_from_note_slug(str(note.get("slug") or ""))
        by_course.setdefault(course, []).append(note)

    ordered: list = []
    for course in sorted(by_course.keys()):
        group = by_course[course]
        group_ch = [n for n in group if chapter_num(str(n.get("slug") or "")) is not None]
        group_plain = [n for n in group if chapter_num(str(n.get("slug") or "")) is None]
        group_ch.sort(key=lambda n: (chapter_num(str(n.get("slug") or "")) or 0, str(n.get("slug") or "").lower()))
        group_plain.sort(key=lambda n: (str(n.get("date") or ""), str(n.get("title") or "")), reverse=True)
        ordered.extend(group_ch + group_plain)
    return ordered


def main() -> None:
    notes = collect_notes()
    NOTE_DIR.mkdir(parents=True, exist_ok=True)
    NOTES_OUT.mkdir(parents=True, exist_ok=True)

    manifest_notes = []
    generated_slugs: set[str] = set()

    for note in notes:
        slug = note["slug"]
        generated_slugs.add(slug)
        out_file = NOTES_OUT / f"{slug}.html"
        out_file.parent.mkdir(parents=True, exist_ok=True)
        page_html = render_note_page(
            title=note["title"],
            slug=slug,
            date=note["date"],
            tags=note["tags"],
            description=note["description"],
            body_html=render_optimized_note_html(note["body"]),
        )
        out_file.write_text(page_html, encoding="utf-8")

        manifest_notes.append(
            {
                "slug": slug,
                "courseSlug": course_slug_from_note_slug(slug),
                "title": note["title"],
                "date": note["date"],
                "tags": note["tags"],
                "description": note["description"],
                "source": note["source"],
                "href": note["href"],
            }
        )

    courses = collect_courses(notes)
    materials = collect_materials()

    for old_html in NOTES_OUT.rglob("*.html"):
        rel = old_html.relative_to(NOTES_OUT).with_suffix("")
        old_slug = str(rel).replace("\\", "/")
        if old_slug not in generated_slugs:
            old_html.unlink()

    payload = {
        "version": 1,
        "generatedAt": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "contentDir": "note_content",
        "courses": courses,
        "materials": materials,
        "notes": manifest_notes,
    }
    MANIFEST_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(manifest_notes)} note page(s) to {NOTES_OUT}")
    print(f"Wrote manifest to {MANIFEST_FILE}")


if __name__ == "__main__":
    main()
