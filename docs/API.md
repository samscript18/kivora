# Kivora API reference

Base URL: `/api`. All API responses, except direct binary exports, use this envelope:

```json
{ "success": true, "data": {} }
```

Errors use:

```json
{
  "success": false,
  "code": "HTTP_403",
  "message": "Revenue manager permission is required",
  "details": {},
  "timestamp": "2026-07-23T00:00:00.000Z",
  "requestId": "uuid",
  "path": "/api/example"
}
```

## Authentication

Send a Privy access token on authenticated routes:

```http
Authorization: Bearer <privy-access-token>
X-Kivora-Organization-Id: <optional-active-organization-id>
```

The organization header is validated against active membership. Approval-protected routes also accept `X-Kivora-Approval-Token`, but it cannot replace the bearer token.

## Health

| Method and route | Authentication | Description |
| --- | --- | --- |
| `GET /health` | none | Service, database, integration summary. |
| `GET /health/live` | none | Liveness probe. |
| `GET /health/ready` | none | Readiness probe; returns 503 until the database, configuration, and an active Wheelhouse connection are available. |
| `GET /health/dependencies` | none | Dependency and Wheelhouse connection-state summary. |
| `GET /metrics` | approval guard | In-memory metrics snapshot. |

## Organization and membership

| Method and route | Minimum role | Description |
| --- | --- | --- |
| `POST /auth/sync` | signed-in user | Synchronize the Privy user into Kivora. |
| `GET /auth/me` | signed-in user | Current Kivora user and active organization context. |
| `GET /auth/organizations` | signed-in user | Organizations available to the user. |
| `POST /auth/organizations` | signed-in user | Create an organization. |
| `PATCH /auth/organizations/current` | organization admin | Update organization profile/default currency/timezone. |
| `POST /auth/organizations/current/default` | active member | Make the selected organization the default. |
| `GET /auth/organizations/current/members` | active member | Members and invitations. |
| `POST /auth/organizations/current/invitations` | organization admin | Invite a member. |
| `DELETE /auth/organizations/current/invitations/:id` | organization admin | Revoke an invitation. |
| `POST /auth/invitations/accept` | signed-in invited user | Accept an invitation token. |
| `PATCH /auth/organizations/current/members/:id` | organization admin | Update membership status. |
| `POST /auth/organizations/current/transfer-ownership` | owner | Transfer ownership. |

## Wheelhouse connections and portfolios

| Method and route | Minimum role | Description |
| --- | --- | --- |
| `GET /wheelhouse-connections` | active member | List redacted organization connections. |
| `POST /wheelhouse-connections` | revenue manager | Create, encrypt, validate, and import a connection. |
| `POST /wheelhouse-connections/:id/test` | revenue manager | Verify live reads and refresh stored connection capability state. |
| `PATCH /wheelhouse-connections/:id/credential` | revenue manager | Replace the encrypted credential after live validation. |
| `DELETE /wheelhouse-connections/:id` | revenue manager | Revoke a connection and remove its stored credential. |
| `GET /portfolios` | active member | List managed portfolios. |
| `POST /portfolios` | revenue manager | Create a portfolio on an existing connection. |
| `POST /portfolios/listings/:id/move` | revenue manager | Move a listing mapping between portfolios on the same connection. |
| `DELETE /portfolios/:id` | revenue manager | Archive an empty portfolio. |

## Portfolio and intelligence reads

| Method and route | Minimum role | Description |
| --- | --- | --- |
| `GET /capabilities` | active member | Current org capability, permission, provider, and scan data. |
| `GET /dashboard` | active member | Revenue dashboard and ranked priorities. |
| `GET /portfolio` | active member | Connected listings and latest persisted metrics. |
| `GET /listings/:id/workspace` | active member | Listing detail plus live depth feeds and operational history. |
| `GET /incidents` | active member | Current incidents. |
| `GET /opportunities` | active member | Non-expired opportunities. |
| `GET /market-intelligence` | active member | Persisted external demand signals. |
| `POST /market-intelligence/refresh` | analyst | Refresh external intelligence for the organization. |
| `GET /segments` / `GET /segments/:id` | active member | Wheelhouse segment reads. |
| `GET /activity` | active member | Organization audit activity. |
| `GET /operational-summary` | active member | Daily operational totals. |

## Simulations and actions

