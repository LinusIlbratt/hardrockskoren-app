# Affärslogik — Hårdrockskörens app

Vad appen gör, för vem, och vilka regler som gäller. Icke-teknisk beskrivning.

Senast verifierad mot koden: 2026-09-26.

---

## 1. Vad appen är

En medlemsportal för Hårdrockskören. Kören är organiserad i flera lokala körer
(t.ex. en per ort). Varje kör har sina egna medlemmar, sin egen repertoar, sin
egen kalender och sina egna meddelanden. Ovanpå det finns gemensamt material och
gemensamma konserter som spänner över alla körer.

Appen löser fyra saker: **få ut noter och övningsmaterial**, **hålla koll på
kalendern**, **nå medlemmarna med information**, och **samla anmälningar till
gemensamma konserter**.

---

## 2. Användarroller

Tre roller. Rollen är global för en person — inte per kör.

### Admin
Plattformsansvarig. Ser och gör allt, i alla körer.

- Skapar och tar bort körer
- Bjuder in medlemmar till vilken kör som helst
- Laddar upp allt material: noter, stämfiler, sjung-upp-material
- Skickar meddelanden (Aktuellt) till en, flera eller alla körer
- Skapar och administrerar gemensamma konserter och ser anmälningslistorna
- Ändrar andras roller och plockar bort medlemmar ur körer
- Skapar både konserter och repetitioner i kalendern

### Körledare (`leader`)
Ansvarar för sin kör. Ser sin körs sidor.

- Skapar och tar bort repertoarer i sin kör
- Kopplar material från biblioteket till sin körs repertoarer
- Skapar **endast repetitioner** i kalendern, inte konserter
- Bjuder in medlemmar
- Ser och hanterar medlemslistan (andra körledare döljs i listan)
- Startar närvaroregistrering och ser närvarohistorik
- Kan **inte** ladda upp nytt material till biblioteket — det är admin-only

### Medlem (`user`)
Vanlig körsångare.

- Ser sin körs repertoarer och kan lyssna på och ladda ner materialet
- Ser kalendern
- Läser Aktuellt
- Anmäler sig till gemensamma konserter
- Registrerar sin närvaro med en kod
- Bygger egna spellistor och markerar favoriter
- Ser sjung-upp-material

### Rättighetsöversikt

| Funktion | Admin | Körledare | Medlem |
|---|:---:|:---:|:---:|
| Skapa/ta bort kör | ✅ | — | — |
| Bjuda in medlemmar | ✅ | ✅ | — |
| Se medlemslista | ✅ | ✅ | — |
| Plocka bort medlem ur kören | ✅ | ✅ | — |
| Ändra roll (till körledare eller medlem) | ✅ | ✅ | — |
| Göra någon till admin | — | — | — |
| Ladda upp material till biblioteket | ✅ | — | — |
| Skapa repertoar i kören | ✅ | ✅ | — |
| Koppla material till repertoar | ✅ | ✅ | — |
| Se repertoar och material | ✅ | ✅ | ✅ |
| Skapa konsert i kalendern | ✅ | — | — |
| Skapa repetition i kalendern | ✅ | ✅ | — |
| Se kalendern | ✅ | ✅ | ✅ |
| Skicka meddelande (Aktuellt) | ✅ | — | — |
| Läsa Aktuellt | ✅ | ✅ | ✅ |
| Skapa gemensam konsert | ✅ | — | — |
| Anmäla sig till gemensam konsert | ✅ | ✅ | ✅ |
| Se anmälningslista | ✅ | — | — |
| Starta närvaroregistrering | ✅ | ✅ | — |
| Registrera egen närvaro | ✅ | ✅ | ✅ |
| Spellistor och favoriter | ✅ | ✅ | ✅ |

**Om att ta bort medlemmar:** en borttagning plockar personen ur den aktuella
kören. Kontot finns kvar, och personen behåller sina eventuella andra körer,
sina spellistor och sina favoriter. Det finns med andra ord ingen funktion i
appen för att radera ett konto permanent — det måste göras i AWS-konsolen.

**Om att sätta admin-rollen:** admin-rollen kan inte delas ut via appen. Den
sätts manuellt i AWS-konsolen. Det är avsiktligt, så att en körledare inte kan
skaffa sig full plattformsbehörighet.

---

## 3. Huvudflöden

### Inbjudan och registrering

Så kommer nya medlemmar in. Admin eller körledare anger en eller flera
e-postadresser, väljer kör och roll.

Systemet hanterar två fall per adress:

**Personen har redan konto.** Läggs till i kören direkt och får ett mejl om att
hen nu finns i kören. Ingen registrering behövs — nya kören dyker upp nästa
gång hen loggar in.

**Personen är ny.** En inbjudan skapas med en unik länk och mejlas ut. Länken
går till registreringssidan där personen fyller i förnamn, efternamn och
lösenord (minst 8 tecken, måste innehålla både bokstäver och siffror). När
kontot skapas raderas inbjudan.

Inbjudningar **går ut efter 7 dagar** och städas bort automatiskt.
Utskicken sker via Resend från `inbjudan@hardrockskoren.se`.

Admin kan också skapa konton direkt utan inbjudningsmejl.

### Inloggning

E-post och lösenord. Lyckad inloggning ger en access-token som sparas i
webbläsaren.

Efter inloggning skickas man vidare automatiskt:
- Admin → adminvyn med körlistan
- Körledare eller medlem med exakt **en** kör → direkt in i den kören
- Körledare eller medlem med **flera eller noll** körer → sidan för att välja kör

**Begränsning idag:** det finns ingen förnyelse av inloggningen. När tokenen går
ut (ca en timme) måste man logga in igen. Ingen tvåfaktorsautentisering.

