// DocHopper content script.
// Injects the command palette and return badge via Shadow DOM and coordinates with the background worker.

/* eslint-disable no-undef */

let storageModule = null;
let shortcutsModule = null;
let searchModule = null;

/** @type {ShadowRoot | null} */
let paletteShadow = null;
/** @type {HTMLElement | null} */
let paletteRoot = null;
/** @type {HTMLInputElement | null} */
let searchInputEl = null;
/** @type {HTMLElement | null} */
let listContainerEl = null;

/** @type {ShadowRoot | null} */
let badgeShadow = null;
/** @type {HTMLElement | null} */
let badgeRoot = null;
/** @type {number | null} */
let badgeTimer = null;
/** @type {number} */
let badgeDurationMs = 8000;

/** @type {boolean} */
let paletteOpen = false;
/** @type {{ siteId: string, element: HTMLElement }[]} */
let currentItems = [];
/** @type {number} */
let currentIndex = -1;

/**
 * Lazy-load shared modules that are bundled as extension scripts.
 */
async function ensureModules() {
  if (storageModule && shortcutsModule && searchModule) return;
  const [storage, shortcuts, search] = await Promise.all([
    import(chrome.runtime.getURL("utils/storage.js")),
    import(chrome.runtime.getURL("utils/shortcuts.js")),
    import(chrome.runtime.getURL("utils/search.js")),
  ]);
  storageModule = storage;
  shortcutsModule = shortcuts;
  searchModule = search;
}

/**
 * Create the Shadow DOM host and palette structure if it does not yet exist.
 */
async function ensurePalette() {
  if (paletteRoot && paletteShadow) return;
  await ensureModules();

  const host = document.createElement("div");
  host.id = "dochopper-root";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  paletteShadow = shadow;

  const style = document.createElement("style");
  const cssUrl = chrome.runtime.getURL("content/palette.css");
  style.textContent = await (await fetch(cssUrl)).text();
  shadow.appendChild(style);

  const overlay = document.createElement("div");
  overlay.className = "dochopper-overlay";
  overlay.style.display = "none";

  const palette = document.createElement("div");
  palette.className = "dochopper-palette";

  const searchRow = document.createElement("div");
  searchRow.className = "dochopper-search";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Search documentation sites…";
  searchRow.appendChild(input);

  const list = document.createElement("div");
  list.className = "dochopper-list";

  palette.appendChild(searchRow);
  palette.appendChild(list);
  overlay.appendChild(palette);
  shadow.appendChild(overlay);

  paletteRoot = overlay;
  searchInputEl = input;
  listContainerEl = list;

  input.addEventListener("input", () => {
    void refreshPaletteResults();
  });
}

/**
 * Open the command palette and focus the search input.
 */
async function openPalette() {
  await ensurePalette();
  if (!paletteRoot || !searchInputEl) return;
  paletteRoot.style.display = "flex";
  paletteOpen = true;
  currentIndex = -1;
  searchInputEl.value = "";
  await refreshPaletteResults();
  setTimeout(() => {
    searchInputEl && searchInputEl.focus();
  }, 0);
}

/**
 * Close the command palette.
 */
function closePalette() {
  if (!paletteRoot) return;
  paletteRoot.style.display = "none";
  paletteOpen = false;
}

/**
 * Fetch sites from the background and render list based on search query.
 */
