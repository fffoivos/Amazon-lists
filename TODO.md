# Amazon List Sidebar – TODO (Prioritized)

## Recently Completed

- [x] Robust dropdown open and scoped list extraction via `openListDropdownAndWait()` and `extractListsFromDropdown()`; no fixed delays.
- [x] Reliable add-to-list flow with 10 attempts, 200ms backoff, and DOM/ARIA confirmation; confirmation wait reduced to 1500ms.
- [x] Settings toggle: “Search results persist after click” (default ON) in `sidebar/panel.html` with live setting in `panel.js` and respected in `content.js`.
- [x] Content honors persistence: clears filter immediately when OFF; restores when ON; preserves across retries.
- [x] UI: centered settings gear icon in `sidebar/panel.css`.
- [x] Caching: lists cached in background memory and in `storage.sync`/`storage.local`; sidebar loads immediately from cache when present.
- [x] Logging: clearer logs in background and content for easier field troubleshooting.
- [x] API cleanup: no `tabs.executeScript` in MV3; sidebar communicates with content via messages.
- [x] Decision: drop in‑page button injection; user opens the sidebar via Firefox sidebar UI or toolbar icon.

## P0 – Critical (Fix first)

- [ ] MV3 background fix: switch `manifest.json` `background.scripts` to `background.service_worker` (Chrome MV3) or verify Firefox MV3 support; ensure background loads reliably.
- [x] Robust dropdown open in `openListDropdownAndWait()` (event-driven; waits for visible popover).
- [x] Reliable add-to-list with retries and DOM/ARIA confirmation (1500ms confirmation wait).
- [x] Replace MV3-incompatible `tabs.executeScript` in `sidebar/panel.js` with messaging to content.
- [x] Decision: do not inject an in-page "Open List Sidebar" button (rely on sidebar/toolbar UX).

## P1 – High

- [ ] Reduce CPU: replace 100ms polling with `history.pushState`/`replaceState` hooks + `popstate` and existing link-capture.
- [ ] Extend `host_permissions` and content matches to more Amazon regions: `.com.au`, `.in`, `.com.mx`, `.com.br`, `.nl`, `.se`, `.pl`, `.sg`, `.ae`, `.sa`, `.com.tr`.

## P2 – Medium

- [ ] Cache/sync cleanup: centralize list cache with TTL, dedupe sync/local writes, and track per-domain (partial: background + sync/local implemented).
- [ ] Add concise debug logging with a toggle to aid field troubleshooting.
- [ ] Cross-domain QA of selectors and flows across locales.
- [ ] Add explicit extension CSP (MV3 default is strict; still set `script-src 'self'; object-src 'none'`).

## P3 – Nice to have / Long-term

- [ ] Headless add-to-list prototype: in-page script replicating Amazon network call with tokens; fall back to UI interaction.
- [ ] Smart list ranking based on usage patterns; category/group organization.

## Decisions

- __No in-page button__: We won’t inject a page button; rely on Firefox sidebar UI and the toolbar icon (background opens sidebar on toolbar click).
- __Toolbar icon__: Keep as manual fallback for opening the sidebar (useful when programmatic open is restricted).

## Security review — Could this extension make the browser more vulnerable?

- __Permissions (current)__
  - `host_permissions`: limited to specific `amazon.*` TLDs (no `<all_urls>`).
  - `permissions`: `activeTab`, `storage` only. No `webRequest`, no remote code, no eval.
- __Behavior overview__
  - Content script runs only on Amazon product pages. It reads DOM, dispatches user-like click events scoped to Amazon’s list popover, and passes non-sensitive data (list names/ids, product info) to the sidebar via `runtime` messaging.
- __Potential risks__
  - __Unintended clicks within popover__: Fallback matching by list name could click a wrong element if Amazon drastically changes markup. Scope is limited to the visible popover and uses IDs when available; residual risk is low and confined to Amazon pages.
  - __Page sessionStorage usage__: Stores a benign filter string (`als_list_filter`) on the Amazon origin. Not sensitive, but we can move to extension storage to avoid touching page storage at all.
  - __Broadcast messages within extension__: Background forwards updates via `runtime.sendMessage`; only our extension contexts receive them. Data is non-sensitive.
  - __Performance (not a vuln)__: 100ms polling could increase CPU usage; not a security issue but worth removing.
- __Mitigations in place__
  - Strict host scoping; no network interception; no remote code; minimal permissions.
  - DOM queries and clicks are confined to the visible Amazon popover; prefer exact element IDs where available.
  - All UI strings rendered with `textContent`, not `innerHTML`.

### Security hardening tasks

- [ ] Manifest CSP: explicitly set strict CSP for the extension context.
- [ ] Tighten message intake in `background.js`: for `UPDATE_LISTS`/`UPDATE_PRODUCT`, verify `sender.tab.url` is an Amazon domain before accepting.
- [ ] Replace page `sessionStorage` with extension `storage.session`/`storage.local` (scoped by tab or ASIN) for the dropdown filter.
- [ ] Remove 100ms polling in `content.js`; rely fully on event-driven updates (click interception, history API, visibility/focus events).
- [ ] Add a safety check to entirely skip fallback text-match clicks if expected `#atwl-link-to-list-<id>` is missing and structure is unverified.
