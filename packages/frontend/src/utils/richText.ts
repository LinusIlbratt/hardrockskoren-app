import { markdownToHtml, toSafeHttpUrl } from '@/utils/markdown';

const ALLOWED_TAGS = new Set(['P', 'H1', 'H2', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'U', 'SMALL', 'A', 'BR']);

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

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? '');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const element = node as HTMLElement;
  if (element.tagName === 'BR') return '<br>';
  const inner = Array.from(element.childNodes).map(serializeNode).join('');
  if (!ALLOWED_TAGS.has(element.tagName)) return inner;
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
