# Arkitektur — Hrk-app

Single source of truth för struktur, datamodell och auth. Läs denna före ny
feature, ny tabell/GSI, nytt API-paket eller ändrad datamodell.

Senast verifierad mot koden: 2026-09-26.

---

## 1. Översikt

Medlems- och adminapp för Hårdrockskören. Monorepo med React/Vite-SPA och
Serverless Framework-Lambdas bakom AWS HTTP API (API Gateway v2), autentisering
via Cognito, data i DynamoDB, filer i S3.

Region: `eu-north-1`. Stages: `dev`, `prod`.

### Monorepo-verktyg

**npm workspaces** (`"workspaces": ["packages/*"]` i rot-`package.json`).
Ingen Turborepo, ingen Nx, ingen Lerna. Rot-`package.json` har inget riktigt
build-script — varje paket byggs och deployas för sig.

Backend orkestreras av **Serverless Compose** (`packages/serverless-compose.yml`).
Alla sju API-tjänster har `dependsOn: infra-service`.

### Paket

| Paket | Serverless-service | Runtime | Ansvar |
|---|---|---|---|
| `infra-service` | `infra-service` | — | DynamoDB, Cognito, S3. Deployas först. |
| `core` | — (bibliotek) | — | Delade typer, permissions, auth-helpers, HTTP-svar |
| `auth-api` | `hrk-auth-service` | nodejs20.x / arm64 | Login, /me, lösenord |
| `admin-api` | `hrk-admin-service` | nodejs20.x / arm64 | Grupper, användare, inbjudningar, närvaro, **central authorizer** |
| `event-api` | `hrk-event-api` | nodejs18.x | Konserter/repetitioner i kalender |
| `material-api` | `hrk-material-api` | nodejs18.x | Noter, repertoarer, sjung-upp-material, S3 |
| `music-api` | `hrk-music-api` | nodejs18.x | Personliga spellistor och favoriter |
| `message-api` | `hrk-message-api` | nodejs20.x | Aktuellt / meddelanden |
| `concert-api` | `hrk-concert-api` | nodejs20.x | Gemensamma konserter + anmälan |
| `frontend` | — (S3 website) | — | React 19 SPA |

**Teknisk skuld:** `event-api`, `material-api` och `music-api` kör fortfarande
`nodejs18.x`, som är EOL. Endast `auth-api` och `admin-api` kör `arm64`.

### Golden path — kopiera dessa

| Uppgift | Följ | Använd inte som mall |
|---|---|---|
| Listor, Query, paginering | `message-api` | `ScanCommand` i `admin-api/functions/group/list.ts` |
| TransactWrite, unikhet, optimistic locking | `concert-api` | Get-sedan-Put utan condition |
| Behörighet per route | `core/utils/permissions.ts` | Ny route utan permissions-rad |
| Kör-access (IDOR-skydd) | `core/utils/requireGroupAccess.ts` | `groupSlug` från path utan check |
| Nyckelhjälpare + enhetstest | `*/functions/lib/keys.ts` + `keys.test.ts` | Inline-strängar i handlern |

---

## 2. Autentisering och auktorisering

Detta är den del som oftast missförstås. Tre separata mekanismer:

| Fråga | Svar kommer från |
|---|---|
| Vem är du? | Cognito access token (JWT), verifierad med `aws-jwt-verify` |
| Vilken roll har du? | Cognito-attributet **`custom:role`** |
| Vilka körer tillhör du? | Cognito **User Pool Groups** (`GroupName` == kör-slug) |

**Ingenting av detta ligger i DynamoDB.** Raderna `GROUP#{slug} / USER#{email}`
i huvudtabellen skrivs av `invite/create.ts` men läses inte av något
listnings-API — de är legacy och ska inte behandlas som sanning.

### Inloggningsflödet

1. `POST /login` (`auth-api/functions/auth.ts`) hämtar `userPoolId` + `clientId`
   från DynamoDB-posten `PK=TENANT#hrk, SK=SETTINGS` och kör
   `AdminInitiateAuth` med `ADMIN_NO_SRP_AUTH`.
2. Svaret innehåller **enbart `accessToken`** — ingen refresh token, inget
   id-token. Sessionen dör när access token går ut.
3. Frontend sparar token i `localStorage` under nyckeln `authToken` och anropar
   `GET /me` för att fylla `AuthContext`.
4. `GET /me` läser `custom:role`, namn och `AdminListGroupsForUser` från Cognito.

### Authorizern

Lambda request-authorizer, `payloadVersion: 2.0`, `enableSimpleResponses: true`,
identity source `$request.header.Authorization`.

