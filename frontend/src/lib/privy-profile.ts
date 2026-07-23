/**
 * Privy exposes an email differently depending on how the user signed in.
 * Email sign-in uses `user.email.address`; Google sign-in uses
 * `user.google.email` (and the same values are present in linkedAccounts).
 * Keep this conversion in one place so authenticated API calls never send an
 * empty profile just because the login method changed.
 */
type PrivyAccount = {
  type?: string;
  address?: string | null;
  email?: string | null;
  name?: string | null;
};

type PrivyUserProfile = {
  email?: { address?: string | null };
  google?: { email?: string | null; name?: string | null };
  linkedAccounts?: PrivyAccount[];
};

const validEmail = (value: unknown): value is string =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export function getPrivyProfile(user: PrivyUserProfile | null | undefined): { email?: string; name?: string } {
  const accounts = user?.linkedAccounts ?? [];
  const emailAccount = accounts.find((account) => account.type === "email" && validEmail(account.address));
  const oauthAccount = accounts.find((account) => validEmail(account.email));
  const candidate = user?.email?.address ?? user?.google?.email ?? emailAccount?.address ?? oauthAccount?.email;
  const email = validEmail(candidate) ? candidate.trim().toLowerCase() : undefined;
  const name = user?.google?.name ?? oauthAccount?.name ?? email?.split("@")[0];

  return { email, ...(name ? { name } : {}) };
}
