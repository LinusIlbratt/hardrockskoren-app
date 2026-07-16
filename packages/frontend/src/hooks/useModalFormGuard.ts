import { useCallback, useEffect, useRef, useState } from 'react';
import { useModalCloseGuardContext } from '@/context/ModalCloseGuardContext';

export interface UseModalFormGuardOptions {
  /** True when the user has unsaved edits. */
  isDirty: boolean;
  /** When true, all close attempts are blocked (e.g. while submitting). */
  isBlocked?: boolean;
  /** Used when the form is rendered outside a Modal (optional fallback). */
  onCloseFallback?: () => void;
}

/**
 * Registers an unsaved-changes guard with the parent Modal and exposes
 * confirmation UI state for DiscardChangesConfirm.
 *
 * Must be called from a component rendered inside Modal's content tree.
 */
export function useModalFormGuard({
  isDirty,
  isBlocked = false,
  onCloseFallback,
}: UseModalFormGuardOptions) {
  const modalContext = useModalCloseGuardContext();
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const showDiscardConfirmRef = useRef(showDiscardConfirm);
  showDiscardConfirmRef.current = showDiscardConfirm;

  // Drop confirm UI if a submit/busy state starts — avoid discard during in-flight work.
  useEffect(() => {
    if (isBlocked) {
      setShowDiscardConfirm(false);
    }
  }, [isBlocked]);

  const guard = useCallback((): boolean => {
    if (isBlocked) {
      return false;
    }
    if (!isDirty) {
      return true;
    }
    // Second Escape / X while confirm is open cancels the confirm (does not discard).
    if (showDiscardConfirmRef.current) {
      setShowDiscardConfirm(false);
      return false;
    }
    setShowDiscardConfirm(true);
    return false;
  }, [isBlocked, isDirty]);

  useEffect(() => {
    if (!modalContext) {
      return;
    }
    return modalContext.registerGuard(guard);
  }, [modalContext, guard]);

  const requestClose = useCallback(() => {
    if (modalContext) {
      modalContext.requestClose();
      return;
    }
    if (isBlocked) {
      return;
    }
    if (!isDirty) {
      onCloseFallback?.();
      return;
    }
    if (showDiscardConfirmRef.current) {
      setShowDiscardConfirm(false);
      return;
    }
    setShowDiscardConfirm(true);
  }, [modalContext, isBlocked, isDirty, onCloseFallback]);

  const confirmDiscard = useCallback(() => {
    if (isBlocked) {
      return;
    }
    setShowDiscardConfirm(false);
    if (modalContext) {
      modalContext.forceClose();
      return;
    }
    onCloseFallback?.();
  }, [isBlocked, modalContext, onCloseFallback]);

  const cancelDiscard = useCallback(() => {
    setShowDiscardConfirm(false);
  }, []);

  return {
    showDiscardConfirm,
    requestClose,
    confirmDiscard,
    cancelDiscard,
    isInsideModal: Boolean(modalContext),
  };
}
