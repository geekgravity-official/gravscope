# 导出接管：onExport（0.2.0）

此回调从 0.2.0 提供。参数名为 **`onExport`**，大小写敏感。

## 普通网页：保留默认下载

```js
const panel = new GravScope({ exportEnabled: true });
```

点击「保存离线报告」或「JSON」时，组件生成带 `.html` / `.json` 后缀的文件，通过 Blob URL 和 `<a download>` 发起下载。无需配置回调。系统是否成功保存由浏览器或宿主决定，组件不能确认下载完成。把组件放在 HTML 中通过 script 加载，不会改变这些规则。

HTML 用于离线阅读；JSON 用于网站「报告回放」。复制报告始终复制 JSON；复制和手动选择文本不触发 `onExport`。

## App 内 WebView：交给业务桥接层

```js
const panel = new GravScope({
  exportEnabled: true,
  redactKeys: ['phone', 'customerId'],
  async onExport(file) {
    // appBridge 是业务 App 自行注入的桥接层，不是浏览器或 GravScope API。
    // 约定返回 Promise：原生完成保存/分享后 resolve，失败或取消时 reject。
    if (!window.appBridge?.saveDiagnosticFile) {
      throw new Error('当前宿主没有提供文件导出能力');
    }
    await window.appBridge.saveDiagnosticFile({
      requestId: file.requestId, // 回执关联编号；宿主可据此关联任务
      filename: file.filename,
      mimeType: file.mimeType,
      content: file.content,
    });
  },
});
```

原生端负责把 `content` 按 UTF-8 写入文件，再调用系统保存或分享能力。文件名和 MIME 类型一并传递，不要把内容字符串当成文件路径或 URL。业务桥接层需要处理消息长度限制；如果采用分块传输、Base64 或上传，由业务方实现。组件不会自动上传任何报告。

Android JavaScript Interface 与 iOS WKScriptMessageHandler 不是统一的 Promise API。若原生接口仅同步发送消息，应由业务桥接层维护请求编号并在原生回执后完成 Promise；不能仅调用 `postMessage()` 就把“发送成功”当成“保存成功”。

## 回调协议

```ts
interface ExportFile {
  requestId: string;
  filename: string;
  mimeType: string;
  format: 'html' | 'json';
  content: string;
}
type ExportHandler = (file: ExportFile) => void | Promise<void>;
```

| 字段 | 含义 |
| --- | --- |
| `requestId` | 本次导出接管编号，在当前组件运行期区分任务；可交给原生关联回执，不保证跨页面/跨设备全局唯一 |
| `filename` | `gravscope-<报告生成时间>.html` 或 `.json`；时间中的冒号和点替换为短横线 |
| `mimeType` | `text/html;charset=utf-8` 或 `application/json;charset=utf-8` |
| `format` | 用户点击的导出格式，`html` / `json` |
| `content` | 已按当前时间范围、正文开关和脱敏配置生成的文本；不是 Blob、Base64 或文件路径 |

- 仅初始化可配置，不支持 `setOption('onExport', ...)`。如需动态切换处理器，可在回调里委托给业务持有的变量。
- 配置后**完全接管**这两个导出按钮，不会同时发起浏览器下载。返回 `false` 不代表回退；如需浏览器下载，请不配置回调或在业务回调中自己实现。
- 同步返回 `void` 或 Promise 成功表示处理器完成；界面不会宣称文件已落盘。Promise 等待期间，该实例的导出任务保持占用；关闭后重新打开对话框也会禁用两个导出按钮，避免重复提交。界面显示任务编号和文件名。
- 同步抛错或 Promise 拒绝显示失败并允许重试，不自动回退下载，避免重复保存；复制仍可使用。
- 关闭对话框不会取消已交给原生的操作或解除任务占用。等待超过 30 秒会提示，仍可继续等待。点击「取消等待」需要确认：只解除组件内的等待状态，不取消原生保存/分享；之后可重新导出，但可能产生重复文件。旧任务迟到的成功/失败不会覆盖新任务。真正取消原生操作、跨实例去重及桥接传输仍由业务方负责。destroy() 释放组件等待计时器，不代表取消原生任务。
- `getReport()` 返回数据，不调用回调。`exportEnabled: false` 隐藏导出界面，但不禁用 `getReport()`。
- 内容与预览对应，是生成报告时的快照。JSON 包含日志、请求以及可选活动记录；HTML 是转义后的离线阅读页。
- 报告使用启发式脱敏，不保证识别所有业务敏感信息。默认排除请求/响应正文和实时消息内容；勾选包含正文后仍执行脱敏。面板内原始日志、请求复制/cURL 和实时消息复制不受报告脱敏规则影响。

## 上传生成下载链接

也可以在回调中把 `content` 上传到业务自己的服务，再由业务显示下载链接。服务端需设置正确的 `Content-Type` 和 `Content-Disposition` 文件名，并自行处理访问权限、留存期限和大小限制。文件后缀有助于识别，但不能替代 WebView 的下载处理能力。

## 报告大小与清理

- JSON 预览显示实际 UTF-8 字节大小，最大 **5 MiB（5 × 1024 × 1024 字节）**，与回放文件上限一致。HTML 转义会放大内容，点击导出时再按实际 HTML 字节数检查；JSON 能导出不代表 HTML 一定能导出。
- getReport() 生成时也执行预算检查；超限抛出 name 为 `ReportLimitError` 的错误（未作为公共构造函数导出）。日志或请求各超过 10000 条也会拒绝，以对齐回放记录上限；计数在 since 时间筛选之后进行。
- 超限不调用 onExport、不下载、不静默删掉记录或生成部分报告。可缩小到最近 5 分钟、取消正文，或清理记录后重试。原生桥接可以有更小的限制，由回调进一步检查并抛错。
- `panel.clearAll()` 同步清空保留日志、请求、活动、自定义系统信息及历史日志存档内容；关闭现有报告预览，避免继续复制旧内容。保留历史开关、采集开关与业务 Cookie/localStorage/sessionStorage，不关闭业务连接，也不取消已交给原生的导出。
- 「更多 → 清空全部诊断数据」先确认再调用 clearAll()；直接调用 API 无确认，返回 void，销毁后调用无操作。环境信息如 URL/UA 仍可重新获取，不属于被清空的历史记录。