async function refreshPaletteResults() {
  if (!searchModule || !storageModule || !listContainerEl) return;
  const query = searchInputEl ? searchInputEl.value : "";

  const response = await chrome.runtime.sendMessage({
    type: "dochopper:getSitesAndSettings",
  });
  const sites = /** @type {import("../utils/storage.js").DocSite[]} */ (
    response.sites || []
  );

  const { fuzzySearchSites } = searchModule;
  const results = fuzzySearchSites(query, sites);

  listContainerEl.innerHTML = "";
  currentItems = [];
  currentIndex = results.length > 0 ? 0 : -1;

  if (results.length === 0) return;

  const section = document.createElement("div");
  section.className = "dochopper-section";

  const title = document.createElement("div");
  title.className = "dochopper-section-title";
  title.textContent = "Sites";
  section.appendChild(title);

  for (let i = 0; i < results.length; i += 1) {
    const { site, highlightedName, highlightedUrl } = results[i];
    const item = document.createElement("div");
    item.className = "dochopper-item";
    item.dataset.siteId = site.id;
    item.dataset.index = String(i);

    const icon = document.createElement("div");
    icon.className = "dochopper-icon";
    icon.textContent = site.icon || "📖";

    const text = document.createElement("div");
    text.className = "dochopper-text";

    const name = document.createElement("div");
    name.className = "dochopper-name";
    name.innerHTML = highlightedName || escapeHtml(site.name);

    const url = document.createElement("div");
    url.className = "dochopper-url";
    url.innerHTML = highlightedUrl || escapeHtml(site.url);

    text.appendChild(name);
    text.appendChild(url);

    const meta = document.createElement("div");
    meta.className = "dochopper-meta";
    const shortcut = document.createElement("div");
    shortcut.className = "dochopper-shortcut";
    shortcut.textContent = site.shortcut.toUpperCase();
    meta.appendChild(shortcut);

    item.appendChild(icon);
    item.appendChild(text);
    item.appendChild(meta);

    item.addEventListener("click", () => {
      void performJump(site.id);
    });

    if (i === currentIndex) {
      item.dataset.active = "true";
    }
    currentItems.push({ siteId: site.id, element: item });
    section.appendChild(item);
  }

  listContainerEl.appendChild(section);
}

/**
 * Move keyboard selection in the palette list.
 * @param {1 | -1} delta
 */
function moveSelection(delta) {
  if (currentItems.length === 0) return;
  currentIndex =
    (currentIndex + delta + currentItems.length) % currentItems.length;
  for (let i = 0; i < currentItems.length; i += 1) {
    currentItems[i].element.dataset.active =
      i === currentIndex ? "true" : "false";
  }
  const activeItem = currentItems[currentIndex]?.element;
  if (activeItem && listContainerEl) {
    const rect = activeItem.getBoundingClientRect();
    const containerRect = listContainerEl.getBoundingClientRect();
    if (rect.top < containerRect.top) {
      listContainerEl.scrollTop += rect.top - containerRect.top;
    } else if (rect.bottom > containerRect.bottom) {
      listContainerEl.scrollTop += rect.bottom - containerRect.bottom;
    }
  }
}

/**
 * Execute the currently selected site or a specific site by ID.
 * @param {string=} explicitSiteId
 */
async function performJump(explicitSiteId) {
  const siteId = explicitSiteId || currentItems[currentIndex]?.siteId;
  if (!siteId) return;

  const snapshot = {
    url: window.location.href,
    title: document.title || window.location.href,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    selectedText: window.getSelection()?.toString() || "",
    timestamp: Date.now(),
    tabId: -1, // background will replace with real tabId based on sender.tab.id
  };

  await chrome.runtime.sendMessage({
    type: "dochopper:jumpFromContent",
    siteId,
    selectedText: snapshot.selectedText,
    snapshot,
  });

  closePalette();
}

/**
 * Create and show the "Back to Context" badge.
 * @param {string} previousTitle
 */
