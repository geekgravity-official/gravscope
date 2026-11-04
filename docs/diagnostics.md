# 增强调试功能（0.2.0）

以下功能从 0.2.0 提供。新增默认面板为 `timeline`、`performance`、`streams`，可通过 `defaultPlugins` 选择；隐藏面板不等于关闭采集。

## 初始化和运行时配置

```js
const panel = new GravScope({
  networkIgnore: ['/heartbeat', '/analytics'],
  redactKeys: ['phone', 'customerId'],
  capture: {
    console: true, network: true, error: true,
    navigation: true, performance: true, realtime: true,
  },
});
panel.setOption('networkIgnore', ['/heartbeat']); // 替换规则，仅影响后续记录/新连接
panel.setOption('redactKeys', ['phone', 'customerId']); // 替换自定义字段；内置脱敏仍有效
panel.setOption('capture', { realtime: false, performance: false }); // 部分更新
```

- `networkIgnore: string[]` 默认 `[]`。URL 包含任一字符串则不保留新请求；匹配区分大小写，非正则。已保留请求不删除，既有实时连接不重新筛选。最多 100 个规则，每个 1–100 个字符，其他输入忽略。不会阻止业务请求、修改请求参数或改变响应。不要把它当成访问控制或阻断网络请求的机制。
- `redactKeys: string[]` 默认 `[]`。对象/JSON 字段按完整名称匹配，忽略大小写；纯文本中按 `字段=值` 或 `字段:值` 形式尽力识别。不支持任意业务文本语义识别。规则数量/长度同上。作用于导出和历史持久化，不修改页面对象或面板原始记录。运行时修改会重写已启用的历史存档。
- `getReport({ redactKeys: ['extraField'] })` 可为单次导出追加规则，不会移除初始化规则。`includeBodies` 同时控制请求/响应正文和实时消息内容。
- `capture` 六个字段均为 boolean，默认 true；运行时只更新提供的字段。`navigation` 控制当前页面与 SPA 路由记录，`performance` 控制长任务观察，`realtime` 控制新 WebSocket/EventSource 连接。关闭不删除已有数据、不关闭业务连接；重新开启只观察新连接。

## 时间线

合并日志、网络请求、SPA 页面跳转、长任务与实时连接事件。异常卡片「查看前后记录」定位到该异常前后各 30 秒；时间邻近仅提供线索，不推断因果。搜索与复制覆盖当前时间范围内全部保留记录，每页最多 100 条。可清除时间范围、翻页或刷新。

页面跳转包含当前 URL、`pushState` / `replaceState`、`popstate` / `hashchange`；不包含用户点击轨迹或 DOM 录像。整页刷新后仅在开启日志保留时恢复日志，不恢复请求、实时消息或长任务。

## 网络列表

每页最多 100 条，过滤覆盖全部保留请求；大量记录按 16 ms 合并更新。翻到更早记录时固定起始记录，新请求不会把该页替换成最新页；容量裁剪仍会淘汰旧记录。详情更新保留滚动位置，详情对应记录被淘汰时返回列表。

## 存储

Cookie、localStorage、sessionStorage 支持搜索键和值。编辑为多行文本，识别有效 JSON 后默认开启校验，支持格式化；仅点击保存才写入，失焦不提交。校验失败保留编辑内容并提示错误。取消不写入，删除需确认。原有 Cookie 的 HttpOnly/域/路径等浏览器限制仍然适用。

## 性能

汇总保留请求中耗时至少 1000 ms 的慢请求（按耗时取前 50），以及有已知大小的资源/响应（按字节数取前 50）。大小是浏览器可观察的预览字节或资源统计，不保证等于传输字节。正在等待响应的请求不纳入慢请求排行。

长任务使用浏览器支持的 PerformanceObserver `longtask`，不支持时不会伪造数据；只记录开启后的活动，可能包含调试面板自身开销。此面板不等同于完整性能剖析器，也不提供准确的 FPS、内存或跨域完整网络时序。

## WebSocket / SSE

- 观察初始化后新建的 WebSocket 和 EventSource；已有连接、worker、跨域 iframe、提前缓存的原生构造函数不在覆盖范围内。
- WebSocket 展示 connecting/open/send/receive/error/close。发送记录仅在原生 send 成功返回后产生。
- SSE 展示连接、默认 message、重连错误和关闭。业务通过被观察实例的 `addEventListener` 注册的命名事件也会记录，每条连接最多观察 100 种命名事件；未注册的命名事件不可见。
- 文本每条最多 2000 字符，二进制只记录大小，不读取或解码二进制内容。导航、长任务和实时消息共享最近 1000 条活动记录上限；列表每页 100 条。此上限独立于 maxLogNumber/maxNetworkNumber。
- 原生 EventSource 不暴露完整响应头/HTTP 状态，不能把 error 一律判断成服务器错误。
- 使用 fetch 读取的 SSE/自定义流仍仅显示普通网络元数据，不复制、缓冲或解析流正文。GravScope 不主动重连、不重发消息、不关闭业务连接。
- 关闭采集或 destroy 后释放观察器/实例监听，并仅恢复仍由组件持有的包装；不会覆盖业务后来替换的接口。

活动也会写入 JSON/HTML 报告，网站回放支持「活动 / 实时消息」视图。旧版报告没有 activity 字段也可读取。

## 验证边界

