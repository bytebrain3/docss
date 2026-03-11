// DocHopper popup script

import { fuzzySearchSites } from "../utils/search.js";

/** @typedef {import("../utils/storage.js").DocSite} DocSite */

const searchInput = /** @type {HTMLInputElement | null} */ (document.getElementById("search-input"));
const sitesContainer = /** @type {HTMLDivElement | null} */ (document.getElementById("sites-container"));
const addSiteBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("add-site-btn"));
const settingsBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("settings-btn"));

/** @type {DocSite[]} */
let allSites = [];

/**
 * Fetch sites + settings from background.
 * @returns {Promise<{sites: DocSite[], settings: any}>}
 */
function loadState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "dochopper:getSitesAndSettings" }, (resp) => {
      resolve(resp);
    });
  });
}

/**
 * Render sites into the grid with optional search query.
 * @param {string} query
 */
function renderSites(query) {
  if (!sitesContainer) return;
  sitesContainer.innerHTML = "";

  const results = fuzzySearchSites(query, allSites);
  if (results.length === 0) {
    const empty = document.createElement("div");
    empty.className = "dh-empty";
    empty.textContent = query ? "No sites match your search." : "No documentation sites configured yet.";
    sitesContainer.appendChild(empty);
    return;
  }

  for (const { site } of results) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "dh-card";
    card.dataset.siteId = site.id;

    const header = document.createElement("div");
    header.className = "dh-card-header";

    const icon = document.createElement("div");
    icon.className = "dh-card-icon";
    icon.textContent = site.icon || "📖";

    const name = document.createElement("div");
    name.className = "dh-card-name";
    name.textContent = site.name;

    header.appendChild(icon);
    header.appendChild(name);

    const url = document.createElement("div");
    url.className = "dh-card-url";
    url.textContent = site.url;

    const meta = document.createElement("div");
    meta.className = "dh-card-meta";

    const last = document.createElement("span");
    last.textContent = site.lastVisited ? timeAgo(site.lastVisited.timestamp) : "Never visited";

    const shortcut = document.createElement("span");
    shortcut.className = "dh-shortcut-pill";
    shortcut.textContent = site.shortcut.toUpperCase();

    meta.appendChild(last);
    meta.appendChild(shortcut);

    card.appendChild(header);
    card.appendChild(url);
    card.appendChild(meta);

    card.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "dochopper:jumpFromPopup", siteId: site.id });
      window.close();
    });

    // Placeholder right-click menu hook (pin/remove/edit) – to be implemented later.
    card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      // Future: open a small context menu.
    });

    sitesContainer.appendChild(card);
  }
}

/**
 * Convert a timestamp into a "time ago" label.
 * @param {number} ts
 * @returns {string}
 */
function timeAgo(ts) {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr${hr > 1 ? "s" : ""} ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const { sites } = await loadState();
  allSites = sites;
  renderSites("");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderSites(searchInput.value || "");
    });
    searchInput.focus();
  }

  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });
  }

  if (addSiteBtn) {
    addSiteBtn.addEventListener("click", async () => {
      const name = prompt("Site name (e.g. React Docs):");
      if (!name) return;
      const url = prompt("Base URL (e.g. https://react.dev):");
      if (!url) return;
      const icon = prompt("Icon emoji (optional):", "📚") || "📚";
      const shortcut = prompt("Keyboard shortcut label (e.g. ALT+6):", "ALT+6") || "ALT+6";

      const trimmedUrl = url.trim();
      try {
        // Validate URL.
        // eslint-disable-next-line no-new
        new URL(trimmedUrl);
      } catch {
        alert("Please enter a valid URL including protocol, e.g. https://example.com");
        return;
      }

      const idBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "custom";
      let uniqueId = idBase;
      let suffix = 2;
      const ids = new Set(allSites.map((s) => s.id));
      while (ids.has(uniqueId)) {
        uniqueId = `${idBase}-${suffix}`;
        suffix += 1;
      }

      /** @type {DocSite} */
      const site = {
        id: uniqueId,
        name: name.trim(),
        url: trimmedUrl,
        searchUrl: `${trimmedUrl.replace(/\/+$/, "")}/search?q=`,
        icon,
        shortcut: shortcut.toLowerCase(),
        pinned: false,
        searchMode: "queryParam"
      };

      const nextSites = [...allSites, site];
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "dochopper:updateSites", sites: nextSites }, () => resolve(null));
      });
      allSites = nextSites;
      renderSites(searchInput?.value || "");
    });
  }
});

