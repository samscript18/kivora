# Kivora architecture

```mermaid
flowchart LR
  W[Wheelhouse RM API] --> S[NestJS scheduled scanner]
  TM[Ticketmaster] --> I[External intelligence]
  OW[OpenWeather] --> I
  S --> R[Deterministic audit rules]
  I --> R
  R --> DB[(Organization-scoped MongoDB)]
  DB --> API[NestJS API]
  API --> UI[Next.js War Room]
  API --> TG[Per-user Telegram bot]
  API --> G[Groq grounded generation]
  UI --> P[Live Wheelhouse preview]
  P --> A{Manager approval}
  A -->|Approved| RA[Persistent idempotent revenue action]
  RA --> X[Wheelhouse update + sync]
  X --> V[Read-after-write verification]
  V --> L[Audit + owner communication]
```

## Trust boundaries

- Wheelhouse, Groq, MongoDB, Telegram, Ticketmaster, and OpenWeather credentials stay in NestJS.
- Next.js receives only the public API URL and Privy app ID.
- Privy bearer tokens are verified by the official server SDK with `PRIVY_APP_ID` and `PRIVY_APP_SECRET`; no separate verification key is used.
- Reads and non-mutating Wheelhouse previews require an authenticated Privy user. Mutations require a manager/admin session or the server-only approval token.
- Kivora verifies supported preference changes after writing them and stores the before/after values in MongoDB.
- Operational incidents without a safe automated resolution are marked for manual review and cannot enter a pricing-write path.
- Telegram connection intents are HMAC-signed, expire after ten minutes, are single-use, and bind both the Telegram chat and sender to one Privy-backed Kivora user.
- Telegram action intents are separately persisted, HMAC-signed, user- and organization-bound, expiring, atomically consumed, and replay protected. A database identifier alone is never authority.
- Every authenticated controller passes the active organization context into storage and integration services. Compound indexes enforce tenant-local external identifiers and idempotency keys.
- Wheelhouse credentials are AES-256-GCM encrypted. Decryption occurs only in the backend immediately before an organization-scoped upstream request.

## Reliability

The default scan processes at most ten listings per pass. A persistent checkpoint advances without wrapping until every active listing is covered, then starts the next cycle. MongoDB locks prevent duplicate organization/connection scans across instances and recover through TTL expiration. Wheelhouse requests retry transient 409/423/429 responses with bounded exponential backoff, optional external-provider failures are isolated, alerts are deduplicated, and production never returns mock data.
