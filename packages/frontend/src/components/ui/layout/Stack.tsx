import { createElement, type ElementType, type JSX, type ReactNode } from 'react';
import styles from './Stack.module.scss';

type StackGap = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
type StackAlign = 'start' | 'center' | 'end' | 'stretch';

const GAP_CLASS: Record<StackGap, string> = {
  '2xs': styles.gap2xs,
  xs: styles.gapXs,
  sm: styles.gapSm,
  md: styles.gapMd,
  lg: styles.gapLg,
  xl: styles.gapXl,
  '2xl': styles.gap2xl,
};

const ALIGN_CLASS: Record<StackAlign, string> = {
  start: styles.alignStart,
  center: styles.alignCenter,
  end: styles.alignEnd,
  stretch: styles.alignStretch,
};

export interface StackProps {
  gap?: StackGap;
  align?: StackAlign;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  children: ReactNode;
}

export const Stack = ({
  gap = 'md',
  align = 'stretch',
  as = 'div',
  className,
  children,
}: StackProps) => {
  const classNames = [styles.stack, GAP_CLASS[gap], ALIGN_CLASS[align], className]
    .filter(Boolean)
    .join(' ');

  return createElement(as as ElementType, { className: classNames }, children);
};
