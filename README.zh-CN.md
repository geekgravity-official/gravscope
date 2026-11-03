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

日志面板始终存在。`defaultPlugins` 决定另外四个内置面板。

## API

```ts
gc.show();
gc.hide();
gc.showTab('network');
gc.setOption('theme', 'dark');
gc.setOption('maxLogNumber', 500);
gc.setSystemInfo('User', 'ada');
gc.addPlugin(plugin);
gc.removePlugin('custom');
gc.destroy();

GravScope.version;
GravScope.current; // 当前实例，同一时间只能有一个
```

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

插件事件：`init`、`render`、`show`、`hide`、`remove`。

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
<script src="https://cdn.jsdelivr.net/npm/@geekgravity/gravscope@0.1.1/dist/gravscope.modern.iife.js"></script>
<script>const panel = new GravScope();</script>
```

[UNPKG fallback / 备用地址](https://unpkg.com/@geekgravity/gravscope@0.1.1/dist/gravscope.modern.iife.js).
