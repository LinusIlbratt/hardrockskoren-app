import { type StepType } from '@reactour/tour';
// src/tours/user/memberDashboardSteps.ts
export const memberDashboardSteps: StepType [] = [
    {
        selector: 'body', // Inget element – rutan visas i mitten
        content: (
            <>
                <b>Välkommen!</b><br />
                <br></br>
                Denna guide dyker upp när du behöver den för att visa viktiga funktioner och hjälpa dig att hitta rätt.
                <br></br>
                <br></br>
                Följ pilarna för att lära dig mer!
                <p style={{
                    fontSize: '0.875rem',
                    color: '#A0A0A0',
                    marginTop: '1.5rem'
                }}>
                    Avsluta guiden när du vill
                    genom att trycka på krysset
                </p>
            </>
        ),
    },
     {
    selector: '[data-tour="user-repertoires-link"]',
    content: <> 
            <b>Ditt material</b><br />
            <br></br>
            Här hittar du körens alla repertoarer och tillhörande material
            <p style={{
                    fontSize: '0.875rem',
                    color: '#A0A0A0',
                    marginTop: '1.5rem'
                }}>
                    Om listan är tom så har din körledare inte laddat upp något material ännu.
                </p>
    </>
  },
    
  {
    selector: '[data-tour="user-practice-link"]',
    content: <> 
            <b>Ditt övnings material</b><br />
            <br></br>
            Här hittar du allt övnings material som finns tillgängligt
            <p style={{
                    fontSize: '0.875rem',
                    color: '#A0A0A0',
                    marginTop: '1.5rem'
                }}>
                    Om listan är tom så har administratören inte lagt upp något material.
                </p>
    </>
  },
    {
    selector: '[data-tour="user-concerts-link"]',
    content: <> 
            <b>Körens Events</b><br />
            <br></br>
            Här hittar du körens alla datum för repetioner och konserter
            <p style={{
                    fontSize: '0.875rem',
                    color: '#A0A0A0',
                    marginTop: '1.5rem'
                }}>
                    Om listan är tom så har din körledare inte skapat något event.
                </p>
    </>
  },

  
  
  // ...fler steg
];