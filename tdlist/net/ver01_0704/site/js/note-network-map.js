/**
 * Note network map — inspired by「昨日重现」Internet Map:
 * collapsed by default; local access path; global = large-scale mesh.
 */

const ROLE_COLORS = {
  host: "#60a5fa",
  cpe: "#38bdf8",
  access: "#34d399",
  edge: "#fbbf24",
  core: "#a78bfa",
  peer: "#f472b6",
  ix: "#94a3b8",
  transit: "#64748b",
  stub: "#7a8894",
  default: "#94a3b8",
};

const NS = "http://www.w3.org/2000/svg";
const SPEED_BASELINE = 0.00105;

function parseMapData(root) {
  const raw = root.querySelector(".note-network-map__data")?.textContent?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hashSeed(str) {
  let h = 2166136261;
  const s = String(str || "nmap");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function rand() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function layoutLocalChain(nodes, edges, width, height) {
  const ids = nodes.map((n) => n.id);
  const indeg = Object.fromEntries(ids.map((id) => [id, 0]));
  const outs = Object.fromEntries(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (indeg[e.to] != null) indeg[e.to] += 1;
    if (outs[e.from]) outs[e.from].push(e.to);
  }

  const layers = [];
  const placed = new Set();
  let frontier = ids.filter((id) => indeg[id] === 0);
  if (!frontier.length) frontier = [...ids];

  while (placed.size < ids.length) {
    const layer = frontier.filter((id) => !placed.has(id));
    if (!layer.length) {
      const rest = ids.filter((id) => !placed.has(id));
      if (!rest.length) break;
      layers.push(rest);
      rest.forEach((id) => placed.add(id));
      break;
    }
    layers.push(layer);
    layer.forEach((id) => placed.add(id));
    const next = [];
    for (const id of layer) {
      for (const to of outs[id] || []) {
        if (!placed.has(to) && !next.includes(to)) next.push(to);
      }
    }
    frontier = next.length ? next : ids.filter((id) => !placed.has(id));
  }

  const padX = 72;
  const padY = 58;
  const positions = {};
  const colW = layers.length <= 1 ? width / 2 : (width - padX * 2) / (layers.length - 1 || 1);

  layers.forEach((layer, li) => {
    const x = layers.length === 1 ? width / 2 : padX + li * colW;
    const rowH = layer.length <= 1 ? 0 : (height - padY * 2) / (layer.length - 1 || 1);
    layer.forEach((id, ni) => {
      const y =
        layer.length === 1
          ? height * 0.52 + (li % 2 === 0 ? -8 : 10)
          : padY + ni * rowH;
      positions[id] = { x, y };
    });
  });

  return positions;
}

/** Large-scale Internet mesh (IX / transit / stub / host), not a layer ladder. */
function buildInternetScale(seedStr, storyNodes = []) {
  const rand = mulberry32(hashSeed(seedStr) || 1);
  const W = 1180;
  const H = 700;
  const nodes = [];
  const edges = [];
  const byId = {};

  const pushNode = (n) => {
    nodes.push(n);
    byId[n.id] = n;
  };

  const IX = [
    { id: "ix100", x: 220, y: 190, label: "IX-100\nCore" },
    { id: "ix101", x: 580, y: 120, label: "IX-101\nEast" },
    { id: "ix102", x: 430, y: 300, label: "IX-102\nMid" },
    { id: "ix103", x: 760, y: 290, label: "IX-103\nSouth" },
    { id: "ix104", x: 960, y: 430, label: "IX-104\nCoast" },
    { id: "ix105", x: 340, y: 500, label: "IX-105\nWest" },
    { id: "ix106", x: 140, y: 390, label: "IX-106\nNorth" },
    { id: "ix107", x: 260, y: 620, label: "IX-107\nEdge" },
    { id: "ix108", x: 840, y: 580, label: "IX-108\nFar" },
    { id: "ix109", x: 1060, y: 180, label: "IX-109\nRim" },
  ];

  IX.forEach((ix) => {
    pushNode({
      id: ix.id,
      label: ix.label,
      role: "ix",
      kind: "ix",
      story: true,
      x: ix.x,
      y: ix.y,
    });
  });

  const transit = [
    { id: "as2", x: 410, y: 200, label: "AS-2\nTier-1", ix: ["ix100", "ix101", "ix102", "ix107"] },
    { id: "as3", x: 700, y: 370, label: "AS-3\nTier-1", ix: ["ix100", "ix103", "ix104", "ix108"] },
    { id: "as4", x: 530, y: 430, label: "AS-4\nTier-1", ix: ["ix102", "ix104", "ix105", "ix106"] },
    { id: "as11", x: 480, y: 560, label: "AS-11\nTier-2", ix: ["ix105", "ix107"] },
    { id: "as12", x: 820, y: 210, label: "AS-12\nTier-2", ix: ["ix101", "ix104", "ix109"] },
  ];

  transit.forEach((t) => {
    pushNode({
      id: t.id,
      label: t.label,
      role: "transit",
      kind: "transit",
      story: true,
      x: t.x,
      y: t.y,
    });
    t.ix.forEach((ixId) => edges.push({ from: t.id, to: ixId }));
  });
  edges.push({ from: "as2", to: "as3" }, { from: "as3", to: "as4" }, { from: "as2", to: "as4" });

  [
    ["ix100", "ix102"],
    ["ix101", "ix102"],
    ["ix101", "ix109"],
    ["ix103", "ix104"],
    ["ix104", "ix108"],
    ["ix105", "ix107"],
    ["ix106", "ix100"],
    ["ix102", "ix103"],
  ].forEach(([a, b]) => edges.push({ from: a, to: b }));

  const stubIds = [];
  const clusters = [
    [180, "ix100", 7],
    [188, "ix102", 6],
    [195, "ix103", 6],
    [202, "ix104", 5],
    [208, "ix105", 5],
    [214, "ix106", 5],
    [219, "ix107", 5],
    [225, "ix108", 4],
    [230, "ix109", 5],
    [235, "ix101", 5],
  ];

  clusters.forEach(([start, ixId, count]) => {
    const ix = byId[ixId];
    for (let i = 0; i < count; i += 1) {
      const asn = start + i;
      const id = `as${asn}`;
      const ang = (Math.PI * 2 * i) / count + asn * 0.11 + rand() * 0.2;
      const r = 40 + (asn % 5) * 8 + rand() * 6;
      pushNode({
        id,
        label: `AS-${asn}`,
        role: "stub",
        kind: "stub",
        story: false,
        x: ix.x + Math.cos(ang) * r,
        y: ix.y + Math.sin(ang) * r,
      });
      edges.push({ from: id, to: ixId });
      stubIds.push(id);
      for (let h = 0; h < 2; h += 1) {
        const hid = `${id}h${h}`;
        const ha = ang + 0.45 + h * 0.9;
        pushNode({
          id: hid,
          label: "",
          role: "host",
          kind: "host",
          story: false,
          x: byId[id].x + Math.cos(ha) * 11,
          y: byId[id].y + Math.sin(ha) * 11,
        });
        edges.push({ from: hid, to: id });
      }
    }
  });

  for (let i = 0; i < stubIds.length; i += 6) {
    edges.push({ from: stubIds[i], to: stubIds[(i + 13) % stubIds.length] });
  }

  // Optional story overlays from markdown [global] nodes — pin near IXes
  const pinIx = ["ix100", "ix102", "ix103", "ix105", "ix101"];
  (storyNodes || []).slice(0, 6).forEach((sn, i) => {
    const ix = byId[pinIx[i % pinIx.length]];
    const ang = -0.9 + i * 0.55;
    const id = sn.id || `story${i}`;
    if (byId[id]) return;
    pushNode({
      id,
      label: sn.label || id,
      role: sn.role || "host",
      kind: "story",
      story: true,
      x: ix.x + Math.cos(ang) * 68,
      y: ix.y + Math.sin(ang) * 52,
    });
    edges.push({ from: id, to: ix.id });
  });

  return {
    width: W,
    height: H,
    nodes,
    edges,
    focus: (storyNodes || []).map((n) => n.id).filter(Boolean),
    stubIds,
  };
}

function resolveGlobalView(data) {
  const raw = data.views?.global || {};
  const preset = String(raw.preset || data.globalPreset || "internet").toLowerCase();
  const customNodes = raw.nodes || [];
  const customEdges = raw.edges || [];
  const looksHierarchical =
    customNodes.length > 0 &&
    customNodes.length <= 8 &&
    customEdges.length >= customNodes.length - 1 &&
    customEdges.length <= customNodes.length + 1;

  if (preset === "custom" && customNodes.length) {
    return { ...raw, mode: "custom" };
  }
  // Default / internet: ignore thin layer ladders and build scale mesh
  if (preset === "internet" || looksHierarchical || !customNodes.length) {
    const built = buildInternetScale(data.id || data.title || "internet", customNodes);
    return {
      ...built,
      title: raw.title,
      preset: "internet",
      mode: "global",
    };
  }
  // Medium custom graphs: keep positions via local layout later
  return { ...raw, mode: "custom" };
}

function collectPrimaryPath(nodes, edges) {
  if (!nodes.length) return [];
  const ids = new Set(nodes.map((n) => n.id));
  const outs = Object.fromEntries([...ids].map((id) => [id, []]));
  const indeg = Object.fromEntries([...ids].map((id) => [id, 0]));
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    outs[e.from].push(e.to);
    indeg[e.to] += 1;
  }
  let cur = nodes.find((n) => indeg[n.id] === 0)?.id || nodes[0].id;
  const path = [cur];
  const seen = new Set([cur]);
  while (outs[cur]?.length) {
    const nxt = outs[cur].find((id) => !seen.has(id)) || outs[cur][0];
    if (!nxt || seen.has(nxt)) break;
    path.push(nxt);
    seen.add(nxt);
    cur = nxt;
  }
  return path;
}

function collectAmbientPaths(nodes, edges, count) {
  if (nodes.length < 2 || edges.length < 1) return [];
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const usable = edges.filter((e) => byId[e.from] && byId[e.to]);
  const paths = [];
  for (let i = 0; i < count; i += 1) {
    const e = usable[(i * 7) % usable.length];
    if (!e) break;
    paths.push({ path: [e.from, e.to], kind: "ambient", phase: 0.08 + i * 0.07 });
  }
  return paths;
}

function edgeControl(a, b, bend = 0.18) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { x: mx - dy * bend, y: my + dx * bend };
}

