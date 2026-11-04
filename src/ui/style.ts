export const STYLE = `
.gc-app {
  all: initial;
  display: block;
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  pointer-events: none;
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
  font-size: 13px;
  line-height: 1.45;
  letter-spacing: 0;
  text-align: left;
  -webkit-font-smoothing: antialiased;
  --bg: #101318;
  --panel: #181c23;
  --panel-2: #1e232c;
  --line: rgba(255, 255, 255, 0.08);
  --text: #f9fafb;
  --muted: #9ca3af;
  --accent: #3b82f6;
  --accent-2: #a78bfa;
  --accent-ink: #ffffff;
  --log: #e5e7eb;
  --info: #93c5fd;
  --warn: #fbbf24;
  --error: #fb7185;
  --debug: #9ca3af;
  --ok: #34d399;
  --chip: #292f3a;
  --handle: #4b5563;
  --shadow: 0 -16px 48px rgba(0, 0, 0, 0.55);
  color-scheme: dark;
}
.gc-app[data-theme="light"] {
  --bg: #f3f4f6;
  --panel: #ffffff;
  --panel-2: #f9fafb;
  --line: rgba(0, 0, 0, 0.08);
  --text: #1f2937;
  --muted: #6b7280;
  --accent: #3b82f6;
  --accent-2: #8b5cf6;
  --accent-ink: #ffffff;
  --log: #1f2937;
  --info: #2563eb;
  --warn: #d97706;
  --error: #e11d48;
  --debug: #6b7280;
  --ok: #059669;
  --chip: #e5e7eb;
  --handle: #d1d5db;
  --shadow: 0 -12px 40px rgba(3, 7, 18, 0.12);
  color: var(--text);
  color-scheme: light;
}
.gc-app * { box-sizing: border-box; }
.gc-app [hidden] { display: none !important; }
.gc-mask {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  inset: 0;
  background: rgba(8, 10, 14, 0.42);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}
.gc-mask.open { opacity: 1; }
.gc-mask.open.gc-ready { pointer-events: auto; }
.gc-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 70%;
  max-height: 720px;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  color: var(--text);
  border-radius: 14px 14px 0 0;
  box-shadow: var(--shadow);
  border-top: 1px solid var(--line);
  transform: translateY(105%);
  transition: transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: none;
  overflow: hidden;
}
.gc-panel.open { transform: translateY(0); pointer-events: auto; }
.gc-handle {
  position: relative;
  width: 80px;
  height: 24px;
  margin: 0 auto;
  border-radius: 99px;
  background: transparent;
  cursor: ns-resize;
  touch-action: none;
  flex: none;
}
.gc-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  border-bottom: 1px solid var(--line);
  flex: none;
}
.gc-tablist {
  display: flex;
  gap: 2px;
  overflow-x: auto;
  flex: 1;
  min-width: 0;
}
.gc-tablist::-webkit-scrollbar { display: none; }
.gc-tab, .gc-close, .gc-tool, .gc-filter, .gc-seg button, .gc-back, .gc-icon, .gc-node-line, .gc-net {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
}
.gc-tab {
  position: relative;
  padding: 10px 10px;
  color: var(--muted);
  border-bottom: 2px solid transparent;
  white-space: nowrap;
}
.gc-tab.active { color: var(--text); border-bottom-color: var(--accent); font-weight: 700; }
.gc-close {
  width: 40px;
  height: 40px;
  margin-right: 2px;
  border-radius: 12px;
  color: var(--muted);
  flex: none;
  font-size: 20px;
  line-height: 1;
}
.gc-close:hover, .gc-icon:hover, .gc-net:hover, .gc-node-line:hover { background: rgba(255, 255, 255, 0.05); }
.gc-app[data-theme="light"] .gc-close:hover,
.gc-app[data-theme="light"] .gc-icon:hover,
.gc-app[data-theme="light"] .gc-net:hover,
.gc-app[data-theme="light"] .gc-node-line:hover { background: rgba(28, 33, 43, 0.05); }
.gc-panes { flex: 1; min-width: 0; max-width: 100%; min-height: 0; position: relative; }
.gc-pane { display: none; flex-direction: column; height: 100%; min-width: 0; max-width: 100%; min-height: 0; overflow: hidden; }
.gc-pane.active { display: flex; }
.gc-tools {
  display: flex;
  gap: 6px;
  padding: 8px;
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--line);
  background: var(--panel-2);
  flex: none;
  overflow-x: auto;
}
.gc-tool, .gc-filter, .gc-seg button {
  border-radius: 6px;
  padding: 6px 10px;
  min-height: 34px;
  background: var(--chip);
  color: var(--text);
  white-space: nowrap;
}
.gc-filter.active, .gc-seg button.active { background: var(--accent); color: var(--accent-ink); font-weight: 700; }
.gc-tool:active, .gc-filter:active, .gc-seg button:active, .gc-cmd button:active, .gc-form button:active { transform: translateY(1px); }
.gc-switch {
  position: absolute;
  right: 16px;
  top: calc(50% + 28px);
  bottom: auto;
  width: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 140px;
  height: 44px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: #ffffff;
  font: 700 14px/1 ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0.01em;
  box-shadow: 0 10px 24px rgba(59, 130, 246, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.2) inset;
  pointer-events: auto;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  transition: left 0.22s ease, top 0.22s ease, transform 0.22s ease, opacity 0.22s ease;
}
.gc-brand-icon { display: block; width: 24px; height: 24px; flex: none; }
.gc-brand-name { white-space: nowrap; }
.gc-switch.gc-docked .gc-brand-name { display: none; }
.gc-switch.gc-dragging { transition: none; }
.gc-switch.gc-docked {
  width: 44px;
  min-width: 44px;
  padding: 0;
  border-radius: 14px;
  opacity: 0.7;
  box-shadow: 0 4px 10px rgba(59, 130, 246, 0.18);
}
.gc-switch.gc-docked[data-side="left"] { transform: translateX(-20%); }
.gc-switch.gc-docked[data-side="right"] { transform: translateX(20%); }
.gc-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 99px;
  background: var(--error);
  color: white;
  font: 700 10px/18px ui-sans-serif, system-ui, sans-serif;
}
.gc-list { flex: 1; min-width: 0; max-width: 100%; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; }
.gc-list::-webkit-scrollbar, .gc-detail::-webkit-scrollbar { width: 8px; height: 8px; }
.gc-list::-webkit-scrollbar-thumb, .gc-detail::-webkit-scrollbar-thumb { background: var(--line); border-radius: 99px; }
.gc-row { min-width: 0; max-width: 100%; border-bottom: 1px solid var(--line); }
.gc-row.gc-lvl-warn { background: rgba(251, 191, 36, 0.1); }
.gc-row.gc-lvl-error { background: rgba(251, 113, 133, 0.12); }
.gc-row-main { display: flex; align-items: flex-start; min-width: 0; max-width: 100%; }
.gc-line { display: flex; flex-direction: column; align-items: stretch; gap: 3px; flex: 1; min-width: 0; padding: 7px 4px 7px 12px; }
.gc-line-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.gc-time, .gc-msg, .gc-pre, .gc-table, .gc-url, .gc-search, .gc-cmd input, .gc-form input, .gc-inline {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.gc-time { color: var(--muted); flex: none; font-size: 11px; font-variant-numeric: tabular-nums; }
.gc-lvl {
  flex: none;
  margin-top: 1px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--chip);
  font-style: normal;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 16px;
  text-transform: uppercase;
  white-space: nowrap;
}
.gc-lvl-log { color: var(--log); }
.gc-lvl-info { color: var(--info); }
i.gc-lvl-info { background: rgba(59, 130, 246, 0.16); }
.gc-lvl-warn { color: var(--warn); }
i.gc-lvl-warn { background: rgba(251, 191, 36, 0.18); }
.gc-lvl-error { color: var(--error); }
i.gc-lvl-error { background: rgba(251, 113, 133, 0.18); }
.gc-lvl-debug { color: var(--debug); }
.gc-msg { min-width: 0; display: flex; flex-direction: column; align-items: stretch; gap: 2px; text-align: left; }
.gc-inline-msg { display: flex; flex-wrap: wrap; gap: 4px 6px; min-width: 0; text-align: left; }
.gc-chunk, .gc-arg, .gc-inline-msg { min-width: 0; max-width: 100%; }
.gc-chunk { white-space: pre-wrap; overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word; text-align: left; tab-size: 2; }
.gc-arg { display: block; }
.gc-struct { min-width: 0; max-width: 100%; text-align: left; }
.gc-prop { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 0 6px; padding-left: 16px; min-width: 0; max-width: 100%; }
.gc-slot { min-width: 0; max-width: 100%; }
.gc-slot-block { flex: 1 0 100%; }
.gc-punct { color: var(--muted); }
.gc-fold { display: inline; width: auto; }
.gc-disclosure {
  display: inline-flex;
  align-items: flex-start;
  gap: 4px;
  max-width: 100%;
  min-height: 22px;
  margin: 0;
  padding: 2px 0;
  border: 0;
  appearance: none;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: inherit;
  text-align: left;
  cursor: pointer;
  vertical-align: top;
}
.gc-disclosure.is-open {
  display: flex;
  flex-wrap: wrap;
  width: 100%;
}
.gc-disclosure-brace { flex: 1 0 100%; }
.gc-caret { flex: none; width: 1em; color: var(--muted); }
.gc-disclosure-label {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-wrap: break-word;
  word-break: break-word;
}
.gc-struct-body { min-width: 0; max-width: 100%; }
.gc-str { color: #8bd48a; }
.gc-app[data-theme="light"] .gc-str { color: #059669; }
.gc-app[data-theme="light"] .gc-num { color: #2563eb; }
.gc-app[data-theme="light"] .gc-bool { color: #7c3aed; }
.gc-num { color: #60a5fa; }
.gc-bool { color: #c4b5fd; }
.gc-nil { color: var(--muted); }
.gc-prop.gc-nil {
  white-space: pre-wrap;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-wrap: break-word;
  word-break: break-word;
}
.gc-obj { color: var(--info); }
.gc-cmdmark { color: var(--accent); font-weight: 700; display: block; max-width: 100%; overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word; }
.gc-repeat {
  flex: none;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 99px;
  background: var(--chip);
  color: var(--accent);
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}
.gc-toggle {
  font: inherit;
  color: var(--info);
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-align: left;
  display: block;
  width: 100%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-wrap: break-word;
  word-break: break-word;
}
.gc-details, .gc-expand, .gc-tree { min-width: 0; max-width: 100%; margin: 2px 0 6px 12px; text-align: left; }
.gc-kvline { display: flex; gap: 8px; align-items: flex-start; padding: 1px 0; min-width: 0; max-width: 100%; text-align: left; }
.gc-k { color: var(--info); flex: none; max-width: 46%; min-width: 0; text-align: left; white-space: pre-wrap; overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word; }
.gc-v { flex: 1; min-width: 0; max-width: 100%; text-align: left; white-space: pre-wrap; tab-size: 2; overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word; }
.gc-filters {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 8px;
  overflow-x: auto;
  flex: none;
  border-bottom: 1px solid var(--line);
}
.gc-search, .gc-cmd input, .gc-form input, .gc-inline {
  min-width: 0;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  outline: none;
}
.gc-search { width: auto; flex: 1; min-width: 108px; }
.gc-search::placeholder, .gc-cmd input::placeholder, .gc-form input::placeholder, .gc-inline::placeholder { color: var(--muted); }
.gc-search:focus, .gc-cmd input:focus, .gc-form input:focus, .gc-inline:focus { border-color: var(--accent); }
.gc-cmd, .gc-form {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-top: 1px solid var(--line);
  background: var(--panel-2);
  flex: none;
}
.gc-cmd input, .gc-form input, .gc-inline { flex: 1; font-size: 16px; }
.gc-cmd button, .gc-form button, .gc-back {
  background: var(--accent);
  color: var(--accent-ink);
  border: 0;
  border-radius: 8px;
  padding: 0 12px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.gc-empty { padding: 36px 20px; color: var(--muted); text-align: center; letter-spacing: 0.01em; }
.gc-toast {
  margin: 0 12px 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(62, 207, 142, 0.14);
  color: var(--ok);
  text-align: center;
}
.gc-pre {
  margin: 0 0 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg);
  text-align: left;
  white-space: pre-wrap;
  tab-size: 2;
  overflow-wrap: anywhere;
  word-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
  font-size: 12px;
  line-height: 1.5;
}
.gc-table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
.gc-table th, .gc-table td { border-bottom: 1px solid var(--line); padding: 4px 8px; text-align: left; white-space: pre-wrap; tab-size: 2; overflow-wrap: anywhere; word-break: break-word; vertical-align: top; }
.gc-table th { color: var(--muted); font-weight: 700; background: var(--panel-2); }
.gc-net {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  column-gap: 10px;
  align-items: center;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  text-align: left;
}
.gc-net.has-preview { grid-template-columns: 40px minmax(0, 1fr); }
.gc-mark {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--chip);
  overflow: hidden;
}
.gc-net.failed .gc-method { color: var(--error); }
.gc-net-body { min-width: 0; max-width: 100%; display: flex; flex-direction: column; gap: 2px; }
.gc-net-main { display: flex; align-items: flex-start; gap: 6px; min-width: 0; }
.gc-net-sub { display: flex; align-items: center; gap: 8px; min-width: 0; }
.gc-net .gc-copy { align-self: center; margin-top: 0; }
.gc-chevron { flex: none; align-self: flex-start; margin-top: 1px; color: var(--muted); font-size: 18px; line-height: 1.2; }
.gc-block-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 12px; }
.gc-block-head h4 { margin: 0; }
.gc-method { flex: none; font-weight: 800; color: var(--info); }
.gc-status { flex: none; font-weight: 800; }
.gc-status.s2 { color: var(--ok); }
.gc-status.s3 { color: var(--warn); }
.gc-status.s4, .gc-status.s5 { color: var(--error); }
.gc-status.s0 { color: var(--muted); }
.gc-url { flex: 1; min-width: 0; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text); font-size: 13px; line-height: 1.5; }
.gc-thumb { width: 40px; height: 40px; object-fit: cover; flex: none; display: block; background: var(--chip); }
.gc-msg .gc-thumb, .gc-pre .gc-thumb, .gc-detail > .gc-thumb { width: 32px; height: 32px; object-fit: contain; border-radius: 4px; }
.gc-meta { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 11px; }
.gc-capture-summary, .gc-log-reference-note, .gc-diagnostics-hint { flex: none; margin: 0; padding: 6px 12px; white-space: normal; overflow-wrap: anywhere; }
.gc-detail { flex: 1; min-width: 0; max-width: 100%; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 8px 12px 16px; }
.gc-detail h3 { margin: 8px 0; max-width: 100%; font-size: 13px; overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word; }
.gc-detail h4 { margin: 0; font-size: 12px; color: var(--accent); }
.gc-detail-bar { display: flex; gap: 12px; margin-bottom: 8px; }
.gc-back { height: 32px; }
.gc-section { min-width: 0; max-width: 100%; padding: 10px 12px 0; }
.gc-section h3 { margin: 0 0 8px; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent); }
.gc-dl { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 6px 10px; margin: 0 0 14px; min-width: 0; max-width: 100%; }
.gc-dl dt { color: var(--muted); min-width: 0; padding-top: 6px; overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word; }
.gc-dl dd { display: flex; align-items: flex-start; gap: 4px; margin: 0; min-width: 0; }
.gc-dd-text { flex: 1; min-width: 0; max-width: 100%; text-align: left; white-space: pre-wrap; tab-size: 2; overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word; padding-top: 6px; }
.gc-banner { max-width: 100%; padding: 8px 12px; background: var(--accent); color: var(--accent-ink); font-weight: 700; flex: none; overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word; }
.gc-node, .gc-node-head { min-width: 0; max-width: 100%; }
.gc-node-head { display: flex; align-items: flex-start; }
.gc-node-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
  min-width: 0;
  max-width: 100%;
  padding: 4px 8px;
  text-align: left;
  align-items: baseline;
  white-space: normal;
}
.gc-node-line.selected { background: rgba(59, 130, 246, 0.16); box-shadow: inset 2px 0 0 var(--accent); }
.gc-caret { width: 14px; flex: none; color: var(--muted); }
.gc-tag { color: var(--info); flex: none; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.gc-attr {
  color: var(--muted);
  flex: 1 1 8em;
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  word-wrap: break-word;
  word-break: break-word;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.gc-children { margin-left: 12px; }
.gc-seg { display: flex; gap: 6px; padding: 8px; flex: none; }
.gc-item {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.4fr) auto auto;
  gap: 6px;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
}
.gc-key { min-width: 0; font-weight: 700; overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word; }
.gc-val {
  font: inherit;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: inherit;
  background: transparent;
  border: 0;
  text-align: left;
  padding: 0;
  min-width: 0;
  white-space: pre-wrap;
  tab-size: 2;
  overflow-wrap: anywhere;
  word-wrap: break-word;
  word-break: break-word;
  cursor: pointer;
}
.gc-icon { color: var(--muted); min-width: 40px; min-height: 32px; padding: 4px 6px; border-radius: 8px; }
.gc-copy { flex: none; align-self: flex-start; margin-top: 4px; font-size: 12px; }
.gc-highlight { position: absolute; top: 0; right: 0; bottom: 0; left: 0; inset: 0; pointer-events: none; z-index: 3; }
.gc-hbox { position: absolute; border: 2px solid var(--accent); background: rgba(59, 130, 246, 0.16); border-radius: 4px; }
.gc-htag {
  position: absolute;
  max-width: calc(100% - 16px);
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--accent);
  color: var(--accent-ink);
  font: 700 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gc-tab:focus-visible, .gc-tool:focus-visible, .gc-switch:focus-visible, .gc-close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .gc-panel, .gc-mask { transition: none; }
}

.gc-handle::after { content: ''; position: absolute; left: 20px; right: 20px; top: 10px; height: 4px; border-radius: 4px; background: var(--handle); }
.gc-panel.gc-fullscreen { height: 100% !important; max-height: 100%; border-radius: 0; padding-top: env(safe-area-inset-top); }
.gc-panel.gc-fullscreen .gc-handle { visibility: hidden; }
.gc-size { font: inherit; font-size: 18px; width: 34px; height: 40px; flex: none; margin: 0; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--muted); cursor: pointer; }
.gc-log-filters, .gc-net-search { overflow: visible; gap: 8px; padding: 10px 12px; }
.gc-search { min-height: 36px; font-size: 16px; }
.gc-level-select { max-width: 90px; min-width: 64px; min-height: 36px; padding: 6px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel-2); color: var(--text); font: inherit; }
.gc-result-count { flex: none; color: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.gc-net-filters { padding: 4px 12px 8px; gap: 4px; }
.gc-net-filters .gc-filter { background: transparent; color: var(--muted); }
.gc-net-filters .gc-filter.active { background: var(--chip); color: var(--text); }
.gc-net-host { color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gc-net.failed { box-shadow: inset 2px 0 var(--error); background: rgba(251, 113, 133, 0.04); }
.gc-net .gc-copy { min-height: 28px; }
.gc-net .gc-method, .gc-net .gc-status { font-size: 11px; font-variant-numeric: tabular-nums; }
.gc-tools { gap: 4px; padding-top: 6px; }
.gc-tools .gc-tool { background: transparent; color: var(--muted); }
.gc-tools .gc-tool:hover { background: var(--chip); color: var(--text); }
.gc-tools .gc-tool:last-child { margin-left: auto; color: var(--accent); }
.gc-detail-bar { position: sticky; top: -8px; z-index: 1; margin: -8px -12px 8px; padding: 10px 12px; background: var(--panel); border-bottom: 1px solid var(--line); justify-content: space-between; }
.gc-back { background: var(--chip); color: var(--text); }
.gc-app button:focus-visible, .gc-app select:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
@media (max-width: 380px) { .gc-tab { padding-left: 7px; padding-right: 7px; } .gc-result-count { display: none; } }

.gc-report { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; gap: 12px; padding: 16px; padding-bottom: calc(16px + env(safe-area-inset-bottom)); background: var(--panel); color: var(--text); overflow: auto; }
.gc-report-head, .gc-report-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; flex: none; }
.gc-report-head { justify-content: space-between; }
.gc-report p { margin: 0; font-size: 12px; color: var(--muted); }
.gc-report .gc-level-select { max-width: none; }
.gc-report-preview { flex: 1; min-height: 100px; width: 100%; resize: none; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--text); font: 12px/1.5 ui-monospace, monospace; }
.gc-report-summary { color: var(--muted); font-size: 12px; }

/* A continuous colored region includes the group heading and every descendant. */
.gc-row.gc-group-region {
  margin: 0 8px;
  background: rgba(var(--group-rgb), var(--group-opacity));
  border-left: 2px solid rgba(var(--group-rgb), 0.42);
  border-right: 1px solid rgba(var(--group-rgb), 0.12);
  border-bottom-color: transparent;
}
.gc-row.gc-group-region.gc-group-start { margin-top: 8px; border-radius: 8px 8px 0 0; border-top: 1px solid rgba(var(--group-rgb), 0.18); }
.gc-row.gc-group-region.gc-group-end { margin-bottom: 8px; border-radius: 0 0 8px 8px; border-bottom: 1px solid rgba(var(--group-rgb), 0.18); }
.gc-row.gc-group-region.gc-group-start.gc-group-end { border-radius: 8px; }
.gc-group .gc-msg { font-weight: 600; }
.gc-group-region.gc-lvl-error .gc-lvl { background: rgba(251, 113, 133, 0.24); }
.gc-group-region.gc-lvl-warn .gc-lvl { background: rgba(251, 191, 36, 0.24); }
.gc-group-toggle { flex: none; width: 32px; min-height: 44px; padding: 4px; border: 0; background: transparent; color: var(--muted); cursor: pointer; font: inherit; }
.gc-group-toggle:disabled { cursor: default; }
.gc-group .gc-line { padding-left: 0; }

.gc-history-badge{font-size:10px;color:var(--muted);border:1px solid currentColor;border-radius:3px;padding:0 3px}
.gc-session-boundary{border-top:1px dashed var(--muted);border-bottom:1px dashed var(--muted);opacity:.8}
.gc-log-filters label{display:flex;align-items:center;gap:4px;white-space:nowrap;font-size:12px}

.gc-error-item{padding:12px;border-bottom:1px solid var(--border);overflow-wrap:anywhere}.gc-error-item summary{cursor:pointer;white-space:pre-wrap}.gc-error-item time{font-size:11px;color:var(--muted);margin-right:8px}.gc-capture-settings label{display:flex;gap:8px;align-items:center;padding:12px}.gc-resume-logs{align-self:center}.gc-net-search{flex-wrap:wrap}.gc-net-status{max-width:180px}

.gc-tools{position:relative;overflow:visible;flex-wrap:nowrap}.gc-tools>.gc-tool{flex:0 1 auto;min-width:0;padding-inline:8px}.gc-more-tools{position:relative;margin-left:auto}.gc-more-tools>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-sizing:border-box}.gc-more-tools>summary::-webkit-details-marker{display:none}.gc-more-menu{position:absolute;right:0;bottom:calc(100% + 10px);z-index:10;min-width:160px;max-height:28vh;overflow-y:auto;padding:6px;border:1px solid var(--line);border-radius:8px;background:var(--panel);box-shadow:0 6px 24px #0004;display:flex;flex-direction:column;gap:3px}.gc-more-menu .gc-tool{text-align:left;width:100%;margin:0!important;min-height:40px}.gc-tools .gc-more-menu .gc-tool:last-child{color:var(--text)}.gc-log-pages{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 8px;font-size:11px;color:var(--muted)}

.gc-storage-editor { flex-wrap: wrap; flex: 0 0 auto; max-height: 60vh; overflow: auto; }
.gc-storage-editor strong, .gc-storage-editor textarea, .gc-storage-editor [role="alert"] { flex: 0 0 100%; min-width: 0; box-sizing: border-box; }
.gc-storage-editor textarea { width: 100%; resize: vertical; color: var(--text); background: var(--panel); font-size: 16px; }
.gc-storage-editor input[type="checkbox"] { flex: none; }
`;
