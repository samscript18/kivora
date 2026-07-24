# Kivora

Kivora is a production-oriented revenue operations workspace for short-term-rental portfolios using Wheelhouse. It turns connected portfolio data into explainable incidents, demand opportunities, safe simulations, approval-gated pricing actions, outcome measurement, reports, and Telegram-assisted operations.

Kivora is deliberately conservative: it never fabricates a portfolio, silently changes pricing, or treats a preview as an applied change. A live Wheelhouse write always requires an authenticated, appropriately privileged user, an approved recommendation where applicable, an audit record, and a read-after-write verification attempt.

## What Kivora does

Kivora combines five operating loops:

1. **Observe** — collect organization-scoped Wheelhouse listings, pricing preferences, KPIs, recommendations, flags, reservations, calendar constraints, and neighborhood benchmarks.
2. **Detect** — identify disabled dynamic pricing, pricing divergence, booking-pace gaps, calendar/sync problems, external-event demand, weather-sensitive demand, and deterministic portfolio opportunities.
3. **Decide** — present evidence, financial assumptions, simulations, assignment, comments, recommendation status, and approval controls in one work-item workspace.
4. **Act safely** — apply only supported Wheelhouse mutations after authorization, retain baseline state for supported reversions, queue a sync, and verify the result from Wheelhouse.
5. **Measure and communicate** — create outcome windows, generate reports, maintain an audit trail, send Telegram updates, and display in-app notifications.

The application supports multiple organizations and multiple Wheelhouse connections per organization. Every operational record is organization-scoped.

## Product areas

| Area | Purpose |
| --- | --- |
| Dashboard | Revenue health, at-risk revenue, priorities, trends, activity, recommendations, and outcome totals. |
| Revenue War Room | Ranked incidents and opportunities with a shared investigation and decision workspace. |
| Portfolio and Listings | Connected property inventory plus listing-level live analytics, reservations, pricing, restrictions, and history. |
| Simulator | Non-mutating conservative, balanced, and aggressive Wheelhouse previews. |
| Market Intelligence | Ticketmaster and OpenWeather signals matched to connected listing markets. |
| Reports | Executive, portfolio, owner, and revenue reports with authenticated PDF/CSV exports. |
| Operations | Wheelhouse connections, portfolios, membership, notification preferences, external intelligence settings, and Telegram. |
| AI Assistant | Groq-backed answers grounded in the active organization’s stored and live portfolio context. |

## Connection and pricing semantics

The connection labels are intentionally precise:

| Status | Meaning |
| --- | --- |
| Not configured | No active Wheelhouse connection is available for the current organization. |
| Connected | Kivora has verified live reads. Write scope has not yet been proven by an approved write. |
| Connected — read-only | Wheelhouse rejected a supported write as read-only. Reads and previews remain available. |
| Fully connected | Kivora has verified reads and has persisted evidence of at least one successful approved Wheelhouse write. |

“Dynamic On” is a listing-level Wheelhouse state: automatic rate posting is enabled. “Review needed” means Kivora has detected a condition that deserves human inspection; it does not mean Kivora has disabled dynamic pricing. A connected API key may still be read-only, even when the listing itself has automatic rate posting enabled.

## Roles and access

| Role | Access |
| --- | --- |
| Owner | Full organization, team, integration, revenue, reporting, and action access. |
| Administrator | Organization/team/integration administration plus revenue actions. |
| Revenue manager | Revenue actions, Wheelhouse connection and portfolio operations, approvals, scheduling, reversion, and reports. |
| Analyst | Read portfolio data; run simulations, underwriting, market refreshes, reviews, comments, and non-approval decisions. |
| Viewer | Read-only portfolio, work-item, report, and activity access. |

The backend enforces these roles. UI controls are also hidden or disabled where the user does not have the required permission.

## Requirements

- Node.js 24.x for the frontend; a current Node.js runtime compatible with NestJS 11 for the backend.
- MongoDB 8 or a compatible hosted MongoDB deployment.
- A Privy application for browser authentication.
- A 32-byte hexadecimal encryption key for organization credentials.
- At least one Wheelhouse API credential connected through Kivora for a ready portfolio.

