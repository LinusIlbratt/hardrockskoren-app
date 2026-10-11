/**
 * Begränsad Markdown för meddelanden och gigtexter.
 * HTML skrivs aldrig in som HTML. Länkar tillåts bara som http(s).
 */

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'bold'; children: InlineNode[] }
  | { type: 'italic'; children: InlineNode[] }
  | { type: 'link'; href: string; children: InlineNode[] };

export type MarkdownBlock =
  | { type: 'paragraph'; lines: InlineNode[][] }
  | { type: 'ul'; items: InlineNode[][] }
  | { type: 'ol'; items: InlineNode[][] };

export type MarkdownAction = 'bold' | 'italic' | 'bullet' | 'number' | 'link';

export type MarkdownEdit = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

const BULLET_RE = /^\s*[-*•]\s+/;
const NUMBER_RE = /^\s*\d+[.)]\s+/;
const LIST_MARKER_RE = /^\s*(?:[-*•]|\d+[.)])\s+/;

function safeHttpUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function countChar(value: string, char: string): number {
  let total = 0;
  for (const item of value) {
    if (item === char) total += 1;
  }
  return total;
}

function splitTrailingPunctuation(raw: string): { url: string; trailing: string } {
  let url = raw;
  let trailing = '';
  while (url.length > 0) {
    const last = url[url.length - 1] ?? '';
    if (/[.,;:!?]/.test(last)) {
      trailing = last + trailing;
      url = url.slice(0, -1);
      continue;
    }
    if (
      (last === ')' && countChar(url, '(') < countChar(url, ')')) ||
      (last === ']' && countChar(url, '[') < countChar(url, ']')) ||
      (last === '}' && countChar(url, '{') < countChar(url, '}'))
    ) {
      trailing = last + trailing;
      url = url.slice(0, -1);
      continue;
    }
    break;
  }
  return { url, trailing };
}

type RawMatch = {
  index: number;
  length: number;
  build: () => InlineNode;
};

function consider(best: RawMatch | null, next: RawMatch | null): RawMatch | null {
  if (!next) return best;
  if (!best) return next;
  if (next.index < best.index) return next;
  if (next.index === best.index && next.length > best.length) return next;
  return best;
}

function execFrom(pattern: RegExp, text: string, from: number): RegExpExecArray | null {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const search = new RegExp(pattern.source, flags);
  search.lastIndex = from;
  const match = search.exec(text);
  if (!match || match.index < from) return null;
  return match;
}

function matchLink(text: string, from: number): RawMatch | null {
  const match = execFrom(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/, text, from);
  if (!match) return null;
  const { url } = splitTrailingPunctuation(match[2] ?? '');
  const href = safeHttpUrl(url) ? url : null;
  if (!href) return null;
  const label = match[1] ?? '';
  const trailing = (match[2]?.length ?? 0) - url.length;
  return {
    index: match.index,
    length: match[0].length - trailing,
    build: () => ({ type: 'link', href, children: parseInline(label) }),
  };
}

function matchWrapped(
  text: string,
  from: number,
  pattern: RegExp,
  type: 'bold' | 'italic',
): RawMatch | null {
  const match = execFrom(pattern, text, from);
  if (!match) return null;
  const inner = match[1] || match[2] || '';
  if (!inner.trim()) return null;
  return {
    index: match.index,
    length: match[0].length,
    build: () => ({ type, children: parseInline(inner) }),
  };
}

