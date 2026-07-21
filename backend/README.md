# Kivora API

NestJS API organized using the same feature-module conventions as AjoFlow: `api`, `core`, and `shared`, with isolated auth, database, health, integrations, and revenue modules.

## Live configuration

Copy `.env.example` to `.env.local` and configure Privy, MongoDB, Wheelhouse, Groq, and Telegram. The API does not seed records or return synthetic fallback responses. In production, the Privy, MongoDB, Wheelhouse, and Groq values are required at startup. `BACKEND_PUBLIC_URL` must be the public HTTPS origin that Telegram can reach.

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
