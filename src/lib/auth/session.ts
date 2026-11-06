import crypto from "crypto";
import { getAuthSigningSecret } from "./dev-mode";
import { sessionRevocationStore } from "./session-store";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function getSessionSecret(): string | null {
  return getAuthSigningSecret();
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

interface SessionClaims {
  sub: string;
  exp: number;
  jti: string;
}

function decodeAndVerify(token: string | undefined): SessionClaims | null {
  const secret = getSessionSecret();
  if (!secret || !token) return null;

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;

  const [, payload, signature] = parts;
  const expected = sign(payload, secret);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<SessionClaims>;

    if (
      !parsed.sub ||
      typeof parsed.exp !== "number" ||
      typeof parsed.jti !== "string" ||
      parsed.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return { sub: parsed.sub, exp: parsed.exp, jti: parsed.jti };
  } catch {
    return null;
  }
}

export function createSessionToken(userId: string): string | null {
  const secret = getSessionSecret();
  if (!secret) return null;

  const payload = encode({
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    jti: crypto.randomUUID(),
  });

  return `v1.${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  const claims = decodeAndVerify(token);
  if (!claims || sessionRevocationStore.isRevoked(claims.jti)) return null;
  return claims.sub;
}

export function revokeSessionToken(token: string | undefined): boolean {
  const claims = decodeAndVerify(token);
  if (!claims) return false;
  sessionRevocationStore.revoke(claims.jti, claims.exp);
  return true;
}

export function isProductionSessionConfigurationValid(): boolean {
  return Boolean(getSessionSecret());
}
