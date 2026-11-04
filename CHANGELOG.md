# Changelog

## 0.2.0 — 2026-11-04

- Fix stretched capture-status and object-reference hints found in iOS WKWebView validation.
- iframe aggregation and history isolation are not included; native saving/sharing remains the integrator’s responsibility.

- Expose getCaptureStatus() with independent enabled/disabled/unavailable/failed states, UI coverage banners and accurate long-task subscription failures.
- Fix duplicate log rows when trimming a small retention buffer before adding its newest record.
- Add synthetic soak/lifecycle checks and package/runtime/CDN release-consistency checks.

- Manage export handoffs across dialogs with request IDs, 30-second wait notices and explicit wait cancellation that does not claim to cancel native work.
- Bound reports/files to 5 MiB UTF-8 and replay record limits; show preview size and reject oversize without partial exports.
- Add clearAll() and a confirmed toolbar action, preserving host storage/connections and capture settings.
- Roll back failed capture channels independently and expose retryable status; explain live object references in the log UI.

- Add timeline/error-context navigation, bounded realtime activity and performance summaries.
- Observe new WebSocket/EventSource connections, messages, named SSE events and lifecycle without closing host connections.
- Add runtime networkIgnore/redactKeys rules, report/history masking and optional activity report replay.
- Bound network lists to 100 rows per page; add storage search, explicit JSON editing and delete confirmation.
- Add typed onExport handoff for native saving/sharing, with asynchronous failure handling and no automatic download fallback.

- Preserve chronological log order when filtered large windows shrink below the paging threshold.
- Page Errors in groups of 100, batch large-store updates and preserve expanded stacks on retained cards.

- Group secondary toolbar actions into More, with outside-click/Escape dismissal and optional plugin tool placement.
- Bound log DOM to 200 records plus up to 100 group-context rows; page older records while searching/copying across the retained store.
- Coalesce large-list updates and retain paused-page position; add 10000-record rendering regressions and mobile acceptance checklist.

- Add combined method/status network filters and shell-quoted cURL copying.
- Add explicit scroll pause and new-log counts, a grouped Errors panel and independent capture controls.
- Add local JSON report import/search/group viewing to the website; no uploads or request execution.
- Bound credential-redaction matching for long strings to avoid blocking history persistence.

- Add opt-in session log preservation with sanitized, bounded snapshots, historical badges and page-session separators.
- Support the Preserve logs checkbox and `setOption('preserveLogs', boolean)`; clear and disable remove saved records.

## 0.1.2 — 2026-11-04

- Allow `setOption('entryButton', boolean)` to toggle the floating entry at runtime without stopping capture. The entry stays hidden while the panel is open.

## 0.1.1 — 2026-11-03

- Add a reload-page tool to the log panel.
- Keep packaged source maps without automatic loading references, avoiding missing-map requests when only JavaScript is deployed.

- Add report copying and manual text selection, plus the `exportEnabled` initialization option (enabled by default).

- Render each console group as a continuous tinted region, with deeper shading for nested groups.

- Implement interactive `console.group`, `groupCollapsed` and `groupEnd` with nested fold state.
- Keep matched descendants and their group headings visible during filtering, restoring fold state when filters clear.
- Reset groups on clear and reveal surviving records when a collapsed heading is evicted.
- Include group ancestry in diagnostic reports; add seven group-specific regression tests and local demo controls.

## 0.1.0 — Early preview

- Console, network, element, storage and system panels with English/Chinese labels.
- Search, expandable values, command input, themes and full-screen mode.
- GravScope SVG identity and draggable icon entry button.
- Offline HTML/JSON diagnostic snapshots with heuristic redaction.
- Bounded fetch response previews and SSE body exclusion.
- Ownership-aware hook teardown and initialization rollback.
- Modern and ES5-syntax distributions with TypeScript declarations.

Known limits: device compatibility, long-session performance and mobile downloads need further validation. Diagnostic redaction is not a guarantee that all sensitive data has been removed.