Optional integrations are Groq, Telegram, SMTP invitation delivery, Ticketmaster, and OpenWeather. They are feature-specific; Kivora remains explicit when one is unavailable.

## Local setup

Install each application’s dependencies:

```bash
npm install --prefix backend
npm install --prefix frontend
```

Create local configuration files from the examples:

```bash
cp backend/.env.example backend/.env.local
cp frontend/.env.example frontend/.env.local
```

Generate the encryption key once and place it in `backend/.env.local`:

```bash
openssl rand -hex 32
```

Start both services in separate terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

Open `http://localhost:3000`. The API is served at `http://localhost:4000/api`; Swagger is available at `/api/docs`.

### Docker Compose

Docker Compose starts MongoDB, Redis, the API, and the web application:

```bash
docker compose --env-file frontend/.env.local up --build
```

`backend/.env.local` is read by the API container. In Docker, the backend reaches MongoDB through `mongodb://mongo:27017/kivora` and the browser reaches the API through `http://localhost:4000/api`.

## Environment configuration

### Required in production

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string. |
| `PRIVY_APP_ID` / `PRIVY_APP_SECRET` | Server-side verification of Privy access tokens. |
| `WHEELHOUSE_CREDENTIAL_ENCRYPTION_KEY` | Exactly 64 hexadecimal characters; encrypts organization-owned Wheelhouse and external-provider credentials with AES-256-GCM. |
| One of `GROQ_API_KEY`, `GEMINI_API_KEY`, or `OPENROUTER_API_KEY` | At least one AI provider is required. Kivora automatically fails over in this order: Groq → Gemini → OpenRouter. |
| `MAILER_SERVICE`, `MAILER_USER`, `MAILER_PASS`, `MAILER_FROM_EMAIL` | SMTP/template mail configuration for secure teammate invitations. |

### Core runtime variables

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | Use `production` in deployed environments. |
| `PORT` | `4000` | API listener port. |
| `FRONTEND_URL` | `http://localhost:3000` | Comma-separated CORS allowlist. |
| `BACKEND_PUBLIC_URL` | — | Required and HTTPS when Telegram is enabled. |
| `WHEELHOUSE_BASE_URL` | Wheelhouse RM API URL | Override only for an approved API environment. |
| `REDIS_URL` | — | Shared Redis cache for Wheelhouse GET responses. Required for cross-instance rate-limit protection. |
| `WHEELHOUSE_CACHE_TTL_SECONDS` | `300` | Positive TTL for cacheable Wheelhouse reads. Successful writes and provider syncs invalidate affected listing reads. |
| `SCAN_BATCH_SIZE` | `10` | Listings processed per connection scan pass; bounded to 1–10. |
| `SCAN_INTERVAL_SECONDS` | `120` | Background scan cadence. |
| `REPORT_STORAGE_PATH` | `./storage/reports` | Local report artifact path when applicable. |

### Optional integrations

| Variable | Capability |
| --- | --- |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_LINK_SECRET` | Per-user Telegram linking, signed action intents, briefings, and delivery. The link secret must be 32+ characters in production. |
| `TICKETMASTER_API_KEY` | Platform-managed event intelligence. Organizations can override it with their own encrypted credential. |
| `OPENWEATHER_API_KEY` | Platform-managed weather intelligence. Organizations can override it with their own encrypted credential. |
| `GROQ_MODEL` | Optional model override; defaults to `llama-3.3-70b-versatile`. |
| `GEMINI_MODEL` / `OPENROUTER_MODEL` | Optional fallback model overrides; defaults are `gemini-2.0-flash` and `mistralai/mistral-small-2603`. |
| `WHEELHOUSE_API_KEY` | Legacy migration input only. New integrations should be connected per organization in Kivora. |
| `KIVORA_APPROVAL_TOKEN` | Optional supplemental approval token. It never bypasses Privy authentication or tenant binding. |

`NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_PRIVY_APP_ID` are the only browser-exposed values. Do not expose server credentials with a `NEXT_PUBLIC_` prefix.

If SMTP delivery is unavailable (for example, on a constrained deployment), creating a teammate invitation still succeeds. Team owners and administrators are shown the secure single-use invitation URL once in Settings and can copy it to share through a trusted channel. Kivora never stores the plaintext token, so create a replacement invitation if that URL is lost.

Wheelhouse cache entries are namespaced by a one-way credential fingerprint and exact request path, so one organization never receives another organization’s provider response. Redis is authoritative when configured; the API falls back to a short-lived in-process cache only if Redis is temporarily unavailable. Cache statistics and the selected cache backend are included in the authenticated capabilities response.

## First organization workflow

1. Sign in with Privy.
2. Create or select an organization.
3. In **Settings → Integrations**, add a Wheelhouse connection. Kivora validates the credential with a live listings read, encrypts it, creates a portfolio, and maps the imported listings.
4. Run a scan or wait for the worker. The dashboard and portfolio make an initial live scan when no scan is cached.
5. Review the War Room and listing-level workspaces.
6. For pricing changes, inspect a live preview, review/approve the linked recommendation, then apply or schedule the exact recommended strategy.
7. Verify the result in the action record. A deferred sync due to Wheelhouse’s 423/429 response is reported separately; it does not erase a successful preference write.

## Data and action lifecycle

```text
Wheelhouse / external signals
        ↓
