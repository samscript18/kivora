# Kivora architecture

```mermaid
flowchart LR
  W[Wheelhouse RM API] --> S[Scheduled portfolio scanner]
  S --> D[Deterministic incident engine]
  D --> M[(MongoDB)]
  D --> T[Telegram alerts]
  D --> UI[Next.js control room]
  UI --> P[Wheelhouse what-if preview]
  P --> A{Human approval}
  A -->|Approved| X[Preference update + sync]
  X --> V[Read-after-write verification]
  V --> L[Audit log + owner brief]
  L --> AI[Grounded AI or template]
```

Wheelhouse credentials remain server-side. What-if analysis calls Wheelhouse's live, non-mutating preview endpoint. Write operations require explicit approval through a verified Privy manager or `KIVORA_APPROVAL_TOKEN`, then a read-after-write verification. Telegram `/start` creates a signed, expiring intent; after Privy login it is consumed once and the Telegram chat is stored against that user in MongoDB. Chat IDs are never global environment configuration.