自动化测试覆盖 10000 请求下的 DOM 上限、规则更新、自定义脱敏、JSON 编辑失败、长任务观察器清理，以及模拟 WebSocket/EventSource 的发送、接收、命名事件和销毁行为。真实手机 WebView、原生桥接、长时间运行与视觉交互仍需按移动端清单验收。

## 可靠性与降级

- 初始化时某个采集通道的接口不允许包装，会回滚该通道已经安装的包装、保留其他可用通道和面板，并记录简短警告。「采集设置」显示停用原因，可重新启用重试。挂载目标等基础配置错误仍会导致初始化失败。
- 日志界面提示对象按引用保留，展开或导出看到的值可能已经改变；本次未引入记录时深拷贝模式，避免额外性能开销。
- 清空全部数据使用 `panel.clearAll()`，详情见导出接入文档；普通日志「清空」仍仅清空日志，网络「清空」仍仅清空请求。
- 全部导出受 5 MiB UTF-8 大小上限和回放记录上限约束，不会自动丢弃旧记录来凑大小。

## 采集状态

`getCaptureStatus()` 返回独立副本，每通道包含 enabled、state、detail；state 分为 enabled、disabled、unavailable、failed。未启用与环境不支持有明确区别。长任务 PerformanceObserver 的订阅失败会显示 failed 并可重试，不再用空操作假装采集中。面板状态栏与采集设置同步显示结果；实时通道列出实际存在的 WebSocket/EventSource 能力和仅新建连接的边界。

## iframe 基础隔离（0.2.1）

- 每个实例仍只采集自己的 window，不读取其他框架的 DOM、URL 或名称，不增加 postMessage 桥接，也不聚合父子日志。
- 顶层页面继续使用原历史键；iframe 根据从顶层到当前框架的零基位置路径分配独立存储键，例如 `[0, 1]`。同源父子、兄弟及嵌套框架不再共用同一个键。
- 位置在初始化时确定，结构固定时 iframe 自身刷新可以恢复对应历史；清空、关闭保留或配额失败只操作自己的键。无法解析路径时不读写历史，并在日志面板提示，当前采集与导出仍可用。
- **位置不是业务身份**：动态插入、删除、重排 iframe，或把同一位置替换成另一个页面时，历史可能对应旧位置；这些场景暂不建议开启 preserveLogs。此版本不写入 window.name、不修改宿主 iframe 属性。
- `getReport()` 新增可选 `frame: { type: 'top' | 'iframe' | 'unknown', path: number[] | null }`；HTML 环境区与报告回放显示同一字段。旧报告没有该字段仍可读取。
- sandbox 禁用脚本时无法运行组件；限制存储时无法保证历史恢复；面板仍受 iframe 边界裁切，刷新仅作用于所在 frame。

上述隔离从 0.2.1 提供。自动化使用受限窗口模型和 DOM 模拟；另已在 GeekGravity 的 iPhone 16 / iOS 18.6 模拟器 WKWebView 完成固定同源嵌套与不透明源 sandbox 实测，7 项通过，详见 [验收记录](mobile-validation.md)。普通跨域站点、动态重排和物理设备仍未验收。

## 基础页面性能（0.2.1）

浏览器 Navigation/Paint Timing 只读快照；范围为当前 document，不合并父子 iframe。指标从导航开始计时，requestTTFB 例外，从 requestStart 计时；各阶段会重叠，不能相加得到页面总时长。连接包含 TLS，TLS 是其中一段。

| 字段 | 定义 |
| --- | --- |
| redirect / dns / tcp / tls | 浏览器对应阶段的结束减开始；TLS 未提供时 null |
| requestTTFB | responseStart - requestStart |
| navigationTTFB | responseStart - startTime，包含请求前阶段 |
| download | responseEnd - responseStart，仅主文档 |
| domInteractive | domInteractive - startTime，不代表应用可交互 |
| domContentLoaded | domContentLoadedEventEnd - startTime |
| load | loadEventEnd - startTime，不代表异步业务加载结束 |
| fp / fcp | first-paint / first-contentful-paint 的 startTime |
| transferSize / encodedBodySize / decodedBodySize | 浏览器提供的主文档字节数；缓存、隐私或实现限制可导致 0 |

`report.performance` 为可选字段以兼容旧报告，含 scope: current-document、navigationType（navigate/reload/back_forward/prerender/null）和 metrics。每项 value 为数值或 null，unit 为 ms/bytes，state 为 available/pending/unavailable。没有可用数据不显示成 0。完成加载后未提供的绘制条目显示 unavailable；页面尚在加载且支持 paint 时显示 pending。

面板打开、点击刷新或收到 load/pageshow 时更新；getReport 每次读取新快照。读取基础计时不安装额外观察器、不上传数据。`capture.performance` 仍控制长任务采集，关闭后基础计时仍可读取，界面明确标记“长任务”。clearAll 清除采集记录，不调用 performance.clearResourceTimings，不删除浏览器计时；getReport 的 since 过滤记录，不过滤这份环境快照。SPA 导航不重置文档计时；BFCache 恢复仍展示原文档导航数据，不声称测量恢复速度。

本轮不提供标准 LCP/CLS/INP 评分，未将原始条目或最大事件耗时冒充 Core Web Vitals。后续如接入完整体验指标需处理生命周期、前后台、交互与页面恢复；可参考 [Google web-vitals](https://github.com/GoogleChrome/web-vitals)。
