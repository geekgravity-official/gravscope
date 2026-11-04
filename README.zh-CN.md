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
  defaultPlugins: ['system', 'network', 'errors', 'element', 'storage'],
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
| `defaultPlugins` | `BuiltinPlugin[]` | `['network', 'errors', 'element', 'storage', 'system', 'timeline', 'performance', 'streams']` | 按数组顺序添加面板；异常、时间线、性能与实时连接从 0.2.0 提供；重复项去重，未知项忽略。日志面板始终包含，传 [] 只保留日志面板。 |
| `capture` | `Partial<CaptureOptions>` | `{ console: true, network: true, error: true, navigation: true, performance: true, realtime: true }` | 0.2.0：独立控制采集通道，支持运行时部分更新。 |
| `preserveLogs` | `boolean` | `false` | 0.2.0：刷新后保留脱敏日志；省略时沿用会话开关，详见下文。 |
| `maxLogNumber` | `number` | `1000` | 保留的日志记录数上限，超出后淘汰最早记录；不是字节大小限制。 |
| `maxNetworkNumber` | `number` | `200` | 保留的网络请求记录数上限，超出后淘汰最早记录。 |
| `entryButton` | `boolean` | `true` | 是否显示悬浮入口。false 时仍可通过实例的 show() 或 showTab() 打开。 |
| `exportEnabled` | `boolean` | `true` | 是否显示日志工具栏的导出入口。false 同时隐藏报告预览内的复制与下载入口；getReport() 仍可调用，日志自身的复制工具不受影响。 |
| `target` | `HTMLElement / string / null` | `null → document.body` | 挂载节点或 CSS 选择器。挂载时选择器必须匹配 HTMLElement，否则报错；省略或传 null 使用 body。 |
| `networkIgnore` | `string[]` | `[]` | 0.2.0：按 URL 子串排除后续请求和新实时连接，区分大小写；支持 setOption 替换。 |
| `redactKeys` | `string[]` | `[]` | 0.2.0：追加自定义敏感字段，作用于报告和历史存档；支持 setOption 替换。 |
| `onExport` | `(file: ExportFile) => void \| Promise<void>` | `undefined` | 0.2.0：接管 HTML/JSON 保存；未配置时维持浏览器下载。仅初始化配置，详见下文。 |
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

`setOption()` 当前仅支持 `theme`、`maxLogNumber`、`maxNetworkNumber`、`entryButton`、`preserveLogs`、`capture`、`networkIgnore`、`redactKeys`（0.2.0）。语言、挂载节点与导出开关需 `destroy()` 后重新初始化，默认不保留旧记录；开启 preserveLogs 后可恢复受容量限制的历史快照。插件可使用 `addPlugin()` / `removePlugin()` 管理。

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

切换并打开面板。内置 ID 为 log、network、errors（0.2.0）、element、storage、system、timeline、performance、streams；自定义面板用 plugin.id。ID 不存在时保留当前标签，但仍打开面板。

```ts
panel.showTab('network');
```

### `setOption(key, value)`

参数：key: 'theme'，value: 'light' / 'dark' / 'auto'；或 key: 'maxLogNumber' / 'maxNetworkNumber'，value: number。 或 key: 'entryButton' / 'preserveLogs'，value: boolean；或 key: 'capture'，value: Partial<CaptureOptions>；或 key: 'networkIgnore' / 'redactKeys'，value: string[]。新增诊断配置从 0.2.0 提供。

返回值：`void`。

即时修改主题、容量或悬浮入口。运行时容量向下取整并至少为 1；非有限值忽略（不同于初始化回退默认值）。非法主题忽略。还支持 preserveLogs（boolean）与 capture（Partial<CaptureOptions>），从 0.2.0 提供；仅支持文档列出的 key；调低容量立即淘汰旧记录。entryButton 的运行时修改从 0.1.2 开始支持。false 立即隐藏悬浮按钮；true 在面板收起时显示按钮，面板打开时仍隐藏。修改 entryButton 不会收起面板或停止采集；它的非布尔值忽略。

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

同步返回脱敏快照，不下载、不上传，也不打开报告窗口。exportEnabled 为 false 时仍可调用。since 非有限或小于 0、报告超过 5 MiB、或筛选后日志/请求各超过 10000 条时抛出错误。

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
| `redactKeys` | `string[]` | `[]` | 0.2.0：为本次报告追加敏感字段，不移除初始化规则；不修改实例配置。 |
| `includeBodies` | `boolean` | `false` | 是否包含已采集的请求体、响应体和实时消息内容；仍受采集截断和脱敏限制，不会补抓此前未采集的内容。 |

