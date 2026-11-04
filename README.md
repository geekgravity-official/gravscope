<img src="https://raw.githubusercontent.com/geekgravity-official/gravscope/main/public/brand/gravscope.svg" alt="GravScope" width="64" height="64" />

# GravScope

[Website & Playground / 官网与在线体验](https://geekgravity-official.github.io/gravscope/)

**Mobile web debugging, by GeekGravity.**

[简体中文](README.zh-CN.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

Inspect logs, requests, page elements and storage directly on a mobile web page. Export a diagnostic snapshot as a standalone HTML report or JSON to share a reproducible starting point with your team.

GravScope is an independent implementation, not a fork or drop-in replacement of vConsole.

## Status

**0.1.2 is an early preview.** Automated checks cover core behavior and package entry points. Mobile browser/device validation and long-running performance testing remain open.

## Features

- Console capture, uncaught errors, level filters, search, repeat counts and expandable values.
- Fetch, XMLHttpRequest, sendBeacon and resource diagnostics with request search.
- DOM tree inspection, element picking and highlighting.
- Cookie, localStorage and sessionStorage viewing and editing.
- System information and custom fields.
- Collapsible JavaScript command input and custom plugins.
- Light, dark and system themes, Shadow DOM style isolation, resizable/full-screen panel.
- Diagnostic exports with preview, time range selection and heuristic credential redaction.
- No runtime package dependencies; separate modern and compatibility builds.

## Quick start

Install from npm:

```sh
npm install @geekgravity/gravscope
```

```ts
import GravScope from '@geekgravity/gravscope/modern';

const panel = new GravScope({ theme: 'auto' });
console.log('Hello GravScope', { ready: true });

// Remove the panel and release owned capture hooks.
panel.destroy();
```

Use `@geekgravity/gravscope` for the ES5-syntax build with language polyfills. Neither build is a guarantee of support for a particular WebView: Shadow DOM, CSS variables and other browser APIs still matter. Test your target devices.

For a script tag, build or unpack the package and serve `dist/gravscope.modern.iife.js` (or `dist/gravscope.iife.js`). Its global constructor is `GravScope`.

Enable only in development or controlled testing environments. The command input executes JavaScript in the page context. Do not enable it by default for end users.

## Configuration and API

```ts
const panel = new GravScope({
  theme: 'auto', // 'light' | 'dark' | 'auto'
  lang: 'en', // 'en' | 'zh'; defaults to browser language
  defaultPlugins: ['network', 'element', 'storage', 'system'],
  maxLogNumber: 1000,
  maxNetworkNumber: 200,
  entryButton: true,
  exportEnabled: true,
});

panel.show();
panel.hide();
panel.showTab('network');
panel.setOption('theme', 'dark');
panel.setOption('maxLogNumber', 500);
panel.setSystemInfo('Build', 'preview-1');
panel.destroy();
```

All initialization options are optional. `new GravScope()` uses the defaults below. The panel starts closed, while capture begins during initialization.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `theme` | `'light' / 'dark' / 'auto'` | `'auto'` | Panel theme; auto follows changes to the system color preference. |
| `lang` | `'zh' / 'en'` | `自动检测 / Auto-detect` | Uses Chinese when navigator.language starts with zh, otherwise English. |
| `defaultPlugins` | `BuiltinPlugin[]` | `['network', 'element', 'storage', 'system']` | Adds Network, Element, Storage and System in array order; duplicates and unknown names are ignored. Log is always included; pass [] for Log only. |
| `maxLogNumber` | `number` | `1000` | Maximum retained log records; oldest records are evicted. This is a record count, not a byte limit. |
| `maxNetworkNumber` | `number` | `200` | Maximum retained network records; oldest records are evicted. |
| `entryButton` | `boolean` | `true` | Shows the floating entry button. With false, open the panel through show() or showTab(). |
| `exportEnabled` | `boolean` | `true` | Shows the log toolbar export entry. false hides access to the report preview, copy and download controls; getReport() and the separate log-copy tool remain available. |
| `target` | `HTMLElement / string / null` | `null → document.body` | Mount element or CSS selector. At mount time the selector must match an HTMLElement or an error is thrown. Omit or pass null to use body. |
| `onReady` | `() => void` | `undefined` | Called once after the UI mounts, with no arguments. Does not wait for page resources or requests. |

Use positive integers for both record limits. During initialization, fractions are rounded down (with a minimum effective limit of 1); zero, negatives, NaN, Infinity and non-numbers fall back to the respective default. Reducing a limit immediately evicts excess old records.

`defaultPlugins` selects panels, not capture hooks. Hiding the entry button, export UI or panel does not stop capture. Call `destroy()` to release hooks owned by the instance. Only one instance can be active at a time; access it through `GravScope.current`.

### Custom entry and export controls

```ts
const panel = new GravScope({
  lang: 'en',
  defaultPlugins: ['network', 'system'],
  entryButton: false,
  exportEnabled: false,
});
// Call from your own debug button's click handler:
panel.show();
// Or open a specific enabled panel:
panel.showTab('network');
```

### Mount target and readiness

```ts
// First provide <div id="debug-root"></div> in the page.
const panel = new GravScope({
  target: '#debug-root', // An HTMLElement is also accepted.
  onReady() {
    GravScope.current?.show();
  },
});
```

`target` changes the mount location; the UI remains an overlay rather than normal content inside that container. When using the default body target before body exists, mounting waits for DOMContentLoaded.

**`onReady` can run synchronously before the constructor returns.** Do not reference the not-yet-assigned `panel` variable inside this callback; use `GravScope.current`. Exceptions thrown by the callback are recorded as logs.

### Changing options after initialization

`setOption()` currently supports only `theme`, `maxLogNumber`, `maxNetworkNumber` and `entryButton`. To change language, mount target or export settings, destroy and recreate the instance; previous records are not retained. Use `addPlugin()` / `removePlugin()` to manage plugins.

## API reference

Examples assume `const panel = new GravScope()` already exists. Methods are synchronous; `void` means no return value, no chaining and no Promise.

### `show()`

Parameters: None.

Returns: `void`。

Opens the panel and resets the unread count without clearing logs.

```ts
panel.show();
```

### `hide()`

Parameters: None.

Returns: `void`。

Closes the panel; capture continues.

```ts
panel.hide();
```

### `showTab(id)`

Parameters: id: string, the ID of an added panel.

Returns: `void`。

Activates a tab and opens the panel. Built-in IDs: log, network, element, storage, system; custom tabs use plugin.id. An unknown ID leaves the active tab unchanged but still opens the panel.

```ts
panel.showTab('network');
```

### `setOption(key, value)`

Parameters: key: 'theme', value: 'light' / 'dark' / 'auto'; or key: 'maxLogNumber' / 'maxNetworkNumber', value: number; or key: 'entryButton', value: boolean.

Returns: `void`。

Updates theme, capacity or the floating entry immediately. Runtime limits are rounded down and clamped to at least 1; non-finite values are ignored (unlike initialization defaults). Invalid themes are ignored. Only the four listed keys are supported; lowering a limit evicts old records immediately. Runtime entryButton support is available from 0.1.2. false hides the entry immediately; true shows it only while the panel is closed. It does not close the panel or stop capture. Non-boolean values are ignored.

```ts
panel.setOption('theme', 'dark');
panel.setOption('maxLogNumber', 500);
panel.setOption('maxNetworkNumber', 100);
// hide / restore the floating entry
panel.setOption('entryButton', false);
panel.setOption('entryButton', true);
```

### `setSystemInfo(key, value)`

Parameters: key: string, information label; value: string, display value.

Returns: `void`。

Adds or replaces custom system information by key, also included in report.custom. The System panel need not be open.

```ts
panel.setSystemInfo('Build', '2026.11.04');
panel.setSystemInfo('Environment', 'staging');
```

### `getReport(options?)`

Parameters: options?: ReportOptions, defaults to {}; fields below.

Returns: `DiagnosticReport`。

Synchronously returns a redacted snapshot without downloading, uploading or opening a dialog. Available when exportEnabled is false. Throws if since is non-finite or negative.

```ts
const report = panel.getReport({
  since: Date.now() - 5 * 60 * 1000,
  includeBodies: false,
});
const json = JSON.stringify(report, null, 2);
```

### `addPlugin(plugin)`

Parameters: plugin: GravScopePlugin, configured with handlers and tools.

Returns: `void`。

Adds a tab and synchronously emits init and render. IDs must be unique; conflicts with built-in or custom plugins throw. Does not automatically select the new tab.

```ts
const plugin = new GravScope.Plugin('build', 'Build');
plugin.on('render', element => {
  element.textContent = 'Build 2026.11.04';
});
panel.addPlugin(plugin);
panel.showTab('build');
```

### `removePlugin(id)`

Parameters: id: string, plugin ID to remove.

Returns: `void`。

Emits remove and removes the tab; unknown IDs are ignored. Removing the active tab selects the first remaining tab. If a remove handler throws, the tab is still removed and the error propagates. Removing Network does not stop capture.

```ts
panel.removePlugin('build');
```

### `destroy()`

Parameters: None.

Returns: `void`。

Removes the UI, emits plugin remove, releases owned capture hooks and listeners, and clears GravScope.current. Safe to repeat; plugin cleanup errors do not block teardown. Create a new instance to start again.

```ts
panel.destroy();
const nextPanel = new GravScope();
```

### `getReport` options and result

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `since` | `number` | `0` | Unix milliseconds; includes logs and requests at or after this time (request start time). Not seconds or a duration. |
| `includeBodies` | `boolean` | `false` | Includes already captured request/response bodies, still subject to truncation and redaction; does not recover uncaptured data. |

| Result field | Type | Description |
| --- | --- | --- |
| `schemaVersion` | `1` | Report schema version. |
| `version` | `string` | GravScope library version. |
| `createdAt` | `string` | Creation time as an ISO 8601 string. |
| `page` | `string` | Redacted current page URL. |
| `device` | `{ userAgent: string; language: string; viewport: string }` | Browser, language and viewport information. |
| `custom` | `unknown` | Redacted custom system information. |
| `logs` | `unknown[]` | Retained logs within the time range. |
| `network` | `unknown[]` | Retained requests within the time range. |
| `policy` | `string` | Capture and redaction policy. |

Contents of `custom`, `logs` and `network` are sanitized and bounded; narrow their types before use rather than treating them as raw objects. Capture reports before calling `destroy()`.

### Public properties

| Property | Type and purpose | Example |
| --- | --- | --- |
| `GravScope.current` | `GravScope / null` — Current instance; null before initialization or after destruction. Read without assigning. | `GravScope.current?.show()` |
| `GravScope.version` / `panel.version` | `string` — Read-only library version. | `console.log(GravScope.version)` |
| `GravScope.Plugin` | `typeof GravScopePlugin` — Plugin constructor, also available through the CDN global. | `new GravScope.Plugin('build', 'Build')` |

## Diagnostic reports

Set `exportEnabled: false` during initialization to hide the export UI (default: `true`). This is a UI preference; `getReport()` remains available.

Choose **Export** in the log toolbar. **Copy report** copies the redacted JSON preview; **Select all** supports manual copying when WebView clipboard APIs are unavailable. Preview all retained records or the last five minutes, then save HTML or JSON. The HTML report opens offline without external resources or executable report data. If downloading is unsupported, copy the preview manually.

```ts
const snapshot = panel.getReport({
  since: Date.now() - 5 * 60 * 1000,
  includeBodies: false,
});
```

Request/response bodies are excluded by default. Storage and command source are excluded. Common credential fields and URL query values/fragments are masked. **Redaction is heuristic: inspect the preview before sharing.** Arbitrary business-sensitive strings may remain.

Only retained data is exported, not a session recording or complete history. Object values reflect export time. Depth, property, node and string limits apply.

## Plugins

```ts
import { GravScopePlugin } from '@geekgravity/gravscope/modern';

const plugin = new GravScopePlugin('build', 'Build');
plugin.on('render', element => {
  element.textContent = 'Build preview-1';
});
plugin.addTool('Refresh', () => console.info('Refresh requested'));
panel.addPlugin(plugin);
panel.removePlugin('build');
```

### Plugin API

#### `new GravScopePlugin(id, name)`

Parameters and behavior: id: string, nonempty unique ID; name: string, tab label, falls back to id when empty.

Returns: `GravScopePlugin`.

```ts
const plugin = new GravScope.Plugin('build', 'Build');
```

#### `on(event, handler)`

Parameters and behavior: event is a name from the event table; handler is the corresponding callback. Adds a listener without replacing previous handlers.

Returns: `this`; `this` supports chaining.

```ts
plugin.on('render', element => { element.textContent = 'Ready'; });
```

#### `addTool(name, onClick)`

Parameters and behavior: name: string, button label; onClick: () => void, click callback with no arguments.

Returns: `this`; `this` supports chaining.

```ts
plugin.addTool('Refresh', () => console.info('Refresh requested'));
```

#### `getTools()`

Parameters and behavior: None. Returns a shallow copy of the tools array; button objects remain shared and should not be mutated.

Returns: `Array<{ name: string; onClick: () => void }>`.

```ts
const labels = plugin.getTools().map(tool => tool.name);
```

#### `emit(event, ...args)`

Parameters and behavior: event is an event name; render requires an HTMLElement, others take no arguments. Calls handlers synchronously in registration order; exceptions interrupt and propagate. Normally dispatched by the panel; manual emission does not change UI state.

Returns: `void`.

```ts
// Manual handler invocation only; does not open the tab.
plugin.emit('show');
```

| Event | Handler | Timing |
| --- | --- | --- |
| `init` | `() => void` | Runs on plugin addition, before render. |
| `render` | `(element: HTMLElement) => void` | Runs on addition; populate the provided panel element. |
| `show` | `() => void` | Emitted on tab activation or panel show; may repeat and does not guarantee actual visibility. |
| `hide` | `() => void` | Emitted when leaving a tab or hiding the panel; may repeat. |
| `remove` | `() => void` | Use to clean up owned timers/listeners on removePlugin or destroy. |

Register handlers and tools before `addPlugin()`. The toolbar reads tools on tab activation; adding tools does not immediately redraw an active toolbar. `id` and `name` are read-only strings; an empty id throws during construction. There is no `off()` API; clean up listeners and timers owned by your plugin in `remove`.


## Capture limits

- Teardown restores hooks only when they are still owned by GravScope, preserving wrappers installed later.
- Fetch preview failures do not reject a successful host request. Pending requests stop updating the panel after teardown.
- Fetch previews read up to approximately 100 KB. Truncated sizes describe sampled bytes, not the complete response. SSE bodies are not buffered.
- Without stream-reading APIs, only small responses with a declared size are considered for preview.
- Log/network retention is bounded. A 10,000-record store test verifies capacity, not real-device rendering speed.
- Initialization failures clean up registered hooks and allow a new instance.

The log toolbar includes **Reload page**, which performs a normal reload and resets in-memory logs. Packaged `.map` files remain available for manual debugging, without automatic source map requests.

## Local development

Use Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run check:package
```

Open the local URL printed by Vite. Add `?shot` to populate sample data. This sample deliberately triggers an error and a failed resource request.

`npm pack` produces a tarball that can be installed with `npm install /path/to/geekgravity-gravscope-0.1.2.tgz` for local evaluation.

## License

[MIT](LICENSE).

## CDN

jsDelivr (pinned version / 固定版本):

```html
<script src="https://cdn.jsdelivr.net/npm/@geekgravity/gravscope@0.1.2/dist/gravscope.modern.iife.js"></script>
<script>const panel = new GravScope();</script>
```

[UNPKG fallback / 备用地址](https://unpkg.com/@geekgravity/gravscope@0.1.2/dist/gravscope.modern.iife.js).
