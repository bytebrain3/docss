// DocHopper background service worker (Manifest V3, module).
// Responsible for handling commands, tab management, and context storage.

import {
  getSites,
  setSites,
  getSettings,
  updateSettings,
  pushContextSnapshot,
  popContextSnapshotForTab,
  peekContextSnapshotForTab
} from "../utils/storage.js";

/**
 * @typedef {import("../utils/storage.js").DocSite} DocSite
 * @typedef {import("../utils/storage.js").ContextSnapshot} ContextSnapshot
 */

/** @type {Map<number, {query: string, siteId: string}>} */
const pendingSearchForTab = new Map();

/** @type {Map<number, ContextSnapshot>} */
const pendingRestoreForTab = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  // Ensure defaults exist.
  await getSites();
  await getSettings();
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab || !tab.id) return;
  if (command === "jump-palette") {
    chrome.tabs.sendMessage(tab.id, { type: "dochopper:togglePalette" });
  } else if (command === "return-context") {
    await handleReturnContext(tab.id);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const { type } = message || {};
    if (type === "dochopper:getSitesAndSettings") {
      const [sites, settings] = await Promise.all([getSites(), getSettings()]);
      sendResponse({ sites, settings });
      return;
    }

    if (type === "dochopper:updateSites") {
      /** @type {DocSite[]} */
      const sites = message.sites || [];
      await setSites(sites);
      sendResponse({ ok: true });
      return;
    }

    if (type === "dochopper:updateSettings") {
      const updated = await updateSettings(message.settings || {});
      sendResponse({ settings: updated });
      return;
    }

    if (type === "dochopper:jumpFromContent") {
      // Content script collected full context and a siteId, we handle navigation and badge.
      if (!sender.tab || !sender.tab.id) {
        sendResponse({ ok: false });
        return;
      }
      const tabId = sender.tab.id;
      const { snapshot, siteId, selectedText } = message;
      await handleJumpFromTab(tabId, snapshot, siteId, selectedText || "");
      sendResponse({ ok: true });
      return;
    }

    if (type === "dochopper:returnContext") {
      if (!sender.tab || !sender.tab.id) {
        sendResponse({ ok: false });
        return;
      }
      await handleReturnContext(sender.tab.id);
      sendResponse({ ok: true });
      return;
    }

    if (type === "dochopper:jumpFromPopup") {
      // Popup requests jump for the active tab; we notify that tab to initiate the jump.
      const siteId = message.siteId;
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.id) {
        sendResponse({ ok: false });
        return;
      }
      chrome.tabs.sendMessage(activeTab.id, { type: "dochopper:initiateJump", siteId });
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "unknown_message_type" });
  })();

  return true; // Indicates async response.
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    // Apply any pending search forwarding for this tab.
    const pending = pendingSearchForTab.get(tabId);
    if (pending) {
      chrome.tabs.sendMessage(tabId, {
        type: "dochopper:applySearchForwarding",
        siteId: pending.siteId,
        query: pending.query
      });
      pendingSearchForTab.delete(tabId);
    }

    // Restore context after a "back" navigation, if needed.
    const restore = pendingRestoreForTab.get(tabId);
    if (restore && tab.url && urlsRoughlyEqual(tab.url, restore.url)) {
      chrome.tabs.sendMessage(tabId, {
        type: "dochopper:restoreContext",
        snapshot: restore
      });
      pendingRestoreForTab.delete(tabId);
    }
  }
});

/**
 * Handle a jump initiated from a specific tab.
 * Saves context, navigates according to tab mode, and sets up return badge + search forwarding.
 * @param {number} tabId
 * @param {ContextSnapshot} snapshot
 * @param {string} siteId
 * @param {string} selectedText
 */
async function handleJumpFromTab(tabId, snapshot, siteId, selectedText) {
  const [sites, settings] = await Promise.all([getSites(), getSettings()]);
  const site = sites.find((s) => s.id === siteId);
  if (!site) return;

  await pushContextSnapshot(snapshot);

  const searchQuery = selectedText || "";
  const destinationUrl = buildDestinationUrl(site, searchQuery);

  let targetTabId = tabId;
  if (settings.tabMode === "tab" || settings.tabMode === "smart") {
    // For now, Smart behaves like Tab when plan is pro, otherwise reuse.
    if (settings.plan !== "free") {
      const created = await chrome.tabs.create({ url: destinationUrl, active: true });
      if (created.id != null) {
        targetTabId = created.id;
      }
    } else {
      await chrome.tabs.update(tabId, { url: destinationUrl });
    }
  } else {
    await chrome.tabs.update(tabId, { url: destinationUrl });
  }

  if (searchQuery && site.searchMode === "dom") {
    pendingSearchForTab.set(targetTabId, { query: searchQuery, siteId: site.id });
  }

  if (settings.showBadge) {
    chrome.tabs.sendMessage(targetTabId, {
      type: "dochopper:showReturnBadge",
      previousTitle: snapshot.title
    });
  }

  // Update last visited info for the site.
  const now = Date.now();
  site.lastVisited = {
    url: destinationUrl,
    title: snapshot.title || site.name,
    timestamp: now
  };
  await setSites(sites);
}

/**
 * Compute the doc site's destination URL based on query and search mode.
 * @param {DocSite} site
 * @param {string} query
 * @returns {string}
 */
function buildDestinationUrl(site, query) {
  if (!query.trim()) return site.url;
  const encoded = encodeURIComponent(query.trim());
  if (site.searchMode === "queryParam") {
    return `${site.searchUrl}${encoded}`;
  }
  if (site.searchMode === "pathSearch") {
    // Ensure there is exactly one slash between base and "search?q="
    const base = site.searchUrl.endsWith("/") ? site.searchUrl : `${site.searchUrl}/`;
    return `${base}?q=${encoded}`;
  }
  // "dom" mode navigates to base docs; actual search is done in the content script.
  return site.searchUrl || site.url;
}

/**
 * Handle a "return to context" request for the given tab.
 * Pops the most recent snapshot for that tab and navigates back.
 * @param {number} tabId
 */
async function handleReturnContext(tabId) {
  const snapshot = await popContextSnapshotForTab(tabId);
  if (!snapshot) return;
  pendingRestoreForTab.set(tabId, snapshot);
  await chrome.tabs.update(tabId, { url: snapshot.url });
}

/**
 * Rough URL equality helper which ignores trailing slashes.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function urlsRoughlyEqual(a, b) {
  const norm = (u) => u.replace(/\/+$/, "");
  return norm(a) === norm(b);
}