| 返回字段 | 类型 | 说明 |
| --- | --- | --- |
| `schemaVersion` | `1` | 报告结构版本。 |
| `version` | `string` | GravScope 库版本。 |
| `createdAt` | `string` | 生成时间，ISO 8601 字符串。 |
| `page` | `string` | 脱敏后的当前页面 URL。 |
| `device` | `{ userAgent: string; language: string; viewport: string }` | 浏览器、语言与视口信息。 |
| `custom` | `unknown` | 脱敏后的自定义系统信息。 |
| `logs` | `unknown[]` | 符合时间范围且仍保留的日志。 |
| `activity` | `unknown[]`（可选） | 0.2.0：时间范围内保留的导航、长任务和实时连接活动；旧报告可不含此字段。 |
| `network` | `unknown[]` | 符合时间范围且仍保留的请求。 |
| `policy` | `string` | 采集和脱敏边界说明。 |

`custom`、`logs`、`network` 的内容经过脱敏与截断，使用时先校验结构；不要当作原始对象。请在 `destroy()` 前取得报告。

### 公开属性

| 属性 | 类型与用途 | 示例 |
| --- | --- | --- |
| `GravScope.current` | `GravScope / null` — 当前实例；未初始化或销毁后为 null，只读取，不手动赋值。 | `GravScope.current?.show()` |
| `GravScope.version` / `panel.version` | `string` — 只读库版本。 | `console.log(GravScope.version)` |
| `GravScope.Plugin` | `typeof GravScopePlugin` — 插件构造函数，CDN 接入也可用。 | `new GravScope.Plugin('build', 'Build')` |

## 刷新后保留日志（0.2.0）

在日志筛选栏勾选「保留日志」，或使用初始化参数 / 运行时 API：

```ts
const panel = new GravScope({ preserveLogs: true });
panel.setOption('preserveLogs', false); // 停止保存并删除会话存档
panel.setOption('preserveLogs', true);  // 保存当前保留的日志及之后的新记录
```

默认关闭；省略参数时会沿用当前标签页会话中上次的开关状态。显式传 `false` 会关闭并删除存档。隐藏面板不会关闭保存，`destroy()` 会保存最后快照并移除监听。

- 使用同源 `sessionStorage`，用于同一标签页内的刷新或页面跳转；不使用 localStorage。浏览器恢复会话或复制标签页时可能保留 / 复制 sessionStorage，以浏览器实际行为为准。
- 最多保存最近 200 条，且受 `maxLogNumber` 约束；存储 JSON 最多 131072 个 UTF-16 码元（约 256 KiB）。超限淘汰最早记录，单条超大记录也可能被淘汰。
- 日志与错误作为脱敏的静态快照保存，不保存命令源码，不保存网络请求或本地存储。脱敏仍是启发式规则，不保证覆盖任意敏感业务文本。
- 恢复后保留原始时间、分组关系和折叠状态，标记「历史」，并插入新页面会话分隔。新日志不会继承上一次的未结束分组。
- 「清空」/ `console.clear()` 会删除当前日志及保存内容，开关偏好保留。关闭「保留日志」删除存档，不清空面板当前日志。
- 保存合并间隔为 150ms，页面隐藏、pagehide、工具栏刷新和销毁时会刷新快照。系统强杀可能丢失最后尚未保存的记录；存储禁用或配额不足时无法保证恢复，但不会中断页面采集。

## 调试流程增强（0.2.0）

这一组功能从 0.2.0 提供。

### 网络筛选与复制

网络列表可组合 URL 搜索、全部/请求/静态资源/失败分类、请求方法和状态筛选。状态框支持精确值（如 `404`）、状态段（如 `4xx`）与 `pending`。详情中的 URL、请求头、请求体、响应头、响应体可单独复制；cURL 按 POSIX shell 规则引用参数，只支持 HTTP(S)。cURL 使用已采集数据，可能含凭证，不保证重现二进制、流和截断请求。

### 暂停滚动与异常面板

日志工具栏「暂停滚动」固定阅读位置，但继续采集；「新增 N 条 · 回到底部」或「最新」恢复跟随。重复日志更新也计入新增提示；手动向上滚动同样停止自动跟随。

默认新增 `errors` 异常面板，集中查看 JavaScript 异常、未处理的 Promise 拒绝、资源加载失败和 console.error。按来源与完整文本聚合重复异常，可搜索、筛选来源和复制堆栈。「清空异常」也会从日志中移除这些错误，普通日志保留；异常受 `maxLogNumber` 的共享容量约束，不是独立无限历史。 异常按每页 100 组展示，搜索覆盖全部保留异常；大量记录时合并刷新，同页仍保留的堆栈不会因新错误到来而自动收起。翻页或筛选导致卡片离开当前页时，展开状态会重置。

```ts
panel.showTab('errors');
```

### 独立控制采集

通过日志工具栏「采集设置」控制三个通道，或使用 API：

