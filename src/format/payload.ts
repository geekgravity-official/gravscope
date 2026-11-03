import { formatBytes } from './text';

export interface PayloadBrief {
  label: string;
  image: boolean;
}

const DATA_URL = /^data:([^,]*),([\s\S]*)$/i;
const PREVIEW_LIMIT = 400_000;

export function describePayload(text: string): PayloadBrief | null {
  if (text.length < 48) return null;
  const data = DATA_URL.exec(text);
  if (data) {
    const meta = data[1] || '';
    const body = data[2] || '';
    const mime = (meta.split(';')[0] || 'text/plain').toLowerCase();
    const base64 = /;base64/i.test(meta);
    const compact = body.replace(/\s/g, '');
    const bytes = base64 ? Math.floor((compact.length * 3) / 4) : body.length;
    const image = mime.startsWith('image/');
    return { label: `${image ? mime : `data:${mime}`} · ${formatBytes(bytes)}`, image };
  }
  if (!isBase64Blob(text)) return null;
  const compact = text.replace(/\s/g, '');
  return { label: `base64 · ${formatBytes(Math.floor((compact.length * 3) / 4))}`, image: false };
}

export function payloadLabel(text: string): string {
  return describePayload(text)?.label ?? text;
}

export function canPreviewImage(text: string): boolean {
  const brief = describePayload(text);
  return Boolean(brief?.image && text.startsWith('data:image/') && text.length <= PREVIEW_LIMIT);
}

function isBase64Blob(text: string): boolean {
  if (text.length < 240) return false;
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(text)) return false;
  const compact = text.replace(/\s/g, '');
  if (compact.length < 240) return false;
  const hasUpper = /[A-Z]/.test(compact);
  const hasLower = /[a-z]/.test(compact);
  const hasDigit = /\d/.test(compact);
  return hasUpper && hasLower && (hasDigit || compact.includes('+') || compact.includes('/'));
}
