import { type StepType } from '@reactour/tour';

export const leaderNavSteps: StepType[] = [
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
        // ÄNDRAD: från "group-card-repertoar" till "group-nav-repertoires"
        selector: '[data-tour="leader-nav"]',
        content: <>
            <b>Körens Kontrollpanel</b><br />
            <p style={{
                fontSize: '0.875rem',
                color: '#A0A0A0',
                marginTop: '1.5rem'
            }}>
                Detta är huvudmenyn. Använd länkarna för att hantera allt som rör just denna kör – från repertoar till närvaro.
            </p>
        </>
    },
    {
        // ÄNDRAD: från "group-card-repertoar" till "group-nav-repertoires"
        selector: '[data-tour="leader-repertoire-link"]',
        content: <>
            <b>Repertoire</b><br />
            <p style={{
                fontSize: '0.875rem',
                color: '#A0A0A0',
                marginTop: '1.5rem'
            }}>
                Klicka här för att komma till sidan som hantera
                körens repertoire.
            </p>
        </>
    },
        {
        selector: '[data-tour="leader-concerts-link"]',
        content: <>
            <b>Events</b><br />
            <br />
            <p style={{
                fontSize: '0.875rem',
                color: '#A0A0A0',
                marginTop: '1.5rem'
            }}>
                Klicka här för att komma till sidan för att 
                hantera konsert och rep datum.
            </p>
        </>
    },
    {
        // ÄNDRAD: från "group-card-practice" till "group-nav-practice"
        selector: '[data-tour="leader-practice-link"]',
        content: <>
            <b>Övningsmaterial</b><br />
            <br />
            Hitta allt gemensamt övningsmaterial. Innehållet här är detsamma för alla körer.
            <br />
            <br />
            <p style={{
                fontSize: '0.875rem',
                color: '#A0A0A0',
                marginTop: '1.5rem'
            }}>
                Allt material i listan hanteras och laddas upp av en administratör.
            </p>
        </>
    },
    {
        selector: '[data-tour="leader-users-link"]',
        content: 'Se och bjud in medlemmar till just denna kör.'
    },
    {
        selector: '[data-tour="leader-attendance-link"]',
        content: 'Här kan du se och hantera närvaron för körens repetitioner.'
    }
];