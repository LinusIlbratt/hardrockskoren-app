import { type StepType } from '@reactour/tour';

export const adminTourSteps: StepType[] = [
    // Dessa selektorer matchar nu länkarna i MainNav.tsx för Admin
    {
        selector: '[data-tour="admin-groups-link"]',
        content: 'Här hanterar du alla körer i systemet. Skapa nya körer och hantera befintliga.',
    },
    {
        selector: '[data-tour="admin-global-material-link"]',
        content: 'Ladda upp och hantera globalt material som är tillgängligt för alla körer.',
    },
    {
        selector: '[data-tour="admin-practice-link"]',
        content: 'Administrera övningsmaterial och sjungupp-sessioner för hela appen.',
    },
    {
        selector: '[data-tour="admin-create-group-button"]',
        content: `  Skapa en ny kör här!
                    En kör är grunden för appen. Den låser upp funktioner som att bjuda in medlemmar och skapa events m.m.
                    

                    Klicka på knappen för att skapa din första kör nu.`,
    }

    // Lägg till fler steg här om du har fler admin-specifika element med data-tour attribut
];