```ts
const panel = new GravScope({
  capture: { console: true, network: false, error: true },
});
panel.setOption('capture', { network: true }); // 只修改指定通道
panel.setOption('capture', { console: false, error: false });
```

`capture` 的类型是 `Partial<CaptureOptions>`，`console`、`network`、`error`、`navigation`、`performance`、`realtime` 均为 boolean，默认全部 true。运行时以部分更新合并，未提供的通道保持原状，非布尔值忽略；返回 void。

关闭采集保留现有记录并释放对应钩子；关闭网络采集不取消页面请求，尚未完成的诊断记录标记为 Capture stopped。重新开启后记录新活动，不补采停用期间的日志或请求。console.error 属于 console 通道；全局异常、Promise 拒绝和资源加载异常属于 error 通道。网络失败记录与 error 通道独立。关闭 Console 后工具栏「清空」仍可用，但页面的 console.clear() 不再驱动面板清空。开关不跨刷新保存，与 preserveLogs 独立。

### 报告导入回放

官网「报告回放」支持选择或拖入 schemaVersion 为 1 的 JSON 报告。在本地按日志、异常、请求和活动分类搜索，保留日志分组关系；仅只读查看，不执行代码、重发请求或上传文件。文件最大 5 MB，日志和请求各最多 10000 条，活动最多 1000 条，每次显示 100 条，可继续加载；单条详情预览最多 20000 字符。清除或关闭页面后释放内存，导入失败会清除上一次显示，避免混淆。导入器兼容 0.1.2 导出的报告，包括组标题被容量裁剪掉的记录。

## 导出问题现场

初始化传入 `exportEnabled: false` 可隐藏导出入口，默认 `true`。该选项只控制界面，`getReport()` 仍可调用。

打开日志面板，点击底部「更多 → 导出」。点击「复制报告」复制当前预览的脱敏 JSON；自动复制失败时会选中文本，也可使用「全选文本」后长按手动复制。可以选择全部已保留记录或最近 5 分钟，预览后保存：

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

#### `addTool(name, onClick, options?)`

参数与行为：name: string，按钮文字；onClick: () => void，点击回调，无参数。options?: { placement?: 'primary' | 'more' }，默认为主操作，more 放入更多菜单（0.2.0）。

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

## 工具栏与大量日志（0.2.0）

日志工具栏固定显示「清空、暂停滚动、最新」，复制、Console、导出、刷新页面和采集设置放入「更多」。点击菜单外或按 Escape 可收起；从菜单执行操作后也会自动收起。

超过 200 条保留记录时采用分段渲染：每页 200 条，额外最多 100 条分组上下文，使用「更早记录 / 更新记录」翻页。追加日志会合并为约 16ms 一次的界面更新；这不是固定行高的连续虚拟滚动。暂停/翻到旧记录时保持当前页，「最新」返回末页。对象展开状态在节点仍处于当前窗口时保留，离开窗口再返回会重建。

搜索作用于全部保留日志，不只当前页；复制遵守当前筛选和折叠规则，覆盖所有匹配记录。`maxLogNumber` 控制数据保留量，分段显示不会删除数据。DOM 模拟覆盖 10000 条记录；实际手机滚动、帧率和内存仍需按[移动端验收记录](docs/mobile-validation.md)验证。

自定义插件可以把次要操作放入更多菜单；未指定时优先显示，最多三个主按钮，其余自动折叠：

