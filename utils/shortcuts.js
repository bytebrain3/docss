/**
 * Keyboard shortcut helpers.
 * Normalizes human-readable shortcut strings like "ctrl+shift+d" and matches them against KeyboardEvent objects.
 */

/**
 * @typedef {Object} NormalizedShortcut
 * @property {boolean} ctrl
 * @property {boolean} meta
 * @property {boolean} alt
 * @property {boolean} shift
 * @property {string} key
 */

/**
 * Normalize a shortcut string like "ctrl+shift+d" or "alt+1" into a canonical representation.
 * @param {string} shortcut
 * @returns {NormalizedShortcut}
 */
export function normalizeShortcut(shortcut) {
  const parts = shortcut.toLowerCase().split("+").map((p) => p.trim()).filter(Boolean);
  /** @type {NormalizedShortcut} */
  const normalized = { ctrl: false, meta: false, alt: false, shift: false, key: "" };

  for (const part of parts) {
    if (part === "ctrl" || part === "control") normalized.ctrl = true;
    else if (part === "cmd" || part === "command" || part === "meta") normalized.meta = true;
    else if (part === "alt" || part === "option") normalized.alt = true;
    else if (part === "shift") normalized.shift = true;
    else normalized.key = part;
  }

  return normalized;
}

/**
 * Check whether a KeyboardEvent matches a normalized shortcut.
 * @param {KeyboardEvent} event
 * @param {NormalizedShortcut} shortcut
 * @returns {boolean}
 */
export function eventMatchesNormalizedShortcut(event, shortcut) {
  const key = event.key.toLowerCase();
  if (shortcut.key && shortcut.key !== key) return false;
  if (shortcut.ctrl !== (event.ctrlKey || false)) return false;
  if (shortcut.meta !== (event.metaKey || false)) return false;
  if (shortcut.alt !== (event.altKey || false)) return false;
  if (shortcut.shift !== (event.shiftKey || false)) return false;
  return true;
}

/**
 * Check whether a KeyboardEvent matches a human-readable shortcut like "ctrl+shift+d".
 * @param {KeyboardEvent} event
 * @param {string} shortcut
 * @returns {boolean}
 */
export function eventMatchesShortcut(event, shortcut) {
  const normalized = normalizeShortcut(shortcut);
  return eventMatchesNormalizedShortcut(event, normalized);
}

