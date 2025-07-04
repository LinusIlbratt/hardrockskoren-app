// src/utils/translations.ts

import type { RoleTypes } from '@hrk/core/types';

/**
 * Översätter en system-roll till en läsbar, svensk text.
 * @param role - Rollen från systemet, t.ex. 'user', 'leader', 'admin'.
 * @returns En läsbar sträng, t.ex. 'Medlem'.
 */
export const translateRole = (role: RoleTypes): string => {
  switch (role) {
    case 'user':
      return 'Medlem';
    case 'leader':
      return 'Körledare';
    case 'admin':
      return 'Administratör';
    default:
      // Returnera den ursprungliga rollen om den inte känns igen
      return role;
  }
};