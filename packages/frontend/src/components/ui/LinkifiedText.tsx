import type { MouseEvent, ReactNode } from "react";
import styles from "./LinkifiedText.module.scss";

interface LinkifiedTextProps {
  text: string;
  className?: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Sentence punctuation and an unmatched closing bracket stay outside the link. */
function splitTrailingPunctuation(raw: string): { url: string; trailing: string } {
  let url = raw;
  let trailing = "";

  while (url.length > 0) {
    const last = url[url.length - 1];
    if (/[.,;:!?]/.test(last)) {
      trailing = last + trailing;
      url = url.slice(0, -1);
      continue;
    }
    if (
      (last === ")" && count(url, "(") < count(url, ")")) ||
      (last === "]" && count(url, "[") < count(url, "]")) ||
      (last === "}" && count(url, "{") < count(url, "}"))
    ) {
      trailing = last + trailing;
      url = url.slice(0, -1);
      continue;
    }
    break;
  }

  return { url, trailing };
}

function count(value: string, char: string): number {
  let n = 0;
  for (const c of value) {
    if (c === char) n += 1;
  }
  return n;
}

function linkify(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = new RegExp(URL_PATTERN.source, "gi");
  let cursor = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const start = match.index;
    const raw = match[0];
    if (start > cursor) {
      nodes.push(text.slice(cursor, start));
    }

    const { url, trailing } = splitTrailingPunctuation(raw);
    if (url && isSafeHttpUrl(url)) {
      nodes.push(
        <a
          key={`link-${index}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
          onClick={(event: MouseEvent<HTMLAnchorElement>) => {
            event.stopPropagation();
          }}
        >
          {url}
        </a>
      );
      if (trailing) nodes.push(trailing);
    } else {
      nodes.push(raw);
    }

    cursor = start + raw.length;
    index += 1;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

export function LinkifiedText({ text, className }: LinkifiedTextProps) {
  const classNames = className ? `${styles.root} ${className}` : styles.root;
  return <span className={classNames}>{linkify(text ?? "")}</span>;
}
