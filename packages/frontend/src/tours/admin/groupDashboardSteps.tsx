import { type StepType } from '@reactour/tour';

export const groupDashboardSteps: StepType[] = [
    {
        // ÄNDRAD: från "group-card-repertoar" till "group-nav-repertoires"
        selector: '[data-tour="group-nav"]',
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
        selector: '[data-tour="group-nav-repertoires"]',
        content: <>
            <b>Material</b><br />
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
        // ÄNDRAD: från "group-card-practice" till "group-nav-practice"
        selector: '[data-tour="group-nav-practice"]',
        content: <>
            <b>Körens övningsmaterial</b><br />
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
        selector: '[data-tour="group-nav-concerts"]',
        content: <>
            <b>Körens Events</b><br />
            <br />

            Planera och se kommande konserter och repdatum.
        </>
    },

    {
        selector: '[data-tour="group-nav-users"]',
        content: 'Se och bjud in medlemmar till just denna kör.'
    },
    {
        selector: '[data-tour="group-nav-attendance"]',
        content: 'Här kan du se och hantera närvaron för körens repetitioner.'
    }
];