function curvedPath(a, b, bend = 0.18) {
  const c = edgeControl(a, b, bend);
  return `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`;
}

/** Point on quadratic Bezier (matches drawn edge curves). */
function quadAt(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function edgeKey(a, b) {
  return `${a}|${b}`;
}

function nodeRadius(n, mode) {
  if (mode === "global") {
    if (n.kind === "ix") return 8.5;
    if (n.kind === "transit") return 7.5;
    if (n.kind === "host") return 2.1;
    if (n.kind === "story") return 9;
    return 3.4;
  }
  return 15;
}

function createSvg(view, options = {}) {
  const mode = options.mode || "local";
  const nodes = view?.nodes || [];
  const edges = view?.edges || [];
  const focus = new Set(view?.focus || []);
  const isGlobal = mode === "global";
  const width = view.width || (isGlobal ? 1180 : 720);
  const height = view.height || (isGlobal ? 700 : Math.max(260, 100 + Math.max(nodes.length, 3) * 36));

  let positions = {};
  if (nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))) {
    nodes.forEach((n) => {
      positions[n.id] = { x: n.x, y: n.y };
    });
  } else {
    positions = layoutLocalChain(nodes, edges, width, height);
  }

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "note-network-map__canvas");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", view?.title || "网络传输示意");

  // soft grid for global density
  if (isGlobal) {
    const defs = document.createElementNS(NS, "defs");
    defs.innerHTML = `
      <pattern id="nmap-grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.12)" stroke-width="1"/>
      </pattern>`;
    svg.appendChild(defs);
    const bg = document.createElementNS(NS, "rect");
    bg.setAttribute("width", String(width));
    bg.setAttribute("height", String(height));
    bg.setAttribute("fill", "url(#nmap-grid)");
    bg.setAttribute("opacity", "0.55");
    svg.appendChild(bg);
  }

  const edgeBends = new Map();
  const gEdges = document.createElementNS(NS, "g");
  gEdges.setAttribute("class", "nmap-edges");
  edges.forEach((e, idx) => {
    const a = positions[e.from];
    const b = positions[e.to];
    if (!a || !b) return;
    const na = nodes.find((n) => n.id === e.from);
    const nb = nodes.find((n) => n.id === e.to);
    const muted = focus.size && !focus.has(e.from) && !focus.has(e.to);
    const backbone =
      isGlobal &&
      ((na?.kind === "ix" && nb?.kind === "ix") ||
        (na?.kind === "transit" && nb?.kind === "transit") ||
        (na?.kind === "transit" && nb?.kind === "ix") ||
        (na?.kind === "ix" && nb?.kind === "transit"));
    const path = document.createElementNS(NS, "path");
    // Keep bends mild so packets stay visually on the stroke
    const bend = isGlobal ? (backbone ? 0.04 : 0.08 + (idx % 3) * 0.015) : 0.12;
    edgeBends.set(edgeKey(e.from, e.to), bend);
    edgeBends.set(edgeKey(e.to, e.from), -bend);
    path.setAttribute("d", curvedPath(a, b, bend));
    path.setAttribute(
      "class",
      `nmap-edge${muted && !isGlobal ? " is-muted" : ""}${backbone ? " is-backbone" : ""}${isGlobal && !backbone ? " is-mesh" : ""}`,
    );
    path.dataset.a = e.from;
    path.dataset.b = e.to;
    path.dataset.bend = String(bend);
    gEdges.appendChild(path);
  });
  svg.appendChild(gEdges);

  const gNodes = document.createElementNS(NS, "g");
  gNodes.setAttribute("class", "nmap-nodes");
  nodes.forEach((n) => {
    const p = positions[n.id] || { x: width / 2, y: height / 2 };
    const role = n.role || n.kind || "default";
    const color = ROLE_COLORS[role] || ROLE_COLORS.default;
    const focused = !focus.size || focus.has(n.id) || n.story;
    const r = nodeRadius(n, mode);
    const g = document.createElementNS(NS, "g");
    g.setAttribute(
      "class",
      `nmap-node nmap-node--${n.kind || role}${focused || isGlobal ? "" : " is-muted"}${n.story ? " is-story" : ""}`,
    );
    g.dataset.nodeId = n.id;
    g.setAttribute("transform", `translate(${p.x}, ${p.y})`);

    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("r", String(r));
    circle.setAttribute("fill", color);
    circle.setAttribute("fill-opacity", n.kind === "host" ? "0.75" : isGlobal ? "0.55" : "0.28");
    circle.setAttribute("stroke", color);
    circle.setAttribute("stroke-width", n.kind === "ix" || !isGlobal ? "1.8" : "1.1");
    g.appendChild(circle);

    const showLabel =
      !isGlobal || n.story || n.kind === "ix" || n.kind === "transit" || n.kind === "story";
    if (showLabel && n.label) {
      String(n.label)
        .split("\n")
        .forEach((line, i) => {
          const text = document.createElementNS(NS, "text");
          text.setAttribute("text-anchor", "middle");
          text.setAttribute("y", String((isGlobal ? 16 : 28) + i * 11));
          text.setAttribute("class", `nmap-label${isGlobal ? " nmap-label--sm" : ""}`);
          text.textContent = line;
          g.appendChild(text);
        });
    }
    gNodes.appendChild(g);
  });
  svg.appendChild(gNodes);

  const packetLayer = document.createElementNS(NS, "g");
  packetLayer.setAttribute("class", "nmap-packets");
  svg.appendChild(packetLayer);

  return { svg, positions, width, height, packetLayer, edgeBends };
}

