import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import styles from './MediaPlayer.module.scss';

type Props = {
  text: string;
};

/**
 * Visar ellipsis om titeln får plats; annars långsam marquee när texten är längre än behållaren.
 */
export function TrackTitleMarquee({ text }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [shiftPx, setShiftPx] = useState(0);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const measure = () => {
      setShiftPx(Math.max(0, inner.scrollWidth - outer.clientWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [text]);

  const marqueeStyle: CSSProperties | undefined =
    shiftPx > 0 ? { ['--marquee-shift' as string]: `${shiftPx}px` } : undefined;

  return (
    <div ref={outerRef} className={styles.trackTitleWrap}>
      <span
        ref={innerRef}
        className={shiftPx > 0 ? styles.trackTitleMarqueeInner : styles.trackTitleStatic}
        style={marqueeStyle}
      >
        {text || '—'}
      </span>
    </div>
  );
}