Glömt lösenord skickar en kod som gäller i 15 minuter.

### Repertoar och material

Materialet är organiserat i två lager.

**Biblioteket** är gemensamt och adminstyrt. Admin laddar upp noter, ljudfiler
och stämfiler i mappstruktur. Filerna ligger på ett ställe — de kopieras inte
per kör.

**Repertoarer** hör till en specifik kör. En körledare eller admin skapar en
repertoar (t.ex. "Vårkonsert 2026") och kopplar material från biblioteket till
den. En låt kan ligga i många körers repertoarer samtidigt utan att filen
dupliceras.

Det finns också en synkfunktion: admin kan koppla en hel bibliotekmapp till en
eller flera körer, så att repertoaren uppdateras när mappens innehåll ändras.

Medlemmar ser sin körs repertoarer, kan spela upp materialet i den inbyggda
spelaren och ladda ner det. Nedladdningslänkar är tidsbegränsade.

**Sjung-upp-material** är ett separat, körövergripande spår märkt med veckonummer
(format `2026-W12`). Alla inloggade kan se det; endast admin laddar upp.

### Egen musik: spellistor och favoriter

Varje användare kan skapa egna spellistor av material hen har tillgång till, och
markera enskilda spår som favoriter. Detta är privat per användare — ingen annan
ser någon annans spellistor. Spellistor kan döpas om, få en beskrivning, och
spår kan läggas till och tas bort.

### Kalender (events)

Två sorters händelser: **konsert** och **repetition**. Båda har titel, starttid,
sluttid och valfri beskrivning.

Behörighetsskillnaden: admin får skapa båda, körledare får bara skapa
repetitioner.

Systemet håller reda på vad varje medlem redan har sett. När ett event skapas
eller ändras markeras det som olästt för körens medlemmar, och beskrivningar har
en egen "ändrad"-markering skild från övriga fältändringar. Det gör att man kan
se *vad* som ändrats, inte bara *att* något ändrats.

Events kan också skapas i batch — flera repetitioner på en gång.

### Aktuellt (meddelanden)

Admin skriver ett meddelande med rubrik (max 120 tecken) och brödtext (max 4000
tecken) och väljer mottagare: antingen **alla körer** eller **en lista med
specifika körer** (max 50 åt gången). De två kan inte kombineras.

Meddelandet lagras en gång och pekas ut mot varje mottagarkör. Avsändarens
förnamn sparas vid utskickstillfället så att det står kvar även om personen
senare byter namn eller slutar.

Medlemmar ser ett flöde med nyaste först, med sin körs meddelanden och
alla-körer-meddelanden sammanslagna. Olästa markeras. Flödet laddar 20 åt gången
med en "ladda äldre"-funktion, max 50 per anrop.

Admin har en egen vy över allt som skickats och kan ta bort meddelanden.

### Gemensamma konserter och anmälan

Admin skapar en gemensam konsert med titel, datum, plats och beskrivning. Den är
synlig för alla inloggade oavsett kör.

Medlemmar anmäler sig med förnamn, efternamn och vilken kör de representerar.
Systemet garanterar att **en person bara kan anmäla sig en gång** per konsert.

**Anmälan stänger automatiskt** när konsertdatumet har passerat (räknat i svensk
tid). Passerade konserter syns kvar som historik men går inte att anmäla sig
till.

Admin ser anmälningslistan i anmälningsordning, sidvis (20 åt gången, max 50).
Endast admin ser listan — anmälningar är inte offentliga.

Radering av en konsert sker i två steg: konserten markeras först som "raderas"
och försvinner då direkt ur listorna, sedan städas anmälningarna bort. Det
förhindrar halvraderade konserter om något går fel mitt i.

Samtidiga ändringar hanteras: om två administratörer redigerar samma konsert
samtidigt får den andra ett felmeddelande i stället för att skriva över.

### Närvaro

Körledaren startar en närvarosession för dagen. Systemet genererar en
**fyrsiffrig kod** som gäller i **20 minuter**. Startar man en session igen
medan en redan är aktiv får man tillbaka samma kod — inga dubbletter.

Medlemmarna skriver in koden i appen och registrerar sin närvaro. Namnet hämtas
automatiskt från kontot.

Körledaren ser vilka som är närvarande och kan bläddra i historiken per dag.

**Begränsning idag:** samma person kan registrera sig flera gånger på samma
session och hamnar då flera gånger i listan.

### Offentlig körlista

En sida som listar alla körer med namn, ort och körledare. Kräver inloggning,
men visar alla körer oavsett vilken man tillhör — tänkt för medlemmar som vill
se var kören finns.

---

## 4. Begränsningar att känna till

Saker som inte finns idag och som ofta efterfrågas:

| Område | Status |
|---|---|
| Push-notiser | Finns inte. Notifieringar visas bara i appen. |
| Automatisk mejlutskick vid nytt event eller meddelande | Finns inte. Mejl skickas bara vid inbjudan. |
| Förnyad inloggning / "kom ihåg mig" | Finns inte. Man loggas ut när sessionen går ut. |
| Tvåfaktorsautentisering | Avstängt. |
| Närvarostatistik över tid | Finns inte, bara dag för dag. |
| Avanmälan från gemensam konsert | Finns inte. |
| Kommentarer eller svar på meddelanden | Finns inte. Enkelriktat. |
| Stämindelning (sopran/alt/tenor/bas) | Finns inte i datamodellen. |
| Rollen gäller per kör | Nej. En körledare är körledare överallt. |
| Permanent radering av konto | Finns inte i appen. Görs i AWS-konsolen. |
| Tilldela admin-rollen | Finns inte i appen. Görs i AWS-konsolen. |