async function showReturnBadge(previousTitle) {
  await ensureModules();
  if (badgeRoot && badgeShadow) {
    badgeRoot.remove();
    badgeRoot = null;
  }

  const host = document.createElement("div");
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  badgeShadow = shadow;

  const style = document.createElement("style");
  const cssUrl = chrome.runtime.getURL("content/badge.css");
  style.textContent = await (await fetch(cssUrl)).text();
  shadow.appendChild(style);

  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = "dochopper-badge";

  const label = document.createElement("span");
  label.className = "dochopper-badge-label";
  const truncated =
    previousTitle.length > 20
      ? `${previousTitle.slice(0, 20)}…`
      : previousTitle;
  label.textContent = `← Back to ${truncated}`;

  const keyHint = document.createElement("span");
  keyHint.className = "dochopper-badge-key";
  keyHint.textContent = "Ctrl+Shift+B";

  const progress = document.createElement("div");
  progress.className = "dochopper-badge-progress";
  progress.style.transition = `transform ${badgeDurationMs}ms linear`;
  progress.style.transform = "scaleX(1)";

  badge.appendChild(label);
  badge.appendChild(keyHint);
  badge.appendChild(progress);
  shadow.appendChild(badge);

  let dismissed = false;
  let remaining = badgeDurationMs;
  let startTime = Date.now();
  const runProgress = () => {
    startTime = Date.now();
    progress.style.transform = "scaleX(0)";
    badgeTimer = window.setTimeout(() => {
      if (!dismissed) dismissBadge();
    }, remaining);
  };

  const dismissBadge = () => {
    dismissed = true;
    if (badgeTimer != null) {
      clearTimeout(badgeTimer);
      badgeTimer = null;
    }
    host.remove();
    badgeRoot = null;
    badgeShadow = null;
  };

  badge.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "dochopper:returnContext" });
    dismissBadge();
  });

  badge.addEventListener("mouseenter", () => {
    if (badgeTimer != null) {
      clearTimeout(badgeTimer);
      badgeTimer = null;
    }
    const elapsed = Date.now() - startTime;
    remaining = Math.max(0, remaining - elapsed);
  });

  badge.addEventListener("mouseleave", () => {
    if (!dismissed && remaining > 0) {
      progress.style.transition = `transform ${remaining}ms linear`;
      runProgress();
    }
  });

  badgeRoot = host;
  runProgress();
}

/**
 * Restore a saved context snapshot in the current page.
 * @param {import("../utils/storage.js").ContextSnapshot} snapshot
 */
function restoreContext(snapshot) {
  window.scrollTo(snapshot.scrollX || 0, snapshot.scrollY || 0);
}

/**
 * Apply per-site search forwarding, including DOM interactions for Tailwind CSS.
 * @param {string} siteId
 * @param {string} query
 */
function applySearchForwarding(siteId, query) {
  if (!query.trim()) return;
  if (siteId === "tailwind") {
    try {
      // Tailwind docs use a search button and an input in a dialog; we try common selectors.
      const openButton =
        document.querySelector("[data-docsearch-trigger]") ||
        document.querySelector('button[aria-label="Search"]');
      if (openButton instanceof HTMLElement) {
        openButton.click();
      }
      setTimeout(() => {
        const input =
          document.querySelector('input[placeholder*="Search docs" i]') ||
          document.querySelector('input[type="search"]');
        if (input instanceof HTMLInputElement) {
          input.focus();
          input.value = query;
          const ev = new Event("input", { bubbles: true });
          input.dispatchEvent(ev);
        }
      }, 300);
    } catch {
      // Best-effort only.
    }
  }
}

/**
 * Escape HTML entities.
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Global keydown handler for in-palette navigation only.
// Ctrl/Cmd+Shift+D and Ctrl/Cmd+Shift+B are handled exclusively
// by the Chrome commands API (manifest.json) via the background service worker
// to avoid double-triggering.
window.addEventListener(
  "keydown",
  (event) => {
    if (!paletteOpen) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void performJump();
      return;
    }
  },
  true,
);

// Message listener for events coming from the background/popup.
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  const { type } = message || {};
  if (type === "dochopper:togglePalette") {
    if (paletteOpen) closePalette();
    else void openPalette();
  } else if (type === "dochopper:showReturnBadge") {
    void showReturnBadge(message.previousTitle || "previous page");
  } else if (type === "dochopper:restoreContext") {
    restoreContext(message.snapshot);
  } else if (type === "dochopper:applySearchForwarding") {
    applySearchForwarding(message.siteId, message.query || "");
  } else if (type === "dochopper:initiateJump") {
    void performJump(message.siteId);
  }
});
