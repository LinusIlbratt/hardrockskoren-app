import { createElement, type AriaRole, type ElementType, type JSX, type ReactNode } from 'react';
import styles from './Cluster.module.scss';

type ClusterGap = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type ClusterJustify = 'start' | 'center' | 'end' | 'between';
type ClusterAlign = 'start' | 'center' | 'end' | 'baseline';

const GAP_CLASS: Record<ClusterGap, string> = {
  '2xs': styles.gap2xs,
  xs: styles.gapXs,
  sm: styles.gapSm,
  md: styles.gapMd,
  lg: styles.gapLg,
  xl: styles.gapXl,
};

const JUSTIFY_CLASS: Record<ClusterJustify, string> = {
  start: styles.justifyStart,
  center: styles.justifyCenter,
  end: styles.justifyEnd,
  between: styles.justifyBetween,
};

const ALIGN_CLASS: Record<ClusterAlign, string> = {
  start: styles.alignStart,
  center: styles.alignCenter,
  end: styles.alignEnd,
  baseline: styles.alignBaseline,
};

export interface ClusterProps {
  gap?: ClusterGap;
  justify?: ClusterJustify;
  align?: ClusterAlign;
  /** Radbrytning av barn. Standard är true (`flex-wrap: wrap`). */
  wrap?: boolean;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  role?: AriaRole;
  'aria-label'?: string;
  children: ReactNode;
}

export const Cluster = ({
  gap = 'md',
  justify = 'start',
  align = 'center',
  wrap = true,
  as = 'div',
  className,
  role,
  'aria-label': ariaLabel,
  children,
}: ClusterProps) => {
  const classNames = [
    styles.cluster,
    GAP_CLASS[gap],
    JUSTIFY_CLASS[justify],
    ALIGN_CLASS[align],
    wrap ? undefined : styles.nowrap,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return createElement(
    as as ElementType,
    { className: classNames, role, 'aria-label': ariaLabel },
    children,
  );
};
