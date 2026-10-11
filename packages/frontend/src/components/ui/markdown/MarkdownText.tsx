import { type MouseEvent, type ReactNode } from 'react';
import { parseMarkdown, toSafeHttpUrl, type InlineNode } from '@/utils/markdown';
import { isStoredRichHtml, sanitizeRichHtml } from '@/utils/richText';
import styles from './MarkdownText.module.scss';

type MarkdownTextProps = {
  text: string;
  className?: string;
};

function renderInline(nodes: InlineNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === 'text') return <span key={key}>{node.value}</span>;
    if (node.type === 'bold') return <strong key={key}>{renderInline(node.children, key)}</strong>;
    if (node.type === 'italic') return <em key={key}>{renderInline(node.children, key)}</em>;
    return (
      <a
        key={key}
        href={node.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event: MouseEvent<HTMLAnchorElement>) => {
          event.stopPropagation();
        }}
      >
        {renderInline(node.children, key)}
      </a>
    );
  });
}

function renderLines(lines: InlineNode[][], keyPrefix: string): ReactNode[] {
  return lines.flatMap((line, index) => {
    const nodes = renderInline(line, `${keyPrefix}-line-${index}`);
    if (index === 0) return nodes;
    return [<br key={`${keyPrefix}-br-${index}`} />, ...nodes];
  });
}

function renderHtmlNodes(nodes: Node[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const element = node as HTMLElement;
    const children = renderHtmlNodes(Array.from(element.childNodes), key);
    if (element.tagName === 'H1') return <h1 key={key}>{children}</h1>;
    if (element.tagName === 'H2') return <h2 key={key}>{children}</h2>;
    if (element.tagName === 'UL') return <ul key={key}>{children}</ul>;
    if (element.tagName === 'OL') return <ol key={key}>{children}</ol>;
    if (element.tagName === 'LI') return <li key={key}>{children}</li>;
    if (element.tagName === 'STRONG') return <strong key={key}>{children}</strong>;
    if (element.tagName === 'EM') return <em key={key}>{children}</em>;
    if (element.tagName === 'U') return <u key={key}>{children}</u>;
    if (element.tagName === 'SMALL') return <small key={key}>{children}</small>;
    if (element.tagName === 'BR') return <br key={key} />;
    if (element.tagName === 'A') {
      const href = toSafeHttpUrl(element.getAttribute('href') ?? '');
      if (!href) return <span key={key}>{children}</span>;
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event: MouseEvent<HTMLAnchorElement>) => event.stopPropagation()}
        >
          {children}
        </a>
      );
    }
    if (element.tagName === 'P') return <p key={key}>{children}</p>;
    return <span key={key}>{children}</span>;
  });
}

function renderStoredHtml(html: string): ReactNode {
  const clean = sanitizeRichHtml(html);
  if (!clean || typeof document === 'undefined') return null;
  const parsed = new DOMParser().parseFromString(clean, 'text/html');
  return renderHtmlNodes(Array.from(parsed.body.childNodes), 'html');
}

/** Visar sparad text. Ny HTML (rubrik, understrykning, liten) och äldre Markdown. */
export function MarkdownText({ text, className }: MarkdownTextProps) {
  const source = text ?? '';
  const classNames = [styles.root, className].filter(Boolean).join(' ');
  if (isStoredRichHtml(source)) {
    const rich = renderStoredHtml(source);
    if (!rich) return null;
    return <div className={classNames}>{rich}</div>;
  }
  const blocks = parseMarkdown(source);
  if (blocks.length === 0) return null;

  return (
    <div className={classNames}>
      {blocks.map((block, index) => {
        if (block.type === 'ul') {
          return (
            <ul key={`ul-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`ul-${index}-${itemIndex}`}>{renderInline(item, `ul-${index}-${itemIndex}`)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={`ol-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`ol-${index}-${itemIndex}`}>{renderInline(item, `ol-${index}-${itemIndex}`)}</li>
              ))}
            </ol>
          );
        }
        return <p key={`p-${index}`}>{renderLines(block.lines, `p-${index}`)}</p>;
      })}
    </div>
  );
}
