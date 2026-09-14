/**
 * Note network map — inspired by「昨日重现」Internet Map:
 * local / global views + packet transmission animation along edges.
 */

const ROLE_COLORS = {
  host: "#60a5fa",
  cpe: "#38bdf8",
  access: "#34d399",
  edge: "#fbbf24",
  core: "#a78bfa",
  peer: "#f472b6",
  default: "#94a3b8",
};

const NS = "http://www.w3.org/2000/svg";
const SPEED_BASELINE = 0.00115;

function parseMapData(root) {
  const raw = root.querySelector(".note-network-map__data")?.textContent?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function layoutNodes(nodes, edges, width, height) {
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

  const padX = 64;
  const padY = 52;
  const positions = {};
  const colW = layers.length <= 1 ? width / 2 : (width - padX * 2) / (layers.length - 1 || 1);

  layers.forEach((layer, li) => {
    const x = layers.length === 1 ? width / 2 : padX + li * colW;
    const rowH = layer.length <= 1 ? height / 2 : (height - padY * 2) / (layer.length - 1 || 1);
    layer.forEach((id, ni) => {
      const y = layer.length === 1 ? height / 2 : padY + ni * rowH;
      positions[id] = { x, y };
    });
  });

  return positions;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  return escapeXml(str).replace(/'/g, "&#39;");
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
  const paths = [];
  for (let i = 0; i < count; i += 1) {
    const e = edges[i % edges.length];
    if (byId[e.from] && byId[e.to]) {
      paths.push({ path: [e.from, e.to], kind: "ambient", phase: 0.15 + i * 0.09 });
    }
  }
  return paths;
}

function createSvg(view, options = {}) {
  const nodes = view?.nodes || [];
  const edges = view?.edges || [];
  const focus = new Set(view?.focus || []);
  const isGlobal = options.mode === "global";
  const width = isGlobal ? 960 : 680;
  const height = Math.max(240, 80 + Math.max(nodes.length, 3) * 46);
  const positions = layoutNodes(nodes, edges, width, height);

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "note-network-map__canvas");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", view?.title || "网络传输示意");

  const gEdges = document.createElementNS(NS, "g");
  gEdges.setAttribute("class", "nmap-edges");
  edges.forEach((e) => {
    const a = positions[e.from];
    const b = positions[e.to];
    if (!a || !b) return;
    const muted = focus.size && !focus.has(e.from) && !focus.has(e.to);
    const line = document.createElementNS(NS, "line");
    line.setAttribute("class", `nmap-edge${muted ? " is-muted" : ""}`);
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.dataset.a = e.from;
    line.dataset.b = e.to;
    gEdges.appendChild(line);
  });
  svg.appendChild(gEdges);

  const gNodes = document.createElementNS(NS, "g");
  gNodes.setAttribute("class", "nmap-nodes");
  nodes.forEach((n) => {
    const p = positions[n.id] || { x: width / 2, y: height / 2 };
    const role = n.role || "default";
    const color = ROLE_COLORS[role] || ROLE_COLORS.default;
    const focused = !focus.size || focus.has(n.id);
    const label = n.label || n.id;
    const tw = Math.min(168, Math.max(76, label.length * 12 + 28));
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", `nmap-node${focused ? " is-focus" : " is-muted"}`);
    g.dataset.nodeId = n.id;
    g.setAttribute("transform", `translate(${p.x}, ${p.y})`);

    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("x", String(-tw / 2));
    rect.setAttribute("y", "-18");
    rect.setAttribute("width", String(tw));
    rect.setAttribute("height", "36");
    rect.setAttribute("rx", "12");
    rect.setAttribute("fill", color);
    rect.setAttribute("fill-opacity", "0.2");
    rect.setAttribute("stroke", color);
    rect.setAttribute("stroke-width", "1.7");
    g.appendChild(rect);

    const text = document.createElementNS(NS, "text");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("class", "nmap-label");
    text.textContent = label;
    g.appendChild(text);
    gNodes.appendChild(g);
  });
  svg.appendChild(gNodes);

  const packetLayer = document.createElementNS(NS, "g");
  packetLayer.setAttribute("class", "nmap-packets");
  svg.appendChild(packetLayer);

  return { svg, positions, width, height, packetLayer };
}

function ensureToolbar(root, data) {
  let bar = root.querySelector(".note-network-map__toolbar");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "note-network-map__toolbar";
    root.insertBefore(bar, root.firstChild);
  }
  const title = data.title || "网络传输示意";
  const speed = root._nmapSpeed ?? 100;
  bar.innerHTML = `
    <div class="note-network-map__heading">
      <span class="note-network-map__kicker">Network Transmit</span>
      <strong class="note-network-map__title">${escapeXml(title)}</strong>
      <span class="note-network-map__status muted" data-nmap-status>待机</span>
    </div>
    <div class="note-network-map__actions" role="group" aria-label="视图与传输控制">
      <button type="button" class="btn btn-ghost btn-sm" data-nmap-view="local" aria-pressed="false">局部</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nmap-view="global" aria-pressed="false">全局</button>
      <label class="note-network-map__speed" title="调节数据包传输速度">
        <span>传输速度</span>
        <input type="range" min="50" max="160" step="5" value="${speed}" data-nmap-speed aria-label="传输速度" />
      </label>
      <button type="button" class="btn btn-ghost btn-sm" data-nmap-action="toggle" aria-pressed="true">暂停</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nmap-action="reset" title="重置缩放">复位</button>
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

function startFlows(root, packets, positions) {
  stopFlows(root);
  const layer = root.querySelector(".nmap-packets");
  if (!layer || !packets.length) return;

  const gen = root._nmapAnimGen;
  let clock = 0;
  let lastTs = null;
  const flows = packets
    .map((p) => {
      const pts = p.path.map((id) => positions[id]).filter(Boolean);
      if (pts.length < 2) return null;
      const el = document.createElementNS(NS, "circle");
      el.setAttribute("r", p.kind === "ambient" ? "3" : "4.4");
      el.setAttribute("cx", String(pts[0].x));
      el.setAttribute("cy", String(pts[0].y));
      el.setAttribute(
        "class",
        `nmap-packet${p.kind === "ambient" ? " nmap-packet--ambient" : " nmap-packet--ok"}`,
      );
      layer.appendChild(el);
      return {
        el,
        pts,
        kind: p.kind,
        baseSegMs: p.kind === "ambient" ? 920 : 680,
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
      const total = f.baseSegMs * (f.pts.length - 1);
      const pos = ((clock / total + f.phase) % 1) * (f.pts.length - 1);
      const i = Math.floor(pos);
      const t = pos - i;
      const a = f.pts[i];
      const b = f.pts[Math.min(i + 1, f.pts.length - 1)];
      f.el.setAttribute("cx", String(a.x + (b.x - a.x) * t));
      f.el.setAttribute("cy", String(a.y + (b.y - a.y) * t));
    });

    // pulse active edges under primary packets
    const svg = root.querySelector(".note-network-map__canvas");
    svg?.querySelectorAll(".nmap-edge").forEach((line) => {
      line.classList.toggle("is-active", !line.classList.contains("is-muted"));
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
    scale = Math.min(2.4, Math.max(0.55, scale * delta));
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
  const view = data.views?.[mode] || data.views?.local || data.views?.global;
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
    status.textContent = mode === "global" ? "全局传输中" : "局部传输中";
  }

  const primary = collectPrimaryPath(view.nodes || [], view.edges || []);
  const packets = [];
  if (primary.length >= 2) {
    packets.push({ path: primary, kind: "ok", phase: 0 });
    packets.push({ path: primary, kind: "ok", phase: 0.42 });
  }
  if (mode === "global") {
    packets.push(...collectAmbientPaths(view.nodes || [], view.edges || [], 6));
  } else if ((view.edges || []).length > 1) {
    packets.push(...collectAmbientPaths(view.nodes || [], view.edges || [], 2));
  }

  // highlight path edges
  const edgeKeys = new Set();
  for (let i = 0; i < primary.length - 1; i += 1) {
    edgeKeys.add([primary[i], primary[i + 1]].sort().join("|"));
  }
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

  startFlows(root, packets, painted.positions);
}

function bindMap(root) {
  if (root.dataset.nmapReady === "1") return;
  const data = parseMapData(root);
  if (!data?.views) return;

  root.dataset.nmapReady = "1";
  root._nmapSpeed = 100;
  root._nmapPaused = false;
  ensureToolbar(root, data);

  const initial = root.dataset.defaultView || data.defaultView || "local";
  const hasLocal = Boolean(data.views.local);
  const hasGlobal = Boolean(data.views.global);
  const start = hasLocal && initial === "local" ? "local" : hasGlobal ? "global" : "local";
  applyView(root, data, start);

  root.addEventListener("click", (event) => {
    const viewBtn = event.target.closest("[data-nmap-view]");
    if (viewBtn) {
      const mode = viewBtn.getAttribute("data-nmap-view");
      if (mode && data.views[mode]) applyView(root, data, mode);
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
      if (status) status.textContent = root._nmapPaused ? "已暂停" : `${root.dataset.activeView === "global" ? "全局" : "局部"}传输中`;
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
