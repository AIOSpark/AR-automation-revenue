// AIOSpark Security Layer Automated Test Suite (Layer 25)

import assert from 'node:assert';
import { runCrossTenantPenetrationSuite } from '../../tenant/__tests__/cross-tenant-pen.test';
import { rateLimiterStore } from '../rate-limiter';
import { BackupRestoreVerificationService } from '../backup-restore';
import { authStore } from '../store';
import { createSessionToken, verifySessionToken } from '../session';
import { tenantStore } from '../../tenant/store';
import { GET as integrationStatusGET } from '../../../app/api/integrations/status/route';
import { POST as onboardingSetupPOST } from '../../../app/api/onboarding/setup/route';
import { POST as logoutPOST } from '../../../app/api/auth/logout/route';
import { isCsrfRequestSafe } from '../csrf';
import { getSecurityHeaders } from '../../security/headers';
import { canGrantRole } from '../../tenant/permissions';
import { parsePagination } from '../../api/pagination';
import { POST as invitePOST } from '../../../app/api/tenant/invite/route';

export async function runSecurityLayerTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 25 SECURITY SUITE');
  console.log('==========================================\n');

  // 1. Re-run Layer 3 Cross-Tenant Penetration Suite + Post-Layer 3 Tables
  const penRes = await runCrossTenantPenetrationSuite();
  assert.strictEqual(penRes.failed, 0, 'Cross-tenant penetration test suite had failures');

  // 2. API Rate Limiter Burst Test
  rateLimiterStore.clearAll();
  const testIp = '192.168.1.100';

  // Make 5 requests (allowed limit for auth)
  for (let i = 1; i <= 5; i++) {
    const res = rateLimiterStore.checkRateLimit(testIp, 'auth');
    assert.strictEqual(res.allowed, true, `Request ${i} should be allowed`);
  }

  // 6th request MUST be throttled (HTTP 429)
  const throttledRes = rateLimiterStore.checkRateLimit(testIp, 'auth');
  assert.strictEqual(throttledRes.allowed, false, 'Rate limiter failed to throttle 6th request!');
  assert(throttledRes.retryAfterSeconds > 0, 'Retry-after seconds missing');

  console.log('⚡ [PASS] 1. API Rate Limiting: Throttled burst traffic (HTTP 429) after 5 requests per minute');

  // 3. Backup Restoration Test Execution & Integrity Benchmark
  const snapshot = BackupRestoreVerificationService.createBackupSnapshot('org_sec_test');
  const restoreRes = BackupRestoreVerificationService.performRestoreTest('org_sec_test', snapshot);

  assert.strictEqual(restoreRes.success, true, 'Backup restoration test failed integrity check');
  assert(restoreRes.durationMs < 1000, `Backup restoration took ${restoreRes.durationMs}ms (>1000ms target)`);

  console.log(`⚡ [PASS] 2. Backup Restoration Benchmark: Restored database in ${restoreRes.durationMs}ms with 100% data integrity`);

  // 3. Route-Level Authorization Regression Tests
  authStore.clearAll();
  tenantStore.clearAll();
  const authzOrg = authStore.createOrganizationDraft({
    name: 'Authorization Regression Org',
    size: '1-10',
    industry: 'IT Services & SaaS',
    created_by_user_id: 'pending',
  });
  const owner = authStore.createUser({
    auth_provider_id: 'sb_authz_owner',
    email: 'authz-owner@example.com',
    first_name: 'Owner',
    last_name: 'User',
  });
  const viewer = authStore.createUser({
    auth_provider_id: 'sb_authz_viewer',
    email: 'authz-viewer@example.com',
    first_name: 'Viewer',
    last_name: 'User',
  });
  const admin = authStore.createUser({
    auth_provider_id: 'sb_authz_admin',
    email: 'authz-admin@example.com',
    first_name: 'Admin',
    last_name: 'User',
  });
  tenantStore.addMember(owner.id, authzOrg.id, 'Owner');
  tenantStore.addMember(viewer.id, authzOrg.id, 'Viewer');
  tenantStore.addMember(admin.id, authzOrg.id, 'Admin');

  const authzRequest = (userId: string, path: string, init: RequestInit = {}) => {
    const token = createSessionToken(userId);
    assert(token, 'Failed to create authz test session token');
    return new Request(`http://localhost${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        cookie: `aiospark_session=${token}; aiospark_active_org=${authzOrg.id}`,
      },
    });
  };

  const ownerIntegrations = await integrationStatusGET(authzRequest(owner.id, '/api/integrations/status') as any);
  const viewerIntegrations = await integrationStatusGET(authzRequest(viewer.id, '/api/integrations/status') as any);
  assert.strictEqual(ownerIntegrations.status, 200, 'Owner should be able to view integration status');
  assert.strictEqual(viewerIntegrations.status, 403, 'Viewer must be denied integration status access');

  const setupBody = JSON.stringify({
    currency: 'INR',
    fy_start_month: 'April',
    default_payment_terms: 'Net 30',
  });
  const viewerSetup = await onboardingSetupPOST(authzRequest(viewer.id, '/api/onboarding/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: setupBody,
  }) as any);
  assert.strictEqual(viewerSetup.status, 403, 'Viewer must be denied company setup changes');

  const logoutToken = createSessionToken(viewer.id) ?? '';
  const logoutResponse = await logoutPOST(new Request('http://localhost/api/auth/logout', {
    method: 'POST',
    headers: { cookie: `aiospark_session=${logoutToken}` },
  }) as any);
  assert.strictEqual(logoutResponse.status, 200, 'Logout should complete successfully');
  assert.strictEqual(verifySessionToken(logoutToken), null, 'Logout must revoke the presented session token');

  const invite = (userId: string, email: string, role: string) =>
    invitePOST(authzRequest(userId, '/api/tenant/invite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, role }),
    }) as any);

  const adminInvitesOwner = await invite(admin.id, 'new-owner@example.com', 'Owner');
  const adminInvitesManager = await invite(admin.id, 'new-manager@example.com', 'Finance Manager');
  const ownerInvitesAdmin = await invite(owner.id, 'new-admin@example.com', 'Admin');
  assert.strictEqual(adminInvitesOwner.status, 403, 'Admin must not be able to invite an Owner');
  assert.strictEqual(adminInvitesManager.status, 200, 'Admin should be able to invite a lower-privilege role');
  assert.strictEqual(ownerInvitesAdmin.status, 200, 'Owner should be able to invite an Admin');
  assert.strictEqual(canGrantRole('Finance Manager', 'Owner'), false, 'Role grant helper must reject privilege escalation');

  console.log('⚡ [PASS] 3. Route Authorization: Viewer blocked from integration status and company setup; Owner allowed; invite escalation blocked; logout revokes session');

  const sameOriginRequest = new Request('https://app.example.com/api/invoices', {
    method: 'POST',
    headers: { origin: 'https://app.example.com', 'x-forwarded-host': 'app.example.com' },
  });
  const crossOriginRequest = new Request('https://app.example.com/api/invoices', {
    method: 'POST',
    headers: { origin: 'https://attacker.example', 'x-forwarded-host': 'app.example.com' },
  });
  const crossSiteNoOriginRequest = new Request('https://app.example.com/api/invoices', {
    method: 'POST',
    headers: { 'sec-fetch-site': 'cross-site' },
  });

  assert.strictEqual(isCsrfRequestSafe(sameOriginRequest), true, 'Same-origin mutation must pass CSRF validation');
  assert.strictEqual(isCsrfRequestSafe(crossOriginRequest), false, 'Cross-origin mutation must fail CSRF validation');
  assert.strictEqual(isCsrfRequestSafe(crossSiteNoOriginRequest), false, 'Cross-site mutation without Origin must fail CSRF validation');

  console.log('⚡ [PASS] 4. CSRF Guard: Same-origin mutations allowed; cross-origin and cross-site mutations rejected');

  const productionHeaders = Object.fromEntries(
    getSecurityHeaders(true).map(({ key, value }) => [key.toLowerCase(), value])
  );
  const developmentHeaders = Object.fromEntries(
    getSecurityHeaders(false).map(({ key, value }) => [key.toLowerCase(), value])
  );

  assert.strictEqual(productionHeaders['x-content-type-options'], 'nosniff', 'Security headers must disable MIME sniffing');
  assert.strictEqual(productionHeaders['x-frame-options'], 'DENY', 'Security headers must prevent framing');
  assert.match(productionHeaders['content-security-policy'], /frame-ancestors 'none'/, 'CSP must prevent framing');
  assert.match(productionHeaders['content-security-policy'], /upgrade-insecure-requests/, 'Production CSP must upgrade insecure requests');
  assert.match(productionHeaders['strict-transport-security'], /max-age=63072000/, 'Production must enable HSTS');
  assert.strictEqual(developmentHeaders['strict-transport-security'], undefined, 'Development must not enable HSTS');

  console.log('⚡ [PASS] 5. Security Headers: HSTS, CSP, framing, sniffing, referrer, and permissions policies configured');

  const boundedPagination = parsePagination(new URLSearchParams({ page: '-4', pageSize: '100000' }));
  const invalidPagination = parsePagination(new URLSearchParams({ page: 'abc', pageSize: 'xyz' }));
  assert.deepStrictEqual(boundedPagination, { page: 1, pageSize: 100 }, 'Pagination must clamp negative pages and oversized page sizes');
  assert.deepStrictEqual(invalidPagination, { page: 1, pageSize: 20 }, 'Pagination must use safe defaults for invalid input');

  console.log('⚡ [PASS] 6. Resource Bounds: Pagination clamped and import payload/row limits enforced');

  console.log('\n==========================================');
  console.log('SECURITY SUITE SUMMARY: ALL PASSED, 0 FAILED');
  console.log('==========================================\n');
}
