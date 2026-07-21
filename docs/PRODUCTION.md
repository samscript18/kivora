# Production operations

## Required backend configuration

- `MONGODB_URI`: MongoDB replica set URI. Transactions used for ownership transfer require replica-set support.
- `PRIVY_APP_ID`, `PRIVY_APP_SECRET`: server-side Privy verification credentials.
- `WHEELHOUSE_CREDENTIAL_ENCRYPTION_KEY`: exactly 32 random bytes encoded as 64 hexadecimal characters. Generate it with `openssl rand -hex 32`; store the output in the deployment secret manager. Back it up separately; losing it makes stored organization credentials unrecoverable.
- `FRONTEND_URL`: comma-separated allowed browser origins.
- `BACKEND_PUBLIC_URL`: public HTTPS base URL when Telegram is enabled.

Optional integrations are enabled only when their real credentials exist: `GROQ_API_KEY`, `TICKETMASTER_API_KEY`, `OPENWEATHER_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `TELEGRAM_LINK_SECRET`. `TELEGRAM_LINK_SECRET` must contain at least 32 characters in production.

The frontend bundle may receive only `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_PRIVY_APP_ID`. Never expose the Wheelhouse encryption key or an integration credential through a `NEXT_PUBLIC_` variable.

## Deployment sequence

1. Back up MongoDB and configure the new encryption key.
2. Deploy the backend code with scheduled workers disabled at the platform level.
3. Run `npm run migrate:tenant --prefix backend`. Exit code `2` means ambiguous legacy records were intentionally left unscoped; inspect the emitted summary and `migrationlogs` before proceeding.
4. Start one backend instance, open each migrated connection in Settings, run its live connection test, and complete the initial synchronization.
5. Enable additional backend instances and scheduled workers. MongoDB locks and action idempotency protect duplicate work.
6. Deploy the frontend with its two public variables.
7. Register the Telegram webhook through the protected operator endpoint when Telegram is configured.
8. Verify probes and a non-mutating Wheelhouse preview. Do not test write access with an unapproved mutation.

For a legacy environment-level `WHEELHOUSE_API_KEY`, keep it only for the migration run, configure the encryption key, run `npm run migrate:tenant --prefix backend`, then add/test the resulting organization connection in Settings. Remove `WHEELHOUSE_API_KEY` only after a successful organization-scoped live read. Neither migration logs nor API responses contain the plaintext credential.

## Probes

- `GET /api/health/live`: process liveness.
- `GET /api/health/ready`: database and required configuration readiness plus optional-dependency degradation.
- `GET /api/health/dependencies`: database and persisted Wheelhouse connection states.

## Data and action safety

Production API queries require an active organization membership. Records without `organizationId` remain invisible after migration. Invitation tokens are random, expiring, single-use, organization-scoped, and stored only as SHA-256 digests. Revenue actions store their baseline and idempotency key before execution; verification compares a fresh upstream read to the expected state. Projected impact remains separate from realized revenue in outcome records.

Reports are rendered server-side into PDF bytes or CSV and streamed only after an authenticated organization-scoped lookup. Downloads are audited and sent with `private, no-store` caching.

## Live verification boundaries

Connection testing performs reads only. Wheelhouse does not expose a safe universal scope-probe for write permission, so Kivora marks write access verified only after a genuine user-approved mutation succeeds. Unsupported verification and upstream limitations must remain visible instead of being converted into success.
