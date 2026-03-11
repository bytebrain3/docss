/**
 * DocHopper storage utilities.
 * Uses chrome.storage.sync for persistent data and chrome.storage.session for per-session context stacks.
 * All functions are Promise-based and include lightweight debouncing for write operations.
 */

/* eslint-disable no-undef */

/**
 * @typedef {"reuse" | "tab" | "smart"} DocTabMode
 */

/**
 * @typedef {Object} DocLastVisited
 * @property {string} url
 * @property {string} title
 * @property {number} timestamp
 */

/**
 * @typedef {Object} DocSite
 * @property {string} id
 * @property {string} name
 * @property {string} url
 * @property {string} searchUrl
 * @property {string} icon
 * @property {string} shortcut
 * @property {boolean} pinned
 * @property {DocLastVisited=} lastVisited
 * @property {"queryParam" | "pathSearch" | "dom"} searchMode
 */

/**
 * @typedef {Object} DocSettings
 * @property {DocTabMode} tabMode
 * @property {boolean} showBadge
 * @property {string} paletteShortcut
 * @property {string} returnShortcut
 * @property {"dark" | "light" | "system"} theme
 * @property {string} plan
 */

/**
 * @typedef {Object} ContextSnapshot
 * @property {string} url
 * @property {string} title
 * @property {number} scrollX
 * @property {number} scrollY
 * @property {string} selectedText
 * @property {number} timestamp
 * @property {number} tabId
 */

/**
 * @typedef {Object} ContextStackData
 * @property {ContextSnapshot[]} dochopper_context_stack
 */

export const DEFAULT_SITES = /** @type {DocSite[]} */ ([
  {
    id: "mdn",
    name: "MDN Web Docs",
    url: "https://developer.mozilla.org",
    searchUrl: "https://developer.mozilla.org/search?q=",
    icon: "🌐",
    shortcut: "alt+1",
    pinned: true,
    searchMode: "queryParam"
  },
  {
    id: "npm",
    name: "npm Registry",
    url: "https://www.npmjs.com",
    searchUrl: "https://www.npmjs.com/search",
    icon: "📦",
    shortcut: "alt+2",
    pinned: true,
    searchMode: "pathSearch"
  },
  {
    id: "github",
    name: "GitHub",
    url: "https://github.com",
    searchUrl: "https://github.com/search",
    icon: "🐙",
    shortcut: "alt+3",
    pinned: true,
    searchMode: "pathSearch"
  },
  {
    id: "tailwind",
    name: "Tailwind CSS",
    url: "https://tailwindcss.com",
    searchUrl: "https://tailwindcss.com/docs",
    icon: "💨",
    shortcut: "alt+4",
    pinned: true,
    searchMode: "dom"
  },
  {
    id: "node",
    name: "Node.js Docs",
    url: "https://nodejs.org/docs",
    searchUrl: "https://nodejs.org/docs/latest/api/search.html?q=",
    icon: "🟢",
    shortcut: "alt+5",
    pinned: false,
    searchMode: "queryParam"
  }
]);

export const DEFAULT_SETTINGS = /** @type {DocSettings} */ ({
  tabMode: "reuse",
  showBadge: true,
  paletteShortcut: "ctrl+shift+d",
  returnShortcut: "ctrl+shift+b",
  theme: "dark",
  // Entire app is unlocked; treat as Pro by default.
  plan: "pro"
});

const SYNC_SITES_KEY = "dochopper_sites";
const SYNC_SETTINGS_KEY = "dochopper_settings";

/** @type {Map<string, {timer: number | null, lastValue: any}>} */
const syncWriteState = new Map();

/** @type {Map<string, {timer: number | null, lastValue: any}>} */
const sessionWriteState = new Map();

const DEBOUNCE_MS = 300;

/**
 * Wrap chrome.storage area get in a Promise.
 * @template T
 * @param {"sync" | "session"} area
 * @param {string | string[] | Object} keys
 * @returns {Promise<T>}
 */
