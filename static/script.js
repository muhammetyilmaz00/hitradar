const grid = document.getElementById("grid");
const statusEl = document.getElementById("status");
const thresholdValueEl = document.getElementById("thresholdValue");
const filtersEl = document.getElementById("filters");
const langFiltersEl = document.getElementById("langFilters");
const seekbarEl = document.getElementById("seekbar");
const seekbarTrackEl = seekbarEl.querySelector(".seekbar-track");
const seekbarFillEl = document.getElementById("seekbarFill");
const seekbarThumbEl = document.getElementById("seekbarThumb");
const barInputEl = document.getElementById("barInput");

const BAR_DEFAULT = Number(document.body.dataset.minViews) || 1_000_000;
const BAR_FLOOR = 1_000; // lowest the bar can go — type/drag/scroll freely above this
const BAR_STEP = 1_000_000; // increment used by scroll/arrow-key nudges only
const BAR_CEILING = 100_000_000_000; // fixed 100B top of the seekbar's range

let allVideos = [];
let activeCategory = "all";
let activeLanguage = "all";
let currentBar = BAR_DEFAULT;
let searchErrorCount = 0;

function formatViews(n) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function tierFor(views) {
  if (!currentBar) return { key: "gold", label: "Gold" };
  if (views >= currentBar * 100) return { key: "diamond", label: "Diamond" };
  if (views >= currentBar * 10) return { key: "platinum", label: "Platinum" };
  return { key: "gold", label: "Gold" };
}

function playBadgeSVG() {
  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="11" fill="#D4AC55" fill-opacity="0.92"/>
    <path d="M9.5 8L16 12L9.5 16V8Z" fill="#14120D"/>
  </svg>`;
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function parseViewsInput(str) {
  if (!str) return null;
  const cleaned = str.trim().toLowerCase().replace(/,/g, "").replace(/\+?\s*views?$/, "").trim();
  const match = cleaned.match(/^([0-9]*\.?[0-9]+)\s*([kmb])?$/);
  if (!match) return null;

  let num = parseFloat(match[1]);
  if (!isFinite(num)) return null;

  if (match[2] === "k") num *= 1_000;
  else if (match[2] === "m") num *= 1_000_000;
  else if (match[2] === "b") num *= 1_000_000_000;

  return Math.round(num);
}

function renderVideos(videos) {
  grid.innerHTML = "";

  if (videos.length === 0) {
    statusEl.className = "status";
    statusEl.textContent = allVideos.length
      ? "Nothing matches this combination of bar, category, and language. Try widening one of them."
      : "No videos cleared the bar. Try lowering the bar above.";
    if (searchErrorCount) {
      statusEl.textContent += ` (${searchErrorCount} search${searchErrorCount === 1 ? "" : "es"} failed to load)`;
    }
    return;
  }

  statusEl.className = "status";
  statusEl.textContent = `${videos.length} video${videos.length === 1 ? "" : "s"} shown.`;
  if (searchErrorCount) {
    statusEl.textContent += ` (${searchErrorCount} search${searchErrorCount === 1 ? "" : "es"} failed to load)`;
  }

  const maxViews = Math.max(...videos.map(v => v.views));

  videos.forEach((video, index) => {
    const card = document.createElement("a");
    card.className = "card";
    card.style.animationDelay = `${Math.min(index, 12) * 30}ms`;
    card.href = video.url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    const pct = Math.max(6, Math.round((video.views / maxViews) * 100));
    const tier = tierFor(video.views);
    const multiple = currentBar ? Math.max(1, Math.round(video.views / currentBar)) : null;
    const rank = String(index + 1).padStart(2, "0");

    card.innerHTML = `
      <div class="thumb-wrap">
        <img src="${video.thumbnail}" alt="" loading="lazy" />
        <div class="card-rank">№ ${rank}</div>
        <div class="play-badge">${playBadgeSVG()}</div>
      </div>
      <div class="card-body">
        <div class="card-meta-row">
          <span class="card-category">${escapeHTML(video.category)} · ${escapeHTML(video.language)}</span>
          <span class="tier-chip tier-${tier.key}">${tier.label}</span>
        </div>
        <div class="card-title">${escapeHTML(video.title)}</div>
        <div class="card-channel">${escapeHTML(video.channel)}</div>
        ${video.description ? `<div class="card-description">${escapeHTML(video.description)}</div>` : ""}
        <div class="meter-row">
          <div class="meter-track">
            <div class="meter-fill" style="width:${pct}%"></div>
          </div>
          <div class="meter-label">
            <span>${formatViews(video.views)} views</span>
            <span class="meter-multiple">${multiple ? `${multiple}× the bar` : ""}</span>
          </div>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

function eligibleVideos() {
  return allVideos.filter(v => v.views >= currentBar);
}

function applyFilter() {
  let filtered = eligibleVideos();
  if (activeCategory !== "all") {
    filtered = filtered.filter(v => v.category === activeCategory);
  }
  if (activeLanguage !== "all") {
    filtered = filtered.filter(v => v.language === activeLanguage);
  }
  renderVideos(filtered);
}

function updateTabCounts() {
  // Category counts respect the bar + the active language, but not the
  // active category (so you can see every category's count at once).
  const byLanguage = activeLanguage === "all"
    ? eligibleVideos()
    : eligibleVideos().filter(v => v.language === activeLanguage);

  const categoryCounts = { all: byLanguage.length };
  for (const video of byLanguage) {
    categoryCounts[video.category] = (categoryCounts[video.category] || 0) + 1;
  }
  filtersEl.querySelectorAll("[data-count-for]").forEach(el => {
    const count = categoryCounts[el.dataset.countFor] || 0;
    el.textContent = count ? `(${count})` : "";
  });

  // Language counts respect the bar + the active category, but not the
  // active language.
  const byCategory = activeCategory === "all"
    ? eligibleVideos()
    : eligibleVideos().filter(v => v.category === activeCategory);

  const languageCounts = { all: byCategory.length };
  for (const video of byCategory) {
    languageCounts[video.language] = (languageCounts[video.language] || 0) + 1;
  }
  langFiltersEl.querySelectorAll("[data-lang-count-for]").forEach(el => {
    const count = languageCounts[el.dataset.langCountFor] || 0;
    el.textContent = count ? `(${count})` : "";
  });
}

function updateSeekbarUI() {
  const range = BAR_CEILING - BAR_FLOOR;
  const pct = Math.min(100, Math.max(0, ((currentBar - BAR_FLOOR) / range) * 100));
  seekbarFillEl.style.width = pct + "%";
  seekbarThumbEl.style.left = pct + "%";
  thresholdValueEl.textContent = formatViews(currentBar);
  seekbarEl.setAttribute("aria-valuemax", BAR_CEILING);
  seekbarEl.setAttribute("aria-valuenow", currentBar);
  seekbarEl.setAttribute("aria-valuetext", `${formatViews(currentBar)}+ views`);
  if (document.activeElement !== barInputEl) {
    barInputEl.value = formatViews(currentBar);
  }
}

function setBar(rawValue, { snap = false } = {}) {
  const value = snap ? Math.round(rawValue / BAR_STEP) * BAR_STEP : Math.round(rawValue);
  currentBar = Math.max(BAR_FLOOR, Math.min(value, BAR_CEILING));
  updateSeekbarUI();
  updateTabCounts();
  applyFilter();
}

seekbarEl.addEventListener("wheel", (e) => {
  e.preventDefault();
  setBar(currentBar + (e.deltaY < 0 ? BAR_STEP : -BAR_STEP), { snap: true });
}, { passive: false });

seekbarEl.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp" || e.key === "ArrowRight") {
    e.preventDefault();
    setBar(currentBar + BAR_STEP, { snap: true });
  } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
    e.preventDefault();
    setBar(currentBar - BAR_STEP, { snap: true });
  }
});