Koden finns i `admin-api/functions/authorizer/authorizer.ts` och deployas som
`hrk-apigateway-admin-authorizer-${stage}`. Alla övriga tjänster
(`event`, `material`, `music`, `message`, `concert`) refererar den **via hårdkodad
ARN** under authorizer-namnet `centralJwtAuthorizer`, plus en
`AWS::Lambda::Permission` för invoke. `auth-api` deployar en egen kopia
(`hrk-apigateway-auth-authorizer-${stage}`).

Konsekvens: admin-api är ett hårt deploy-beroende för alla andra API:er men det
syns inte i `serverless-compose.yml` (där står bara `dependsOn: infra-service`).

Authorizern gör per anrop:

1. Släpper igenom `OPTIONS` för CORS-preflight.
2. Verifierar JWT (`tokenUse: "access"`).
3. `AdminGetUser` mot Cognito för att läsa `custom:role`, `given_name`,
   `family_name`.
4. Slår upp `event.routeKey` i `routePermissions`. **Saknas routen → nekas.**
   Detta är deny-by-default och är avsiktligt.
5. Returnerar `AuthContext` som authorizer-context.

```typescript
// packages/core/types/auth.ts
export type RoleTypes = "user" | "admin" | "leader";

export interface AuthContext {
  uuid: string;        // Cognito sub — använd denna som användar-ID
  role: RoleTypes;
  given_name?: string;
  family_name?: string;
  groups?: string[];
  clientId?: string;
  userPoolId?: string;
}
```

Läs alltid identitet från `event.requestContext.authorizer.lambda`. Aldrig från
request body.

### Kör-access (IDOR-skydd)

`routePermissions` svarar bara på "får den här *rollen* nå den här routen" —
inte "får den här *användaren* nå den här *kören*". Det andra kräver
`packages/core/utils/requireGroupAccess.ts`:

- `requireGroupAccessResponse(ctx, slug)` — admin passerar; övriga måste vara
  med i Cognito-gruppen med samma namn som sluggen.
- `requireAnyChoirMembershipResponse(ctx)` — för ALL-scope-data.
- `requireAccessToAnyGroupSlug(ctx, slugs)` — skärning mot flera slugs.

Returnerar `null` vid OK, annars ett färdigt felsvar.

**Används idag av:** `message-api` (list, markRead, unreadStatus, createGroupMessage),
`concert-api` (createSignup), `material-api` (listRepertoires,
listMaterialsInRepertoire), `event-api` (list, create, update, batch,
delete, getNotificationStatus), `admin-api` (user delete/update).

**Används INTE av:** skriv-endpointsen i `material-api`
(`linkMaterialToRepertoire`, `createRepertoire`, `deleteRepertoire`).

### Kända säkerhetsbrister (verifierade, ej åtgärdade)

| # | Var | Problem |
|---|---|---|
| 1 | `admin-api/functions/user/delete.ts` | ✅ **Ändrat 2026-10-07.** `AdminDeleteUser` tar bort hela Cognito-kontot. Anropet kräver att målet är medlem i `groupSlug`. Cognito-gruppen `admin` kan inte raderas. `UserNotFoundException` ger 200. |
| 2 | `admin-api/functions/user/update.ts` | ✅ **Åtgärdat 2026-09-26.** Allowlist på `leader`/`user`; `admin` kan inte sättas via API:et. |
| 3 | `event-api/functions/event/*` | ✅ **Åtgärdat 2026-09-26.** `requireGroupAccessResponse` på alla kör-skopade event-endpoints (list, create, update, batch, delete, getNotificationStatus). Admin passerar; leader/user begränsas till sina Cognito-grupper. |
| 4 | `material-api/functions/getUploadUrl.ts` | Ingen validering av filnamn, filtyp eller storlek. Presigned PUT binder inte `ContentType`. |
| 5 | Alla `serverless.yml` | `httpApi.cors: true` = alla origins. S3-bucketens CORS är däremot låst till frontend-URL:en. |
| 6 | `infra-service/iam/cognito.yml` | `custom:role` finns inte i Schema-blocket. Hela auktoriseringen hänger på manuell konsolkonfiguration. |

---

## 3. Datamodell

### Tabeller

Fyra tabeller, alla `PAY_PER_REQUEST`, alla med PITR och deletion protection.

**`HrkMainTable-${stage}`** — single-table för domändata.
PK (S) + SK (S).

