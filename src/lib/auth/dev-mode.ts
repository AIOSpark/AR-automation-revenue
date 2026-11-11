export function isAuthTestMode(): boolean {
  return process.env.AIOSPARK_TEST_MODE === "true" && process.env.NODE_ENV !== "production";
}

export function isDevAuthEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return isAuthTestMode() || process.env.AIOSPARK_DEV_AUTH === "true";
}

export function isAuthProviderConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(
    url &&
      !url.includes("placeholder") &&
      key &&
      !key.includes("placeholder")
  );
}

export function getAuthSigningSecret(): string | null {
  const configured = process.env.AIOSPARK_SESSION_SECRET;
  if (configured) return configured;
  return null;
}

export function isSessionSecretStrong(secret: string | null): boolean {
  if (!secret) return false;
  // A session signing secret must provide at least 256 bits of entropy.
  // Provision with: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
  // which yields 43 base64url characters. Reject predictable / short values.
  const base64Url = /^[A-Za-z0-9_-]+$/;
  return base64Url.test(secret) && secret.length >= 43;
}
