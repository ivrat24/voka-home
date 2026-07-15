import { isFileProtocol } from "./runtime.js";
import {
  getPageIdFromUrl,
  refreshSiteHeaderOffset,
  updateNavActive,
} from "./layout.js";
import { refreshCursorTrailToggle } from "./cursor-trail.js";
import { gateMouseDiaryNavigation } from "./access-gate.js";

let navigating = false;

function shouldHandleLink(link) {
  if (!link || link.target === "_blank" || link.hasAttribute("download")) return false;
  const href = link.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }

  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return false;

  const path = url.pathname;
  return path.endsWith(".html") || /\/pages\/[^/]+\/?$/.test(path) || path.endsWith("/");
}

export function initSpaNavigation(onNavigate) {
  if (window.__vokaSpaInit) return;
  window.__vokaSpaInit = true;

  if (isFileProtocol()) {
    return;
  }

  document.addEventListener("click", async (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const link = event.target.closest("a[href]");
    if (!shouldHandleLink(link)) return;

    event.preventDefault();
    if (await gateMouseDiaryNavigation(link.href)) {
      return;
    }
    navigateTo(link.href, onNavigate);
  });

  window.addEventListener("popstate", () => {
    navigateTo(window.location.href, onNavigate, { fromPopstate: true });
  });
}

async function navigateTo(url, onNavigate, { fromPopstate = false } = {}) {
  if (navigating) return;
  navigating = true;

  try {
    const targetUrl = new URL(url, window.location.href).href;
    if (!fromPopstate && targetUrl === window.location.href) {
      return;
    }

    if (await gateMouseDiaryNavigation(targetUrl)) {
      return;
    }

    const response = await fetch(targetUrl, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`Failed to load ${targetUrl}`);

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const nextMain = doc.querySelector("main");
    const currentMain = document.querySelector("main");
    const nextHeader = doc.querySelector(".site-header");
    const currentHeader = document.querySelector(".site-header");
    const nextFooter = doc.querySelector(".site-footer");
    const currentFooter = document.querySelector(".site-footer");

    if (!nextMain || !currentMain) {
      window.location.href = targetUrl;
      return;
    }

    if (nextHeader && currentHeader) {
      currentHeader.replaceWith(document.importNode(nextHeader, true));
      refreshSiteHeaderOffset();
    }

    currentMain.replaceWith(document.importNode(nextMain, true));

    if (nextFooter && currentFooter) {
      currentFooter.replaceWith(document.importNode(nextFooter, true));
    }

    refreshCursorTrailToggle();
    refreshSiteHeaderOffset();

    document.title = doc.title;
    const nextDescription = doc.querySelector('meta[name="description"]')?.getAttribute("content");
    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (nextDescription && descriptionMeta) {
      descriptionMeta.setAttribute("content", nextDescription);
    }

    if (!fromPopstate) {
      history.pushState({ vokaSpa: true }, "", targetUrl);
    }

    window.scrollTo(0, 0);

    const pageId = getPageIdFromUrl(targetUrl);
    updateNavActive(pageId);
    await onNavigate(pageId, { doc, url: targetUrl });
  } catch {
    window.location.href = url;
  } finally {
    navigating = false;
  }
}
