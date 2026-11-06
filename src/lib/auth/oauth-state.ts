import crypto from 'crypto';
import { getAuthSigningSecret } from './dev-mode';

type OAuthState = {
  organizationId: string;
  userId: string;
  returnTo: '/onboarding' | '/settings/integrations';
  nonce: string;
  exp: number;
};

const consumedNonces = new Map<string, number>();

function secret(): string | null {
  return getAuthSigningSecret();
}

function sign(value: string, key: string): string {
  return crypto.createHmac('sha256', key).update(value).digest('base64url');
}

export function createOAuthState(input: Omit<OAuthState, 'nonce' | 'exp'>): string | null {
  const key = secret();
  if (!key) return null;
  const payload = Buffer.from(JSON.stringify({ ...input, nonce: crypto.randomUUID(), exp: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  return `${payload}.${sign(payload, key)}`;
}

export function verifyOAuthState(value: string | null): OAuthState | null {
  const key = secret();
  if (!key || !value) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload, key));
  const provided = Buffer.from(signature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState;
    if (!parsed.organizationId || !parsed.userId || !parsed.nonce || parsed.exp < Date.now()) return null;
    if (parsed.returnTo !== '/onboarding' && parsed.returnTo !== '/settings/integrations') return null;
    if (consumedNonces.has(parsed.nonce)) return null;

    const now = Date.now();
    for (const [nonce, expiresAt] of consumedNonces) {
      if (expiresAt < now) consumedNonces.delete(nonce);
    }
    consumedNonces.set(parsed.nonce, parsed.exp);

    return parsed;
  } catch {
    return null;
  }
}
