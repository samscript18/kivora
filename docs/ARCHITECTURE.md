# Kivora architecture

## System shape

Kivora is a two-application system:

```text
Next.js web application
  ├─ Privy browser session
  ├─ React Query cache and organization selector
  └─ Kivora REST API client
              │ Bearer token + active organization header
              ▼
NestJS API
  ├─ Privy authentication and organization membership lookup
  ├─ Revenue, actions, reports, and notification services
  ├─ Scheduled scanning and action workers
  └─ Provider adapters
              │
              ├─ MongoDB: operational source of truth
              ├─ Wheelhouse: portfolio reads, previews, and supported writes
              ├─ Ticketmaster/OpenWeather: external demand signals
              ├─ Groq: grounded narrative assistance
              ├─ Telegram: per-user delivery and signed action intents
              └─ SMTP + Handlebars: organization invitations
```

The web application is responsible for rendering, role-aware affordances, and user interaction. The API remains the authority for authentication, tenant scoping, mutation authorization, provider calls, lifecycle transitions, audits, and persisted records.

## Tenant model

The core tenant chain is:

```text
User ──< Membership >── Organization ──< WheelhouseConnection >── Portfolio ──< ListingMapping
                                      │
                                      ├─ Incidents / opportunities / recommendations
                                      ├─ Simulations / revenue actions / outcomes
                                      ├─ Reports / briefs / audits / notifications
                                      └─ Integration settings / notification preferences
```

Privy authentication verifies the browser access token. The API resolves the user and their organization membership; the optional `X-Kivora-Organization-Id` header selects an organization only when that user is an active member. All organization-facing queries use the resolved `organizationId` rather than trusting a client-supplied tenant identifier.

Every Wheelhouse credential belongs to one organization and is encrypted with the server-side AES-256-GCM encryption key. Listing mappings bind a Wheelhouse listing to the exact connection and portfolio that own it. Listing-depth reads and action execution look up this mapping before selecting the credential.

## Authentication and authorization

`PrivyAuthGuard` verifies the access token and attaches the resolved Kivora user/organization context to the request. `ApprovalGuard` invokes Privy authentication first, then allows an organization owner, administrator, or revenue manager to invoke approval-protected operations. The optional approval token can supplement authorization but cannot create a user context or cross organization boundaries.

Authorization is defended twice:

- The frontend uses capability data to avoid presenting unavailable actions.
- Backend services enforce roles, state transitions, record ownership, and tenant filters.

Viewers cannot trigger analysis or write workflows. Analysts can inspect, simulate, refresh intelligence, comment, and review. Revenue managers and above can approve, schedule, apply, revert, and manage Wheelhouse connections/portfolios. Organization administration is restricted to owners and administrators.

## Wheelhouse adapter

`WheelhouseService` is the provider boundary. It:

- adds `X-Integration-Api-Key` to provider requests;
- isolates provider connection state by credential fingerprint;
- tracks successful reads, a known read-only rejection, write verification, and the most recent error;
- paginates listings and reservations;
- retries transient 409, 423, and 429 responses for ordinary reads with bounded exponential delay;
- does not retry explicit listing sync requests, because retrying a queued or daily-rate-limited sync adds delay without changing the outcome;
- translates provider failures into Kivora HTTP exceptions with a stable code and upstream status.

Wheelhouse does not expose a harmless endpoint that proves write scope. Kivora therefore treats a connection as write-capable only after a successful approved provider `PUT`; the proof is persisted on the connection. A read-only response marks the connection read-only, while a temporary listing-level error does not invalidate the entire credential.

## Scanning and intelligence

The scanner uses an organization-and-connection-specific lock key and checkpoint. Each pass reads all active listings, synchronizes listing mappings, then analyzes a bounded batch. The checkpoint advances until it completes the connection’s listing set and then starts a new cycle.

For organizations with multiple Wheelhouse connections, the scheduled worker calls the scanner with the specific connection identifier. Its tenant listing cache is merged by connection mapping, so one connection does not overwrite another connection’s inventory.

Per listing, the analysis can retrieve preferences, recommendations, KPIs, recent changes, and flags. It persists snapshots and may create incidents for:

- automatic rate posting disabled;
- material underpricing or overpricing compared with Wheelhouse guidance;
- market booking pace materially ahead of the listing;
- calendar or channel synchronization signals.

