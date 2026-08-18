# Projektkontext (Hrk-app)

Läs detta före ny feature, ny datamodell eller nytt API-paket. Detaljerade förbud finns i `.cursor/rules/`.

## Vad det är

Medlems- och adminapp för Hårdrockskören. Monorepo: React/Vite-frontend + Serverless Lambdas bakom HTTP API, Cognito JWT, **en** DynamoDB-tabell (`HrkMainTable-${stage}`).

## Golden path (kopiera dessa)

| | Följ | Inte mall |
|---|---|---|
| Meddelanden / listor / Query | `packages/message-api` | Cognito custom attrs som “databas” |
| Gemensamma konserter / TransactWrite | `packages/concert-api` | `ScanCommand` i `admin-api` grupplista |
| Behörighet per route | `packages/core/utils/permissions.ts` | Ny route utan permissions-rad |
| Kör-access | `packages/core/utils/requireGroupAccess.ts` | `groupSlug` från body utan check |

## Arkitektur i korthet

- API:er: `auth-api`, `admin-api`, `event-api`, `material-api`, `music-api`, `message-api`, `concert-api`. Infra först (`infra-service`).
- Authorizer sätter `uuid`, `role`, `userPoolId`. Använd det — lita inte på klienten.
- Roller: `admin` (plattform), `leader`, `user` (medlem). Data är oftast `GROUP#{slug}` + SK-prefix.

## Kostnad

PAY_PER_REQUEST. Query/GetItem/tunna poster. Ingen Scan i ny kod. Ingen onödig GSI eller extra tabell.

## Frontend

SPA i `packages/frontend`. Env: `VITE_*_API_URL`. Återanvänd befintliga komponenter och Sass-tokens.
