<img src="public/brand/gravscope.svg" alt="GravScope" width="64" height="64" />

# GravScope

[Website & Playground / 官网与在线体验](https://geekgravity-official.github.io/gravscope/)

[English](README.md) · [贡献指南](CONTRIBUTING.md) · [更新日志](CHANGELOG.md)

轻量、可扩展的移动端前端调试面板。在手机网页里查看日志、网络请求、元素树和本地存储，也可以直接执行一段 JavaScript。

GravScope 是独立实现，解决和 [vConsole](https://github.com/Tencent/vConsole) 同类的问题。它不是 vConsole 的分支，接口看起来接近，但不能当作 vConsole 的替代包直接替换。

## 功能

- 日志：`console.log / info / warn / error / debug / table / group / dir / trace / count / time`，未捕获错误和 Promise 拒绝。字符串里的换行和缩进按原文显示，JSON 文本不再转义引号。普通对象、数组、Map、Set、URL 和二进制数据默认收成一行，点开头的箭头再按层级展开，DOM 节点按类型摘要，错误会带出堆栈，`console.trace` 也收成可展开的调用栈
- 固定搜索栏、日志级别筛选、结果计数、重复日志合并、对象展开
- 命令行：点击底部「命令行」展开，在页面全局作用域执行 JavaScript
- 网络：`fetch`、`XMLHttpRequest`、`sendBeacon`，以及脚本、样式、图片等静态资源。列表里能看到加载中、HTTP 状态、失败和缓存，详情里有耗时、体积、协议和响应内容
- 元素：DOM 树、高亮、点选页面元素
- 存储：Cookie、`localStorage`、`sessionStorage` 的查看、新增、修改、删除
- 系统：UA、视口、网络信息和性能计时，可写入自定义字段
- 问题现场导出：日志面板底部「导出」，预览脱敏后的日志、网络及设备信息，保存离线 HTML 报告或 JSON
- 自定义插件
- 网络搜索：按地址、方法或状态码搜索，可与请求类型筛选组合使用
- 面板全屏 / 半屏切换，扩大拖动把手触摸范围
- 浅色 / 深色 / 跟随系统
- Shadow DOM 隔离页面样式
- 无运行时依赖

## 安装

包名为 `@geekgravity/gravscope`。也可以运行 `npm run build` 和 `npm pack`，安装生成的 tgz 文件进行本地验证。

```bash
npm install @geekgravity/gravscope
```

```ts
import GravScope from '@geekgravity/gravscope';

const gc = new GravScope();
console.log('Hello GravScope');

// 调试结束后移除面板并恢复 console / fetch / XHR
gc.destroy();
```

用 script 标签引入构建好的 `dist/gravscope.iife.js`：

```html
<script src="./dist/gravscope.iife.js"></script>
<script>
  var gc = new GravScope({ lang: 'zh' });
</script>
```

全局名是 `GravScope`。自定义插件类在 `GravScope.Plugin`。

只在开发或测试环境启用。命令行会执行任意脚本，不要把它默认打进面向用户的生产包。

## 采集边界与稳定性

- 销毁时只恢复仍由 GravScope 持有的 console、fetch、XHR 和 sendBeacon 包装，不覆盖后来安装的包装；保留在其他工具调用链里的旧包装停止采集。
- fetch 预览失败不会改变原请求的成功或失败结果；销毁后，未完成请求不再更新面板。
- fetch 响应预览最多读取约 100 KB，截断时体积是已采样字节数，不能视为完整响应大小。SSE 不读取响应体。缺少流读取能力的浏览器仅尝试预览已知大小的小响应。
- 日志和网络记录数量由配置上限限制。自动测试覆盖连续写入 10,000 条日志后的容量约束，但这不代表已完成浏览器长时间性能或真机验证。
- 初始化失败会清理已安装的采集和界面，允许重新创建实例。

## 配置

```ts
const gc = new GravScope({
  theme: 'auto', // 'light' | 'dark' | 'auto'
  lang: 'zh', // 默认跟随浏览器语言
  defaultPlugins: ['system', 'network', 'element', 'storage'],
  maxLogNumber: 1000,
  maxNetworkNumber: 200,
  entryButton: true,
  exportEnabled: true,
  onReady() {
    console.log('GravScope ready');
  },
});
```

所有初始化参数均可省略，`new GravScope()` 即使用默认配置。初始化后默认收起面板，采集已经开始。

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `theme` | `'light' / 'dark' / 'auto'` | `'auto'` | 面板主题；auto 跟随系统配色变化。 |
| `lang` | `'zh' / 'en'` | `自动检测 / Auto-detect` | 读取 navigator.language，以 zh 开头时用中文，其余用英文。 |
| `defaultPlugins` | `BuiltinPlugin[]` | `['network', 'element', 'storage', 'system']` | 按数组顺序添加网络、元素、存储、系统面板；重复项去重，未知项忽略。日志面板始终包含，传 [] 只保留日志面板。 |
| `maxLogNumber` | `number` | `1000` | 保留的日志记录数上限，超出后淘汰最早记录；不是字节大小限制。 |
| `maxNetworkNumber` | `number` | `200` | 保留的网络请求记录数上限，超出后淘汰最早记录。 |
| `entryButton` | `boolean` | `true` | 是否显示悬浮入口。false 时仍可通过实例的 show() 或 showTab() 打开。 |
| `exportEnabled` | `boolean` | `true` | 是否显示日志工具栏的导出入口。false 同时隐藏报告预览内的复制与下载入口；getReport() 仍可调用，日志自身的复制工具不受影响。 |
| `target` | `HTMLElement / string / null` | `null → document.body` | 挂载节点或 CSS 选择器。挂载时选择器必须匹配 HTMLElement，否则报错；省略或传 null 使用 body。 |
| `onReady` | `() => void` | `undefined` | 界面挂载完成后执行一次，无参数；不代表页面资源或请求加载完成。 |

两个数量上限建议传正整数。初始化时小数向下取整（最终至少 1）；0、负数、NaN、Infinity 或非数字会回退到各自默认值。减少上限会立即淘汰超量的旧记录。

`defaultPlugins` 只选择面板，不关闭底层网络采集；`entryButton: false`、`exportEnabled: false` 和 `hide()` 也不停止采集。调试结束使用 `destroy()` 释放实例持有的采集钩子。同一时间只允许一个实例，可通过 `GravScope.current` 访问。

### 自定义入口与导出开关

```ts
const gc = new GravScope({
  lang: 'zh',
  defaultPlugins: ['network', 'system'],
  entryButton: false,
  exportEnabled: false,
});
// 在你自己的调试按钮点击事件中调用：
gc.show();
// 也可以直接切到某个已启用的面板：
gc.showTab('network');
```

### 挂载节点与就绪回调

```ts
// 页面中先准备好 <div id="debug-root"></div>
const gc = new GravScope({
  target: '#debug-root', // 也可直接传 HTMLElement
  onReady() {
    GravScope.current?.show();
  },
});
```

`target` 控制挂载位置，面板仍按浮层布局，不会变成容器内的普通内容。默认挂载到 body 时，若 body 尚未出现，会等待 DOMContentLoaded。

**`onReady` 可能在构造函数返回之前同步执行。** 不要在上例回调中使用尚未赋值完成的 `gc`；使用 `GravScope.current`。回调抛出的异常会记入日志。

### 初始化后修改配置

`setOption()` 当前仅支持 `theme`、`maxLogNumber`、`maxNetworkNumber`、`entryButton`。语言、挂载节点与导出开关需 `destroy()` 后重新初始化，旧记录不会保留。插件可使用 `addPlugin()` / `removePlugin()` 管理。

## API 方法

以下示例假设已创建 `const panel = new GravScope()`。方法都是同步 API；`void` 表示没有返回值，不支持链式调用，也不返回 Promise。

### `show()`

参数：无。

返回值：`void`。

打开面板并清除未读数量，不清空日志。

```ts
panel.show();
```

### `hide()`

参数：无。

返回值：`void`。

收起面板；采集继续进行。

```ts
panel.hide();
```

### `showTab(id)`

参数：id: string，已添加的面板 ID。

返回值：`void`。

切换并打开面板。内置 ID 为 log、network、element、storage、system；自定义面板用 plugin.id。ID 不存在时保留当前标签，但仍打开面板。

```ts
panel.showTab('network');
```

### `setOption(key, value)`

参数：key: 'theme'，value: 'light' / 'dark' / 'auto'；或 key: 'maxLogNumber' / 'maxNetworkNumber'，value: number。 或 key: 'entryButton'，value: boolean。

返回值：`void`。

即时修改主题、容量或悬浮入口。运行时容量向下取整并至少为 1；非有限值忽略（不同于初始化回退默认值）。非法主题忽略。仅支持列出的四个 key；调低容量立即淘汰旧记录。entryButton 的运行时修改从 0.1.2 开始支持。false 立即隐藏悬浮按钮；true 在面板收起时显示按钮，面板打开时仍隐藏。设置不会收起面板或停止采集，非布尔值忽略。

```ts
panel.setOption('theme', 'dark');
panel.setOption('maxLogNumber', 500);
panel.setOption('maxNetworkNumber', 100);
// 隐藏 / 恢复悬浮入口
panel.setOption('entryButton', false);
panel.setOption('entryButton', true);
```

### `setSystemInfo(key, value)`

参数：key: string，信息名称；value: string，显示内容。

返回值：`void`。

添加或覆盖同名自定义系统信息，进入报告的 custom 字段；不需要先打开系统面板。

```ts
panel.setSystemInfo('Build', '2026.11.04');
panel.setSystemInfo('Environment', 'staging');
```

### `getReport(options?)`

参数：options?: ReportOptions，默认 {}；字段见下表。

返回值：`DiagnosticReport`。

同步返回脱敏快照，不下载、不上传，也不打开报告窗口。exportEnabled 为 false 时仍可调用。since 非有限或小于 0 时抛出错误。

```ts
const report = panel.getReport({
  since: Date.now() - 5 * 60 * 1000,
  includeBodies: false,
});
const json = JSON.stringify(report, null, 2);
```

### `addPlugin(plugin)`

参数：plugin: GravScopePlugin，已经配置事件和工具的插件实例。

返回值：`void`。

添加标签并同步触发 init、render。ID 必须唯一，与现有内置或自定义插件重名会抛错。添加后不会自动切换过去。

```ts
const plugin = new GravScope.Plugin('build', 'Build');
plugin.on('render', element => {
  element.textContent = 'Build 2026.11.04';
});
panel.addPlugin(plugin);
panel.showTab('build');
```

### `removePlugin(id)`

参数：id: string，要移除的插件 ID。

返回值：`void`。

触发 remove 并移除标签；ID 不存在则不操作。移除当前标签会切换到第一个剩余标签。插件 remove 回调抛错时仍移除标签，但异常会传给调用方。移除网络标签不停止网络采集。

```ts
panel.removePlugin('build');
```

### `destroy()`

参数：无。

返回值：`void`。

移除界面，触发插件 remove，释放实例持有的采集钩子与监听，清空 GravScope.current。可重复调用；插件清理异常不会阻断销毁。实例不可重新启用，需要 new 创建新实例。

```ts
panel.destroy();
const nextPanel = new GravScope();
```

### `getReport` 参数与返回结构

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `since` | `number` | `0` | Unix 毫秒时间戳，包含该时刻及之后的日志与请求（按请求开始时间）；不是秒，也不是持续时长。 |
| `includeBodies` | `boolean` | `false` | 是否包含已采集的请求体与响应体；仍受采集截断和脱敏限制，不会补抓此前未采集的内容。 |

| 返回字段 | 类型 | 说明 |
| --- | --- | --- |
| `schemaVersion` | `1` | 报告结构版本。 |
| `version` | `string` | GravScope 库版本。 |
| `createdAt` | `string` | 生成时间，ISO 8601 字符串。 |
| `page` | `string` | 脱敏后的当前页面 URL。 |
| `device` | `{ userAgent: string; language: string; viewport: string }` | 浏览器、语言与视口信息。 |
| `custom` | `unknown` | 脱敏后的自定义系统信息。 |
| `logs` | `unknown[]` | 符合时间范围且仍保留的日志。 |
| `network` | `unknown[]` | 符合时间范围且仍保留的请求。 |
| `policy` | `string` | 采集和脱敏边界说明。 |

`custom`、`logs`、`network` 的内容经过脱敏与截断，使用时先校验结构；不要当作原始对象。请在 `destroy()` 前取得报告。

### 公开属性

| 属性 | 类型与用途 | 示例 |
| --- | --- | --- |
| `GravScope.current` | `GravScope / null` — 当前实例；未初始化或销毁后为 null，只读取，不手动赋值。 | `GravScope.current?.show()` |
| `GravScope.version` / `panel.version` | `string` — 只读库版本。 | `console.log(GravScope.version)` |
| `GravScope.Plugin` | `typeof GravScopePlugin` — 插件构造函数，CDN 接入也可用。 | `new GravScope.Plugin('build', 'Build')` |

## 导出问题现场

初始化传入 `exportEnabled: false` 可隐藏导出入口，默认 `true`。该选项只控制界面，`getReport()` 仍可调用。

打开日志面板，点击底部「导出」。点击「复制报告」复制当前预览的脱敏 JSON；自动复制失败时会选中文本，也可使用「全选文本」后长按手动复制。可以选择全部已保留记录或最近 5 分钟，预览后保存：

- **离线 HTML**：在电脑浏览器中打开，按条展开日志和网络详情；不需要部署服务，也不加载外部资源或执行报告数据。
- **JSON**：便于自行归档或接入其他排查工具。下载受限的浏览器可以手动复制预览内容。

默认不含请求体、响应体、本地存储和命令源码。勾选后可以包含请求体与响应体。常见密码、Token、Cookie、Authorization 等字段会遮蔽，URL 查询参数值和片段会遮蔽。自动规则不保证识别所有业务敏感内容，分享前请检查预览。

报告是当前已采集、尚未被容量上限淘汰的记录快照，不是页面录制或完整历史。对象参数取导出时的值；为避免副作用不读取 getter。单个字符串、对象深度及属性数量有限制，超长字符串会标记截断。

```ts
const report = gc.getReport({
  since: Date.now() - 5 * 60 * 1000, // 可省略，Unix 毫秒时间戳
  includeBodies: false, // 默认 false
});
// report 是已脱敏的普通数据，可自行保存 JSON.stringify(report)。
```

## 自定义插件

```ts
import { GravScopePlugin } from '@geekgravity/gravscope';

const plugin = new GravScopePlugin('custom', '自定义');
plugin
  .on('render', (element) => {
    element.textContent = '自定义面板';
  })
  .on('show', () => {
    console.log('custom tab visible');
  })
  .addTool('刷新', () => {
    console.log('refresh');
  });

gc.addPlugin(plugin);
```

### 插件 API

#### `new GravScopePlugin(id, name)`

参数与行为：id: string，非空唯一标识；name: string，标签名称，空字符串时使用 id。

返回值：`GravScopePlugin`.

```ts
const plugin = new GravScope.Plugin('build', 'Build');
```

#### `on(event, handler)`

参数与行为：event 为下表事件名；handler 为对应回调。添加监听，不覆盖已有回调。

返回值：`this`；`this` 支持链式调用。

```ts
plugin.on('render', element => { element.textContent = 'Ready'; });
```

#### `addTool(name, onClick)`

参数与行为：name: string，按钮文字；onClick: () => void，点击回调，无参数。

返回值：`this`；`this` 支持链式调用。

```ts
plugin.addTool('Refresh', () => console.info('Refresh requested'));
```

#### `getTools()`

参数与行为：无。返回工具数组的浅拷贝；按钮对象本身仍共享，不应修改它们。

返回值：`Array<{ name: string; onClick: () => void }>`.

```ts
const labels = plugin.getTools().map(tool => tool.name);
```

#### `emit(event, ...args)`

参数与行为：event 为事件名；render 需要 HTMLElement，其余无参数。同步按注册顺序执行，回调抛错会中断并向外传播。通常由面板调度，手动调用不会切换 UI。

返回值：`void`.

```ts
// Manual handler invocation only; does not open the tab.
plugin.emit('show');
```

| 事件 | 回调签名 | 时机 |
| --- | --- | --- |
| `init` | `() => void` | 插件添加时执行，先于 render。 |
| `render` | `(element: HTMLElement) => void` | 插件添加时执行，用 element 填充面板内容。 |
| `show` | `() => void` | 标签激活或面板 show 时触发；可能重复触发，不保证只在真正可见时执行。 |
| `hide` | `() => void` | 切换离开当前标签或调用 hide 时触发；可能重复。 |
| `remove` | `() => void` | removePlugin 或 destroy 时清理定时器、事件等自有资源。 |

请在 `addPlugin()` 前注册事件和工具。工具栏在标签激活时读取工具列表，追加工具不会即时重绘当前工具栏。`id`、`name` 为只读字符串；空 id 构造时抛错。没有 `off()` API，插件自行创建的监听和定时器应在 `remove` 中清理。


日志工具栏提供「刷新页面」，执行普通刷新，当前内存日志会重置。发布包保留 `.map` 文件，但不再自动请求；需要调试库源码时可手动加载对应映射。

## 本地开发

```bash
npm install
npm run dev
npm test
npm run build
```

`npm run dev` 打开演示页。屏幕中线偏下的 GravScope 按钮展开面板。按钮可以拖动，松手后贴到较近的左右边缘，收成 44px 的图标按钮并变淡，再往屏幕外收起一小截。贴边后再点一下只把按钮展开，再点一次才打开面板。

构建产物：

- `dist/gravscope.modern.js`、`dist/gravscope.modern.cjs`、`dist/gravscope.modern.iife.js`：ES2020，不带 `core-js` 和 `regenerator`
- `dist/gravscope.js`、`dist/gravscope.cjs`、`dist/gravscope.iife.js`：ES5，带语言 polyfill，给老 WebView
- `dist/index.d.ts`：类型

现代包从 `@geekgravity/gravscope/modern` 引入。默认的 `@geekgravity/gravscope` 仍是带 polyfill 的 ES5 包。

```ts
import GravScope from '@geekgravity/gravscope/modern';
```

```html
<script src="./dist/gravscope.modern.iife.js"></script>
```

ES5 包的语法是 `var` 和 `function`，并带上 `Promise`、`Map`、`Object.assign` 这类语言 polyfill。`ParentNode.append`、`replaceChildren`、`ChildNode.remove` 在缺失时会就地补上。现代包不包含这些补丁。

页面仍然需要 Shadow DOM、CSS 变量等浏览器能力。ES5 语法检查通过不等于旧 WebView 可用；目前尚未完成 iOS、Android 和微信内置浏览器的真机兼容性验收。开发环境建议 Node.js 22.12+。

## CDN

jsDelivr (pinned version / 固定版本):

```html
<script src="https://cdn.jsdelivr.net/npm/@geekgravity/gravscope@0.1.2/dist/gravscope.modern.iife.js"></script>
<script>const panel = new GravScope();</script>
```

[UNPKG fallback / 备用地址](https://unpkg.com/@geekgravity/gravscope@0.1.2/dist/gravscope.modern.iife.js).
