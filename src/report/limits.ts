export const MAX_REPORT_BYTES = 5 * 1024 * 1024;
export class ReportLimitError extends Error {
  constructor(readonly reason: 'size' | 'records' = 'size') {
    super(reason === 'size' ? 'Report exceeds 5 MiB. Narrow the time range or exclude bodies.' : 'Report exceeds replay record limits. Narrow the time range.');
    this.name = 'ReportLimitError';
  }
}
export function byteSize(text: string): number { return new Blob([text]).size; }
export function checkReportSize(text: string): number {
  const size = byteSize(text);
  if (size > MAX_REPORT_BYTES) throw new ReportLimitError();
  return size;
}
