# Legacy tenant migration

Run:

```bash
npm run migrate:tenant --prefix backend
```

`tenantize-legacy.ts` is idempotent. It assigns legacy records only when exactly one active organization makes ownership unambiguous. For the older sole-user/zero-organization layout, it can create that sole user's workspace and owner membership before assignment; it refuses this path when more than one user exists. It creates an encrypted migration connection only when both the legacy credential and encryption key are available, replaces legacy globally unique indexes with tenant-compound indexes, and writes a rerunnable summary to `migrationlogs`.

When multiple organizations exist, ambiguous records are logged as unresolved and remain inaccessible to production organization-scoped queries. Resolve those records using verified customer ownership evidence, then rerun the migration. The script never guesses a tenant and never duplicates a connection with the same migration name.
