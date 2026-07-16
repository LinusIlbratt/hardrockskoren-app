import { createContext, useContext } from 'react';

/** Return true to allow close; false to block (caller shows confirmation UI). */
export type ModalCloseGuardFn = () => boolean;

export interface ModalCloseGuardContextValue {
  registerGuard: (guard: ModalCloseGuardFn) => () => void;
  /** Run all guards; close modal if none block. */
  requestClose: () => void;
  /** Close modal immediately, bypassing guards (after user confirms discard). */
  forceClose: () => void;
}

export const ModalCloseGuardContext = createContext<ModalCloseGuardContextValue | null>(null);

export function useModalCloseGuardContext(): ModalCloseGuardContextValue | null {
  return useContext(ModalCloseGuardContext);
}
