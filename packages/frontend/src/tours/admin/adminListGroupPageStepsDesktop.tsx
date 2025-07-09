import { type StepType } from '@reactour/tour';

export const adminListGroupPageStepsDesktop: StepType[] = [
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
        selector: '[data-tour="main-navbar"]',
        content: (
            <>
                <b>Huvudmenyn</b><br />
                <br />
                Här uppe hittar du alltid menyn. Använd den för att snabbt navigera mellan de olika delarna av appen.
                <br />
                <br />
                <p style={{
                    fontSize: '0.875rem',
                    color: '#A0A0A0',
                    marginTop: '1.5rem'
                }}>
                    Den följer med dig överallt så att du alltid hittar rätt.
                </p>
            </>
        ),
    },
    {
        selector: '[data-tour="admin-groups-link"]',
        content: (
            <>
                <b>Översikt över körer</b><br />
                <br />
                Klicka här för att komma till sidan där du ser och hanterar alla dina körer.
                <br />
                <br />
                <p style={{
                    fontSize: '0.875rem',
                    color: '#A0A0A0',
                    marginTop: '1.5rem'
                }}>
                    Detta är startsidan för all administration.
                </p>
            </>
        ),
    },
    {
        selector: '[data-tour="admin-global-material-link"]',
        content: (
            <>
                <b>Materialarkivet</b><br />
                <br />
                Här laddar du upp och hanterar allt gemensamt material, som noter och ljudfiler m.m
                <br />
                <br />
                {/* Första p-taggen med info om flödet */}
                <p style={{
                    fontSize: '0.875rem',
                    color: '#A0A0A0',
                    marginTop: '1.5rem',
                    marginBottom: '0.5rem' // Lite mindre marginal nedåt för att hålla ihop textblocken
                }}>
                    Materialet du lägger till här kan du och körledarna sedan
                    använda för att bygga repertoarer för era körer.
                </p>

                {/* Din nya p-tagg med info om behörighet */}
                <p style={{
                    fontSize: '0.875rem',
                    color: '#A0A0A0'
                }}>
                    Som administratör är det bara du som kan se och hantera detta material.
                </p>
            </>
        ),
    },
    {
        selector: '[data-tour="admin-practice-link"]',
        content: (
            <>
                <b>Sjungupp!</b><br />
                <br />
                Här publicerar du sjungupp material, som blir direkt tillgängligt för medlemmar i <b>alla</b> körer.
                <br />
                <br />
                <p style={{
                    fontSize: '0.875rem',
                    color: '#A0A0A0',
                    marginTop: '1.5rem'
                }}>
                    Som administratör är det bara du som kan se och hantera detta material.
                </p>
            </>
        ),
    },





        // osv...
    ];

export const adminGroupCreation: StepType[] = [
    {
        selector: '[data-tour="group-card"]',
        content: (
            <>
                <b>Grattis!</b>
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
        // osv...
    ];
    

