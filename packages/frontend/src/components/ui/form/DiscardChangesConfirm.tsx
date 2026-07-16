import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import styles from './DiscardChangesConfirm.module.scss';

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface DiscardChangesConfirmProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export const DiscardChangesConfirm = ({ onConfirm, onCancel }: DiscardChangesConfirmProps) => {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLSpanElement>(null);
  const [dialogEl, setDialogEl] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    setDialogEl(host.closest('[role="dialog"]'));
  }, []);

  useLayoutEffect(() => {
    if (!dialogEl) {
      return;
    }

    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    const getFocusables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
      );

    // Prefer the safe action so default focus is non-destructive.
    const cancelButton = panel.querySelector<HTMLButtonElement>('[data-discard-cancel]');
    (cancelButton ?? getFocusables()[0])?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return;
      }

      const focusables = getFocusables();
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          event.preventDefault();
          event.stopPropagation();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        event.preventDefault();
        event.stopPropagation();
        first.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!panel.contains(event.target as Node)) {
        getFocusables()[0]?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [dialogEl]);

  const overlay = dialogEl
    ? createPortal(
        <div
          className={styles.overlay}
          role="presentation"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            ref={panelRef}
            className={styles.confirm}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
          >
            <p id={titleId} className={styles.message}>
              Du har osparade ändringar. Vill du stänga utan att spara?
            </p>
            <p id={descId} className={styles.srOnly}>
              Välj att fortsätta redigera eller stänga utan att spara.
            </p>
            <div className={styles.actions}>
              <Button
                type="button"
                variant={ButtonVariant.Primary}
                data-discard-cancel
                onClick={onCancel}
              >
                Fortsätt redigera
              </Button>
              <Button type="button" variant={ButtonVariant.Destructive} onClick={onConfirm}>
                Stäng utan att spara
              </Button>
            </div>
          </div>
        </div>,
        dialogEl,
      )
    : null;

  // Host marker so we can locate the parent Modal dialog for portaling.
  return (
    <>
      <span ref={hostRef} className={styles.host} aria-hidden="true" />
      {overlay}
    </>
  );
};
