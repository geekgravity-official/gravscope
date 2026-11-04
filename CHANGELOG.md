# Changelog

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
