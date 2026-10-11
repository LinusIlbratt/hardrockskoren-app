import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import LinkExtension from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, ChevronDown, Italic, Link, List, ListOrdered, Redo2, Underline as UnderlineIcon, Undo2 } from 'lucide-react';
import { Button, ButtonSize, ButtonVariant } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { Small } from '@/components/ui/markdown/smallMark';
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

const STYLES = [
  { id: 'normal', label: 'Vanlig text', menu: 'Vanlig text' },
  { id: 'xl', label: 'Stor rubrik', menu: 'Stor rubrik (H1)' },
  { id: 'lg', label: 'Mellanrubrik', menu: 'Mellanrubrik (H2)' },
  { id: 'sm', label: 'Liten text', menu: 'Liten text' },
] as const;

type TextSize = (typeof STYLES)[number]['id'];

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
  const styleMenuId = useId();
  const styleButtonRef = useRef<HTMLButtonElement>(null);
  const styleMenuRef = useRef<HTMLDivElement>(null);
  const [styleOpen, setStyleOpen] = useState(false);
  const [styleBox, setStyleBox] = useState<{ top: number; left: number; width: number } | null>(null);
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
        current.commands.setContent(editorHtmlFromStored(markdownRef.current), { emitUpdate: false });
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
          size: 'normal' as TextSize,
        };
      }
      const size: TextSize = current.isActive('heading', { level: 1 })
        ? 'xl'
        : current.isActive('heading', { level: 2 })
          ? 'lg'
          : current.isActive('small')
            ? 'sm'
            : 'normal';
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
        size,
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
    editor.commands.setContent(editorHtmlFromStored(value), { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (!linkOpen) return;
    linkInputRef.current?.focus();
    linkInputRef.current?.select();
  }, [linkOpen]);

  useEffect(() => {
    if (!styleOpen) return;
    const place = () => {
      const rect = styleButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.max(rect.width, 196);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      setStyleBox({ top: rect.bottom + 4, left, width });
    };
    place();
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (styleButtonRef.current?.contains(target) || styleMenuRef.current?.contains(target)) return;
      setStyleOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStyleOpen(false);
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
  }, [styleOpen]);

  const applySize = (size: TextSize) => {
    if (!editor || disabled) return;
    const chain = editor.chain().focus();
    if (size === 'xl') {
      chain.unsetMark('small').setHeading({ level: 1 }).run();
      return;
    }
    if (size === 'lg') {
      chain.unsetMark('small').setHeading({ level: 2 }).run();
      return;
    }
    if (size === 'sm') {
      if (editor.isActive('heading')) chain.setParagraph();
      chain.setMark('small').run();
      return;
    }
    chain.unsetMark('small').setParagraph().run();
  };

  const chooseStyle = (size: TextSize) => {
    applySize(size);
    setStyleOpen(false);
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
  const currentStyle = STYLES.find((item) => item.id === marks.size) ?? STYLES[0];
  const controlsDisabled = disabled || !editor;

  return (
    <div className={styles.field}>
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
        <div className={styles.group}>
          <button
            ref={styleButtonRef}
            type="button"
            className={[styles.styleButton, styleOpen ? styles.toolActive : ''].filter(Boolean).join(' ')}
            title="Textformat"
            aria-label={`Textformat, ${currentStyle.label}`}
            aria-haspopup="listbox"
            aria-expanded={styleOpen}
            aria-controls={styleOpen ? styleMenuId : undefined}
            disabled={controlsDisabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setStyleOpen((open) => !open)}
          >
            <span className={styles.styleLabel}>{currentStyle.label}</span>
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
              setStyleOpen(false);
            }}
          >
            <Link size={18} strokeWidth={2.25} aria-hidden />
          </ToolButton>
        </div>
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
        style={{ minHeight }}
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
      {styleOpen &&
        styleBox &&
        createPortal(
          <div
            ref={styleMenuRef}
            id={styleMenuId}
            className={styles.styleMenu}
            role="listbox"
            aria-label="Textformat"
            style={{ top: styleBox.top, left: styleBox.left, width: styleBox.width }}
          >
            {STYLES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={marks.size === item.id}
                className={[styles.styleOption, marks.size === item.id ? styles.toolActive : ''].filter(Boolean).join(' ')}
                data-style={item.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseStyle(item.id)}
              >
                {item.menu}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
