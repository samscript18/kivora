type Environment = Record<string, string | undefined>;

function required(value: string | undefined, name: string, production: boolean) {
  if (production && !value) throw new Error(`${name} is required in production`);
}

export function validateEnvironment(env: Environment) {
  const production = env.NODE_ENV === "production";
  required(env.MONGODB_URI, "MONGODB_URI", production);
  required(env.PRIVY_APP_ID, "PRIVY_APP_ID", production);
  required(env.PRIVY_APP_SECRET, "PRIVY_APP_SECRET", production);
  required(env.WHEELHOUSE_CREDENTIAL_ENCRYPTION_KEY, "WHEELHOUSE_CREDENTIAL_ENCRYPTION_KEY", production);
  if (production && !env.GROQ_API_KEY && !env.GEMINI_API_KEY && !env.OPENROUTER_API_KEY)
    throw new Error("Configure at least one AI provider: GROQ_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY");
  required(env.MAIL_HOST, "MAIL_HOST", production);
  required(env.MAIL_USER, "MAIL_USER", production);
  required(env.MAIL_PASSWORD, "MAIL_PASSWORD", production);
  required(env.MAIL_FROM_EMAIL, "MAIL_FROM_EMAIL", production);
  if (production && env.TELEGRAM_BOT_TOKEN) {
    required(env.TELEGRAM_WEBHOOK_SECRET, "TELEGRAM_WEBHOOK_SECRET", true);
    required(env.TELEGRAM_LINK_SECRET, "TELEGRAM_LINK_SECRET", true);
    required(env.BACKEND_PUBLIC_URL, "BACKEND_PUBLIC_URL", true);
    if (!env.BACKEND_PUBLIC_URL?.startsWith("https://")) throw new Error("BACKEND_PUBLIC_URL must use HTTPS when Telegram is enabled");
  }
  if (production && env.TELEGRAM_BOT_TOKEN && (env.TELEGRAM_LINK_SECRET?.length ?? 0) < 32) throw new Error("TELEGRAM_LINK_SECRET must be at least 32 characters");
  if (env.WHEELHOUSE_CREDENTIAL_ENCRYPTION_KEY && !/^[a-fA-F0-9]{64}$/.test(env.WHEELHOUSE_CREDENTIAL_ENCRYPTION_KEY)) throw new Error("WHEELHOUSE_CREDENTIAL_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)");
  return env;
}
