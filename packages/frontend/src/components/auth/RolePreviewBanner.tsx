import { useLayoutEffect, useRef } from 'react';
import { useRolePreview } from '@/hooks/useRolePreview';
import { translateRole } from '@/utils/translations';
import styles from './RolePreviewBanner.module.scss';

/** Fast list högst upp när en admin ser appen som körledare eller medlem. */
export function RolePreviewBanner() {
  const { viewAsRole, switchTo } = useRolePreview();
  const barRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return undefined;

    const applyHeight = () => {
      document.documentElement.style.setProperty('--role-preview-height', `${bar.offsetHeight}px`);
    };

    applyHeight();
    const observer = new ResizeObserver(applyHeight);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--role-preview-height');
    };
  }, [viewAsRole]);

  if (!viewAsRole) return null;

  const label = translateRole(viewAsRole);

  return (
    <div ref={barRef} className={styles.bar} role="status">
      <p className={styles.text}>
        <span aria-hidden="true">👁️</span> Visar appen som {label}
        {' – '}
        <button type="button" className={styles.returnButton} onClick={() => switchTo(null)}>
          Återgå till administratör
        </button>
      </p>
    </div>
  );
}
