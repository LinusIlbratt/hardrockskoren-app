import { type StepType } from '@reactour/tour';

export const userTourSteps: StepType[] = [
  {
    selector: '[data-tour="user-repertoires-link"]', // Matchar NavLink till "repertoires"
    content: 'Här hittar du alla noter, texter och inspelningar för kören. Klicka för att utforska!',
  },
  {
    selector: '[data-tour="user-practice-link"]', // Matchar NavLink till "practice"
    content: 'Få tillgång till övningsmaterial och sjung upp med kören.',
  },
  {
    selector: '[data-tour="user-concerts-link"]', // Matchar NavLink till "concerts"
    content: 'Se när nästa övning eller konsert äger rum. Håll dig uppdaterad!',
  },
  // Denna selektor för meddelandeikon finns inte i de nav-komponenter du visat mig.
  // Om du har en meddelandeikon någon annanstans (t.ex. i en footer eller separat header),
  // måste du lägga till data-tour attributet där. Annars kan du ta bort detta steg.
  // {
  //   selector: '[data-tour="user-messages-icon"]',
  //   content: 'Använd meddelandefunktionen för att kommunicera med körmedlemmar och ledare.',
  // },
  // Denna selektor för närvaroknappen lade vi till i MainNav.
  // Du kanske vill att den visas i turen för användare.
  {
    selector: '[data-tour="user-attendance-button"]',
    content: 'Använd den här knappen för att enkelt registrera din närvaro på övningar.',
  },
];