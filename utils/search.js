/**
 * Lightweight fuzzy search utilities for DocHopper.
 * Scores results by name, URL, and last visited title with configurable weights.
 */

/**
 * @typedef {import("./storage.js").DocSite} DocSite
 */

/**
 * @typedef {Object} FuzzyMatch
 * @property {DocSite} site
 * @property {number} score
 * @property {string} highlightedName
 * @property {string} highlightedUrl
 * @property {string} highlightedLastVisited
 */

const NAME_WEIGHT = 3;
const URL_WEIGHT = 1;
const TITLE_WEIGHT = 2;

/**
 * Very small fuzzy match helper that returns a score and HTML-highlighted text.
 * Prioritises contiguous substring matches but allows scattered character matches.
 *
 * @param {string} query
 * @param {string} target
 * @returns {{ score: number, highlighted: string }}
 */
function fuzzyScoreAndHighlight(query, target) {
  const q = query.trim().toLowerCase();
  const t = target;
  const tl = t.toLowerCase();

  if (!q) {
    return { score: 0, highlighted: escapeHtml(t) };
  }

  const directIndex = tl.indexOf(q);
  if (directIndex !== -1) {
    const before = escapeHtml(t.slice(0, directIndex));
    const match = escapeHtml(t.slice(directIndex, directIndex + q.length));
    const after = escapeHtml(t.slice(directIndex + q.length));
    const score = 100 - directIndex * 2 - (t.length - q.length);
    return {
      score,
      highlighted: `${before}<span class="dochopper-highlight">${match}</span>${after}`
    };
  }

  // Fallback: scattered characters in order
  let score = 0;
  /** @type {string[]} */
  const parts = [];
  let lastIndex = 0;
  let currentPos = 0;

  for (let i = 0; i < q.length; i += 1) {
    const ch = q[i];
    const foundIndex = tl.indexOf(ch, currentPos);
    if (foundIndex === -1) {
      return { score: 0, highlighted: escapeHtml(t) };
    }
    if (foundIndex > lastIndex) {
      parts.push(escapeHtml(t.slice(lastIndex, foundIndex)));
    }
    parts.push(`<span class="dochopper-highlight">${escapeHtml(t[foundIndex])}</span>`);
    score += 10 - (foundIndex - (i > 0 ? currentPos : 0));
    lastIndex = foundIndex + 1;
    currentPos = foundIndex + 1;
  }
  if (lastIndex < t.length) {
    parts.push(escapeHtml(t.slice(lastIndex)));
  }
  return { score, highlighted: parts.join("") };
}

/**
 * Escape basic HTML characters.
 * @param {string} input
 * @returns {string}
 */
function escapeHtml(input) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Fuzzy search over all doc sites, returning sorted matches with highlight metadata.
 * @param {string} query
 * @param {DocSite[]} sites
 * @returns {FuzzyMatch[]}
 */
export function fuzzySearchSites(query, sites) {
  const trimmed = query.trim();
  if (!trimmed) {
    return sites.map((site) => ({
      site,
      score: 0,
      highlightedName: escapeHtml(site.name),
      highlightedUrl: escapeHtml(site.url),
      highlightedLastVisited: site.lastVisited ? escapeHtml(site.lastVisited.title) : ""
    }));
  }

  /** @type {FuzzyMatch[]} */
  const results = [];
  for (const site of sites) {
    const nameRes = fuzzyScoreAndHighlight(trimmed, site.name);
    const urlRes = fuzzyScoreAndHighlight(trimmed, site.url);
    const titleText = site.lastVisited?.title || "";
    const titleRes = titleText ? fuzzyScoreAndHighlight(trimmed, titleText) : { score: 0, highlighted: "" };

    const totalScore =
      nameRes.score * NAME_WEIGHT +
      urlRes.score * URL_WEIGHT +
      titleRes.score * TITLE_WEIGHT;

    if (totalScore <= 0) continue;

    results.push({
      site,
      score: totalScore,
      highlightedName: nameRes.highlighted,
      highlightedUrl: urlRes.highlighted,
      highlightedLastVisited: titleRes.highlighted
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

