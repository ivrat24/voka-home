(function () {
  var script = document.currentScript;
  if (!script) return;

  // Reader-first site mode before CSS/paint settles (local host keeps editor brand).
  (function applySiteModeEarly() {
    var host = location.hostname;
    var local =
      host === "localhost" ||
      host === "127.0.0.1" ||
      location.protocol === "file:";
    document.documentElement.setAttribute("data-site-mode", local ? "local" : "published");
  })();

  var pageId = script.getAttribute("data-page") || "home";
  var moduleSrc = script.getAttribute("data-module") || "main.js";
  var bundleSrc = script.getAttribute("data-bundle") || "site-offline.bundle.js";
  // Bump when shipping reader-visible JS/CSS so Pages visitors skip stale module cache.
  var assetVersion = script.getAttribute("data-asset-version") || "20260927j";

  function withVersion(url) {
    try {
      var next = new URL(url, script.src);
      next.searchParams.set("v", assetVersion);
      return next.href;
    } catch (error) {
      return url + (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + encodeURIComponent(assetVersion);
    }
  }

  function appendScript(options) {
    var el = document.createElement("script");
    if (options.type) el.type = options.type;
    if (options.src) el.src = options.src;
    if (options.text) el.textContent = options.text;
    document.body.appendChild(el);
  }

  function registerOfflineSiteRoot() {
    if (location.protocol !== "file:") return;
    var siteRoot = new URL("../", script.src).href;
    var baseParts = [];
    var current = new URL("./", location.href).href;
    var guard = 0;
    while (current !== siteRoot && guard < 12) {
      baseParts.push("..");
      current = new URL("../", current).href;
      guard += 1;
    }
    var siteBase = baseParts.length ? baseParts.join("/") + "/" : "";
    window.__VOKA_SITE_ROOT__ = siteRoot;
    window.__VOKA_SITE_BASE__ = siteBase;
    try {
      sessionStorage.setItem("voka-offline-root", siteRoot);
      sessionStorage.setItem("voka-site-base", siteBase);
    } catch (error) {
      /* ignore storage errors */
    }
    document.documentElement.setAttribute("data-voka-offline", "1");
    if (pageId === "home") {
      document.documentElement.setAttribute("data-voka-offline-entry", "index");
    }
  }

  registerOfflineSiteRoot();

  if (location.protocol === "file:") {
    var bundleUrl = new URL(bundleSrc, script.src).href;
    var bundle = document.createElement("script");
    bundle.src = bundleUrl;
    bundle.onload = function () {
      if (window.VokaBoot && typeof window.VokaBoot.boot === "function") {
        window.VokaBoot.boot(pageId);
      } else {
        console.error("[Voka] 离线 bundle 未就绪，请运行 python sync/build-all.py");
      }
    };
    bundle.onerror = function () {
      console.error("[Voka] 无法加载离线 bundle:", bundleUrl);
    };
    document.body.appendChild(bundle);
    return;
  }

  if (pageId === "home") {
    appendScript({ type: "module", src: withVersion(new URL(moduleSrc, script.src).href) });
    return;
  }

  // Load bootstrap with cache-bust so subsequent module graph picks up newer files after deploy.
  var bootstrapUrl = withVersion(new URL("bootstrap.js", script.src).href);
  appendScript({
    type: "module",
    text:
      "import { bootstrap } from " +
      JSON.stringify(bootstrapUrl) +
      "; bootstrap(" +
      JSON.stringify(pageId) +
      ").catch(function (error) { console.error('[Voka] 页面初始化失败:', error); });",
  });
})();
