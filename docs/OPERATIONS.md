# Kivora operations runbook

## Deployment prerequisites

Before deploying, ensure the environment contains the production-required variables documented in the README. In particular:

- `WHEELHOUSE_CREDENTIAL_ENCRYPTION_KEY` must be a stable 64-character hexadecimal value. Rotating it without migrating existing credentials makes existing encrypted credentials unreadable.
- `PRIVY_APP_ID` and `PRIVY_APP_SECRET` must be configured on the API, while only `NEXT_PUBLIC_PRIVY_APP_ID` is configured in the browser.
- `FRONTEND_URL` must include the actual deployed browser origin.
- `BACKEND_PUBLIC_URL` must be HTTPS when Telegram is enabled.
- Configure Nodemailer with `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, and `MAIL_FROM_EMAIL`. For Brevo use `smtp-relay.brevo.com`, port `587`, `MAIL_SECURE=false`, the Brevo SMTP login as `MAIL_USER`, and the Brevo SMTP key as `MAIL_PASSWORD`. `MAIL_FROM_EMAIL` must be a verified sender; `MAIL_FROM_NAME` defaults to `Kivora`. Do not use a Brevo REST API key as the SMTP password.

Do not set organization Wheelhouse credentials in frontend environment variables. Add them through the authenticated Kivora connection flow.

## Deployment sequence

1. Run the verification commands locally or in CI.
2. Deploy the backend with the required environment variables.
3. Confirm `GET /api/health/live` returns HTTP 200.
4. Confirm MongoDB connectivity and configuration through `GET /api/health/ready`.
5. Deploy the frontend with the production API URL and Privy application ID.
6. Sign in as an owner or administrator and connect/test the Wheelhouse account if no active connection exists.
7. Confirm readiness returns `wheelhouseConnections > 0`.
8. Create a controlled teammate invitation to an inbox you own. Confirm the API reports `emailDelivery: sent`, the message arrives with both text and HTML content, and the invitation link opens the deployed frontend.
9. Register the Telegram webhook only after the backend has a stable HTTPS public URL and the webhook secret is set.

Readiness intentionally returns 503 until an active Wheelhouse connection exists. This prevents declaring a technically booted but operationally empty workspace ready.

## Release verification

Run:

```bash
npm test
npm run lint
npm run build
npm --prefix frontend run typecheck
git diff --check
```

Then perform controlled browser acceptance as an authorized organization member:

1. Sign in and switch organizations.
2. Confirm dashboard, portfolio, listings, War Room, reports, settings, and activity load for the selected organization.
3. Open at least two different work items and confirm each opens its own workspace.
4. Check long work-item content scrolls inside the viewport on desktop and mobile widths.
5. Test a read-only/non-write-capable connection to confirm mutations are blocked clearly.
6. With explicit pricing authority, run one low-risk approved preview/action, verify read-back state, then run the supported revert where appropriate.

Do not run a live pricing action merely to make a status badge green. “Fully connected” is a consequence of an authorized operational action, not a test target.

## Routine monitoring

| Signal | Expected | Operator action when unhealthy |
| --- | --- | --- |
| `/health/live` | HTTP 200 | Restart or investigate the API process/platform. |
| `/health/ready` | HTTP 200, database connected, required config valid, active Wheelhouse connections > 0 | Check MongoDB, configuration, connection revocation, or credential migration. |
| Wheelhouse connection status | connected or verified | Use the organization connection test; replace an invalid credential only through Settings. |
| Worker activity | new scan audit entries and advancing checkpoints | Check logs, lock expiry, MongoDB availability, and `SCAN_INTERVAL_SECONDS`. |
| Action failures | visible in work-item/action history | Inspect provider error, verification payload, current listing mapping, recommendation expiry, and permission. |
| Integration health | connected/configured | Validate Ticketmaster/OpenWeather settings; do not expose credentials in tickets or logs. |
| Invitation email | API reports `emailDelivery: sent` and the test inbox receives it | Check SMTP configuration, verified-sender status, backend logs, and the Brevo transactional log. Rotate exposed SMTP keys. |

The API logs structured request events including request ID, route, status, duration, and selected organization header. Do not add authorization headers or provider credentials to log messages.

## Invitation email incidents

Kivora sends invitation mail through Nodemailer and the configured SMTP relay. It renders both plain-text and HTML bodies. Creating the invitation and delivering its email are deliberately separate outcomes: if SMTP delivery fails, the pending invitation remains valid and the create response returns `emailDelivery: failed` with its one-time invitation URL for immediate trusted sharing.

When delivery fails:

1. Confirm `MAIL_HOST`, `MAIL_USER`, `MAIL_PASSWORD`, and `MAIL_FROM_EMAIL` are present in the backend runtime, not the frontend deployment. Confirm `MAIL_PORT` and `MAIL_SECURE` match the relay if overriding their `587` and `false` defaults.
2. For Brevo, confirm `MAIL_USER` is the SMTP login and `MAIL_PASSWORD` is an active SMTP key. Do not use a REST API key.
3. Confirm `MAIL_FROM_EMAIL` or its domain is verified in Brevo and permitted for that account.
4. Confirm port `587` egress is allowed by the backend hosting provider and `MAIL_SECURE=false`. Port `465` requires `MAIL_SECURE=true` if the deployment intentionally uses it instead.
5. Inspect safe backend error text and Brevo's transactional log without copying credentials into logs or tickets.
6. Rotate the SMTP key immediately if it was exposed. Update the backend secret and redeploy before retesting.

Do not repeatedly create invitations while diagnosing delivery. Each request revokes the prior pending invitation for that email. Use the newest returned link, or revoke it and create one replacement after SMTP is healthy.

## Wheelhouse connection incidents

### Reads fail for all listings

1. Check `/health/ready` and database state.
2. In Settings, inspect the relevant organization connection’s last error.
3. Run the connection test as a revenue manager.
4. If live listing reads fail, replace the credential through the authenticated connection screen.
5. Run a scan and confirm mapping count/portfolio inventory recovers.

### A listing workspace returns `Active organization listing not found`

This is an organization mapping error, not a generic listing-not-found response. Confirm:

1. The browser is switched to the organization that owns the listing.
2. The expected Wheelhouse connection is active, not revoked.
3. The connection test/import completed successfully.
4. A mapping-aware scan has run after connecting the account.

Never work around this by using a listing ID from a different organization.

### “Partially connected” or writes not verified

Live reads do not prove write scope. A test connection call records read health, while successful approved writes persist write proof. If the API key is known to be read-only, Kivora displays that and blocks writes. If it is capable but unverified, perform an ordinary, explicitly approved operational action when it is appropriate; its verification result will update the connection state.

### Sync is deferred

Wheelhouse can return:

- `423`: a sync is already queued;
- `429`: the daily sync allowance is unavailable.

Kivora records this as a deferred sync when the pricing preference write itself succeeded. Review the action’s verification result; do not classify the write as failed solely because the sync queue was unavailable.

## Action incident response

When an action is `FAILED` or `PARTIALLY_APPLIED`:

1. Open the exact work item and inspect the child action rows, error details, baseline, provider response, and verification result.
2. Confirm the recommendation and simulation have not expired.
3. Confirm the current listing mapping still points to the expected connection/channel.
4. Compare live Wheelhouse preferences with the action’s expected fields.
5. If the state is safe and the action supports it, use the recorded reversion control. Do not hand-edit a stale action record.
6. Add a work-item comment with the decision and evidence.

For grouped actions, treat each child listing independently. A successful child must not be reverted solely because another child failed unless the business decision requires a coordinated rollback.

## Scheduled actions

The scheduler revalidates due actions. An action may cancel or fail if the recommendation expired, its simulation expired, live base-price evidence changed, the listing mapping disappeared, or provider access changed. This is intentional safety behavior.

When scheduling, use a timestamp in the organization’s intended timezone and confirm it remains before the recommendation and simulation expiry. The persisted action stores its scheduled time in UTC.

## Credential rotation and encryption-key rotation

### Provider credential rotation

Use the Settings connection/integration replacement flow. It validates the new credential before persisting it and records an audit entry. Do not edit encrypted fields directly in MongoDB.

### Encryption-key rotation

There is no automatic blind key rotation. Existing credentials are encrypted under the current AES-GCM key. Plan a controlled migration that decrypts every credential using the old key and re-encrypts it using the new key while both keys are available in a secure operational process. Take a database backup first. Do not deploy a new key until the migration has completed and been verified.

## Legacy migration

`backend/src/migrations/tenantize-legacy.ts` supports the historical move from a single server-level Wheelhouse key to organization-scoped encrypted connections. Run it only once, after backing up MongoDB and confirming the intended target organization. The migrated connection is deliberately marked degraded until an administrator validates it.

## Backup and recovery

Back up MongoDB regularly. The database contains organizations, membership, encrypted provider credentials, mapping state, audits, recommendations, actions, outcomes, reports, and notification history. Restoring only application code without its MongoDB data will not restore tenants or connections.

For recovery:

1. Restore MongoDB to a compatible version.
2. Restore the exact encryption key used by the backup.
3. Deploy a compatible API revision.
4. Check health/readiness.
5. Test one read connection in each critical organization.
6. Validate mapping and worker checkpoints before resuming high-volume actions.

## Security checklist

- Keep `PRIVY_APP_SECRET`, all provider credentials, encryption keys, and Telegram secrets out of the repository and browser build.
- Require HTTPS for production frontend and backend origins.
- Restrict CORS through `FRONTEND_URL`.
- Limit administrator and revenue-manager memberships.
- Review audit logs after connection replacement, pricing actions, membership changes, report delivery, and integration setting changes.
- Treat exported reports as private customer data.
- Review dependency advisories and platform logs on a regular cadence.
