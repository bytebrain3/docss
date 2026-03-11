// DocHopper options page script.

/* global chrome */

document.addEventListener("DOMContentLoaded", async () => {
  const tabModeEl = /** @type {HTMLSelectElement | null} */ (document.getElementById("tab-mode"));
  const themeEl = /** @type {HTMLSelectElement | null} */ (document.getElementById("theme"));
  const showBadgeEl = /** @type {HTMLInputElement | null} */ (document.getElementById("show-badge"));

  if (!tabModeEl || !themeEl || !showBadgeEl) return;

  const bg = chrome.runtime;

  const { settings } = await new Promise((resolve) => {
    bg.sendMessage({ type: "dochopper:getSitesAndSettings" }, (resp) => resolve(resp));
  });

  tabModeEl.value = settings.tabMode;
  themeEl.value = settings.theme;
  showBadgeEl.checked = settings.showBadge;

  tabModeEl.addEventListener("change", () => {
    const next = tabModeEl.value;
    chrome.runtime.sendMessage({ type: "dochopper:updateSettings", settings: { tabMode: next } });
  });

  themeEl.addEventListener("change", () => {
    chrome.runtime.sendMessage({ type: "dochopper:updateSettings", settings: { theme: themeEl.value } });
  });

  showBadgeEl.addEventListener("change", () => {
    chrome.runtime.sendMessage({
      type: "dochopper:updateSettings",
      settings: { showBadge: showBadgeEl.checked }
    });
  });
});