The intelligence pass joins optional event and weather signals with listing profiles and coordinates. Deterministic portfolio rules create opportunities only when stored/live evidence meets the documented threshold; examples include market acceleration, pace divergence, comparable movement, weekday/weekend premiums, last-minute and far-future demand, luxury premiums, seasonal demand, and calendar-supported minimum-stay/gap-night cases.

## Work-item and recommendation model

Incidents and opportunities are raw operational signals. A recommendation is a persistent decision object linked to one of those signals. The work-item endpoint consolidates:

- evidence and financial calculation;
- linked recommendation and its state;
- persisted simulations;
- actions and outcomes;
- comments, assignment, signals, and audit activity;
- current eligibility and write-capability facts.

Key recommendation states are `READY`, `REVIEWED`, `APPROVED`, `SCHEDULED`, `EXECUTING`, `VERIFIED`, `FAILED`, `IGNORED`, `DISMISSED`, `CANCELLED`, and `EXPIRED`. State changes are persisted with actor, timestamp, reason, and relevant action identifiers.

## Simulation and action model

Strategy simulations use Wheelhouse’s non-mutating preview endpoint. Kivora persists the current revenue baseline, option, response, projection method, expiry, user, organization, and optional recommendation link. Previews do not change prices.

An applied action is linked to its organization, connection, portfolio, recommendation, simulation, target listings, request payload, baseline state, idempotency key, provider response, verification response, and audit records. Single actions use `apply_pricing_preset` or `restore_dynamic_pricing`. Grouped actions use a parent record and independent child actions.

The action result states have deliberately different meanings:

| State | Meaning |
| --- | --- |
| `VERIFIED` | The provider write succeeded and the post-write read matched the expected fields. |
| `APPLIED` | The provider accepted the write, but the post-write state was unavailable or did not conclusively support verification. |
| `PARTIALLY_APPLIED` | A grouped action had mixed child outcomes. |
| `FAILED` | The write, verification, or required precondition failed. |
| `CANCELLED` | The scheduled action was cancelled or became stale before execution. |

The sync request is separate from the setting mutation. A Wheelhouse 423 means an existing sync is already queued; a 429 means the daily sync allowance is unavailable. In both cases Kivora records the deferred sync while retaining the successful pricing write result.

## Scheduled actions and outcomes

The scheduled worker claims due action records with an expiring lock. It revalidates recommendation expiry, simulation expiry, current listing mappings, baseline staleness, and provider write access. For grouped actions each target runs independently; the parent captures a complete child-result summary.

Verified actions may create an outcome record. The outcome evaluator compares snapshots over the measurement window and stores realized deltas, attribution confidence, or an explicit unattributed state when comparable data is absent. Projected revenue, protected revenue, and realized revenue are never presented as interchangeable fields.

## Notifications, reports, and Telegram

In-app notifications are deduplicated and scoped to the recipient user, with legacy organization-wide records still visible. Notification preferences can be defined at user, portfolio, and organization scope; the effective preference considers channels, categories, severity, minimum impact, assignment, quiet hours, timezone, and digest mode.

Reports are based on stored, organization-scoped facts. They have draft/ready/shared states, versions, authenticated PDF and CSV exports, audit records, and optional tracked Telegram delivery. Currency and timezone default to the organization or selected listing instead of being silently forced to a global display currency.

Telegram links are per user and organization. Action intents are signed, short-lived, single-use records; Telegram callbacks resolve the linked actor before invoking normal Kivora lifecycle operations.

Wheelhouse GET responses use a credential-fingerprinted Redis cache. The exact request path is part of the key, preventing cross-listing and cross-organization reuse. Redis is authoritative in a multi-instance deployment; successful pricing writes and explicit provider syncs invalidate the affected listing’s cached reads. A local TTL cache is used only while Redis is unavailable.

## Failure posture

Kivora treats unavailable optional inputs as unavailable, not as synthetic data. Listing-depth optional calls can return an unavailable feed list while preserving the rest of the workspace. Provider errors are captured in the appropriate connection/action/integration state. Readiness is separate from feature completeness: the API is ready only when MongoDB, required settings, and at least one active Wheelhouse connection are present.
