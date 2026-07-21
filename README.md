# Kivora

**Revenue, on watch.** Kivora is an AI revenue operations platform built for the Wheelhouse Revenue Management Hackathon 2026. It turns live Wheelhouse portfolio data into a ranked War Room, explainable audits, safe what-if previews, approval-gated actions, external demand signals, reports, and per-user Telegram operations.

Kivora never substitutes synthetic portfolio data. If Wheelhouse, MongoDB, Groq, Ticketmaster, or OpenWeather is unavailable, the relevant workflow reports that state instead of fabricating a result.

## Applications

```text
kivora/
├── frontend/   # Next.js 16, React, Axios, React Query, Framer Motion, Recharts
└── backend/    # NestJS 11, MongoDB/Mongoose, Wheelhouse, Groq, Telegram
```

## Run locally

```bash
cp backend/.env.example backend/.env.local
cp frontend/.env.example frontend/.env.local
npm install --prefix backend
npm install --prefix frontend
npm run dev:backend
npm run dev:frontend
```

Open `http://localhost:3000`. Swagger is at `http://localhost:4000/api/docs`, and health is at `http://localhost:4000/api/health`.

## Required configuration

The browser only receives:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_PRIVY_APP_ID`

The NestJS application owns every secret: `MONGODB_URI`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `WHEELHOUSE_API_KEY`, `GROQ_API_KEY`, and `KIVORA_APPROVAL_TOKEN`. The official Privy Node client verifies access tokens using the app ID and app secret; no additional verification credential is needed.

Ticketmaster, OpenWeather, and Telegram are production integrations but remain disabled until their corresponding administrator credentials are set. Telegram uses one bot with per-user MongoDB connections—there is intentionally no global `TELEGRAM_CHAT_ID`.

## Live feature coverage

- AI Revenue War Room with portfolio health, revenue at risk, incidents, opportunities, market signals, and ranked actions
- Rolling Wheelhouse scans with rate-aware batches and deterministic underpricing, overpricing, disabled-pricing, booking-pace, and calendar/sync audits
- Wheelhouse non-mutating previews plus explicit approval, sync, audit logging, and read-after-write verification for supported fixes
- Conservative, balanced, and aggressive Wheelhouse strategy previews and approved preset application
- Ticketmaster event matching and OpenWeather demand-risk signals using listing coordinates
- Portfolio KPIs, Wheelhouse segments, incident center, opportunity feed, activity center, underwriting, and grounded Groq assistant
- Executive, portfolio, owner, and revenue reports generated from stored live facts
- Per-user Telegram linking, alerts, daily briefings, conversational questions, previews, and role-checked approvals

## Verification

```bash
npm run lint
npm test
npm run build
```

For a local container build, run `docker compose --env-file frontend/.env.local up --build`; the backend reads `backend/.env.local`, while the two public frontend values are passed as build arguments. See [architecture](docs/ARCHITECTURE.md), [operator walkthrough](docs/DEMO_SCRIPT.md), and [submission copy](docs/SUBMISSION.md).
