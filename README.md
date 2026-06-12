# Hårdrockskören – Applikation

**Medlems- och administrationsapp för Hårdrockskören.** Webbapplikation för hantering av körmedlemmar, grupper, evenemang, närvaro och övningsmaterial, med separata gränssnitt för medlemmar och administratörer.

---

## Översikt

Hrk-app är en fullständig, serverlös webbapplikation byggd som en **monorepo** med delad kod, tydlig ansvarsfördelning mellan tjänster och automatiserad deployment mot AWS. Backend består av flera API:er (auth, admin, event, material) som körs på AWS Lambda bakom API Gateway, med DynamoDB och S3 som persistering. Frontend är en React-app (Vite, TypeScript) som anropar dessa API:er och hanterar inloggning via AWS Cognito.

---

## Arkitektur

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Frontend (React + Vite)                     │
│                    SPA, Cognito JWT, VITE_* env för API-URL:er            │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ HTTPS
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   auth-api    │  │  admin-api     │  │  event-api     │  │ material-api   │
│   (Lambda)    │  │  (Lambda)      │  │  (Lambda)      │  │  (Lambda)      │
│ Login, reset  │  │ Grupper,       │  │ Evenemang,     │  │ Material,      │
│               │  │ inbjudan,      │  │ list/filter    │  │ presigned S3   │
│               │  │ användare,     │  │                │  │                │
│               │  │ närvaro        │  │                │  │                │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                  │                  │                  │
        └──────────────────┼──────────────────┼──────────────────┘
                            ▼                  ▼
        ┌───────────────────────────────────────────────────────────────┐
        │  infra-service (en gång per miljö)                             │
        │  DynamoDB (HrkMainTable + GSI, Invite, Attendance, Reset)       │
        │  S3 (media, frontend), Cognito User Pool                        │
        └───────────────────────────────────────────────────────────────┘
```

- **Single-table design:** Huvuddata i DynamoDB med PK/SK och GSI för olika access patterns.
- **IAM per function:** Varje Lambda har minimal behörighet via `serverless-iam-roles-per-function`.
- **Authorizer:** JWT-validering (Cognito) med cachelagring; admin/event/material använder samma authorizer där det passar.
- **Filuppladdning:** Presigned S3-URL:er – filer laddas inte genom Lambda.

---

## Teknisk stack

| Lager        | Teknik                                                                  |
| ------------ | ----------------------------------------------------------------------- |
| **Frontend** | React 19, TypeScript, Vite 6, React Router, Tailwind/Sass, Lucide React |
| **Backend**  | Node.js 18/20, AWS Lambda, API Gateway HTTP API, Serverless Framework 4 |
| **Data**     | DynamoDB (PAY_PER_REQUEST), S3 (media + frontend-hosting)               |
| **Auth**     | AWS Cognito (User Pool), JWT i Authorization-header                     |
| **Infra**    | Serverless Compose (infra-service → auth, admin, event, material)       |

---

## Monorepo-struktur

```
hrk-app/
├── package.json              # Workspaces: packages/*
├── packages/
│   ├── frontend/             # React SPA (Vite)
│   ├── core/                 # Delad kod: typer, auth-hjälp, http, permissions
│   ├── infra-service/        # DynamoDB-tabeller, S3, Cognito (deployas först)
│   ├── auth-api/             # Login, lösenordsåterställning
│   ├── admin-api/            # Grupper, inbjudan, användare, närvaro
│   ├── event-api/            # Evenemang
│   ├── material-api/         # Övningsmaterial, globalt material, presigned upload
│   └── serverless-compose.yml # Deploy-ordning för backend
└── docs/                     # Dokumentation (arbetsflöden, analys, prioritering)
```

---

## Förutsättningar

- **Node.js** 18+ (rekommenderat 20 för parity med Lambda)
- **AWS CLI** konfigurerat med rätt konto och behörighet att skapa Lambda, API Gateway, DynamoDB, S3, Cognito
- **env-filer** per tjänst och stage (t.ex. `env.dev.yaml`, `env.prod.yaml`) – finns inte i Git; måste sättas upp manuellt eller från säker källa

---

## Kom igång

### 1. Klona och installera

```bash
git clone <repo-url>
cd hrk-app
npm install
```

### 2. Backend (dev)

Deploya infrastruktur och alla API:er till en dev-stage:

```bash
cd packages
npx serverless deploy --stage dev
```

Anteckna de utskrivna HTTP API-URL:erna för varje tjänst (auth, admin, event, material).

### 3. Konfigurera frontend

I `packages/frontend` skapa `.env` med dev-API-URL:er:

```env
VITE_AUTH_API_URL=https://<auth-api-dev-url>
VITE_ADMIN_API_URL=https://<admin-api-dev-url>
VITE_EVENT_API_URL=https://<event-api-dev-url>
VITE_MATERIAL_API_URL=https://<material-api-dev-url>
VITE_S3_BUCKET_URL=https://<media-bucket-url>
```

### 4. Starta frontend lokalt

```bash
cd packages/frontend
npm run dev
```

Öppna `http://localhost:5173` och logga in med en användare från dev-Cognito User Pool.

### 5. Bygg och deploy till produktion

- **Frontend:** `npm run build` i `packages/frontend`, sedan uppladdning till S3 (eller CI/CD).
- **Backend:** `npx serverless deploy --stage prod` i `packages` (med korrekt `env.prod.yaml` per tjänst).

Detaljerade steg finns i [docs/ARBETSFLODEN.md](docs/ARBETSFLODEN.md).

---

## Skript (root)

- `npm run build` – generisk (använd workspace-specifika kommandon, t.ex. `npm run build -w frontend`).

I varje `packages/<pkg>`:

- **frontend:** `dev`, `build`, `preview`, `lint`
- **admin-api / auth-api / event-api / material-api:** deploy via `serverless` i `packages` med `serverless-compose`

---

## Licens

ISC.

---

_Hårdrockskören – hrk-app monorepo._
