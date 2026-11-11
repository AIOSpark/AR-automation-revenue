import crypto from 'crypto';
import { udmStore } from '../udm/store';

/**
 * Extract the Idempotency-Key header from an HTTP request.
 * Returns the key string or null if not present.
 */
export function extractIdempotencyKey(request: Request): string | null {
  const key = request.headers.get('Idempotency-Key');
  if (!key || key.trim().length === 0) return null;
  return key.trim();
}

/**
 * Compute a SHA-256 fingerprint of the request body for idempotency comparison.
 * Two requests with the same body produce the same fingerprint.
 */
export function computeRequestFingerprint(body: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

/**
 * Check and reserve an API-level idempotency key atomically under the key lock.
 *
 * Returns:
 *   { status: 'available', recordId: null } — key not seen before, reserved for this request
   *   { status: 'replay', recordId, response } — same key + same fingerprint, return cached response
   *   { status: 'conflict', recordId } — same key + different fingerprint, return 409
   */
export function checkAndReserveIdempotency(
  orgId: string,
  endpoint: string,
  key: string,
  fingerprint: string
) {
  return udmStore.checkAndReserveApiIdempotency(orgId, endpoint, key, fingerprint);
}

/**
 * Finalize an idempotency key after a successful creation.
 * Stores the record ID, fingerprint, and serialized response for replay.
 */
export function finalizeIdempotency(
  orgId: string,
  endpoint: string,
  key: string,
  recordId: string,
  fingerprint: string,
  response: unknown
): void {
  udmStore.finalizeApiIdempotency(orgId, endpoint, key, recordId, fingerprint, response);
}

/**
 * Release an idempotency key after a failed mutation, allowing retries.
 */
export function releaseIdempotency(
  orgId: string,
  endpoint: string,
  key: string
): void {
  udmStore.releaseApiIdempotency(orgId, endpoint, key);
}
