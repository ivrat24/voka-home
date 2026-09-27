import { escapeHtml } from "./layout.js";
import { fetchAnnouncementsForHome } from "./mouse-diary-api.js";

const AUTO_INTERVAL_MS = 5000;

let carouselTimer = null;
let carouselIndex = 0;
let isPaused = false;
/** @type {object[]} */
let announcements = [];

function getTrack() {
  return document.getElementById("home-updates-track");
}

function formatTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function previewText(content, max = 100) {
  const text = String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function openAnnouncementDetail(item) {
  const dialog = document.getElementById("home-update-dialog");
  const title = document.getElementById("home-update-dialog-title");
  const meta = document.getElementById("home-update-dialog-meta");
  const body = document.getElementById("home-update-dialog-body");
  if (!dialog || !body) return;

  if (title) title.textContent = item.title || "更新公告";
  if (meta) {
    meta.innerHTML = `
      <span class="home-update-badge">更新公告</span>
      ${item.favorite ? '<span class="diary-fav-badge">★ 精选</span>' : ""}
      <time datetime="${escapeHtml(item.updatedAt || item.createdAt || "")}">${escapeHtml(formatTime(item.updatedAt || item.createdAt))}</time>
    `;
  }
  body.textContent = item.content || "";
  body.classList.add("home-update-dialog__body--pre");
  dialog.showModal();
}

function renderSlide(item, index) {
  const time = formatTime(item.updatedAt || item.createdAt);
  const preview = previewText(item.content, 120);
  return `
    <article class="home-update-slide${index === carouselIndex ? " is-active" : ""}" data-index="${index}" data-path="${escapeHtml(item.path)}">
      <button type="button" class="home-update-slide-hit" data-action="open" aria-label="查看公告详情：${escapeHtml(item.title || "更新公告")}"></button>
      <div class="home-update-slide__inner">
        <header class="home-update-slide__head">
          <span class="home-update-badge">更新</span>
          ${item.favorite ? '<span class="diary-fav-badge">★ 精选</span>' : ""}
          <time>${escapeHtml(time)}</time>
        </header>
        <h3 class="home-update-slide__title">${escapeHtml(item.title || "更新公告")}</h3>
        <p class="home-update-slide__preview home-update-slide__preview--pre">${escapeHtml(preview)}</p>
        <span class="home-update-slide__more">查看详情 →</span>
      </div>
    </article>
  `;
}

function updateActiveSlide({ smooth = true } = {}) {
  const track = getTrack();
  if (!track) return;

  track.querySelectorAll(".home-update-slide").forEach((slide, i) => {
    slide.classList.toggle("is-active", i === carouselIndex);
  });

  const dots = document.getElementById("home-updates-dots");
  if (dots) {
    dots.querySelectorAll("[data-dot]").forEach((dot, i) => {
      dot.classList.toggle("is-active", i === carouselIndex);
      dot.setAttribute("aria-selected", i === carouselIndex ? "true" : "false");
    });
  }

  const activeSlide = track.querySelector(`.home-update-slide[data-index="${carouselIndex}"]`);
  if (!activeSlide) return;

  track.scrollTo({
    left: activeSlide.offsetLeft,
    behavior: smooth ? "smooth" : "auto",
  });
}

function goToSlide(index, options = {}) {
  if (!announcements.length) return;
  carouselIndex = ((index % announcements.length) + announcements.length) % announcements.length;
  updateActiveSlide(options);
}

function tickCarousel() {
  if (isPaused || announcements.length <= 1) return;
  goToSlide(carouselIndex + 1);
}

function startCarousel() {
  stopCarousel();
  if (announcements.length <= 1) return;
  isPaused = false;
  carouselTimer = window.setInterval(tickCarousel, AUTO_INTERVAL_MS);
}

function stopCarousel() {
  if (carouselTimer) {
    window.clearInterval(carouselTimer);
    carouselTimer = null;
  }
}

function pauseCarousel() {
  isPaused = true;
}

function resumeCarousel() {
  isPaused = false;
  if (!carouselTimer && announcements.length > 1) {
    startCarousel();
  }
}

function renderEmptyCarousel() {
  const section = document.getElementById("home-updates-section");
  const track = document.getElementById("home-updates-track");
  const dots = document.getElementById("home-updates-dots");
  const nav = section?.querySelector(".home-updates-nav");
  if (!section || !track) return;

  stopCarousel();
  section.hidden = false;
  carouselIndex = 0;
  if (nav) nav.hidden = true;
  if (dots) dots.innerHTML = "";
  track.innerHTML = `
    <article class="home-update-slide is-active home-update-slide--empty" data-index="0">
      <div class="home-update-slide__inner">
        <header class="home-update-slide__head">
          <span class="home-update-badge">更新</span>
        </header>
        <h3 class="home-update-slide__title">暂无更新公告</h3>
        <p class="home-update-slide__preview">编辑端在「鼠の事件簿 → 更新公告」发布后，同步到读者端即可在此轮播展示。</p>
      </div>
    </article>
  `;
}

function renderCarousel() {
  const section = document.getElementById("home-updates-section");
  const track = document.getElementById("home-updates-track");
  const dots = document.getElementById("home-updates-dots");
  const nav = section?.querySelector(".home-updates-nav");
  if (!section || !track) return;

  if (!announcements.length) {
    renderEmptyCarousel();
    return;
  }

  section.hidden = false;
  if (nav) nav.hidden = false;
  carouselIndex = 0;
  track.innerHTML = announcements.map((item, i) => renderSlide(item, i)).join("");

  if (dots) {
    dots.innerHTML = announcements
      .map(
        (_, i) =>
          `<button type="button" class="home-updates-dot${i === 0 ? " is-active" : ""}" data-dot="${i}" aria-label="第 ${i + 1} 条公告" aria-selected="${i === 0 ? "true" : "false"}"></button>`,
      )
      .join("");
  }

  startCarousel();
  requestAnimationFrame(() => updateActiveSlide({ smooth: false }));
}

function syncIndexFromScroll() {
  const track = getTrack();
  if (!track || announcements.length <= 1) return;

  const center = track.scrollLeft + track.clientWidth / 2;
  let nearest = carouselIndex;
  let nearestDist = Infinity;

  track.querySelectorAll(".home-update-slide").forEach((slide) => {
    const slideCenter = slide.offsetLeft + slide.clientWidth / 2;
    const dist = Math.abs(slideCenter - center);
    const index = Number(slide.dataset.index);
    if (dist < nearestDist && Number.isFinite(index)) {
      nearestDist = dist;
      nearest = index;
    }
  });

  if (nearest !== carouselIndex) {
    carouselIndex = nearest;
    updateActiveSlide({ smooth: false });
  }
}

function bindCarouselEvents() {
  const root = document.getElementById("home-updates-section");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const track = getTrack();
  let scrollSyncTimer = null;
  track?.addEventListener("scroll", () => {
    if (scrollSyncTimer) window.clearTimeout(scrollSyncTimer);
    scrollSyncTimer = window.setTimeout(syncIndexFromScroll, 120);
  }, { passive: true });

  root.addEventListener("click", (event) => {
    const prev = event.target.closest("[data-carousel=prev]");
    const next = event.target.closest("[data-carousel=next]");
    const dot = event.target.closest("[data-dot]");
    const openBtn = event.target.closest("[data-action=open]");

    if (prev) {
      goToSlide(carouselIndex - 1);
      startCarousel();
    } else if (next) {
      goToSlide(carouselIndex + 1);
      startCarousel();
    } else if (dot) {
      goToSlide(Number(dot.dataset.dot));
      startCarousel();
    } else if (openBtn) {
      pauseCarousel();
      const slide = openBtn.closest(".home-update-slide");
      const item = announcements[Number(slide?.dataset.index)];
      if (item) openAnnouncementDetail(item);
    }
  });

  root.addEventListener("mouseenter", pauseCarousel);
  root.addEventListener("mouseleave", resumeCarousel);
  root.addEventListener("focusin", pauseCarousel);
  root.addEventListener("focusout", (event) => {
    if (!root.contains(event.relatedTarget)) resumeCarousel();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseCarousel();
    else resumeCarousel();
  });

  document.getElementById("home-update-dialog")?.addEventListener("close", () => {
    resumeCarousel();
  });

  document.getElementById("home-update-dialog-close")?.addEventListener("click", () => {
    document.getElementById("home-update-dialog")?.close();
  });
}

export async function initHomeUpdates() {
  const section = document.getElementById("home-updates-section");
  if (!section) return;

  bindCarouselEvents();

  try {
    announcements = await fetchAnnouncementsForHome();
  } catch {
    announcements = [];
  }
  renderCarousel();
}

export function refreshHomeUpdates() {
  void initHomeUpdates();
}
