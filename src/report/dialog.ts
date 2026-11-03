import type { GravScopeLang } from '../types';
import { el } from '../ui/dom';
import { reportHTML, type DiagnosticReport, type ReportOptions } from './snapshot';

export function showReportDialog(parent: HTMLElement, lang: GravScopeLang, capture: (options: ReportOptions) => DiagnosticReport): void {
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
  const label = el('label', {}, [bodies, zh ? ' 包含请求体和响应体' : ' Include request and response bodies']);
  const controls = el('div', { class: 'gc-report-controls' }, [period, label]);
  const note = el('p', { text: zh ? '仅导出当前保留的记录；对象值取导出时的状态。不含本地存储和命令源码。已自动遮蔽常见凭证与 URL 参数值，仍请在分享前检查内容。' : 'Retained records only; object values reflect export time. Storage and command source excluded. Common credentials and URL query values are masked. Review before sharing.' });
  const summary = el('div', { class: 'gc-report-summary', role: 'status' });
  const preview = el('textarea', { class: 'gc-report-preview', readonly: '', 'aria-label': zh ? '报告预览' : 'Report preview' });
  let snapshot: DiagnosticReport;
  const refresh = () => {
    try {
      snapshot = capture({ since: period.value === '5' ? Date.now() - 300000 : 0, includeBodies: bodies.checked });
      preview.value = JSON.stringify(snapshot, null, 2);
      summary.textContent = zh ? `${snapshot.logs.length} 条日志 · ${snapshot.network.length} 个请求` : `${snapshot.logs.length} logs · ${snapshot.network.length} requests`;
    } catch { summary.textContent = zh ? '生成报告失败，请关闭后重试' : 'Report failed. Close and retry.'; }
  };
  period.addEventListener('change', refresh);
  bodies.addEventListener('change', refresh);
  const actions = el('div', { class: 'gc-report-controls' });
  for (const format of ['html', 'json'] as const) {
    const button = el('button', { class: 'gc-tool', type: 'button', text: format === 'html' ? (zh ? '保存离线报告' : 'Save offline report') : 'JSON' });
    button.addEventListener('click', () => {
      if (!snapshot) return;
      try {
        const content = format === 'html' ? reportHTML(snapshot) : preview.value;
        const blob = new Blob([content], { type: format === 'html' ? 'text/html;charset=utf-8' : 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = el('a', { href: url, download: `gravscope-${snapshot.createdAt.replace(/[:.]/g, '-')}.${format}` });
        dialog.append(anchor);
        anchor.click(); anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
        summary.textContent = zh ? '已发起下载；若浏览器不支持，请复制下方预览内容。' : 'Download requested. If unsupported, copy the preview below.';
      } catch { summary.textContent = zh ? '下载失败，请复制下方预览内容。' : 'Download failed. Copy the preview below.'; }
    });
    actions.append(button);
  }
  const dismiss = () => { dialog.remove(); previous?.focus(); };
  close.addEventListener('click', dismiss);
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); dismiss(); }
    if (event.key === 'Tab') {
      const nodes = Array.from(dialog.querySelectorAll<HTMLElement>('button, select, input, textarea'));
      const current = (dialog.getRootNode() as ShadowRoot).activeElement;
      if (event.shiftKey && current === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
      else if (!event.shiftKey && current === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
    }
  });
  dialog.append(head, controls, note, summary, preview, actions);
  parent.append(dialog);
  refresh(); close.focus();
}
