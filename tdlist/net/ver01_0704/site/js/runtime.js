let siteDataCache = null;

/** 本地编辑端品牌（含 call sign） */
export const LOCAL_BRAND = "Alstr（Call Sign ☘ VLinv）";
/** 读者端品牌 */
export const PUBLISHED_BRAND = "鼠窝";

export function isFileProtocol() {
  return window.location.protocol === "file:";
}

export function isLocalDevHost() {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || isFileProtocol();
}

/** 已发布到公网（GitHub Pages 等）— 访客只读 */
export function isPublishedSite() {
  return !isLocalDevHost();
}

/** 仅本地开发环境可编辑笔记（localhost / file://） */
export function canEditNotes() {
  return isLocalDevHost();
}

/** 当前站点对外展示的品牌名 */
export function siteBrandLabel() {
  return isPublishedSite() ? PUBLISHED_BRAND : LOCAL_BRAND;
}

export function applySiteAccessMode() {
  const mode = canEditNotes() ? "local" : "published";
  document.documentElement.setAttribute("data-site-mode", mode);
  // 静态 title/meta 以读者端「鼠窝」为准；本地再还原 Alstr
  if (mode === "local") {
    if (document.title.includes(PUBLISHED_BRAND)) {
      document.title = document.title.split(PUBLISHED_BRAND).join(LOCAL_BRAND);
    }
    document.querySelectorAll('meta[name="description"]').forEach((el) => {
      const content = el.getAttribute("content") || "";
      if (content.includes(PUBLISHED_BRAND)) {
        el.setAttribute("content", content.split(PUBLISHED_BRAND).join(LOCAL_BRAND));
      }
    });
  }
}

export function shouldUseEmbeddedData() {
  return isFileProtocol();
}

export async function getSiteDataBundle() {
  if (siteDataCache) return siteDataCache;
  try {
    const mod = await import("./site-data.js");
    siteDataCache = mod.SITE_DATA ?? {};
    return siteDataCache;
  } catch {
    siteDataCache = {};
    return siteDataCache;
  }
}

export async function loadEmbeddedJson(key) {
  const bundle = await getSiteDataBundle();
  const value = bundle[key];
  return value ?? null;
}

export async function fetchJson(url, embeddedKey) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) return res.json();
  } catch {
    /* fall through to embedded */
  }

  if (embeddedKey) {
    const embedded = await loadEmbeddedJson(embeddedKey);
    if (embedded !== null && embedded !== undefined) return embedded;
  }

  throw new Error(`无法加载 ${url}`);
}