function ensureShell(root, data) {
  let bar = root.querySelector(".note-network-map__toolbar");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "note-network-map__toolbar";
    root.insertBefore(bar, root.firstChild);
  }
  const title = data.title || "网络传输示意";
  const speed = root._nmapSpeed ?? 100;
  const expanded = root.dataset.expanded === "1";
  bar.innerHTML = `
    <button type="button" class="note-network-map__toggle" data-nmap-action="expand" aria-expanded="${expanded ? "true" : "false"}">
      <span class="note-network-map__chevron" aria-hidden="true"></span>
      <span class="note-network-map__heading">
        <span class="note-network-map__kicker">Network Transmit</span>
        <strong class="note-network-map__title">${escapeXml(title)}</strong>
        <span class="note-network-map__hint muted">${expanded ? "点击收起" : "默认折叠 · 点击展开交互示意"}</span>
      </span>
    </button>
    <div class="note-network-map__actions" role="group" aria-label="视图与传输控制" ${expanded ? "" : "hidden"}>
      <button type="button" class="btn btn-ghost btn-sm" data-nmap-view="local" aria-pressed="false">局部接入</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nmap-view="global" aria-pressed="false">全局网络</button>
      <label class="note-network-map__speed" title="调节数据包传输速度">
        <span>速度</span>
        <input type="range" min="50" max="160" step="5" value="${speed}" data-nmap-speed aria-label="传输速度" />
      </label>
      <button type="button" class="btn btn-ghost btn-sm" data-nmap-action="toggle" aria-pressed="true">暂停</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nmap-action="reset" title="重置缩放">复位</button>
      <span class="note-network-map__status muted" data-nmap-status>待机</span>
    </div>
  `;
  return bar;
}

