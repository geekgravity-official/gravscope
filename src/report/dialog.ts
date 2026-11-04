import { ExportTask } from './export-task';
import { checkReportSize, ReportLimitError } from './limits';
import type { ExportHandler, GravScopeLang } from '../types';
import { copyText, el } from '../ui/dom';
import { reportHTML, type DiagnosticReport, type ReportOptions } from './snapshot';

export function showReportDialog(parent: HTMLElement, lang: GravScopeLang, capture: (options: ReportOptions) => DiagnosticReport, onExport?: ExportHandler, task = new ExportTask()): void {
  if (parent.querySelector('.gc-report')) return;
  const zh = lang === 'zh';
  const previous = parent.getRootNode() instanceof ShadowRoot ? (parent.getRootNode() as ShadowRoot).activeElement as HTMLElement | null : null;
  const dialog = el('section', { class: 'gc-report', role: 'dialog', 'aria-modal': 'true', 'aria-label': zh ? '导出问题现场' : 'Export diagnostics' });
  const title = el('strong', { text: zh ? '导出问题现场' : 'Export diagnostics' });
  const close = el('button', { class: 'gc-tool', type: 'button', text: zh ? '关闭' : 'Close' });
  const head = el('div', { class: 'gc-report-head' }, [title, close]);
  const period = el('select', { class: 'gc-level-select', 'aria-label': zh ? '时间范围' : 'Time range' });
  period.append(el('option', { value: '0', text: zh ? '全部记录' : 'All retained' }), el('option', { value: '5', text: zh ? '最近 5 分钟' : 'Last 5 minutes' }));
  const bodies = el('input', { type: 'checkbox' });
  const label = el('label', {}, [bodies, zh ? ' 包含请求体、响应体和实时消息' : ' Include request/response bodies and realtime messages']);
  const controls = el('div', { class: 'gc-report-controls' }, [period, label]);
  const note = el('p', { text: zh ? '仅导出当前保留的记录；对象值取导出时的状态。不含本地存储和命令源码。已自动遮蔽常见凭证与 URL 参数值，仍请在分享前检查内容。' : 'Retained records only; object values reflect export time. Storage and command source excluded. Common credentials and URL query values are masked. Review before sharing.' });
  const summary = el('div', { class: 'gc-report-summary', role: 'status' });
  const preview = el('textarea', { class: 'gc-report-preview', readonly: '', 'aria-label': zh ? '报告预览' : 'Report preview' });
  let snapshot: DiagnosticReport | undefined;
  let exporting = false;
  let valid = false;
  const sizeLabel = el('p', { class: 'gc-report-size' });
  const taskStatus = el('p', { class: 'gc-export-task-status', role: 'status' });
  const cancelWait = el('button', { class: 'gc-tool gc-export-cancel', type: 'button', text: zh ? '取消等待' : 'Cancel waiting' });
  cancelWait.hidden = true;
  cancelWait.addEventListener('click', () => {
    if (window.confirm(zh ? '仅取消组件等待，不会取消原生保存或分享。再次导出可能重复，确认继续？' : 'Stop waiting only? Native saving/sharing may still continue; exporting again may create duplicates.')) task.cancelWait();
  });
  const exportButtons: HTMLButtonElement[] = [];
  const refresh = () => {
    valid = false;
    try {
      snapshot = capture({ since: period.value === '5' ? Date.now() - 300000 : 0, includeBodies: bodies.checked });
      preview.value = JSON.stringify(snapshot, null, 2);
      const size = checkReportSize(preview.value);
      valid = true;
      sizeLabel.textContent = `JSON: ${(size / 1024).toFixed(1)} KiB / 5120 KiB`;
      summary.textContent = zh ? `${snapshot.logs.length} 条日志 · ${snapshot.network.length} 个请求` : `${snapshot.logs.length} logs · ${snapshot.network.length} requests`;
    } catch (error) {
      snapshot = undefined; preview.value = ''; sizeLabel.textContent = '';
      summary.textContent = error instanceof ReportLimitError
        ? (zh ? '报告超出 5 MiB 或回放记录数量限制。请缩小时间范围、取消包含正文，或先清理记录。未截断报告。' : 'Report exceeds 5 MiB or replay record limits. Narrow the time range, exclude bodies or clear records. No partial report was exported.')
        : (zh ? '生成报告失败，请关闭后重试' : 'Report failed. Close and retry.');
    }
    syncTask(false);
  };
  period.addEventListener('change', refresh);
  bodies.addEventListener('change', refresh);
  const actions = el('div', { class: 'gc-report-controls' });
  const selectPreview = () => {
    preview.focus();
    preview.select();
    preview.setSelectionRange(0, preview.value.length);
  };
  const copy = el('button', { class: 'gc-tool gc-report-copy', type: 'button', text: zh ? '复制报告' : 'Copy report' });
  copy.addEventListener('click', async () => {
    if (!snapshot || copy.disabled) return;
    const content = preview.value;
    copy.disabled = true;
    const ok = await copyText(content);
    copy.disabled = false;
    if (!dialog.isConnected) return;
    if (ok) summary.textContent = zh ? '已复制脱敏后的 JSON 报告。' : 'Redacted JSON report copied.';
    else {
      selectPreview();
      summary.textContent = zh ? '自动复制未成功，已全选报告，请长按文本手动复制。' : 'Automatic copy failed. Report selected; copy the text manually.';
    }
  });
  const select = el('button', { class: 'gc-tool gc-report-select', type: 'button', text: zh ? '全选文本' : 'Select all' });
  select.addEventListener('click', () => {
    selectPreview();
    summary.textContent = zh ? '已全选，请长按文本复制。' : 'Report selected. Copy the text manually.';
  });
  actions.append(copy, select);
  for (const format of ['html', 'json'] as const) {
    const button = el('button', { class: 'gc-tool', type: 'button', text: format === 'html' ? (zh ? '保存离线报告' : 'Save offline report') : 'JSON' });
    exportButtons.push(button);
    button.addEventListener('click', async () => {
      if (!snapshot || !valid || exporting || task.state.status === 'pending') return;
      exporting = true; exportButtons.forEach(item => { item.disabled = true; });
      try {
        const content = format === 'html' ? reportHTML(snapshot) : preview.value;
        checkReportSize(content);
        const filename = `gravscope-${snapshot.createdAt.replace(/[:.]/g, '-')}.${format}`;
        const mimeType = format === 'html' ? 'text/html;charset=utf-8' : 'application/json;charset=utf-8';
        if (onExport) {
          task.start(onExport, { filename, mimeType, format, content });
          return;
        }
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = el('a', { href: url, download: filename });
        dialog.append(anchor);
        anchor.click(); anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
        summary.textContent = zh ? '已发起下载；若浏览器不支持，请复制下方预览内容。' : 'Download requested. If unsupported, copy the preview below.';
      } catch (error) {
        if (dialog.isConnected) summary.textContent = error instanceof ReportLimitError
          ? (zh ? '该格式超过 5 MiB，请缩小范围或取消正文后重试；未发送文件。' : 'This format exceeds 5 MiB. Narrow the range or exclude bodies; no file was sent.')
          : onExport
          ? (zh ? '应用导出失败，可重试或复制报告；未自动发起下载。' : 'Application export failed. Retry or copy the report; no download was started.')
          : (zh ? '下载失败，请复制下方预览内容。' : 'Download failed. Copy the preview below.');
      } finally { exporting = false; syncTask(false); }
    });
    actions.append(button);
  }
  const syncTask = (announce = true) => {
    const state = task.state;
    for (const button of exportButtons) button.disabled = !valid || exporting || state.status === 'pending';
    copy.disabled = !valid; select.disabled = !valid;
    cancelWait.hidden = state.status !== 'pending';
    const messages = {
      idle: '',
      pending: state.slow ? (zh ? '等待已超过 30 秒，应用尚未确认完成。可以继续等待或取消等待。' : 'Waiting over 30 seconds; application completion is unconfirmed. Continue or cancel waiting.') : (zh ? '正在等待应用处理…' : 'Waiting for the application…'),
      completed: zh ? '应用导出回调已完成；保存或分享结果由应用确认。' : 'Application export callback completed; the application confirms saving or sharing.',
      failed: zh ? '应用导出失败，可重试或复制报告；未自动发起下载。' : 'Application export failed. Retry or copy the report; no download was started.',
      cancelled: zh ? '已取消等待，原生操作可能仍在进行；再次导出可能重复。' : 'Waiting cancelled; native work may still continue. Another export may duplicate it.',
    };
    taskStatus.textContent = messages[state.status] + (state.requestId ? ` [${state.requestId}] ${state.filename}` : '');
    if (announce && state.status !== 'idle') summary.textContent = messages[state.status];
  };
  const unsubscribe = task.subscribe(() => syncTask());
  const dismiss = () => { unsubscribe(); dialog.remove(); previous?.focus(); };
  close.addEventListener('click', dismiss);
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); dismiss(); }
    if (event.key === 'Tab') {
      const nodes = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), select, input, textarea')).filter(node => !node.hidden);
      const current = (dialog.getRootNode() as ShadowRoot).activeElement;
      if (event.shiftKey && current === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
      else if (!event.shiftKey && current === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
    }
  });
  dialog.append(head, controls, note, sizeLabel, taskStatus, cancelWait, summary, preview, actions);
  parent.append(dialog);
  refresh(); close.focus();
}
