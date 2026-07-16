import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { IoClose } from 'react-icons/io5';
import {
  ModalCloseGuardContext,
  type ModalCloseGuardFn,
} from '@/context/ModalCloseGuardContext';
import styles from './Modal.module.scss';

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /**
   * Form modals: disables backdrop close by default.
   * Close-guard context is always available when the modal is open;
   * child forms opt in via useModalFormGuard.
   */
  formMode?: boolean;
  /** When false, clicks on the backdrop do not close the modal. */
  closeOnBackdropClick?: boolean;
  /** When false, Escape does not close the modal. */
  closeOnEscape?: boolean;
}

export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  formMode = false,
  closeOnBackdropClick: closeOnBackdropClickProp,
  closeOnEscape = true,
}: ModalProps) => {
  const closeOnBackdropClick = closeOnBackdropClickProp ?? !formMode;

  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const backdropMouseDownRef = useRef(false);
  const guardsRef = useRef<Set<ModalCloseGuardFn>>(new Set());

  const registerGuard = useCallback((guard: ModalCloseGuardFn) => {
    guardsRef.current.add(guard);
    return () => {
      guardsRef.current.delete(guard);
    };
  }, []);

  const forceClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    for (const guard of guardsRef.current) {
      if (!guard()) {
        return;
      }
    }
    onClose();
  }, [onClose]);

  const guardContextValue = useMemo(
    () => ({ registerGuard, requestClose, forceClose }),
    [registerGuard, requestClose, forceClose],
  );

  useEffect(() => {
    if (!isOpen) {
      guardsRef.current.clear();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !closeOnEscape) {
      return;
    }

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        requestClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, closeOnEscape, requestClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    previousActiveElement.current = document.activeElement as HTMLElement | null;
    const el = modalRef.current;
    if (!el) {
      return;
    }

    const getFocusables = () =>
      Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (node) =>
          !node.hasAttribute('disabled') &&
          node.getAttribute('aria-hidden') !== 'true' &&
          node.tabIndex !== -1,
      );

    const initialFocusables = getFocusables();
    initialFocusables[0]?.focus();

    // Re-query on each Tab so dynamically added controls (e.g. discard confirm) are included.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') {
        return;
      }

      const focusables = getFocusables();
      if (focusables.length === 0) {
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    el.addEventListener('keydown', handleKeyDown);
    return () => {
      el.removeEventListener('keydown', handleKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [isOpen]);

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!closeOnBackdropClick) {
      return;
    }
    backdropMouseDownRef.current = e.target === e.currentTarget;
  };

  const handleBackdropMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!closeOnBackdropClick) {
      return;
    }
    if (backdropMouseDownRef.current && e.target === e.currentTarget) {
      requestClose();
    }
    backdropMouseDownRef.current = false;
  };

  if (!isOpen) {
    return null;
  }

  return ReactDOM.createPortal(
    <ModalCloseGuardContext.Provider value={guardContextValue}>
      <div
        className={styles.backdrop}
        onMouseDown={handleBackdropMouseDown}
        onMouseUp={handleBackdropMouseUp}
      >
        <div
          ref={modalRef}
          className={styles.modal}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <header className={styles.header}>
            <h2 id="modal-title" className={styles.title}>{title}</h2>
            <button
              type="button"
              className={styles.closeButton}
              onClick={requestClose}
              aria-label="Stäng modal"
            >
              <IoClose size={24} />
            </button>
          </header>

          <div className={styles.content}>
            {children}
          </div>

          {footer && (
            <footer className={styles.footer}>
              {footer}
            </footer>
          )}
        </div>
      </div>
    </ModalCloseGuardContext.Provider>,
    document.getElementById('modal-root')!,
  );
};
