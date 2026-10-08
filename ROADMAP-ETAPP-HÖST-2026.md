# Krav- och Avcheckningsunderlag: Etapp Höst 2026

Officiellt avcheckningsunderlag för nästa utvecklingsblock.  
Varje punkt är klar först när både implementation och acceptanskriterier är ikryssade.

Läs `ARKITEKTUR.md` och `AFFARSLOGIK.md` innan kod. Ingen `Scan`. Identitet från authorizer. Kör-skopad data kräver `requireGroupAccess`. Inga nya npm-paket eller tabeller/GSI utan godkännande.

**Senast uppdaterad:** 2026-10-02

---

## 1. Filer & Material

- [ ] **Byta visningsnamn på filer direkt i appen**
  - Möjliggör inline-redigering eller modal för att döpa om filer i materialbiblioteket utan ny uppladdning.
  - Uppdatera visningsnamnet (`title`) på materialposten i DynamoDB. S3-nyckeln (`materials/{uuid}-{filnamn}`) och uppspelning via lagrad `filePath` ska inte kräva ny uppladdning. Byt objekt i S3 bara om en befintlig referens faktiskt pekar på filnamnet i nyckeln — kopiera inte filen per kör.
  - Endast admin (biblioteket är admin-only). Validera namn (längd, inga path-tecken). `UpdateItem` med villkor att posten finns.
  - **Acceptans**
    - [ ] Admin kan byta visningsnamn på en befintlig fil och se det nya namnet direkt i biblioteket.
    - [ ] Uppspelning och nedladdning fungerar efter bytet, utan ny uppladdning.
    - [ ] Körledare och medlem kan inte döpa om globalt material.

- [x] **Textkorrigering i Materialsektionen**
  - I `packages/frontend/src/pages/admin/AdminUploadMaterialPage.tsx`: hjälptexten ska enbart lyda `"Här hanterar du globalt material"`.
  - Radera texten `"som kan användas för Sjung upp-övningar"`.
  - **Acceptans**
    - [x] Materialsidan visar exakt den nya meningen och inget om Sjung upp-övningar.

## 2. Repertoar & Låtlistor

- [x] **Alfabetisk sortering (A–Ö) på låttitlar**
  - Sortera låtar/repertoar per kör i bokstavsordning i de vyer som listar dem (medlem och admin/körledare).
  - Använd `localeCompare('sv')` så att Å, Ä och Ö sorteras efter Z. Ingen egen bokstavstabell.
  - **Acceptans**
    - [x] Listan för en kör är A–Ö, med Å/Ä/Ö sist.
    - [x] Sorteringen gäller vald kör och blandar inte titlar från andra körer.

## 3. Användarhantering & Medlemmar

- [x] **Fritextsökning: "Söka medlemmar"**
  - Placera sökfältet direkt under körfiltret i admin-vyn.
  - Filtrera på både namn och e-post. Sökningen ska gälla inom den kör som är vald i filtret (tomt körfilter = alla körer admin får se).
  - Filtrera på redan hämtad lista i klienten. Ingen ny `Scan` och inget nytt GSI för fritext.
  - **Acceptans**
    - [x] Sökfältet ligger direkt under körfiltret.
    - [x] Träff på förnamn, efternamn och e-post, och resultatet följer valt körfilter.
    - [x] Tom sökning visar samma lista som körfiltret ensamt.

- [ ] **Manuell användarhantering för admin (Bypass inbjudningsstrul)**
  - Admin ska kunna skapa ett konto utan inbjudningsmejl och sätta ett initialt permanent lösenord (Cognito `AdminCreateUser` + `AdminSetUserPassword` med `Permanent: true`), så att medlemmen kan logga in direkt.
  - Lösenordskrav som vid registrering: minst 8 tecken, bokstäver och siffror. Rollen får bara vara `leader` eller `user` — `admin` sätts inte via API:et.
  - Cognito-kontot raderas när en medlem tas bort (`AdminDeleteUser` i `delete.ts`, 2026-10-07). DynamoDB-poster (spellistor, favoriter, anmälningar) städas fortfarande inte.
  - Körledare får inte skapa eller radera konton på plattformsnivå. Identitet från authorizer, `requireGroupAccess` om anropet är kör-skopat.
  - **Acceptans**
    - [ ] Admin skapar ett konto med permanent lösenord och användaren kan logga in utan mejlaktivering.
    - [ ] API:et avvisar försök att sätta rollen `admin`.
    - [ ] Explicit radering tar bort kontot i Cognito och användarens poster i DynamoDB.
    - [ ] "Ta bort ur kör" lämnar kontot kvar och rör inte personens övriga körer.

- [ ] **Översikt över inbjudna men ej registrerade medlemmar**
  - Medlemslistan ska visa inbjudningar som skickats men där kontot ännu inte aktiverats (inbjudan finns, ingen Cognito-användare).
  - Status ska skilja "inbjuden, ej registrerad" från aktiva medlemmar. Utgångna inbjudningar (7 dagar) ska inte se ut som väntande.
  - **Acceptans**
    - [ ] En skickad, oanvänd inbjudan syns i listan med tydlig status.
    - [ ] Status försvinner när personen slutfört registrering.
    - [ ] En inbjudan äldre än 7 dagar visas inte som väntande.

---
