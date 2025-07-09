import { type StepType } from '@reactour/tour';

export const leaderTourSteps: StepType[] = [
  // Dessa selektorer matchar länkarna i din LeaderNav.tsx
  {
    selector: '[data-tour="leader-repertoire-link"]', // Matchar NavLink till "repertoires" i LeaderNav
    content: 'Här hanterar du all körens repertoar. Lägg till nya låtar och organisera befintliga.',
  },
  {
    selector: '[data-tour="leader-concerts-link"]', // Matchar NavLink till "concerts" i LeaderNav
    content: 'Skapa och se översikten över kommande konserter och viktiga repdatum.',
  },
  {
    selector: '[data-tour="leader-practice-link"]', // Matchar NavLink till "practice" i LeaderNav
    content: 'Hantera och ladda upp övningsmaterial. Hjälp kören att sjunga upp effektivt!',
  },
  {
    selector: '[data-tour="leader-users-link"]', // Matchar NavLink till "users" i LeaderNav
    content: 'Administrera medlemmarna i din kör, se deras information och behörigheter.',
  },
  {
    selector: '[data-tour="leader-attendance-link"]', // Matchar NavLink till "attendance" i LeaderNav
    content: 'Följ upp körmedlemmarnas närvaro på övningar och evenemang här.',
  },
  // Om du har specifika knappar eller element UTANFÖR LeaderNav som en körledare använder,
  // som att "ladda upp material" eller "skapa event" direkt på en sida,
  // måste du lägga till data-tour attribut på dessa element OCH lägga till nya steg här.
  // Exempel på sådana steg (om relevanta för din UI):
  // {
  //   selector: '[data-tour="leader-upload-material-button"]', // Exempel: knappen för att ladda upp på en repertoarsida
  //   content: 'Använd den här knappen för att lägga till nya noter eller ljudfiler till den aktuella repertoaren.',
  // },
  // {
  //   selector: '[data-tour="leader-create-event-button"]', // Exempel: knapp för att skapa ett event på en kalendersida
  //   content: 'Klicka här för att schemalägga en ny konsert, ett rep eller en annan händelse.',
  // },
];