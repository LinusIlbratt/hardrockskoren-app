// src/tours/admin/groupsStepsMobile.tsx
import { type StepType } from '@reactour/tour';

export const adminListGroupPageStepsMobile: StepType[] = [
   {
    selector: 'body', // Inget element – rutan visas i mitten
    content: (
        <>
            <b>Välkommen!</b><br />
            <br />
            Denna guide dyker upp när du behöver den för att visa viktiga funktioner och hjälpa dig att hitta rätt.
            <br />
            <br />
            Följ pilarna för att lära dig mer!
            <br />
            <p style={{
                fontSize: '0.875rem', 
                color: '#A0A0A0',     
                marginTop: '1.5rem'
            }}>
                Klicka på krysset i högra hörnet när du vill avsluta guiden.
            </p>
        </>
    ),
},
    {
        selector: '[data-tour="admin-create-group-button"]',
        content: (
            <>
                <b>Här skapar man nya körer!</b>
                <br />
                <p style={{
                fontSize: '0.875rem', 
                color: '#A0A0A0',     
                marginTop: '1.5rem'
            }}>
                Fyll i information i rutan som öppnas.
            </p>
            </>
        ),
    },
    {
        selector: '[data-tour="admin-filter-input"]',
        content: (
            <>
                <b>Sök och hitta körer snabbt!</b><br />
                 <p style={{
                fontSize: '0.875rem', 
                color: '#A0A0A0',     
                marginTop: '1.5rem'
            }}>
                Använd sökfältet om listan blir lång.
            </p>
            </>
        ),
    },
    {
        selector: '[data-tour="hamburger-menu-icon"]',
        content: (
            <>
                
                Detta öppnar upp din huvud navigation
                på mobila-enheter.<br />
                <p style={{
                fontSize: '0.875rem', 
                color: '#A0A0A0',     
                marginTop: '1.5rem'
            }}>
                Avsluta guiden genom att trycka på krysset
            </p>
                
            </>
        ),
    },
];