```ts
plugin.addTool('次要操作', () => console.info('action'), { placement: 'more' });
```

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
<script src="https://cdn.jsdelivr.net/npm/@geekgravity/gravscope@0.2.1/dist/gravscope.modern.iife.js"></script>
<script>const panel = new GravScope();</script>
```

[UNPKG fallback / 备用地址](https://unpkg.com/@geekgravity/gravscope@0.2.1/dist/gravscope.modern.iife.js).

## 新增诊断与导出接入（0.2.0）

新增 `timeline`、`performance`、`streams` 默认面板；异常可定位前后各 30 秒的日志、请求与路由。网络每页 100 条，存储支持搜索和 JSON 校验编辑。性能面板提供慢请求/大小排行与受浏览器支持限制的长任务记录；实时面板观察新 WebSocket/EventSource 连接。

完整配置、运行时更新、数据上限和不覆盖的场景见 [增强调试说明](docs/diagnostics.md)。`setOption('networkIgnore', string[])` 与 `setOption('redactKeys', string[])` 返回 void，替换各自规则数组；不是追加。

### onExport 文件导出回调

```js
new GravScope({
  onExport: async ({ requestId, filename, mimeType, format, content }) => {
    // appBridge 是宿主自行实现的桥接层，须提供 Promise 完成/失败回执。
    await window.appBridge.saveDiagnosticFile({ requestId, filename, mimeType, content });
  },
});
```

`requestId` 为本次接管编号，可用于关联原生回执；`filename` 已带 `.html` / `.json`；`mimeType` 分别为 `text/html;charset=utf-8` / `application/json;charset=utf-8`；`format` 为 `html` / `json`；`content` 为脱敏后的文本，不是文件路径。原生按 UTF-8 保存或分享。

配置回调后不再自动下载。支持同步 void 或 Promise<void>；抛错/拒绝时显示失败并可重试，不自动回退下载。实例级任务等待期间禁用两个导出按钮，关闭再打开仍然防重复；30 秒后显示等待提示。确认取消等待仅解除组件等待，不取消原生操作，再次导出可能重复。迟到回执不会覆盖新任务。`getReport()`、复制和全选文本不触发回调；`exportEnabled: false` 隐藏导出入口。文件后缀不能替代 WebView 的下载实现。

查看 [onExport 完整接入协议、原生回执和上传说明](docs/export-integration.md)。

### 清空与可靠性（0.2.0）

`panel.clearAll()` 无参数，返回 void：清空日志、请求、活动、自定义系统信息和历史日志存档内容，并关闭旧报告预览；保留采集/历史开关与业务存储，不关闭业务连接，不取消已交给原生的导出。更多菜单入口先确认；API 直接执行，destroy 后调用无操作。原来各面板的清空按钮仍只清空对应记录。

报告预览显示 JSON 的 UTF-8 字节大小，导出上限 5 MiB；HTML 转义后单独检查实际体积。getReport() 超限抛出 name 为 ReportLimitError 的错误，界面提示缩小时间范围、排除正文或清理后重试，不静默截断、不发送部分报告。

采集初始化失败按通道回滚和降级，「采集设置」显示失败原因并允许重新勾选重试；挂载节点等基础配置错误仍会阻止初始化。日志界面提示对象是引用，展开/导出值可能变化。参见 [详细协议](docs/export-integration.md)。

### 采集状态与发布前检查（0.2.0）

`panel.getCaptureStatus(): CaptureStatusMap` 无参数，返回六个通道的独立状态副本：每项包含 `enabled: boolean`、`state: 'enabled' | 'disabled' | 'unavailable' | 'failed'` 和本地化 `detail: string`。修改返回值不会修改采集设置；destroy 后 enabled 均为 false。unavailable 表示当前环境缺少支持，failed 表示接口接管/订阅失败，可用 setOption('capture', {...}) 重试。

各诊断面板显示相关通道的采集中/停用/不支持/失败状态，采集设置提供覆盖范围说明。实时面板明确只观察新建连接；长任务 API 不支持时不会显示成正在采集。状态不代表所有浏览器请求、worker 或其他 frame 都可见。

```js
const status = panel.getCaptureStatus();
if (status.performance.state === 'unavailable') {
  // 没有长任务记录不代表页面没有卡顿。
}
```

`npm run check:release` 检查 package、lockfile、运行时版本以及网站 CDN 固定版本；发布前另执行严格模式，避免把未整理的增强误发布成旧版本。`npm run check:soak -- 1` 是 1 分钟合成持续采集与反复销毁检查，`npm run check:soak -- 30` 可运行 30 分钟。该检查需要先 build，使用 Node/happy-dom 与模拟连接，不能代替手机 WebView 或原生验收。

## iframe 使用边界（0.2.1）

每个实例只采集当前 window，面板受 iframe 边界限制，刷新只作用于当前框架。历史按固定框架结构的位置隔离；同源父子、兄弟、嵌套页面不共用存储键。动态增删、重排或复用位置仍可能恢复旧位置历史，这些场景暂不建议开启 preserveLogs。没有跨框架日志聚合。详见 [隔离范围与实测](docs/diagnostics.md)。

原生文件保存、分享和权限由接入方实现和验收。

## 基础页面性能报告（0.2.1）

性能面板和系统面板使用同一组导航/绘制指标：重定向、DNS、连接、TLS、请求/导航到首字节、文档下载、DOM 可交互、DOMContentLoaded、Load、FP/FCP，以及文档传输/压缩/解压大小。性能面板可搜索与复制，JSON/HTML 报告和本地回放均包含 performance 字段。

```js
const report = panel.getReport();
const load = report.performance?.metrics.load;
if (load?.state === 'available') console.log(load.value, load.unit);
```

每项为 `{ value: number | null, unit: 'ms' | 'bytes', state: 'available' | 'pending' | 'unavailable' }`。0 是有效观测值，不支持或未提供时为 null。Load 不等于业务就绪；当前文档数据不代表 SPA 路由耗时或 BFCache 恢复耗时。本轮不提供标准 LCP/CLS/INP 评分。完整字段、采集开关与清空语义见 [性能说明](docs/diagnostics.md)。
