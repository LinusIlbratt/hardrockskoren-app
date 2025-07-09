import { type StepType } from '@reactour/tour';

// Funktionen tar emot användarens roll och returnerar en array med steg
export const createAdminMainNavMobileSteps = (userRole: string): StepType[] => {
  // Börja med de steg som är gemensamma för alla, t.ex. en välkomsttext
  // I en mobilmeny kanske det första man pekar på är hamburgarikonen? 
  // Detta är bara ett exempel, anpassa efter din guide.
  const steps: StepType[] = [
    
    // Steg för user-info kan också vara gemensamt
  ];

  // Om användaren är ADMIN, lägg till admin-specifika steg
  if (userRole === 'admin') {
    steps.push(
      {
        selector: '[data-tour="admin-groups-link"]',
        content: (
          <>
            <b>Hantera körer</b><br />
            <p style={{ fontSize: '0.875rem', color: '#A0A0A0', marginTop: '1.5rem' }}>
              Här ser och administrerar du alla körer i systemet.
            </p>
          </>
        ),
      },
      {
        selector: '[data-tour="admin-global-material-link"]',
        content: (
          <>
            <b>Materialarkivet</b><br />
            <p style={{ fontSize: '0.875rem', color: '#A0A0A0', marginTop: '1.5rem' }}>
              Här hanterar du allt gemensamt material som kan användas i repertoarer.
            </p>
          </>
        ),
      },
      {
        selector: '[data-tour="admin-practice-link"]',
        content: (
          <>
            <b>Sjungupp!</b><br />
            <p style={{ fontSize: '0.875rem', color: '#A0A0A0', marginTop: '1.5rem' }}>
              Här laddar du upp övningsmaterial som är tillgängligt för alla.
            </p>
          </>
        ),
      }
    );
  }

  

  // Glöm inte att returnera den färdiga listan!
  return steps;
};