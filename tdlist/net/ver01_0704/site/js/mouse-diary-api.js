import { isFileProtocol, isPublishedSite, loadEmbeddedJson, fetchJson } from "./runtime.js";
import { getSiteBaseUrl } from "./layout.js";

const API_ROOT = "http://127.0.0.1:8765/api/diary";
const LS_KEY = "voka-mouse-diary-memos";
const PUBLISHED_ANNOUNCEMENTS_URL = "content/mouse-diary/announcements.json";
const PUBLISHED_MOOD_URL = "content/mouse-diary/mood-board.json";

export const MEMO_CATEGORIES = ["备忘", "闲聊", "碎碎念"];
export const PLAN_CATEGORY = "更新计划";
export const ANNOUNCE_CATEGORY = "更新公告";
export const MOOD_CATEGORY = "心情贴";
export const MOOD_MAX_LENGTH = 50;
export const DIARY_CATEGORIES = [...MEMO_CATEGORIES, PLAN_CATEGORY, ANNOUNCE_CATEGORY, MOOD_CATEGORY];

/** @type {"server" | "local" | "published" | null} */
let storageMode = null;

async function fetchPublishedAnnouncementsRaw() {
  const base = getSiteBaseUrl();
  try {
    const data = await fetchJson(`${base}${PUBLISHED_ANNOUNCEMENTS_URL}`, "diaryAnnouncements");
    if (Array.isArray(data)) return data;
    return data?.announcements || [];
  } catch {
    const embedded = await loadEmbeddedJson("diaryAnnouncements");
    return Array.isArray(embedded) ? embedded : [];
  }
}