function stopFlows(root) {
  root._nmapAnimGen = (root._nmapAnimGen || 0) + 1;
  if (root._nmapAnimHandle) {
    cancelAnimationFrame(root._nmapAnimHandle);
    root._nmapAnimHandle = null;
  }
  root._nmapFlows = [];
  const layer = root.querySelector(".nmap-packets");
  if (layer) layer.innerHTML = "";
}

function startFlows(root, packets, positions, edgeBends = new Map()) {
  stopFlows(root);
  const layer = root.querySelector(".nmap-packets");
  if (!layer || !packets.length) return;

  const gen = root._nmapAnimGen;
  let clock = 0;
  let lastTs = null;
  const flows = packets
    .map((p) => {
      const ids = (p.path || []).filter((id) => positions[id]);
      if (ids.length < 2) return null;
      const segs = [];
      for (let i = 0; i < ids.length - 1; i += 1) {
        const from = ids[i];
        const to = ids[i + 1];
        const a = positions[from];
        const b = positions[to];
        const bend = edgeBends.has(edgeKey(from, to))
          ? edgeBends.get(edgeKey(from, to))
          : edgeBends.has(edgeKey(to, from))
            ? -edgeBends.get(edgeKey(to, from))
            : 0;
        // Skip phantom shortcuts with no drawn edge (would fly across empty space)
        if (!edgeBends.has(edgeKey(from, to)) && !edgeBends.has(edgeKey(to, from))) {
          continue;
        }
        segs.push({ a, b, c: edgeControl(a, b, bend) });
      }
      if (!segs.length) return null;
      const el = document.createElementNS(NS, "circle");
      el.setAttribute("r", p.kind === "ambient" ? "2.6" : "4.2");
      el.setAttribute("cx", String(segs[0].a.x));
      el.setAttribute("cy", String(segs[0].a.y));
      el.setAttribute(
        "class",
        `nmap-packet${p.kind === "ambient" ? " nmap-packet--ambient" : " nmap-packet--ok"}`,
      );
      layer.appendChild(el);
      return {
        el,
        segs,
        kind: p.kind,
        baseSegMs: p.kind === "ambient" ? 1100 : 720,
        phase: p.phase || 0,
      };
    })
    .filter(Boolean);

  root._nmapFlows = flows;

  const frame = (ts) => {
    if (gen !== root._nmapAnimGen) return;
    if (root._nmapPaused) {
      lastTs = ts;
      root._nmapAnimHandle = requestAnimationFrame(frame);
      return;
    }
    if (lastTs == null) lastTs = ts;
    const dt = Math.min(64, ts - lastTs);
    lastTs = ts;
    const speed = (root._nmapSpeed || 100) / 100;
    clock += dt * speed * SPEED_BASELINE * 1000;

    flows.forEach((f) => {
      const total = f.baseSegMs * f.segs.length;
      const pos = ((clock / total + f.phase) % 1) * f.segs.length;
      const i = Math.min(f.segs.length - 1, Math.floor(pos));
      const t = pos - i;
      const seg = f.segs[i];
      const pt = quadAt(seg.a, seg.c, seg.b, t);
      f.el.setAttribute("cx", String(pt.x));
      f.el.setAttribute("cy", String(pt.y));
    });

    root._nmapAnimHandle = requestAnimationFrame(frame);
  };

  root._nmapAnimHandle = requestAnimationFrame(frame);
}

