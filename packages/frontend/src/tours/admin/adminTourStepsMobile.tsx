import { type StepType } from '@reactour/tour';

export const adminTourStepsMobile: StepType[] = [
  {
    selector: '[data-tour="hamburger-menu-icon"]',
    content: (
      <>
        <b>Här öppnar/stänger du huvudmenyn</b>
        <br />
        <span>Tryck på hamburgarikonen för att se menyn.</span>
      </>
    ),
  },
  {
    selector: '[data-tour="admin-groups-link"]',
    content: (
      <div>
        Här hanterar du dina körer
        <br />
        <ul>
          <li>Skapa ny kör</li>
          <li>Redigera befintlig kör</li>
        </ul>
      </div>
    ),
  },
  // ...fler steg
];