| Method and route | Minimum role | Description |
| --- | --- | --- |
| `POST /scan` | revenue manager | Run a connection-scoped portfolio scan. |
| `POST /underwrite` | analyst | Market acquisition underwriting from Wheelhouse market time-series data. |
| `POST /incidents/:id/preview` | active member | Non-mutating dynamic-pricing recovery preview. |
| `POST /incidents/:id/resolve` | revenue manager | Approved dynamic-pricing recovery action. |
| `GET /listings/:id/strategies` | analyst | Three non-mutating Wheelhouse strategy previews. |
| `POST /listings/:id/strategies/apply` | revenue manager | Apply a selected pricing preset. |
| `GET /recommendations` | active member | Persistent recommendation records. |
| `POST /recommendations/:id/decision` | analyst; approval requires manager | Review, approve, ignore, dismiss, reopen, or cancel. |
| `POST /recommendations/:id/simulations` | analyst | Persist recommendation-bound strategy simulations. |
| `POST /recommendations/:id/execute` | revenue manager | Execute an approved recommendation with a current matching simulation. |
| `POST /recommendations/:id/schedule` | revenue manager | Schedule an approved recommendation before its simulation/recommendation expiry. |
| `GET /revenue-actions` | active member | Action history. |
| `POST /revenue-actions/:id/revert` | revenue manager | Supported deterministic reversion of a verified action. |
| `GET /outcomes` | active member | Outcome measurement records. |

`POST /listings/:id/strategies/apply` requires `{ "strategy": "conservative" | "balanced" | "aggressive" }`. Recommendation execution rejects a simulation whose strategy does not match the recommendation’s intended preset.

## Work items and notifications

| Method and route | Minimum role | Description |
| --- | --- | --- |
| `GET /work-items/:kind/:id` | active member | Consolidated incident or opportunity workspace. |
| `POST /work-items/:kind/:id/assign` | analyst | Assign/unassign a member. |
| `POST /work-items/:kind/:id/comments` | analyst | Add an organization-visible comment. |
| `GET /notifications` | active member | Recipient-scoped in-app notifications. |
| `POST /notifications/:id/read` | recipient | Mark one notification read. |
| `GET /owner-briefs` | active member | Owner brief records. |
| `POST /owner-briefs/:id/send` | revenue manager | Send an owner brief through Telegram. |

## Reports and assistant

| Method and route | Minimum role | Description |
| --- | --- | --- |
| `GET /reports` | active member | Reports visible to the organization. |
| `POST /reports/executive` | analyst | Generate an executive report. |
| `POST /reports/generate` | analyst | Generate typed executive, portfolio, owner, or revenue report. |
| `POST /reports/:id/edit` | analyst | Edit a draft report body. |
| `POST /reports/:id/finalize` | revenue manager | Finalize a draft. |
| `POST /reports/:id/deliver` | revenue manager | Deliver a finalized report through Telegram. |
| `GET /reports/:id/export/pdf` | active member | Authenticated binary PDF export. |
| `GET /reports/:id/export/csv` | active member | Authenticated binary CSV export. |
| `POST /assistant/ask` | active member | Ask a grounded assistant question. |
| `GET /assistant/history` | active member | Personal assistant history within the organization. |
| `DELETE /assistant/history` | active member | Clear personal assistant history. |

## Integration and Telegram settings

| Method and route | Minimum role | Description |
| --- | --- | --- |
| `GET /integration-settings` | active member | Redacted Ticketmaster/OpenWeather configuration. |
| `PATCH /integration-settings/:provider` | organization admin | Update enabled state, credential mode, credential, or settings. |
| `POST /integration-settings/:provider/test` | organization admin | Validate and persist health for an integration. |
| `DELETE /integration-settings/:provider/credential` | organization admin | Revoke an organization-owned provider credential. |
| `GET /integration-settings/notifications/preferences` | active member | Effective notification preferences. |
| `PATCH /integration-settings/notifications/preferences/:scope` | user; org/portfolio requires admin | Save user, portfolio, or organization preferences. |
| `GET /telegram/status` | active member | Current user’s Telegram state. |
| `POST /telegram/link` | active member | Create a Telegram link intent. |
| `DELETE /telegram/connection` | active member | Disconnect current user’s Telegram account. |
| `POST /telegram/webhook/register` | revenue manager | Register the production Telegram webhook. |
| `POST /telegram/webhook` | Telegram secret | Receive Telegram updates; do not call from the browser. |

## Important response semantics

- `APPLIED` is not `VERIFIED`. Examine `verificationResult` and `sync` for the actual provider state.
- A deferred sync can be a normal provider 423/429 outcome after a pricing setting was saved.
- `404 Active organization listing not found` means the current organization does not have an active mapping for that external listing. Reconnect/test the correct Wheelhouse connection or run the mapping-aware scan after deployment.
- `403 WHEELHOUSE_WRITE_ACCESS_REQUIRED` means the provider has rejected the credential as read-only or no eligible connection is configured.
