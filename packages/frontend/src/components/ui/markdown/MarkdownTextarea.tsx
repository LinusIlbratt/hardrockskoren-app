import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import LinkExtension from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, ChevronDown, Italic, Link, List, ListOrdered, Maximize2, Redo2, Underline as UnderlineIcon, Undo2 } from 'lucide-react';
import { Button, ButtonSize, ButtonVariant } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { Small } from '@/components/ui/markdown/smallMark';
import { TextAppearance, type AppearanceFont } from '@/components/ui/markdown/textAppearance';
import { looksLikeMarkdown, markdownToHtml, toSafeHttpUrl } from '@/utils/markdown';
import { editorHtmlFromStored, sanitizeRichHtml } from '@/utils/richText';
import styles from './MarkdownTextarea.module.scss';

type MarkdownTextareaProps = {
  value: string;
  onChange?: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
  id?: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
};

const FONT_CHOICES = [
  { id: 'standard', label: 'Standard', menu: 'Standard' },
  { id: 'arial', label: 'Arial', menu: 'Arial' },
  { id: 'verdana', label: 'Verdana', menu: 'Verdana' },
  { id: 'trebuchet', label: 'Trebuchet MS', menu: 'Trebuchet MS' },
  { id: 'tahoma', label: 'Tahoma', menu: 'Tahoma' },
  { id: 'times', label: 'Times New Roman', menu: 'Times New Roman' },
  { id: 'georgia', label: 'Georgia', menu: 'Georgia' },
  { id: 'garamond', label: 'Garamond', menu: 'Garamond' },
  { id: 'comic', label: 'Comic Sans', menu: 'Comic Sans' },
  { id: 'impact', label: 'Impact', menu: 'Impact' },
  { id: 'courier', label: 'Fast bredd', menu: 'Fast bredd (Courier)' },
] as const;

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32] as const;
const DEFAULT_FONT_SIZE = 16;

const FONT_LABELS: Record<string, string> = {
  standard: 'Standard',
  sans: 'Standard',
  arial: 'Arial',
  verdana: 'Verdana',
  trebuchet: 'Trebuchet MS',
  tahoma: 'Tahoma',
  times: 'Times New Roman',
  georgia: 'Georgia',
  garamond: 'Garamond',
  comic: 'Comic Sans',
  impact: 'Impact',
  courier: 'Fast bredd',
  mono: 'Fast bredd',
};

type FontChoice = (typeof FONT_CHOICES)[number]['id'];
type OpenMenu = 'font' | 'size';

function ToolButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
  expanded,
  controls,
  className,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  expanded?: boolean;
  controls?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={[styles.tool, pressed ? styles.toolActive : '', className].filter(Boolean).join(' ')}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function emitChange(onChange: MarkdownTextareaProps['onChange'], value: string) {
  onChange?.({ target: { value }, currentTarget: { value } } as ChangeEvent<HTMLTextAreaElement>);
}

/** ProseMirror collapses runs of spaces unless parsing keeps them. setContent does not inherit this from the editor. */
const PRESERVE_WHITESPACE = { preserveWhitespace: 'full' as const };

