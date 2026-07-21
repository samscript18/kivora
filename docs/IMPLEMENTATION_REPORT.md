# Kivora implementation report — 2026-07-21

## 1. Repository assessment

The original application was a working single-credential MVP. Privy established a user and nascent organization membership, but revenue caches, MongoDB queries, Wheelhouse access, scans, market signals, reports, Telegram routing, and actions were global. Incidents were persisted, while opportunities were projections of incidents rather than independent records. Scanning rotated with an in-memory cursor, actions did not have a persistent idempotent lifecycle, reports had no real export, and Telegram callbacks authorized raw incident identifiers.

## 2. Architecture changes

The backend now has organization-scoped connection, portfolio, listing-mapping, checkpoint, lock, opportunity, recommendation, simulation, action, outcome, notification, invitation, Telegram-intent, Telegram-delivery, and metrics domains. Authenticated controllers pass active organization context into services. Scheduled scanning iterates persisted organization connections. Approved mutations create actions before execution and persist verification afterward.

## 3. Database models created or updated

Created: `Invitation`, `WheelhouseConnection`, `Portfolio`, `ListingMapping`, `ScanCheckpoint`, `DistributedLock`, `RevenueOpportunity`, `Recommendation`, `Simulation`, `RevenueAction`, `Outcome`, `NotificationDelivery`, `TelegramActionIntent`, and `TelegramDelivery`.

Updated: users, memberships, incidents, snapshots, reports, owner briefs, audit logs, market signals, Telegram links, and Telegram connections with tenant/lifecycle fields and compound indexes.

## 4. Migrations performed

The idempotent `tenantize-legacy.ts` migration was run against local MongoDB. It created one workspace and owner membership for the sole existing user, assigned 36 snapshots, 20 market signals, and one incident to that organization, and verified that zero of those records remain unscoped. Tenant-compound indexes were verified. The rerun completed with no unresolved records. An encrypted migrated Wheelhouse connection was not created because `WHEELHOUSE_CREDENTIAL_ENCRYPTION_KEY` is unavailable locally.

## 5. Organization and tenancy implementation

Implemented organization create/select/default/update, strict active-membership selection, roles, member listing, secure invitations, acceptance, revocation, role/status changes, suspension/removal, and transactional ownership transfer. Revenue, report, market, Telegram, connection, portfolio, action, and export paths now add server-side organization filters. Cross-tenant resource identifiers alone cannot pass those filters.

## 6. Wheelhouse connection implementation

Organizations can add multiple Wheelhouse accounts. Credentials are validated by a live listing read before persistence and encrypted with AES-256-GCM. The UI and API support listing connections, live tests, credential replacement/reconnection, revocation, capability state, initial portfolio creation, and listing mapping. Decrypted credentials are not serialized or audited.

## 7. Synchronization improvements

Scans use persistent connection checkpoints, advance through the portfolio without repeatedly wrapping the first batch, mark complete cycles, and use expiring MongoDB locks. Scheduled workers iterate active organization connections. Listing snapshots and incidents are tenant scoped.

## 8. Incident rules

Preserved and scoped deterministic disabled-posting, underpricing, overpricing, calendar/sync, and booking-pace rules. Evidence now stores the affected horizon, occupancy probability, rate inputs, calculation method, assumptions, confidence, root cause, and verification state.

## 9. Opportunity rules

Independent opportunities are persisted for Ticketmaster events only when Wheelhouse local-demand attributes corroborate demand and produce a positive defensible rate-gap estimate. Property-aware weather opportunities require persisted listing profiles and explicit positive rules (for example snow plus ski destination or rain plus indoor-attraction profile). Weather opportunities without measured pricing uplift store zero impact rather than inventing revenue.

## 10. Recommendation architecture

Incidents and qualifying independent opportunities create first-class recommendations with structured evidence, impact calculations, confidence, risks, expiry, assignment fields, and transitions. Review, approve, ignore, dismiss-with-reason, reopen, schedule, and cancel transitions validate current state and role and write audit records.

## 11. Financial-impact calculations

Pricing risk uses rate gap × affected nights × occupancy probability. Event opportunity uses rate gap × corroborated affected nights × occupancy probability × confidence. Inputs and assumptions are persisted. Projected values remain distinct from realized values.

## 12. Simulation architecture

Live Wheelhouse conservative, balanced, and aggressive previews are persisted per organization/user/listing with baseline, inputs, upstream preview, local calculation method, uncertainty label, selected strategy, and 30-minute expiry.

## 13. Action and verification architecture

Pricing presets and dynamic-pricing restoration now create persistent actions with tenant, connection, requester/approver, baseline, payload, deterministic idempotency key, attempts, upstream response, and verification. Reads after writes compare expected and actual state. Replayed action requests return the existing record. Scheduled actions revalidate recommendation expiry and live baseline before execution.

## 14. Revert and rollback support

Baseline and revert-information fields are persisted, but no generic revert endpoint was enabled because the currently verified Wheelhouse adapter does not establish safe restoration semantics for every mutation. Group rollback was not fabricated.

## 15. Outcome measurement

Verified actions create outcome windows with baseline, projected gain/revenue protected, currency, measurement dates, zero initial attribution confidence, and an explicit statement that projected revenue is not realized revenue. A post-window measurement worker remains unfinished.

## 16. Reports and PDF exports

Reports use scoped live/persisted facts. Draft editing stores versions; managers can finalize drafts. Authenticated organization-scoped endpoints generate actual server-side PDF bytes and flattened CSV, stream with private/no-store headers, and audit downloads. Owner-brief delivery is tenant scoped.

## 17. Telegram security

