# Amazon List Sidebar – TODO (Prioritized)

## P0 – Critical (Fix first)

- [ ] MV3 background fix: switch `manifest.json` `background.scripts` to `background.service_worker` so background loads and `OPEN_SIDEBAR` works.
- [ ] Reliable sidebar button: observe buy-box containers (`#rightCol`, `#desktop_buybox`, `#buybox`, `#addToCart_feature_div`) and inject/reinject the "Open List Sidebar" button.
- [ ] Robust dropdown open: reuse `findAddToListButton()`, dispatch mouse event sequence, and wait for `.a-popover[aria-hidden="false"]` (no fixed delays).
- [ ] Reliable add-to-list: find the exact list entry within the visible popover, dispatch events, and only report success after detecting confirmation in DOM or timeout.
- [ ] Replace MV3-incompatible `tabs.executeScript` in `sidebar/panel.js` with a message to the content script for list-count debugging.

## P1 – High

- [ ] Reduce CPU: replace 100ms polling with `history.pushState`/`replaceState` hooks + `popstate` and existing link-capture.
- [ ] Extend `host_permissions` and content matches to more Amazon regions: `.com.au`, `.in`, `.com.mx`, `.com.br`, `.nl`, `.se`, `.pl`, `.sg`, `.ae`, `.sa`, `.com.tr`.

## P2 – Medium

- [ ] Cache/sync cleanup: centralize list cache in background with TTL, dedupe sync/local writes, and track per-domain.
- [ ] Add concise debug logging with a toggle to aid field troubleshooting.
- [ ] Cross-domain QA of selectors and flows across locales.

## P3 – Nice to have / Long-term

- [ ] Headless add-to-list prototype: in-page script replicating Amazon network call with tokens; fall back to UI interaction.
- [ ] Smart list ranking based on usage patterns; category/group organization.
