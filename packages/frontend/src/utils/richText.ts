import { markdownToHtml, toSafeHttpUrl } from '@/utils/markdown';

const ALLOWED_TAGS = new Set(['P', 'H1', 'H2', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'U', 'SMALL', 'A', 'BR', 'SPAN']);
const FONT_VALUES = new Set([
  'sans',
  'mono',
  'arial',
  'verdana',
  'trebuchet',
  'tahoma',
  'times',
  'georgia',
  'garamond',
  'comic',
  'impact',
  'courier',
]);

/** Stored TipTap HTML starts with a block tag. Older posts are Markdown. */
export function isStoredRichHtml(value: string): boolean {
  return /^\s*<(p|h1|h2|ul|ol)\b/i.test(value ?? '');
}

/** Value from the API → HTML the editor can show. */
export function editorHtmlFromStored(value: string): string {
  if (!value?.trim()) return '<p></p>';
  if (isStoredRichHtml(value)) return value;
  return markdownToHtml(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function allowedSize(value: string | null): string | null {
  if (!value || !/^\d{2}$/.test(value)) return null;
  const size = Number(value);
  if (size < 10 || size > 48) return null;
  return value;
}

function appearanceAttributes(element: HTMLElement): string {
  const font = element.getAttribute('data-font');
  const size = allowedSize(element.getAttribute('data-size'));
  const parts: string[] = [];
  if (font && FONT_VALUES.has(font)) parts.push(` data-font="${font}"`);
  if (size) parts.push(` data-size="${size}"`);
  return parts.join('');
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? '');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const element = node as HTMLElement;
  if (element.tagName === 'BR') return '<br>';
  const inner = Array.from(element.childNodes).map(serializeNode).join('');
  if (!ALLOWED_TAGS.has(element.tagName)) return inner;
  if (element.tagName === 'SPAN') {
    const attrs = appearanceAttributes(element);
    if (!attrs) return inner;
    return `<span${attrs}>${inner}</span>`;
  }
  if (element.tagName === 'A') {
    const href = toSafeHttpUrl(element.getAttribute('href') ?? '');
    if (!href) return inner;
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
  }
  const tag = element.tagName.toLowerCase();
  return `<${tag}>${inner}</${tag}>`;
}

/** Keeps only the tags the editor produces, and drops javascript: links. */
export function sanitizeRichHtml(html: string): string {
  if (typeof document === 'undefined' || !html.trim()) return '';
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const serialized = Array.from(parsed.body.childNodes).map(serializeNode).join('').trim();
  const text = serialized
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
  if (!text) return '';
  return serialized;
}
