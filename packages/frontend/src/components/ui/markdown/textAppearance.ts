import { Mark, mergeAttributes, type CommandProps } from '@tiptap/core';

export const FONT_IDS = [
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
] as const;
export type AppearanceFont = (typeof FONT_IDS)[number];

const FONTS = new Set<string>(FONT_IDS);
const DEFAULT_SIZE = 16;

function validFont(value: unknown): AppearanceFont | null {
  return typeof value === 'string' && FONTS.has(value) ? (value as AppearanceFont) : null;
}

/** Two-digit sizes 10–48. 16 is the default and is not stored. */
function validSize(value: unknown): string | null {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d{2}$/.test(raw)) return null;
  const size = Number(raw);
  if (size < 10 || size > 48 || size === DEFAULT_SIZE) return null;
  return raw;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textAppearance: {
      setAppearanceFont: (font: AppearanceFont | null) => ReturnType;
      setAppearanceSize: (size: number) => ReturnType;
    };
  }
}

function applyAppearance(
  { tr, state, dispatch }: CommandProps,
  patch: { font?: AppearanceFont | null; size?: number },
): boolean {
  const type = state.schema.marks.textAppearance;
  if (!type) return false;
  if (!dispatch) return true;

  const { selection } = tr;

  const resolve = (current: Record<string, unknown>) => {
    const font = patch.font !== undefined ? patch.font : validFont(current.font);
    const size = patch.size !== undefined ? validSize(patch.size) : validSize(current.size);
    return { font, size };
  };

  if (selection.empty) {
    const cursorMarks = tr.storedMarks ?? selection.$from.marks();
    const existing = cursorMarks.find((mark) => mark.type === type);
    const attrs = resolve(existing?.attrs ?? {});
    if (!attrs.font && !attrs.size) {
      if (existing) tr.removeStoredMark(type);
    } else {
      tr.addStoredMark(type.create(attrs));
    }
    dispatch(tr);
    return true;
  }

  const ranges: { from: number; to: number; font: AppearanceFont | null; size: string | null }[] = [];
  tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (!node.isText) return;
    const existing = node.marks.find((mark) => mark.type === type);
    ranges.push({
      from: Math.max(pos, selection.from),
      to: Math.min(pos + node.nodeSize, selection.to),
      ...resolve(existing?.attrs ?? {}),
    });
  });
  for (const range of ranges) {
    tr.removeMark(range.from, range.to, type);
    if (range.font || range.size) {
      tr.addMark(range.from, range.to, type.create({ font: range.font, size: range.size }));
    }
  }
  dispatch(tr);
  return true;
}

/** Inline font and point size. Renders as span with data-font / data-size, never a style attribute. */
export const TextAppearance = Mark.create({
  name: 'textAppearance',

  addAttributes() {
    return {
      font: {
        default: null,
        parseHTML: (element: HTMLElement) => validFont(element.getAttribute('data-font')),
        renderHTML: (attributes: { font?: unknown }) => {
          const font = validFont(attributes.font);
          if (!font) return {};
          return { 'data-font': font };
        },
      },
      size: {
        default: null,
        parseHTML: (element: HTMLElement) => validSize(element.getAttribute('data-size')),
        renderHTML: (attributes: { size?: unknown }) => {
          const size = validSize(attributes.size);
          if (!size) return {};
          return { 'data-size': size };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-font]' }, { tag: 'span[data-size]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setAppearanceFont: (font) => (props) => applyAppearance(props, { font }),
      setAppearanceSize: (size) => (props) => applyAppearance(props, { size }),
    };
  },
});