async function fetchPublishedMoodRaw() {
  const base = getSiteBaseUrl();
  try {
    const data = await fetchJson(`${base}${PUBLISHED_MOOD_URL}`, "diaryMoodBoard");
    const mood = data?.mood ?? data;
    if (mood && typeof mood === "object" && mood.content) return mood;
  } catch {
    /* fall through */
  }
  const embedded = await loadEmbeddedJson("diaryMoodBoard");
  if (embedded && typeof embedded === "object" && embedded.content) return embedded;
  return null;
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

function readLocalMemos() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeLocalMemos(memos) {
  localStorage.setItem(LS_KEY, JSON.stringify(memos));
}

function parseTime(iso) {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

export function sortMemos(memos) {
  return [...memos].sort((a, b) => {
    const favA = a.favorite ? 0 : 1;
    const favB = b.favorite ? 0 : 1;
    if (favA !== favB) return favA - favB;
    return parseTime(b.updatedAt || b.createdAt) - parseTime(a.updatedAt || a.createdAt);
  });
}

export function sortPlans(items) {
  return [...items].sort((a, b) => {
    const favA = a.favorite ? 0 : 1;
    const favB = b.favorite ? 0 : 1;
    if (favA !== favB) return favA - favB;
    const planA = parseTime(a.plannedAt) || parseTime(a.updatedAt) || Number.MAX_SAFE_INTEGER;
    const planB = parseTime(b.plannedAt) || parseTime(b.updatedAt) || Number.MAX_SAFE_INTEGER;
    return planA - planB;
  });
}

export function sortAnnouncements(items) {
  return sortMemos(items);
}

export const HOME_ANNOUNCEMENTS_LIMIT = 5;

/** 首页公告：收藏优先，同组内按更新时间倒序，最多 limit 条 */
export function pickAnnouncementsForHome(items, limit = HOME_ANNOUNCEMENTS_LIMIT) {
  if (!Array.isArray(items) || !items.length) return [];
  const capped = Math.max(1, Number(limit) || HOME_ANNOUNCEMENTS_LIMIT);
  return sortAnnouncements(items).slice(0, capped);
}

export function sortMoods(items) {
  return [...items].sort(
    (a, b) => parseTime(b.createdAt || b.updatedAt) - parseTime(a.createdAt || a.updatedAt),
  );
}

export function pickMoodForHome(moods) {
  if (!moods.length) return null;
  const featured = moods.find((m) => m.featured);
  if (featured) return featured;
  return sortMoods(moods)[0];
}

function clearLocalMoodFeatured(exceptPath) {
  const memos = readLocalMemos();
  let changed = false;
  for (const memo of memos) {
    if (memo.category === MOOD_CATEGORY && memo.featured && memo.path !== exceptPath) {
      memo.featured = false;
      changed = true;
    }
  }
  if (changed) writeLocalMemos(memos);
}

export async function detectDiaryStorage() {
  if (storageMode) return storageMode;

  if (isPublishedSite()) {
    storageMode = "published";
    return storageMode;
  }

  if (!isFileProtocol()) {
    try {
      const health = await fetch(`${API_ROOT}/health`, { signal: AbortSignal.timeout(1500) });
      if (health.ok) {
        storageMode = "server";
        return storageMode;
      }
    } catch {
      /* no server */
    }
  }

  storageMode = "local";
  return storageMode;
}

export function getDiaryStorageMode() {
  return storageMode;
}

export function storageModeLabel(mode) {
  if (mode === "published") return "已发布站点 · 只读展示";
  if (mode === "server") return "本地服务 · 保存至 content/mouse-diary/";
  return "浏览器本地 · 仅本机可见";
}

/** 同步前将浏览器 localStorage 中的事件簿写入 content/mouse-diary/ */
export async function migrateLocalDiaryToServerIfNeeded() {
  const local = readLocalMemos();
  if (!local.length) return { migrated: 0, total: 0 };

  try {
    const health = await fetch(`${API_ROOT}/health`, { signal: AbortSignal.timeout(2000) });
    if (!health.ok) {
      throw new Error("本地同步服务未运行。请先运行：python sync/server.py");
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("本地同步服务")) throw err;
    throw new Error("本地同步服务未运行。请先运行：python sync/server.py");
  }

  const serverData = await apiFetch("/memos");
  const serverMemos = serverData.memos || [];
  const serverIds = new Set(serverMemos.map((m) => m.id).filter(Boolean));
  const serverSignatures = new Set(
    serverMemos.map((m) => `${m.category}::${m.title}::${(m.content || "").slice(0, 120)}`),
  );

  let migrated = 0;
  for (const memo of local) {
    if (!DIARY_CATEGORIES.includes(memo.category)) continue;
    const signature = `${memo.category}::${memo.title}::${(memo.content || "").slice(0, 120)}`;
    if (memo.id && serverIds.has(memo.id)) continue;
    if (serverSignatures.has(signature)) continue;

    await apiFetch("/memos", {
      method: "POST",
      body: JSON.stringify({
        id: memo.id,
        category: memo.category,
        content: memo.content,
        title: memo.title,
        favorite: memo.favorite,
        plannedAt: memo.plannedAt,
        featured: memo.featured,
      }),
    });
    migrated++;
  }

  storageMode = null;
  return { migrated, total: local.length };
}

/** 同步时收集浏览器与服务端的事件簿数据 */
export async function collectDiaryMemosForSync() {
  const merged = new Map();

  for (const memo of readLocalMemos()) {
    if (!memo?.category || !memo?.content) continue;
    const key = memo.id || `${memo.category}::${memo.title}::${(memo.content || "").slice(0, 80)}`;
    merged.set(key, memo);
  }

  try {
    const health = await fetch(`${API_ROOT}/health`, { signal: AbortSignal.timeout(1500) });
    if (health.ok) {
      const data = await apiFetch("/memos");
      for (const memo of data.memos || []) {
        if (!memo?.category || !memo?.content) continue;
        const key = memo.id || `${memo.category}::${memo.title}::${(memo.content || "").slice(0, 80)}`;
        merged.set(key, memo);
      }
    }
  } catch {
    /* localStorage only */
  }

  return [...merged.values()];
}

/** 将编辑端公告（浏览器 + 本地文件）覆盖写入读者端导出数据 */
export async function exportEditorAnnouncementsToReader() {
  const localAnnouncements = readLocalMemos().filter((m) => m.category === ANNOUNCE_CATEGORY && m.content);
  const merged = await collectDiaryMemosForSync();
  const mergedAnnouncements = merged.filter((m) => m.category === ANNOUNCE_CATEGORY && m.content);

  // 优先用浏览器里你自己写的公告；没有再回退到本地文件里的公告
  const announcements = localAnnouncements.length ? localAnnouncements : mergedAnnouncements;
  if (!announcements.length) {
    throw new Error("未找到你写的更新公告。请先在「鼠の事件簿 → 更新公告」确认能看到内容。");
  }

  try {
    const health = await fetch(`${API_ROOT}/health`, { signal: AbortSignal.timeout(2000) });
    if (!health.ok) throw new Error("offline");
  } catch {
    throw new Error("本地同步服务未运行。请先运行：python sync/server.py");
  }

  const data = await apiFetch("/import-memos", {
    method: "POST",
    body: JSON.stringify({
      memos: announcements,
      replaceAnnouncements: true,
    }),
  });

  storageMode = null;
  return {
    imported: data.imported || 0,
    count: data.announcementCount || announcements.length,
    announcements: data.announcements || [],
    source: localAnnouncements.length ? "browser" : "files",
  };
}

async function fetchAllMemosRaw() {
  await detectDiaryStorage();

  if (storageMode === "server") {
    const data = await apiFetch("/memos");
    return data.memos || [];
  }

  return readLocalMemos();
}

export async function listMemos() {
  const all = await fetchAllMemosRaw();
  return sortMemos(all.filter((m) => MEMO_CATEGORIES.includes(m.category)));
}

export async function listPlans() {
  const all = await fetchAllMemosRaw();
  return sortPlans(all.filter((m) => m.category === PLAN_CATEGORY));
}

export async function listAnnouncements() {
  if (isPublishedSite()) {
    return sortAnnouncements(await fetchPublishedAnnouncementsRaw());
  }

  await detectDiaryStorage();
  const localAnnouncements = readLocalMemos().filter((m) => m.category === ANNOUNCE_CATEGORY);

  if (storageMode === "server") {
    try {
      const data = await apiFetch("/memos");
      const serverAnnouncements = (data.memos || []).filter((m) => m.category === ANNOUNCE_CATEGORY);
      const merged = new Map();
      for (const item of [...serverAnnouncements, ...localAnnouncements]) {
        const key = item.id || `${item.title}::${(item.content || "").slice(0, 80)}`;
        merged.set(key, item);
      }
      return sortAnnouncements([...merged.values()]);
    } catch {
      return sortAnnouncements(localAnnouncements);
    }
  }

  return sortAnnouncements(localAnnouncements);
}

export async function listMoods() {
  const all = await fetchAllMemosRaw();
  return sortMoods(all.filter((m) => m.category === MOOD_CATEGORY));
}

export async function fetchMoodForHome() {
  if (isPublishedSite()) {
    return fetchPublishedMoodRaw();
  }

  await detectDiaryStorage();

  if (storageMode === "server") {
    try {
      const data = await apiFetch("/mood-board");
      return data.mood || null;
    } catch {
      return pickMoodForHome(await listMoods());
    }
  }

  const embedded = await loadEmbeddedJson("diaryMoodBoard");
  if (embedded && typeof embedded === "object" && embedded.content) {
    return embedded;
  }

  return pickMoodForHome(await listMoods());
}

export async function fetchAnnouncementsForHome() {
  if (isPublishedSite()) {
    return pickAnnouncementsForHome(await fetchPublishedAnnouncementsRaw());
  }

  await detectDiaryStorage();

  const localAnnouncements = readLocalMemos().filter((m) => m.category === ANNOUNCE_CATEGORY);

  if (storageMode === "server") {
    try {
      const data = await apiFetch("/memos");
      const serverAnnouncements = (data.memos || []).filter((m) => m.category === ANNOUNCE_CATEGORY);
      // 编辑端：浏览器里的公告与本地文件合并，避免只显示仓库种子数据
      const merged = new Map();
      for (const item of [...serverAnnouncements, ...localAnnouncements]) {
        const key = item.id || `${item.title}::${(item.content || "").slice(0, 80)}`;
        merged.set(key, item);
      }
      return pickAnnouncementsForHome([...merged.values()]);
    } catch {
      return pickAnnouncementsForHome(localAnnouncements);
    }
  }

  const embedded = await loadEmbeddedJson("diaryAnnouncements");
  if (Array.isArray(embedded) && embedded.length) {
    return pickAnnouncementsForHome(embedded);
  }

  return pickAnnouncementsForHome(await listAnnouncements());
}

function newLocalId() {
  return `memo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function titleFromContent(content, category) {
  const line = content.split(/\n/).find((s) => s.trim()) || "";
  const trimmed = line.trim().slice(0, 40);
  if (trimmed) return trimmed;
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return `${category} ${stamp}`;
}

export async function createMemo({ category, content, title, favorite = false, plannedAt, featured = false }) {
  const body = (content || "").trim();
  if (!body) throw new Error("内容不能为空");
  if (!DIARY_CATEGORIES.includes(category)) throw new Error("无效的栏目");
  if (category === PLAN_CATEGORY && !plannedAt) throw new Error("请填写计划时间");
  if (category === MOOD_CATEGORY && body.length > MOOD_MAX_LENGTH) {
    throw new Error(`心情贴不能超过 ${MOOD_MAX_LENGTH} 字`);
  }

  await detectDiaryStorage();

  const payload = { category, content: body, title, favorite };
  if (plannedAt) payload.plannedAt = plannedAt;
  if (category === MOOD_CATEGORY && featured) payload.featured = true;

  if (storageMode === "server") {
    const data = await apiFetch("/memos", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return data.memo;
  }

  const now = new Date().toISOString();
  const memo = {
    id: newLocalId(),
    path: `local/${newLocalId()}.md`,
    title:
      title ||
      (category === ANNOUNCE_CATEGORY
        ? `更新公告 ${formatStamp(now)}`
        : category === MOOD_CATEGORY
          ? `心情贴 ${formatStamp(now)}`
          : titleFromContent(body, category)),
    category,
    favorite: Boolean(favorite),
    featured: category === MOOD_CATEGORY && Boolean(featured),
    plannedAt: plannedAt || "",
    createdAt: now,
    updatedAt: now,
    content: body,
  };
  if (memo.featured) clearLocalMoodFeatured(memo.path);
  const memos = readLocalMemos();
  memos.push(memo);
  writeLocalMemos(memos);
  return memo;
}

export async function updateMemo({ path, content, title, category, favorite, plannedAt, featured }) {
  await detectDiaryStorage();

  if (storageMode === "server") {
    const payload = { path };
    if (content !== undefined) payload.content = content;
    if (title !== undefined) payload.title = title;
    if (category !== undefined) payload.category = category;
    if (favorite !== undefined) payload.favorite = favorite;
    if (plannedAt !== undefined) payload.plannedAt = plannedAt;
    if (featured !== undefined) payload.featured = featured;
    const data = await apiFetch("/memos", { method: "PUT", body: JSON.stringify(payload) });
    return data.memo;
  }

  const memos = readLocalMemos();
  const idx = memos.findIndex((m) => m.path === path || m.id === path);
  if (idx < 0) throw new Error("记录不存在");
  const memo = { ...memos[idx] };
  if (content !== undefined) {
    if (memo.category === MOOD_CATEGORY && content.length > MOOD_MAX_LENGTH) {
      throw new Error(`心情贴不能超过 ${MOOD_MAX_LENGTH} 字`);
    }
    memo.content = content;
  }
  if (title !== undefined) memo.title = title;
  if (category !== undefined) memo.category = category;
  if (favorite !== undefined) memo.favorite = Boolean(favorite);
  if (plannedAt !== undefined) memo.plannedAt = plannedAt;
  if (featured !== undefined) {
    memo.featured = Boolean(featured);
    if (memo.featured && memo.category === MOOD_CATEGORY) {
      clearLocalMoodFeatured(memo.path);
    }
  }
  memo.updatedAt = new Date().toISOString();
  memos[idx] = memo;
  writeLocalMemos(memos);
  return memo;
}

export async function setMoodFeatured(path, featured = true) {
  return updateMemo({ path, featured });
}

export async function createMoodSticker({ content, featured = false }) {
  return createMemo({ category: MOOD_CATEGORY, content, featured });
}

export async function deleteMemo(path) {
  await detectDiaryStorage();

  if (storageMode === "server") {
    return apiFetch(`/memos?path=${encodeURIComponent(path)}`, { method: "DELETE" });
  }

  const memos = readLocalMemos().filter((m) => m.path !== path && m.id !== path);
  writeLocalMemos(memos);
  return { ok: true };
}

function formatStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function defaultPlannedInputValue() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setMinutes(0, 0, 0);
  return toDatetimeLocalValue(d);
}

export function toDatetimeLocalValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString();
}
