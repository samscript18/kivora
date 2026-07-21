# Kivora API

NestJS API organized using the same feature-module conventions as AjoFlow: `api`, `core`, and `shared`, with isolated auth, database, health, integrations, and revenue modules.

## Live configuration

Copy `.env.example` to `.env.local` and configure Privy, MongoDB, Wheelhouse, Groq, and Telegram. Ticketmaster and OpenWeather are optional live enrichments and are disabled until their keys are set. The API does not seed records or return synthetic fallback responses. In production, the Privy, MongoDB, Wheelhouse, and Groq values are required at startup. `BACKEND_PUBLIC_URL` must be the public HTTPS origin that Telegram can reach.

Privy authentication uses `PRIVY_APP_ID` and `PRIVY_APP_SECRET` through the official Node SDK. No additional verification credential is required or supported.

Wheelhouse keys can be configured as read-only. Keep `WHEELHOUSE_WRITE_ENABLED=false` for those keys: Kivora will continue using live reads and non-mutating pricing previews, but will not offer or attempt preference updates. Set it to `true` only after Wheelhouse grants write access to the key. If an enabled key is rejected upstream as read-only, Kivora immediately downgrades the connection to preview-only mode and returns `WHEELHOUSE_WRITE_ACCESS_REQUIRED` instead of retrying the mutation.

Generate the application-owned secrets locally:

```bash
openssl rand -hex 32 # KIVORA_APPROVAL_TOKEN
openssl rand -hex 32 # TELEGRAM_WEBHOOK_SECRET
openssl rand -hex 32 # TELEGRAM_LINK_SECRET
```

`KIVORA_APPROVAL_TOKEN` is not issued by Wheelhouse or Groq. It is a high-entropy server secret for approved service-to-service mutations. Browser users sign in through Privy and send a short-lived Privy access token; never expose the approval token through a `NEXT_PUBLIC_` variable.

Create the bot with Telegram's `@BotFather` and place its rotated token in `TELEGRAM_BOT_TOKEN`. There is deliberately no global `TELEGRAM_CHAT_ID`: `/start` creates a ten-minute signed web intent, Privy authenticates the person opening it, and Kivora then binds that Telegram identity to that MongoDB user.

Register the production webhook after deployment using an authenticated manager request:

```bash
curl -X POST \
  -H "Authorization: Bearer <PRIVY_ACCESS_TOKEN>" \
  https://api.example.com/api/telegram/webhook/register
```

Telegram signs every webhook request with `TELEGRAM_WEBHOOK_SECRET`. Callback actions are accepted only when both the Telegram chat and Telegram user identity match an enabled Kivora connection; mutations additionally require the linked Kivora account to have a manager or admin role.

## Verification

```bash
npm run lint
npm test
npm run build
```