function matchUrl(text: string, from: number): RawMatch | null {
  const match = execFrom(/https?:\/\/[^\s<>"']+/, text, from);
  if (!match) return null;
  const { url, trailing } = splitTrailingPunctuation(match[0]);
  const href = safeHttpUrl(url) ? url : null;
  if (!href) return null;
  return {
    index: match.index,
    length: match[0].length - trailing.length,
    build: () => ({ type: 'link', href, children: [{ type: 'text', value: url }] }),
  };
}

function matchBoldItalic(text: string, from: number): RawMatch | null {
  const match = execFrom(/\*\*\*([^*\n]+)\*\*\*/, text, from);
  if (!match) return null;
  const inner = match[1] ?? '';
  if (!inner.trim()) return null;
  return {
    index: match.index,
    length: match[0].length,
    build: () => ({
      type: 'bold',
      children: [{ type: 'italic', children: parseInline(inner) }],
    }),
  };
}

function findNext(text: string, from: number): { index: number; length: number; node: InlineNode } | null {
  let best: RawMatch | null = null;
  best = consider(best, matchLink(text, from));
  best = consider(best, matchBoldItalic(text, from));
  best = consider(best, matchWrapped(text, from, /\*\*([^*\n]+)\*\*|__([^_\n]+)__/, 'bold'));
  best = consider(
    best,
    matchWrapped(
      text,
      from,
      /(?<![A-Za-z0-9])\*([^*\n]+)\*(?![A-Za-z0-9])|(?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])/,
      'italic',
    ),
  );
  best = consider(best, matchUrl(text, from));
  if (!best) return null;
  return { index: best.index, length: best.length, node: best.build() };
}

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const next = findNext(text, cursor);
    if (!next) {
      nodes.push({ type: 'text', value: text.slice(cursor) });
      break;
    }
    if (next.index > cursor) {
      nodes.push({ type: 'text', value: text.slice(cursor, next.index) });
    }
    nodes.push(next.node);
    cursor = next.index + next.length;
  }
  return nodes;
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = (source ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: 'paragraph', lines: paragraph.map((line) => parseInline(line)) });
    paragraph = [];
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const items: string[] = [];
      const pattern = bullet ? /^\s*[-*•]\s+(.*)$/ : /^\s*\d+[.)]\s+(.*)$/;
      while (index < lines.length) {
        const current = lines[index] ?? '';
        const match = pattern.exec(current);
        if (!match) break;
        items.push(match[1] ?? '');
        index += 1;
      }
      blocks.push({
        type: bullet ? 'ul' : 'ol',
        items: items.map((item) => parseInline(item)),
      });
      continue;
    }
    if (line.trim() === '') {
      flushParagraph();
      index += 1;
      continue;
    }
    paragraph.push(line);
    index += 1;
  }
  flushParagraph();
  return blocks;
}

/** http(s) only. Keeps the address as written when it is already safe. */
export function toSafeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!safeHttpUrl(trimmed)) return null;
  return trimmed;
}

export function looksLikeMarkdown(text: string): boolean {
  return (
    /(\*\*[^*\n]+\*\*|__[^_\n]+__|(?<![A-Za-z0-9])\*[^*\n]+\*(?![A-Za-z0-9])|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/m.test(
      text,
    ) || /^\s*(?:[-*•]|\d+[.)])\s+\S/m.test(text)
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineNodesToHtml(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return escapeHtml(node.value);
      if (node.type === 'bold') return `<strong>${inlineNodesToHtml(node.children)}</strong>`;
      if (node.type === 'italic') return `<em>${inlineNodesToHtml(node.children)}</em>`;
      return `<a href="${escapeHtml(node.href)}">${inlineNodesToHtml(node.children)}</a>`;
    })
    .join('');
}

/** HTML for the editor. Generated from the parsed subset, never from raw user HTML. */
export function markdownToHtml(source: string): string {
  const blocks = parseMarkdown(source ?? '');
  if (blocks.length === 0) return '<p></p>';
  return blocks
    .map((block) => {
      if (block.type === 'ul') {
        return `<ul>${block.items
          .map((item) => `<li><p>${inlineNodesToHtml(item)}</p></li>`)
          .join('')}</ul>`;
      }
      if (block.type === 'ol') {
        return `<ol>${block.items
          .map((item) => `<li><p>${inlineNodesToHtml(item)}</p></li>`)
          .join('')}</ol>`;
      }
      const inner = block.lines.map((line) => inlineNodesToHtml(line)).join('<br>');
      return `<p>${inner}</p>`;
    })
    .join('');
}

export type RichTextNode = {
  type?: string;
  text?: string;
  marks?: { type?: string; attrs?: { href?: unknown } }[];
  content?: RichTextNode[];
};

function serializeMarkedText(text: string, marks: RichTextNode['marks']): string {
  const list = marks ?? [];
  const bold = list.some((mark) => mark.type === 'bold');
  const italic = list.some((mark) => mark.type === 'italic');
  const link = list.find((mark) => mark.type === 'link');
  let next = text;
  if (bold && italic) next = `***${text}***`;
  else if (bold) next = `**${text}**`;
  else if (italic) next = `*${text}*`;
  const rawHref = typeof link?.attrs?.href === 'string' ? link.attrs.href.trim() : '';
  const href = rawHref && safeHttpUrl(rawHref) ? rawHref : null;
  if (href) next = `[${next}](${href})`;
  return next;
}

function serializeInlines(nodes: RichTextNode[] | undefined): string {
  if (!nodes) return '';
  return nodes
    .map((node) => {
      if (node.type === 'text') return serializeMarkedText(node.text ?? '', node.marks);
      if (node.type === 'hardBreak') return '\n';
      return serializeInlines(node.content);
    })
    .join('');
}