function linkLabel(href: string): string {
  return href.replace(/^https?:\/\//, '').replace(/\/$/, '') || href;
}

/** WYSIWYG-fält. Nya texter sparas som begränsad HTML, äldre Markdown visas oförändrat tills den redigeras. */
export function MarkdownTextarea({
  value,
  onChange,
  disabled = false,
  maxLength,
  className,
  id,
  placeholder,
  rows = 6,
}: MarkdownTextareaProps) {
  const markdownRef = useRef(value);
  const editorRef = useRef<Editor | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const linkPopoverId = useId();
  const fontMenuId = useId();
  const sizeMenuId = useId();
  const expandTitleId = useId();
  const fontButtonRef = useRef<HTMLButtonElement>(null);
  const sizeButtonRef = useRef<HTMLButtonElement>(null);
  const styleMenuRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [styleBox, setStyleBox] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [linkError, setLinkError] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        blockquote: false,
        code: false,
        codeBlock: false,
        strike: false,
        underline: false,
        horizontalRule: false,
        link: false,
      }),
      Underline,
      Small,
      TextAppearance,
      LinkExtension.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
        isAllowedUri: (url) => toSafeHttpUrl(url) !== null,
        shouldAutoLink: (url) => toSafeHttpUrl(url) !== null,
      }),
    ],
    content: editorHtmlFromStored(value),
    parseOptions: PRESERVE_WHITESPACE,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: styles.prose,
        role: 'textbox',
        'aria-multiline': 'true',
      },
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData('text/plain') ?? '';
        const html = event.clipboardData?.getData('text/html') ?? '';
        if (html.trim() || !looksLikeMarkdown(text)) return false;
        const current = editorRef.current;
        if (!current) return false;
        current.commands.insertContent(markdownToHtml(text));
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      const next = sanitizeRichHtml(current.getHTML());
      const overLimit =
        typeof maxLength === 'number' &&
        next.length > maxLength &&
        next.length > markdownRef.current.length;
      if (overLimit) {
        current.commands.setContent(editorHtmlFromStored(markdownRef.current), {
          emitUpdate: false,
          parseOptions: PRESERVE_WHITESPACE,
        });
        return;
      }
      if (next === markdownRef.current) return;
      markdownRef.current = next;
      emitChange(onChange, next);
    },
  });

  editorRef.current = editor;

  const marks = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) {
        return {
          bold: false,
          italic: false,
          underline: false,
          bullet: false,
          ordered: false,
          link: false,
          empty: true,
          canUndo: false,
          canRedo: false,
          font: 'standard' as FontChoice | AppearanceFont,
          textSize: DEFAULT_FONT_SIZE,
        };
      }
      const appearance = current.getAttributes('textAppearance');
      const font: FontChoice | AppearanceFont =
        appearance.font === 'arial' ||
        appearance.font === 'comic' ||
        appearance.font === 'times' ||
        appearance.font === 'courier' ||
        appearance.font === 'mono' ||
        appearance.font === 'georgia'
          ? appearance.font
          : 'standard';
      const parsedSize = Number(appearance.size);
      const textSize =
        Number.isInteger(parsedSize) && parsedSize >= 10 && parsedSize <= 48
          ? parsedSize
          : DEFAULT_FONT_SIZE;
      return {
        bold: current.isActive('bold'),
        italic: current.isActive('italic'),
        underline: current.isActive('underline'),
        bullet: current.isActive('bulletList'),
        ordered: current.isActive('orderedList'),
        link: current.isActive('link'),
        empty: current.isEmpty,
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
        font,
        textSize,
      };
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;
    if (value === markdownRef.current) return;
    markdownRef.current = value;
    editor.commands.setContent(editorHtmlFromStored(value), {
      emitUpdate: false,
      parseOptions: PRESERVE_WHITESPACE,
    });
  }, [editor, value]);

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    editor?.commands.focus('end');
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen, editor]);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || openMenu) return;
      event.preventDefault();
      setIsFullscreen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isFullscreen, openMenu]);

  useEffect(() => {
    if (!linkOpen) return;
    linkInputRef.current?.focus();
    linkInputRef.current?.select();
  }, [linkOpen]);

  useEffect(() => {
    if (!openMenu) return;
    const anchor = openMenu === 'font' ? fontButtonRef : sizeButtonRef;
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.max(rect.width, openMenu === 'font' ? 248 : 196);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const cap = Math.min(window.innerHeight * 0.7, 28 * 16);
      const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(120, Math.min(cap, openUp ? spaceAbove : spaceBelow));
      setStyleBox(
        openUp
          ? { bottom: window.innerHeight - rect.top + 4, left, width, maxHeight }
          : { top: rect.bottom + 4, left, width, maxHeight },
      );
    };
    place();
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideAnchor =
        fontButtonRef.current?.contains(target) ||
        sizeButtonRef.current?.contains(target) ||
        styleMenuRef.current?.contains(target);
      if (insideAnchor) return;
      setOpenMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [openMenu]);

  const chooseFont = (font: FontChoice) => {
    if (!editor || disabled) return;
    editor.chain().focus().setAppearanceFont(font === 'standard' ? null : font).run();
    setOpenMenu(null);
  };

  const chooseTextSize = (size: number) => {
    if (!editor || disabled) return;
    editor.chain().focus().setAppearanceSize(size).run();
    setOpenMenu(null);
  };

  const toggleMenu = (menu: OpenMenu) => {
    setOpenMenu((current) => (current === menu ? null : menu));
    setLinkOpen(false);
  };

  const closeLink = () => {
    setLinkOpen(false);
    setLinkError(null);
    editor?.commands.focus();
  };

  const applyLink = () => {
    if (!editor || disabled) return;
    const href = toSafeHttpUrl(linkUrl);
    if (!href) {
      setLinkError('Använd en adress som börjar med http:// eller https://.');
      return;
    }
    const chain = editor.chain().focus();
    if (editor.state.selection.empty && !editor.isActive('link')) {
      chain
        .insertContent({
          type: 'text',
          text: linkLabel(href),
          marks: [{ type: 'link', attrs: { href } }],
        })
        .run();
    } else {
      chain.extendMarkRange('link').setLink({ href }).run();
    }
    setLinkOpen(false);
    setLinkError(null);
  };

  const removeLink = () => {
    if (!editor || disabled) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkOpen(false);
    setLinkError(null);
  };

  const minHeight = `${Math.max(rows, 3) * 1.6}em`;
  const shellClass = [styles.shell, className].filter(Boolean).join(' ');
  const currentFontLabel = FONT_LABELS[marks.font] ?? 'Standard';
  const controlsDisabled = disabled || !editor;

  const field = (
    <div className={styles.field} data-expanded={isFullscreen ? 'true' : undefined}>
      {isFullscreen && (
        <div className={styles.expandHeader}>
          <h2 className={styles.expandTitle} id={expandTitleId}>
            Redigera beskrivning
          </h2>
          <Button
            type="button"
            size={ButtonSize.Small}
            variant={ButtonVariant.Primary}
            onClick={() => setIsFullscreen(false)}
          >
            Klar
          </Button>
        </div>
      )}
      {id && (
        <input
          id={id}
          className={styles.focusProxy}
          tabIndex={-1}
          aria-hidden="true"
          value=""
          onChange={() => undefined}
          onFocus={() => editor?.commands.focus()}
        />
      )}
      <div className={shellClass} data-disabled={disabled ? 'true' : undefined}>
      <div className={styles.toolbar} role="toolbar" aria-label="Textformatering" aria-controls={id}>
        <div className={styles.toolbarRow}>
        <div className={styles.group}>
          <ToolButton
            label="Ångra"
            className={styles.history}
            disabled={controlsDisabled || !marks.canUndo}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 size={18} strokeWidth={2.25} aria-hidden />
          </ToolButton>
          <ToolButton
            label="Gör om"
            className={styles.history}
            disabled={controlsDisabled || !marks.canRedo}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2 size={18} strokeWidth={2.25} aria-hidden />
          </ToolButton>
        </div>
        <span className={styles.divider} aria-hidden="true" />
        <div className={styles.appearanceGroup}>
          <button
            ref={fontButtonRef}
            type="button"
            className={[styles.styleButton, openMenu === 'font' ? styles.toolActive : ''].filter(Boolean).join(' ')}
            title="Typsnitt"
            aria-label={`Typsnitt, ${currentFontLabel}`}
            aria-haspopup="listbox"
            aria-expanded={openMenu === 'font'}
            aria-controls={openMenu === 'font' ? fontMenuId : undefined}
            disabled={controlsDisabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => toggleMenu('font')}
          >
            <span className={styles.styleLabel}>{currentFontLabel}</span>
            <ChevronDown size={16} strokeWidth={2.25} aria-hidden />
          </button>
          <button
            ref={sizeButtonRef}
            type="button"
            className={[styles.styleButton, styles.sizeButton, openMenu === 'size' ? styles.toolActive : ''].filter(Boolean).join(' ')}
            title="Textstorlek"
            aria-label={`Textstorlek, ${marks.textSize}`}
            aria-haspopup="listbox"
            aria-expanded={openMenu === 'size'}
            aria-controls={openMenu === 'size' ? sizeMenuId : undefined}
            disabled={controlsDisabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => toggleMenu('size')}
          >
            <span className={styles.styleLabel}>{marks.textSize}</span>
            <ChevronDown size={16} strokeWidth={2.25} aria-hidden />
          </button>
        </div>
        </div>
        <div className={styles.toolbarRow}>
        <span className={`${styles.divider} ${styles.desktopDivider}`} aria-hidden="true" />
        <div className={styles.group}>
          <ToolButton label="Fetstil" pressed={marks.bold} disabled={controlsDisabled} onClick={() => editor?.chain().focus().toggleBold().run()}>
            <Bold size={18} strokeWidth={2.25} aria-hidden />
          </ToolButton>
          <ToolButton label="Kursiv" pressed={marks.italic} disabled={controlsDisabled} onClick={() => editor?.chain().focus().toggleItalic().run()}>
            <Italic size={18} strokeWidth={2.25} aria-hidden />
          </ToolButton>
          <ToolButton label="Understruken" pressed={marks.underline} disabled={controlsDisabled} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon size={18} strokeWidth={2.25} aria-hidden />
          </ToolButton>
        </div>
        <span className={styles.divider} aria-hidden="true" />
        <div className={styles.group}>
          <ToolButton label="Punktlista" pressed={marks.bullet} disabled={controlsDisabled} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
            <List size={18} strokeWidth={2.25} aria-hidden />
          </ToolButton>
          <ToolButton label="Numrerad lista" pressed={marks.ordered} disabled={controlsDisabled} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
            <ListOrdered size={18} strokeWidth={2.25} aria-hidden />
          </ToolButton>
        </div>
        <span className={styles.divider} aria-hidden="true" />
        <div className={styles.group}>
          <ToolButton
            label="Infoga länk"
            pressed={marks.link || linkOpen}
            disabled={controlsDisabled}
            expanded={linkOpen}
            controls={linkOpen ? linkPopoverId : undefined}
            onClick={() => {
              const href = editor?.getAttributes('link').href;
              setLinkUrl(typeof href === 'string' && href ? href : 'https://');
              setLinkError(null);
              setLinkOpen(true);
              setOpenMenu(null);
            }}
          >
            <Link size={18} strokeWidth={2.25} aria-hidden />
          </ToolButton>
        </div>
        {!isFullscreen && (
          <ToolButton
            label="Öppna i fullskärm"
            className={styles.expand}
            disabled={controlsDisabled}
            onClick={() => {
              setOpenMenu(null);
              setLinkOpen(false);
              setIsFullscreen(true);
            }}
          >
            <Maximize2 size={18} strokeWidth={2.25} aria-hidden />
          </ToolButton>
        )}
        </div>
      </div>

      {linkOpen && (
        <div id={linkPopoverId} className={styles.linkPopover} role="group" aria-label="Länkadress">
          <Input
            ref={linkInputRef}
            value={linkUrl}
            disabled={disabled}
            placeholder="https://"
            aria-label="Länkadress"
            onChange={(event) => {
              setLinkUrl(event.target.value);
              if (linkError) setLinkError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyLink();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                closeLink();
              }
            }}
          />
          <div className={styles.linkActions}>
            <Button type="button" size={ButtonSize.Small} variant={ButtonVariant.Primary} disabled={disabled} onClick={applyLink}>
              Infoga
            </Button>
            {marks.link && (
              <Button type="button" size={ButtonSize.Small} variant={ButtonVariant.Ghost} onClick={removeLink}>
                Ta bort
              </Button>
            )}
            <Button type="button" size={ButtonSize.Small} variant={ButtonVariant.Ghost} onClick={closeLink}>
              Avbryt
            </Button>
          </div>
          {linkError && <p className={styles.linkError}>{linkError}</p>}
        </div>
      )}

      <div
        className={styles.surface}
        style={isFullscreen ? undefined : { minHeight }}
        onMouseDown={(event) => {
          if (disabled || !editor) return;
          if (event.target === event.currentTarget || (event.target as HTMLElement).classList.contains(styles.placeholder)) {
            event.preventDefault();
            editor.commands.focus('end');
          }
        }}
      >
        {marks.empty && placeholder && <span className={styles.placeholder}>{placeholder}</span>}
        <EditorContent editor={editor} />
      </div>
      </div>
      {openMenu &&
        styleBox &&
        createPortal(
          <div
            ref={styleMenuRef}
            id={openMenu === 'font' ? fontMenuId : sizeMenuId}
            className={styles.styleMenu}
            role="listbox"
            aria-label={openMenu === 'font' ? 'Typsnitt' : 'Textstorlek'}
            style={{
              top: styleBox.top,
              bottom: styleBox.bottom,
              left: styleBox.left,
              width: styleBox.width,
              maxHeight: styleBox.maxHeight,
            }}
          >
            {openMenu === 'font' &&
              FONT_CHOICES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={marks.font === item.id}
                  className={[styles.styleOption, marks.font === item.id ? styles.toolActive : ''].filter(Boolean).join(' ')}
                  data-font={item.id === 'standard' ? undefined : item.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseFont(item.id)}
                >
                  {item.menu}
                </button>
              ))}
            {openMenu === 'size' &&
              FONT_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  role="option"
                  aria-selected={marks.textSize === size}
                  className={[styles.styleOption, marks.textSize === size ? styles.toolActive : ''].filter(Boolean).join(' ')}
                  data-size={size}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseTextSize(size)}
                >
                  {size}
                </button>
              ))}
          </div>,
          document.body,
        )}
    </div>
  );

  if (isFullscreen) {
    return createPortal(
      <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby={expandTitleId}>
        <div className={styles.panel}>{field}</div>
      </div>,
      document.body,
    );
  }

  return field;
}
