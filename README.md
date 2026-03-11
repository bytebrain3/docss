## DocHopper — Warp-Speed Doc Switching for Developers

DocHopper is a Chrome extension that lets you **jump between documentation sites at warp speed without losing your place**.  
You can be reading Tailwind docs, hop to MDN or npm to check an API, then snap back to the exact scroll position, selection, and tab you came from.

---

### Key Features

- **Command palette everywhere**  
  Press **Cmd/Ctrl + Shift + D** on any page to open a floating command palette:
  - Fuzzy-search across all your doc sites.
  - Keyboard navigation with arrows + Enter.
  - Recent pages and last-visited URLs right in the list.

- **Context-preserving jumps**  
  Before navigating, DocHopper captures:
  - Current URL and page title
  - Scroll position
  - Selected text
  - Timestamp and tab id  
  Use **Cmd/Ctrl + Shift + B** or the **“Back to context”** badge to return to exactly where you were.

- **Smart search forwarding**  
  When you have text selected, DocHopper automatically forwards that query to doc search:
  - **MDN**: `?q=your+query`
  - **npm**: `/search?q=your+query`
  - **GitHub**: `/search?q=your+query`
  - **Tailwind CSS**: opens the search dialog and types the query into their search box.

- **Doc site registry with unlimited sites**  
  Out of the box DocHopper includes:
  - MDN Web Docs
  - npm Registry
  - GitHub
  - Tailwind CSS
  - Node.js Docs  
  You can also **add any custom site** (name, URL, emoji icon, shortcut) from the popup.

- **Flexible tab behavior**  
  Choose how DocHopper opens docs:
  - **Reuse**: open docs in the current tab (default).
  - **Tab**: always open docs in a new tab.
  - **Smart**: reuse an existing doc tab when possible, otherwise open a new one.

---

### Installation (Developer Mode)

1. Run `pnpm`/`npm`/`yarn` install if you add tooling (not required for the core extension).
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `dochopper/` folder (this repo root).
5. You should now see **DocHopper** in your extensions bar.

---

### Keyboard Shortcuts

- **Open command palette**: `Cmd/Ctrl + Shift + D`
- **Back to previous context**: `Cmd/Ctrl + Shift + B`
- **Per-site shortcuts** (default):
  - Alt + 1 – MDN Web Docs
  - Alt + 2 – npm Registry
  - Alt + 3 – GitHub
  - Alt + 4 – Tailwind CSS
  - Alt + 5 – Node.js Docs

All shortcuts can be customized from Chrome’s **Extensions → Keyboard shortcuts** page.

---

### Project Structure

- `manifest.json` – Chrome Manifest V3 configuration
- `background/service-worker.js` – command handling, tab management, context storage
- `content/content.js` – palette + badge injection, context capture, search forwarding
- `content/palette.css` – command palette styling (Shadow DOM)
- `content/badge.css` – “Back to context” badge styling (Shadow DOM)
- `popup/` – popup UI (HTML/CSS/JS) and custom site management
- `options/` – settings page (tab behavior, theme, badge toggle)
- `utils/storage.js` – storage helpers, default sites, context stack logic
- `utils/shortcuts.js` – keyboard shortcut parsing/matching
- `utils/search.js` – fuzzy search across sites and URLs

---

### Icons & Visual Style

- Dark theme with **high-contrast typography** tuned for dev tools.
- Emojis or favicons as **site icons** in the palette and popup.
- Smooth open/close animations for the command palette and return badge.

If you want to brand DocHopper further, drop your own icon set into `icons/` and wire it up in `manifest.json`.

---

### Roadmap Ideas

- Better “Recent” section with per-site history.
- Import/export of site configuration.
- Optional analytics on most-used sites (local only, privacy-first).

If you have ideas to make DocHopper even smoother in your workflow, open an issue or tweak the config and hotkeys to match your style.
