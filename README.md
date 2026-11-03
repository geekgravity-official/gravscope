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

Log is always included. `defaultPlugins` controls the other built-in panels; it does not disable the underlying network capture hooks. Only one instance can be active at a time (`GravScope.current`).

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
