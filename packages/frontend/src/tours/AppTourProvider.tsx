// Fil: AppTourProvider.tsx

import { TourProvider, type StepType } from '@reactour/tour';
import React from 'react';

/** Sätt till true för att visa onboarding-turerna igen. */
export const ENABLE_ONBOARDING_TOURS = false;

export interface AppTourProviderProps {
  steps: StepType[];
  tourKey: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  beforeClose?: () => void;
  onClickMask?: () => void;
}

export function AppTourProvider({
  steps,
  tourKey,
  children,
  defaultOpen,
  beforeClose,
  onClickMask,
}: AppTourProviderProps) {
  const shouldOpen =
    ENABLE_ONBOARDING_TOURS &&
    (typeof defaultOpen === 'boolean'
      ? defaultOpen
      : process.env.NODE_ENV === 'development'
        ? true
        : !localStorage.getItem(`tour_seen_for_${tourKey}`));

  return (
    <TourProvider
      steps={steps}
      defaultOpen={shouldOpen}
      beforeClose={() => {
        if (process.env.NODE_ENV !== 'development') {
          localStorage.setItem(`tour_seen_for_${tourKey}`, 'true');
        }
        if (beforeClose) beforeClose();
      }}
      maskClassName="tour-mask"
      disableInteraction={true}
      onClickMask={onClickMask}

      // 👇 LÄGG TILL DENNA RAD FÖR ATT DÖLJA BADGE/NUMRERINGEN
      showBadge={false}
      
      styles={{
        popover: (base) => ({
          ...base,
          backgroundColor: '#1A1A1A',
          color: '#f5f5f5',
          borderRadius: '8px',
          boxShadow: '0 4px 15px rgba(109, 0, 0, 0.2)',
        }),
        badge: (base) => ({
          ...base,
          backgroundColor: '#fe160a',
        }),
        dot: (base, state) => ({
          ...base,
          backgroundColor: state?.active ? '#8e44ad' : '#ccc',
        }),
        close: (base) => ({
          ...base,
          color: '#F5F5F5',
          width: '16px',
          height: '16px',
        }),
      }}
    >
      {children}
    </TourProvider>
  );
}