| Index | Hash | Range | Använd till |
|---|---|---|---|
| GSI1 | `GSI1PK` | `GSI1SK` | Tidsordnade listor: event per kör, globala material, skickade meddelanden, gemensamma konserter |
| GSI2 | `GSI1PK` | `filePath` | Uppslag av bibliotekmaterial via filsökväg (material-api-synk) |

Obs att GSI2 återanvänder `GSI1PK` som hash. Det betyder att en post som deltar
i GSI1 automatiskt hamnar i GSI2 så snart den har `filePath`.

**`HrkInviteTable-${stage}`** — PK `inviteId`. TTL på `timeToLive` (7 dygn).

**`HrkAttendanceSessionsTable-${stage}`** — PK `date` + SK `sessionId`.
GSI `AttendanceCodeIndex` (`attendanceCode`) och `GroupDateIndex`
(`groupSlug` + `date`). TTL på `expiresAt`.

**`HrkPasswordResetTokensTable-${stage}`** — PK `email`. TTL på `expiresAt` (15 min).

### Nyckelmönster i huvudtabellen

| Entitet | PK | SK | GSI1PK | GSI1SK |
|---|---|---|---|---|
| Tenant-inställningar | `TENANT#hrk` | `SETTINGS` | — | — |
| Kör (metadata) | `GROUP#{slug}` | `METADATA` | — | — |
| Event | `GROUP#{slug}` | `EVENT#{eventId}` | `GROUP#{slug}` | ISO-startdatum |
| Repertoar | `GROUP#{slug}` | `REPERTOIRE#{id}` | — | — |
| Repertoar↔material | `GROUP#{slug}#REPERTOIRE#{repId}` | `MATERIAL#{matId}` | — | — |
| Globalt material | `MATERIAL#{id}` | `MATERIAL#{id}` | `MATERIALS` | createdAt |
| Sjung-upp-material | `SJUNGUPP#MATERIALS` | `MATERIAL#{id}` | — | — |
| Spellista | `USER#{uuid}` | `PLAYLIST#{id}` | — | — |
| Favorit | `USER#{uuid}` | `FAVORITE#{materialId}` | — | — |
| Meddelande (kanoniskt) | `MSG#{messageId}` | `META` | `MSG#SENT` | `{createdAt}#{id}` |
| Meddelande-pekare | `GROUP#{slug}` eller `GROUP#ALL` | `MSG#{createdAt}#{id}` | — | — |
| Läskvitto | `USER#{uuid}` | `MSGREAD#{messageId}` | — | — |
| Gemensam konsert | `SHARED_CONCERT#{id}` | `META` | `SHARED_CONCERT#LIST#{år}` | `{datum}#{id}` |
| Konsertanmälan | `SHARED_CONCERT#{id}` | `SIGNUP#{createdAt}#{uuid}` | — | — |
| Anmälnings-ref (unikhet) | `SHARED_CONCERT#{id}` | `SIGNUPREF#{uuid}` | — | — |
| Kör↔användare (legacy) | `GROUP#{slug}` | `USER#{email}` | — | — |

Sista raden: skrivs av invite-flödet men läses inte av något API. Betrakta som
död data.

### Kostnadsregler

PAY_PER_REQUEST. Query och GetItem, aldrig Scan i ny kod. Tunna poster.
`ProjectionExpression` när hela posten inte behövs. Unikhet och räknare via
`ConditionExpression` eller `TransactWrite`.

Tre `ScanCommand` finns kvar och är **legacy, inte mall**:
`admin-api/functions/group/list.ts`, `admin-api/functions/group/listPublic.ts`,
`material-api/functions/syncAllRepertoiresFromLibraryFolder.ts`.

### Två mönster värda att kopiera

**Fan-out undviks i `message-api`.** Ett kanoniskt meddelande (`MSG#{id}/META`)
plus en tunn pekare per kör. Inte N fulla kopior. Max 50 mottagarkörer per
utskick eftersom TransactWrite klarar 100 items. Redigering (`PUT`) uppdaterar
bara `title`, `body` och `updatedAt` på META-posten. Radering tar bort META och
pekarna som listas i `targets`.

**Årsshardning i `concert-api`.** `GSI1PK = SHARED_CONCERT#LIST#{år}` sprider
last i stället för en enda het partition. Listningen frågar 5 år bakåt plus den
gamla oshardade partitionen `SHARED_CONCERT#LIST`.

---

## 4. Lagring (S3)