function serializeListItem(item: RichTextNode): string {
  return (item.content ?? [])
    .map((child) =>
      child.type === 'paragraph' ? serializeInlines(child.content) : serializeInlines([child]),
    )
    .join(' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

/** Editor document → the same Markdown the API already stores. */
export function richTextDocToMarkdown(doc: RichTextNode): string {
  const blocks = doc.type === 'doc' ? doc.content : [doc];
  const parts: string[] = [];
  for (const node of blocks ?? []) {
    if (node.type === 'paragraph') {
      parts.push(serializeInlines(node.content));
      continue;
    }
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      const lines = (node.content ?? []).map((item, index) => {
        const text = serializeListItem(item);
        return node.type === 'bulletList' ? `- ${text}` : `${index + 1}. ${text}`;
      });
      parts.push(lines.join('\n'));
      continue;
    }
    if (node.content) {
      const nested = richTextDocToMarkdown({ type: 'doc', content: node.content });
      if (nested) parts.push(nested);
    }
  }
  while (parts.length > 0 && parts[0] === '') parts.shift();
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts.join('\n\n');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string,
): MarkdownEdit {
  const selected = value.slice(start, end);
  const wrapped =
    selected.length > 0 &&
    value.slice(start - before.length, start) === before &&
    value.slice(end, end + after.length) === after;
  if (wrapped) {
    const next = value.slice(0, start - before.length) + selected + value.slice(end + after.length);
    const selectionStart = start - before.length;
    return { value: next, selectionStart, selectionEnd: selectionStart + selected.length };
  }
  const inner = selected || placeholder;
  const next = value.slice(0, start) + before + inner + after + value.slice(end);
  const selectionStart = start + before.length;
  return { value: next, selectionStart, selectionEnd: selectionStart + inner.length };
}

function applyLink(value: string, start: number, end: number): MarkdownEdit {
  const selected = value.slice(start, end);
  if (selected) {
    const inserted = `[${selected}](https://)`;
    const next = value.slice(0, start) + inserted + value.slice(end);
    const urlStart = start + 1 + selected.length + 2;
    return { value: next, selectionStart: urlStart, selectionEnd: urlStart + 'https://'.length };
  }
  const label = 'länktext';
  const inserted = `[${label}](https://)`;
  const next = value.slice(0, start) + inserted + value.slice(end);
  return { value: next, selectionStart: start + 1, selectionEnd: start + 1 + label.length };
}

function applyList(
  value: string,
  start: number,
  end: number,
  mode: 'bullet' | 'number',
): MarkdownEdit {
  const from = clamp(start, 0, value.length);
  const to = clamp(end, 0, value.length);
  const selectionEnd = to > from && value[to - 1] === '\n' ? to - 1 : to;
  const lineStartIndex = value.lastIndexOf('\n', Math.max(0, from - 1));
  const lineStart = lineStartIndex === -1 ? 0 : lineStartIndex + 1;
  const breakAt = value.indexOf('\n', selectionEnd);
  const lineEnd = breakAt === -1 ? value.length : breakAt;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const marker = mode === 'bullet' ? BULLET_RE : NUMBER_RE;
  const filled = lines.filter((line) => line.trim() !== '');
  const remove = filled.length > 0 && filled.every((line) => marker.test(line));
  const cursorLineIndex = value.slice(lineStart, from).split('\n').length - 1;
  let number = 1;
  const nextLines = lines.map((line, lineIndex) => {
    if (line.trim() === '') {
      if (remove || lineIndex !== cursorLineIndex) return line;
      if (mode === 'bullet') return '- ';
      const prefixed = `${number}. `;
      number += 1;
      return prefixed;
    }
    const content = line.replace(LIST_MARKER_RE, '');
    if (remove) return content;
    if (mode === 'bullet') return `- ${content}`;
    const prefixed = `${number}. ${content}`;
    number += 1;
    return prefixed;
  });
  const block = nextLines.join('\n');
  const next = value.slice(0, lineStart) + block + value.slice(lineEnd);
  const cursor = lineStart + block.length;
  return { value: next, selectionStart: cursor, selectionEnd: cursor };
}

export function applyMarkdownAction(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: MarkdownAction,
  maxLength?: number,
): MarkdownEdit | null {
  const start = clamp(Math.min(selectionStart, selectionEnd), 0, value.length);
  const end = clamp(Math.max(selectionStart, selectionEnd), 0, value.length);
  let edit: MarkdownEdit;
  if (action === 'bold') edit = wrapSelection(value, start, end, '**', '**', 'fetstil');
  else if (action === 'italic') edit = wrapSelection(value, start, end, '*', '*', 'kursiv');
  else if (action === 'link') edit = applyLink(value, start, end);
  else edit = applyList(value, start, end, action === 'bullet' ? 'bullet' : 'number');

  if (typeof maxLength === 'number' && maxLength >= 0 && edit.value.length > maxLength) {
    return null;
  }
  return edit;
}