function setupPanZoom(viewport, stage, enabled) {
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const apply = () => {
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };
  apply();

  viewport.classList.toggle("is-pannable", enabled);
  viewport.onpointerdown = null;
  viewport.onpointermove = null;
  viewport.onpointerup = null;
  viewport.onpointercancel = null;
  viewport.onwheel = null;

  if (!enabled) {
    viewport._nmapReset = () => {
      scale = 1;
      tx = 0;
      ty = 0;
      apply();
    };
    return;
  }

  viewport.onpointerdown = (event) => {
    if (event.button !== 0) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    viewport.setPointerCapture(event.pointerId);
  };
  viewport.onpointermove = (event) => {
    if (!dragging) return;
    tx += event.clientX - lastX;
    ty += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    apply();
  };
  viewport.onpointerup = () => {
    dragging = false;
  };
  viewport.onpointercancel = () => {
    dragging = false;
  };
  viewport.onwheel = (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.92 : 1.08;
    scale = Math.min(2.6, Math.max(0.45, scale * delta));
    apply();
  };
  viewport._nmapReset = () => {
    scale = 1;
    tx = 0;
    ty = 0;
    apply();
  };
}

function applyView(root, data, mode) {
  const view =
    mode === "global"
      ? resolveGlobalView(data)
      : data.views?.local || data.views?.global;
  if (!view) return;

  stopFlows(root);
  root.dataset.activeView = mode;
  root.classList.toggle("is-global", mode === "global");
  root.classList.toggle("is-local", mode === "local");

  root.querySelectorAll("[data-nmap-view]").forEach((btn) => {
    const on = btn.getAttribute("data-nmap-view") === mode;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });

  let viewport = root.querySelector(".note-network-map__viewport");
  if (!viewport) {
    viewport = document.createElement("div");
    viewport.className = "note-network-map__viewport";
    root.appendChild(viewport);
  }

  const painted = createSvg({ ...view, title: data.title }, { mode });
  const stage = document.createElement("div");
  stage.className = "note-network-map__stage";
  stage.appendChild(painted.svg);
  viewport.innerHTML = "";
  viewport.appendChild(stage);
  viewport.dataset.view = mode;
  setupPanZoom(viewport, stage, mode === "global");

  const status = root.querySelector("[data-nmap-status]");
  if (status) {
    status.textContent = mode === "global" ? "大规模网络传输中" : "局部接入传输中";
  }

  const primary = collectPrimaryPath(
    (view.nodes || []).filter((n) => n.kind !== "host"),
    view.edges || [],
  );
  const packets = [];
  if (mode === "local" && primary.length >= 2) {
    packets.push({ path: primary, kind: "ok", phase: 0 });
    packets.push({ path: primary, kind: "ok", phase: 0.45 });
  }
  if (mode === "global") {
    // Only walk real edges so packets never cut across empty space
    const story = (view.nodes || []).filter((n) => n.kind === "story");
    const edgeList = view.edges || [];
    const neighbor = (id) => {
      for (const e of edgeList) {
        if (e.from === id) return e.to;
        if (e.to === id) return e.from;
      }
      return null;
    };
    story.slice(0, 3).forEach((s, i) => {
      const ix = neighbor(s.id);
      if (ix) packets.push({ path: [s.id, ix], kind: "ok", phase: i * 0.22 });
    });
    const backboneRoutes = [
      ["ix100", "as2", "ix101"],
      ["ix103", "as3", "ix104"],
      ["ix105", "as4", "ix102"],
    ];
    backboneRoutes.forEach((route, i) => {
      if (route.every((id) => painted.positions[id])) {
        packets.push({ path: route, kind: "ok", phase: 0.1 + i * 0.28 });
      }
    });
    packets.push(...collectAmbientPaths(view.nodes || [], view.edges || [], 14));
  } else if ((view.edges || []).length > 1) {
    packets.push(...collectAmbientPaths(view.nodes || [], view.edges || [], 2));
  }

  const edgeKeys = new Set();
  packets
    .filter((p) => p.kind === "ok")
    .forEach((p) => {
      for (let i = 0; i < p.path.length - 1; i += 1) {
        edgeKeys.add([p.path[i], p.path[i + 1]].sort().join("|"));
      }
    });
  painted.svg.querySelectorAll(".nmap-edge").forEach((line) => {
    const key = [line.dataset.a, line.dataset.b].sort().join("|");
    line.classList.toggle("is-path", edgeKeys.has(key));
  });

  root._nmapPaused = false;
  const toggleBtn = root.querySelector("[data-nmap-action=toggle]");
  if (toggleBtn) {
    toggleBtn.textContent = "暂停";
    toggleBtn.setAttribute("aria-pressed", "true");
  }

  startFlows(root, packets, painted.positions, painted.edgeBends);
}