function setBarFromClientX(clientX) {
  const rect = seekbarTrackEl.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  setBar(BAR_FLOOR + pct * (BAR_CEILING - BAR_FLOOR));
}

// Pointer Events cover mouse, touch, and pen in one API, so dragging the
// seekbar works the same way whether you click-drag on desktop or
// touch-drag on a phone/tablet.
let isDraggingBar = false;

seekbarEl.addEventListener("pointerdown", (e) => {
  isDraggingBar = true;
  seekbarEl.setPointerCapture(e.pointerId);
  setBarFromClientX(e.clientX);
});

seekbarEl.addEventListener("pointermove", (e) => {
  if (!isDraggingBar) return;
  setBarFromClientX(e.clientX);
});

function endBarDrag(e) {
  if (!isDraggingBar) return;
  isDraggingBar = false;
  if (seekbarEl.hasPointerCapture(e.pointerId)) {
    seekbarEl.releasePointerCapture(e.pointerId);
  }
}

seekbarEl.addEventListener("pointerup", endBarDrag);
seekbarEl.addEventListener("pointercancel", endBarDrag);

function commitBarInput() {
  const parsed = parseViewsInput(barInputEl.value);
  if (parsed !== null && parsed > 0) {
    setBar(parsed);
  } else {
    barInputEl.value = formatViews(currentBar);
  }
}

barInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    commitBarInput();
    barInputEl.blur();
  }
});

barInputEl.addEventListener("blur", commitBarInput);

filtersEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-tab");
  if (!btn) return;

  filtersEl.querySelectorAll(".filter-tab").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  activeCategory = btn.dataset.category;
  updateTabCounts();
  applyFilter();
});

langFiltersEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-tab");
  if (!btn) return;

  langFiltersEl.querySelectorAll(".filter-tab").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  activeLanguage = btn.dataset.language;
  updateTabCounts();
  applyFilter();
});

async function fetchVideos() {
  statusEl.className = "status";
  statusEl.textContent = "Loading videos…";

  try {
    const res = await fetch("/api/videos");
    const data = await res.json();

    if (!res.ok) {
      statusEl.className = "status error";
      statusEl.textContent = data.error || "Something went wrong fetching videos.";
      return;
    }

    allVideos = data.videos || [];
    searchErrorCount = (data.errors || []).length;
    updateSeekbarUI();
    updateTabCounts();
    applyFilter();
  } catch (err) {
    statusEl.className = "status error";
    statusEl.textContent = "Could not reach the server. Is app.py running?";
  }
}

updateSeekbarUI();
fetchVideos();
