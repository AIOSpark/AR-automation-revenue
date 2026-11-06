const DEVELOPMENT_SIGNING_SECRET = "local-development-session-secret";

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
  if (isDevAuthEnabled()) return DEVELOPMENT_SIGNING_SECRET;
  return null;
}
