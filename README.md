<img src="https://raw.githubusercontent.com/geekgravity-official/gravscope/main/public/brand/gravscope.svg" alt="GravScope" width="64" height="64" />

# GravScope

[Website & Playground / 官网与在线体验](https://geekgravity-official.github.io/gravscope/)

**Mobile web debugging, by GeekGravity.**

[简体中文](README.zh-CN.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

Inspect logs, requests, page elements and storage directly on a mobile web page. Export a diagnostic snapshot as a standalone HTML report or JSON to share a reproducible starting point with your team.

GravScope is an independent implementation, not a fork or drop-in replacement of vConsole.

## Status

**0.1.1 is an early preview.** Automated checks cover core behavior and package entry points. Mobile browser/device validation and long-running performance testing remain open.

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

`setOption()` currently supports only `theme`, `maxLogNumber` and `maxNetworkNumber`. To change language, mount target, entry or export settings, destroy and recreate the instance; previous records are not retained. Use `addPlugin()` / `removePlugin()` to manage plugins.

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

Events: `init`, `render`, `show`, `hide`, `remove`.

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

`npm pack` produces a tarball that can be installed with `npm install /path/to/geekgravity-gravscope-0.1.1.tgz` for local evaluation.

## License

[MIT](LICENSE).

## CDN

jsDelivr (pinned version / 固定版本):

```html
<script src="https://cdn.jsdelivr.net/npm/@geekgravity/gravscope@0.1.1/dist/gravscope.modern.iife.js"></script>
<script>const panel = new GravScope();</script>
```

[UNPKG fallback / 备用地址](https://unpkg.com/@geekgravity/gravscope@0.1.1/dist/gravscope.modern.iife.js).