**`hrk-media-${stage}-${accountId}`** — noter, ljud, video.
Public access helt blockerat. CORS tillåter GET och PUT från enbart frontend-URL:en
(`http://localhost:5173` i dev, `https://app.hardrockskoren.se` i prod).
All åtkomst sker via presigned URLs (upload 300 s).
Nyckelmönster: `materials/{uuid}-{filnamn}`.

**`hrk-app-frontend-${stage}-${accountId}`** — statisk SPA-hosting.
`IndexDocument` och `ErrorDocument` båda `index.html` för client-side routing.

Ingen versionering, ingen lifecycle-policy, ingen explicit `BucketEncryption`
(AWS-hanterad SSE-S3 gäller som default). Ingen CloudFront.

Känd inkonsekvens: material raderas i två steg utan transaktion, så en
misslyckad DynamoDB-delete efter en lyckad S3-delete lämnar föräldralösa poster
(och tvärtom).

---

## 5. Delade verktyg — `packages/core`

Importeras både som `@hrk/core/...` (music-, message-api) och via relativ sökväg
`../../core/...` (äldre paket). Båda funkar; `@hrk/core` är att föredra.

| Fil | Innehåll |
|---|---|
| `types/auth.ts` | `RoleTypes`, `AuthContext` |
| `utils/permissions.ts` | `RoleGroups`, `routePermissions` — **enda källan för route-behörighet** |
| `utils/requireGroupAccess.ts` | Kör-access-kontroller (IDOR) |
| `utils/authHelper.ts` | JWT-dekomposition, verifier-skapande, attributläsning |
| `utils/http.ts` | `sendResponse`, `sendError` |
| `utils/messageFeed.ts` | Flödesmerge, unread-beräkning, cursors |
| `services/cognito.ts` | Delad Cognito-klient |
| `middleware/validateSchema.ts` | Middy-middleware för Joi-scheman |

Tester: `vitest` i `core`, `message-api` och `concert-api`. Övriga paket saknar
tester helt.

---

## 6. Frontend

React 19 + Vite + TypeScript + SCSS-moduler. Alias `@` → `src`.

```
src/
  components/   layout/, ui/, auth/ (ProtectedRoute, RequireRole)
  context/      AuthContext, EventNotification, Favorites, MessageUnread,
                MusicPlayerOverlay, ModalCloseGuard, GroupNotificationProviders
  hooks/        useAuth, useAttendance, useFavorites, usePlaylists, ...
  pages/        admin/, leader/, member/ + LoginPage, RegistrationPage,
                GroupSelectionPage, PracticePage, PublicChoirListPage
  routes/       Router.tsx — all routing på ett ställe
  services/     concertService, eventService, messageService, musicService,
                mediaUrlService
  styles/       _variables.scss, _typography.scss, main.scss
  tours/        @reactour/tour-onboarding
```

Miljövariabler (en per API):
`VITE_AUTH_API_URL`, `VITE_ADMIN_API_URL`, `VITE_EVENT_API_URL`,
`VITE_MATERIAL_API_URL`, `VITE_MUSIC_API_URL`, `VITE_MESSAGE_API_URL`,
`VITE_CONCERT_API_URL`.

Routing styrs av roll: `/admin/*` bakom `RequireRole roles={["admin"]}`,
`/leader/choir/:groupName/*`, `/user/me/:groupName/*`. Rot-routen `/` väljer
destination utifrån roll och antal körer — en kör går direkt in, noll eller
flera går till `/select-group`.

**Odeklarerade beroenden:** `axios` och `@hrk/core` används i frontend-koden men
står inte i `packages/frontend/package.json`. De löser sig via hoisting från
rotens `node_modules`. Bräckligt — bör deklareras.

Frontend har inga tester och ingen code splitting (alla routes importeras direkt
i `Router.tsx`). Ingen error boundary.

---

## 7. Checklista före kod på ny access path

Skriv ner detta innan du skriver handlern:

1. Skärm eller API-anrop → vilken operation? `GetItem` eller `Query` (PK/SK
   eller GSI)? Aldrig Scan.
2. Vilka `ConditionExpression` behövs för unikhet eller räknare?
3. Vilken rad i `routePermissions` läggs till — **i samma ändring**.
4. Behövs `requireGroupAccess`? Om datan är kör-skopad: ja.
5. IAM per function: exakt de actions koden anropar. `TransactWrite` kräver
   även `PutItem`/`UpdateItem`/`DeleteItem` separat.
6. Ny service → `nodejs20.x`, HTTP API med `centralJwtAuthorizer`, registrera i
   `serverless-compose.yml`, vitest för nycklar och regler.

Inga nya npm-paket, nya tabeller eller nya GSI utan uttryckligt godkännande.