function setExpanded(root, data, expanded) {
  root.dataset.expanded = expanded ? "1" : "0";
  root.classList.toggle("is-collapsed", !expanded);
  root.classList.toggle("is-expanded", expanded);
  ensureShell(root, data);

  const viewport = root.querySelector(".note-network-map__viewport");
  if (viewport) viewport.hidden = !expanded;

  if (!expanded) {
    stopFlows(root);
    return;
  }

  const initial = root.dataset.activeView || root.dataset.defaultView || data.defaultView || "local";
  const hasLocal = Boolean(data.views?.local);
  const hasGlobal = Boolean(data.views?.global) || true;
  const start =
    hasLocal && initial === "local" ? "local" : hasGlobal && initial === "global" ? "global" : hasLocal ? "local" : "global";
  applyView(root, data, start);
}

function bindMap(root) {
  if (root.dataset.nmapReady === "1") return;
  const data = parseMapData(root);
  if (!data?.views) return;

  root.dataset.nmapReady = "1";
  root._nmapSpeed = 100;
  root._nmapPaused = false;

  // collapsed by default unless explicitly expanded=true / collapsed=false
  const wantExpanded =
    root.dataset.expanded === "1" ||
    data.expanded === true ||
    String(data.collapsed).toLowerCase() === "false";
  const startCollapsed = !wantExpanded;

  // Ensure global view key exists for toggle even if markdown only had local
  if (!data.views.global) {
    data.views.global = { nodes: [], edges: [], preset: "internet" };
  }

  setExpanded(root, data, !startCollapsed);

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-nmap-action=expand]")) {
      const next = root.dataset.expanded !== "1";
      setExpanded(root, data, next);
      return;
    }
    const viewBtn = event.target.closest("[data-nmap-view]");
    if (viewBtn) {
      const mode = viewBtn.getAttribute("data-nmap-view");
      if (mode) applyView(root, data, mode);
      return;
    }
    if (event.target.closest("[data-nmap-action=reset]")) {
      root.querySelector(".note-network-map__viewport")?._nmapReset?.();
      return;
    }
    if (event.target.closest("[data-nmap-action=toggle]")) {
      root._nmapPaused = !root._nmapPaused;
      const btn = root.querySelector("[data-nmap-action=toggle]");
      if (btn) {
        btn.textContent = root._nmapPaused ? "播放" : "暂停";
        btn.setAttribute("aria-pressed", root._nmapPaused ? "false" : "true");
      }
      const status = root.querySelector("[data-nmap-status]");
      if (status) {
        status.textContent = root._nmapPaused
          ? "已暂停"
          : `${root.dataset.activeView === "global" ? "大规模网络" : "局部接入"}传输中`;
      }
    }
  });

  root.addEventListener("input", (event) => {
    const speed = event.target.closest("[data-nmap-speed]");
    if (!speed) return;
    root._nmapSpeed = Number(speed.value) || 100;
  });
}

export function initNoteNetworkMaps(root = document) {
  root.querySelectorAll("[data-network-map]").forEach((el) => bindMap(el));
}

export function refreshNoteNetworkMaps(root = document) {
  root.querySelectorAll("[data-network-map]").forEach((el) => {
    stopFlows(el);
    el.dataset.nmapReady = "";
    bindMap(el);
  });
}
