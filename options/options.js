// DocHopper options page script.

/* global chrome */

document.addEventListener("DOMContentLoaded", async () => {
  const tabModeEl = /** @type {HTMLSelectElement | null} */ (document.getElementById("tab-mode"));
  const themeEl = /** @type {HTMLSelectElement | null} */ (document.getElementById("theme"));
  const showBadgeEl = /** @type {HTMLInputElement | null} */ (document.getElementById("show-badge"));
  const planStatusEl = /** @type {HTMLDivElement | null} */ (document.getElementById("plan-status"));

  if (!tabModeEl || !themeEl || !showBadgeEl || !planStatusEl) return;

  const bg = chrome.runtime;

  const { settings } = await new Promise((resolve) => {
    bg.sendMessage({ type: "dochopper:getSitesAndSettings" }, (resp) => resolve(resp));
  });

  tabModeEl.value = settings.tabMode;
  themeEl.value = settings.theme;
  showBadgeEl.checked = settings.showBadge;

  const isFree = settings.plan === "free";
  if (isFree) {
    planStatusEl.textContent =
      "You are on the Free plan. Pro unlocks Tab mode, Smart mode, and deeper context history.";
  } else {
    planStatusEl.textContent = "You are on DocHopper Pro. Thank you for supporting development.";
  }

  if (isFree && settings.tabMode !== "reuse") {
    tabModeEl.value = "reuse";
  }

  tabModeEl.addEventListener("change", () => {
    const next = tabModeEl.value;
    chrome.runtime.sendMessage({ type: "dochopper:updateSettings", settings: { tabMode: next } });
    if (next !== "reuse" && isFree) {
      tabModeEl.value = "reuse";
      alert("Tab and Smart modes are Pro features. Upgrade in the popup to unlock them.");
    }
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