Connections are organization scoped. Action buttons now use HMAC-signed, expiring, per-user/per-organization intents with random nonces and atomic single-use consumption. Membership is rechecked on callback. Delivery records deduplicate incident, signal, and daily briefing messages and persist failures. Raw database identifiers no longer authorize callback actions.

## 18. Monitoring and security improvements

Added structured request logs with request ID, organization header, route, status, and duration; protected request/domain metrics; liveness, readiness, and dependency endpoints; production encryption-key validation; secure report lookup; tenant-compound indexes; DTO whitelisting; role checks; idempotency; and secret-safe activity metadata.

## 19. Tests added

Added lifecycle/tenancy tests for scoped recommendation queries, optimistic transition guards, repeated approval rejection, required dismissal reason, deterministic priority scoring, real PDF/CSV bytes, and replay rejection for signed Telegram intents. Existing Wheelhouse, Groq, Telegram, revenue-rule, and controller tests remain green.

## 20. Commands executed

- `npm run build`, `npm test`, `npm run lint` in `backend/`
- `npm run build`, `npm run lint` in `frontend/`
- `npm run migrate:tenant` in `backend/` (including an idempotent rerun)
- `npm run start` in `backend/`, followed by health/auth boundary requests
- `docker compose build` (attempted twice)
- Read-only local MongoDB migration audits

## 21. Test and build results

- Backend build: pass
- Backend lint: pass
- Backend tests: 6 suites, 20 tests, all pass
- Frontend production build/type check: pass; 17 routes generated
- Frontend lint: pass
- Backend runtime boot against MongoDB: pass
- `/api/health/live`: HTTP 200
- `/api/health/ready`: truthful `not_ready` because encryption configuration/organization connection is missing
- Unauthenticated `/api/reports`: HTTP 401
- Unauthenticated `/api/metrics`: HTTP 401
- Docker build: blocked because the local Docker daemon is not running

## 22. Live integrations verified

MongoDB connectivity and persistence were verified. Groq and Telegram are detected as configured, but no paid/model request or external Telegram delivery was executed solely for testing. No live Wheelhouse mutation was executed because there was no genuine user approval. Per-organization Wheelhouse reads could not be verified until the encryption key is configured and the existing credential is migrated/reconnected. Ticketmaster and OpenWeather were not invoked during final verification.

## 23. Upstream limitations that remain

Wheelhouse does not expose a universal non-mutating write-scope probe, so write access remains unverified until a genuine approved write. Safe generic revert/group rollback semantics are not established by the current adapter. Minimum-stay and gap-night opportunity rules remain disabled until the live account exposes the calendar/reservation fields needed to prove availability. Realized-revenue attribution cannot be claimed before post-action booking/revenue windows close.

## 24. Exact files changed

Modified:

- `README.md`
- `backend/.env.example`, `backend/package.json`
- `backend/src/main.ts`, `backend/src/shared/schemas/env.schema.ts`
- `backend/src/api/api.module.ts`
- `backend/src/api/auth/auth.controller.ts`, `auth.module.ts`, `auth.service.ts`
- `backend/src/api/auth/schemas/membership.schema.ts`, `user.schema.ts`
- `backend/src/api/health/health.controller.ts`
- `backend/src/api/integrations/integrations.module.ts`
- `backend/src/api/integrations/schemas/market-signal.schema.ts`, `telegram-connection.schema.ts`, `telegram-link.schema.ts`
- `backend/src/api/integrations/services/market-intelligence.service.ts`, `telegram.service.ts`, `telegram.service.spec.ts`, `wheelhouse.service.ts`
- `backend/src/api/revenue/revenue.controller.ts`, `revenue.module.ts`, `revenue.service.ts`, `scanner.service.ts`
- `backend/src/api/revenue/dto/revenue.dto.ts`
- `backend/src/api/revenue/schemas/audit-log.schema.ts`, `incident.schema.ts`, `owner-brief.schema.ts`, `report.schema.ts`, `snapshot.schema.ts`
- `docs/ARCHITECTURE.md`
- `frontend/src/app/dashboard/reports/page.tsx`, `settings/page.tsx`
- `frontend/src/lib/api.ts`, `frontend/src/types/api.ts`

Created:

- `backend/src/api/auth/dto/organization.dto.ts`
- `backend/src/api/auth/schemas/invitation.schema.ts`
- `backend/src/api/integrations/schemas/telegram-operation.schema.ts`
- `backend/src/api/monitoring/metrics.service.ts`, `monitoring.controller.ts`, `monitoring.module.ts`
- `backend/src/api/revenue/connection.service.ts`, `operations.controller.ts`, `revenue.lifecycle.spec.ts`
- `backend/src/api/revenue/dto/operations.dto.ts`
- `backend/src/api/revenue/schemas/operations.schema.ts`
- `backend/src/migrations/tenantize-legacy.ts`
- `docs/MIGRATIONS.md`, `docs/PRODUCTION.md`, `docs/IMPLEMENTATION_REPORT.md`
- `frontend/src/components/dashboard/OperationsSettings.tsx`

The pre-existing deletion of `.github/workflows/ci.yml` was preserved and the file was not restored.

## 25. Remaining work

The full completion prompt is not yet entirely satisfied. Browser E2E, dedicated integration/contract/load/accessibility suites, email notifications, notification-preference UI, assignment/comment UI, group actions and partial rollback UI, portfolio-management UI, post-window outcome measurement, end-of-day briefing scheduling by per-user timezone, protected persistent file/object storage for report artifacts, and broader listing workspace history are still unfinished. These are stated explicitly because schemas or endpoints alone do not make a workflow complete.

External/configuration blockers are: missing `WHEELHOUSE_CREDENTIAL_ENCRYPTION_KEY`, no encrypted organization connection, no user-approved live Wheelhouse mutation, and a stopped Docker daemon.