scan, snapshots, deterministic rules
        ↓
incident or opportunity → recommendation
        ↓
review → approval → simulation → execute or schedule
        ↓
APPLIED / VERIFIED / PARTIALLY_APPLIED / FAILED
        ↓
outcome measurement, report, audit, notifications
```

The product distinguishes **APPLIED** from **VERIFIED**. `APPLIED` means Wheelhouse accepted the mutation but Kivora could not conclusively read back the expected state. `VERIFIED` means the subsequent read matches the expected settings. Grouped actions retain individual child outcomes and report partial results rather than pretending the whole group succeeded.

## Safety guarantees

- Every Privy-authenticated request is scoped to the active organization selected by `X-Kivora-Organization-Id`.
- The approval token is supplemental only; authenticated tenant context is always required.
- Wheelhouse credentials are encrypted at rest and not returned by API responses.
- Listing workspaces select the credential from the listing mapping, preventing a first-connection fallback from using the wrong account.
- Background scans use organization/connection-specific locks and checkpoints.
- Pricing actions are idempotent and persist action, simulation, recommendation, baseline, verification, and audit records.
- Supported reverts restore the exact previously stored settings and verify them.
- In-app notifications are scoped to the recipient user; legacy organization-wide records remain visible for backward compatibility.
- Reports and exports are organization-authenticated and sent with `Cache-Control: private, no-store`.

## Health and monitoring

Public probes:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Service/database/integration summary. |
| `GET /api/health/live` | Liveness probe. |
| `GET /api/health/ready` | Readiness probe; requires MongoDB, required configuration, and at least one active Wheelhouse connection. Returns 503 when not ready. |
| `GET /api/health/dependencies` | Dependency state and connection status counts. |

`GET /api/metrics` is protected by the approval guard and requires Privy authentication plus revenue-manager-level access or a valid supplemental approval token.

## Verification commands

Run these before deploying:

```bash
npm test
npm run lint
npm run build
npm --prefix frontend run typecheck
git diff --check
```

Current code-level verification covers backend unit/lifecycle tests, backend build, frontend type-check, frontend production build, and lint. Live writes, browser end-to-end flows, Mongo-backed concurrency tests, and load tests remain separate acceptance activities because they require controlled external state.

## Documentation map

- [Architecture](docs/ARCHITECTURE.md) — components, tenancy, data model, worker model, and action lifecycle.
- [API reference](docs/API.md) — authenticated endpoints, roles, error envelope, and action semantics.
- [Operations runbook](docs/OPERATIONS.md) — deployment, readiness, incident response, migrations, backups, and release checks.
- [User guide](docs/USER_GUIDE.md) — practical workflows for managers, analysts, and viewers.
- [Acceptance status](docs/ACCEPTANCE.md) — verified coverage and remaining explicit acceptance gates.
- [Project walkthrough](docs/PROJECT_WALKTHROUGH.md) — presenter-ready end-to-end product demonstration script.

## Important operational boundaries

Kivora does not guarantee revenue uplift. Its financial values are calculated estimates with recorded evidence and assumptions. External provider failures, unavailable optional endpoints, and read-only credentials are surfaced in the relevant workflow; Kivora does not replace them with synthetic results.