function storageGet(area, keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage[area].get(keys, /** @param {any} result */ (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(/** @type {T} */ (result));
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Debounced chrome.storage area set.
 * @param {"sync" | "session"} area
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
function storageSetDebounced(area, key, value) {
  const map = area === "sync" ? syncWriteState : sessionWriteState;
  const existing = map.get(key);
  if (existing && existing.timer != null) {
    clearTimeout(existing.timer);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.storage[area].set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
      map.set(key, { timer: null, lastValue: value });
    }, DEBOUNCE_MS);
    map.set(key, { timer: /** @type {number} */ (timer), lastValue: value });
  });
}

/**
 * Get all configured doc sites, falling back to defaults if none stored.
 * @returns {Promise<DocSite[]>}
 */
export async function getSites() {
  const data = await storageGet(/** @type {"sync"} */ ("sync"), SYNC_SITES_KEY);
  /** @type {DocSite[] | undefined} */
  const sites = data[SYNC_SITES_KEY];
  if (!sites || !Array.isArray(sites) || sites.length === 0) {
    await storageSetDebounced("sync", SYNC_SITES_KEY, DEFAULT_SITES);
    return DEFAULT_SITES;
  }
  return sites;
}

/**
 * Persist all doc sites.
 * @param {DocSite[]} sites
 * @returns {Promise<void>}
 */
export function setSites(sites) {
  return storageSetDebounced("sync", SYNC_SITES_KEY, sites);
}

/**
 * Get global DocHopper settings.
 * @returns {Promise<DocSettings>}
 */
export async function getSettings() {
  const data = await storageGet(/** @type {"sync"} */ ("sync"), SYNC_SETTINGS_KEY);
  /** @type {Partial<DocSettings> | undefined} */
  const stored = data[SYNC_SETTINGS_KEY];
  const merged = { ...DEFAULT_SETTINGS, ...(stored || {}) };
  return merged;
}

/**
 * Persist global DocHopper settings.
 * @param {Partial<DocSettings>} partial
 * @returns {Promise<DocSettings>}
 */
export async function updateSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await storageSetDebounced("sync", SYNC_SETTINGS_KEY, next);
  return next;
}

/**
 * Return whether the current plan is any pro plan.
 * @param {DocSettings} settings
 * @returns {boolean}
 */
export function isPro(settings) {
  return true;
}

/**
 * Get the full context stack from session storage.
 * @returns {Promise<ContextSnapshot[]>}
 */
export async function getContextStack() {
  const data = await storageGet(/** @type {"session"} */ ("session"), "dochopper_context_stack");
  /** @type {ContextSnapshot[] | undefined} */
  const stack = data["dochopper_context_stack"];
  if (!stack || !Array.isArray(stack)) {
    return [];
  }
  return stack;
}

/**
 * Save the full context stack, trimming to a maximum number of entries.
 * @param {ContextSnapshot[]} stack
 * @param {number} [maxSize]
 * @returns {Promise<void>}
 */
export async function setContextStack(stack, maxSize) {
  const settings = await getSettings();
  const limit = maxSize || (isPro(settings) ? 50 : 10);
  const trimmed = stack.slice(-limit);
  return storageSetDebounced("session", "dochopper_context_stack", trimmed);
}

/**
 * Push a snapshot onto the global context stack for a tab.
 * @param {ContextSnapshot} snapshot
 * @returns {Promise<void>}
 */
export async function pushContextSnapshot(snapshot) {
  const stack = await getContextStack();
  stack.push(snapshot);
  await setContextStack(stack);
}

/**
 * Pop the most recent snapshot for a given tab, without removing other tabs' history.
 * @param {number} tabId
 * @returns {Promise<ContextSnapshot | null>}
 */
export async function popContextSnapshotForTab(tabId) {
  const stack = await getContextStack();
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].tabId === tabId) {
      const [removed] = stack.splice(i, 1);
      await setContextStack(stack);
      return removed;
    }
  }
  return null;
}

/**
 * Peek the most recent snapshot for a given tab without removing it.
 * @param {number} tabId
 * @returns {Promise<ContextSnapshot | null>}
 */
export async function peekContextSnapshotForTab(tabId) {
  const stack = await getContextStack();
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].tabId === tabId) {
      return stack[i];
    }
  }
  return null;
}

