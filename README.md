# Kivora

**Revenue, on watch.** Kivora is an autonomous revenue control room for vacation-rental operators, built for the Wheelhouse Revenue Management Hackathon 2026.

The winning demo loop is intentionally focused: Kivora detects a costly pricing override, explains the Wheelhouse signals behind it, runs a safe what-if preview, waits for human approval, restores pricing, records the action, and prepares the owner update.

## Run locally

```bash
cp backend/.env.example backend/.env
npm install --prefix frontend
npm install --prefix backend
npm run start:dev --prefix backend
npm run dev --prefix frontend
```

The repository contains two independent applications:

```text
kivora/
├── frontend/   # Next.js, React Query, Axios and Framer Motion
└── backend/    # NestJS, MongoDB, Mongoose and Wheelhouse API
```

Open `http://localhost:3000`; API documentation is available at `http://localhost:4000/api/docs`. When a required dependency is unavailable, the frontend shows the upstream failure and never substitutes synthetic data.

For live operation, configure Privy on both applications (`NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`), plus `MONGODB_URI`, `WHEELHOUSE_API_KEY`, `GROQ_API_KEY`, and `KIVORA_APPROVAL_TOKEN`. Telegram uses one bot plus signed webhooks and signed account-link intents; each Privy user gets their own Telegram connection.

## Architecture

- Next.js 16, React Query, Axios, Framer Motion, Recharts, Tailwind and shadcn-style primitives
- NestJS, MongoDB and Mongoose
- Wheelhouse RM API isolated behind a typed service with timeouts, 429 backoff, safe previews and human approval gates
- Audit records for every approved mutation
- Ten-minute portfolio scans, rate-aware batching and read-after-write verification
- Privy manager authentication, mutation approval guard, throttling and security headers
- Per-user signed Telegram linking, identity-bound approvals and Groq-generated owner communications

## Production checklist

Set `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `MONGODB_URI`, `WHEELHOUSE_API_KEY`, `GROQ_API_KEY`, `FRONTEND_URL`, `BACKEND_PUBLIC_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_LINK_SECRET`, and a strong approval secret. Never expose backend credentials to the browser.

See [architecture](docs/ARCHITECTURE.md), [demo script](docs/DEMO_SCRIPT.md), and [submission copy](docs/SUBMISSION.md).
