type Environment = Record<string, string | undefined>;

function required(value: string | undefined, name: string, production: boolean) {
  if (production && !value) throw new Error(`${name} is required in production`);
}

export function validateEnvironment(env: Environment) {
  const production = env.NODE_ENV === "production";
  required(env.MONGODB_URI, "MONGODB_URI", production);
  required(env.PRIVY_APP_ID, "PRIVY_APP_ID", production);
  required(env.PRIVY_APP_SECRET, "PRIVY_APP_SECRET", production);
  required(env.WHEELHOUSE_API_KEY, "WHEELHOUSE_API_KEY", production);
  required(env.GROQ_API_KEY, "GROQ_API_KEY", production);
  if (production && env.TELEGRAM_BOT_TOKEN) {
    required(env.TELEGRAM_WEBHOOK_SECRET, "TELEGRAM_WEBHOOK_SECRET", true);
    required(env.TELEGRAM_LINK_SECRET, "TELEGRAM_LINK_SECRET", true);
    required(env.BACKEND_PUBLIC_URL, "BACKEND_PUBLIC_URL", true);
    if (!env.BACKEND_PUBLIC_URL?.startsWith("https://")) throw new Error("BACKEND_PUBLIC_URL must use HTTPS when Telegram is enabled");
  }
  if (production && env.TELEGRAM_BOT_TOKEN && (env.TELEGRAM_LINK_SECRET?.length ?? 0) < 32) throw new Error("TELEGRAM_LINK_SECRET must be at least 32 characters");
  return env;
}
