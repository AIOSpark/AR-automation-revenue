// AIOSpark Read-Only Pilot Access Grant Test Suite
import assert from 'node:assert';
import { authStore } from '../../auth/store';
import { billingStore } from '../store';
import { pilotAccessEngine, APPROVED_PILOT_FEATURES } from '../pilot-access';

export async function runPilotAccessTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK PILOT ACCESS GRANT TEST SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function t(condition: boolean, name: string, extra = '') {
    if (condition) {
      passed++;
      console.log(`  ✅ [PASS] ${name}`);
    } else {
      failed++;
      console.error(`  ❌ [FAIL] ${name} ${extra}`);
    }
  }

  // Platform administrator (only they may issue/revoke pilot grants).
  const adminUser = authStore.createUser({
    auth_provider_id: 'auth_provider_admin_pilot',
    email: 'admin_pilot@example.com',
    first_name: 'Platform',
    last_name: 'Admin',
    role_title: 'Platform Administrator',
  });
  const adminUserId = adminUser.id;
  authStore.setPlatformAdmin(adminUserId, true);
  t(authStore.isPlatformAdmin(adminUserId) === true, 'Platform admin flag set');

  // Regular user (not a platform administrator).
  const regularUser = authStore.createUser({
    auth_provider_id: 'auth_provider_regular_pilot',
    email: 'regular_pilot@example.com',
    first_name: 'Regular',
    last_name: 'User',
  });
  const regularUserId = regularUser.id;
  t(authStore.isPlatformAdmin(regularUserId) === false, 'Regular user is not platform admin');

  const orgA = authStore.createOrganizationDraft({
    name: 'Pilot Org A',
    size: '11-50 employees',
    industry: 'IT Services & SaaS',
    created_by_user_id: adminUserId,
  });
  const orgB = authStore.createOrganizationDraft({
    name: 'Unpaid Org B',
    size: '11-50 employees',
    industry: 'IT Services & SaaS',
    created_by_user_id: regularUserId,
  });

  // ---- TEST 1: Authorized pilot grant ----
  console.log('\n1. Authorized pilot grant...');
  const grant = pilotAccessEngine.grantPilotAccess({
    organization_id: orgA.id,
    granted_by: adminUserId,
    granted_by_user_id: adminUserId,
    approved_features: [
      'receivables',
      'customer_360',
      'cfo_intelligence',
      'causal_graph',
      'cash_unblock',
      'reports',
    ],
    read_only: true,
    pilot_charter_reference: 'charter-2026-001',
    starts_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  t(grant.status === 'active', 'Grant status is active', grant.status);
  t(grant.read_only === true, 'Grant is read-only', String(grant.read_only));
  t(grant.organization_id === orgA.id, 'Grant bound to org A');
  t(grant.granted_by === adminUserId, 'Granted by platform admin');
  t(
    grant.approved_features.includes('receivables') &&
      grant.approved_features.includes('cfo_intelligence'),
    'Approved features stored',
    JSON.stringify(grant.approved_features),
  );
  t(
    !!grant.expires_at && new Date(grant.expires_at).getTime() > Date.now(),
    'Grant has future expiry',
  );
  t(
    pilotAccessEngine.hasPilotFeatureAccess(orgA.id, 'receivables') === true,
    'Org A has receivables pilot access',
  );
  t(
    pilotAccessEngine.hasPilotFeatureAccess(orgA.id, 'cfo_intelligence') === true,
    'Org A has CFO pilot access',
  );
  t(
    pilotAccessEngine.hasPilotFeatureAccess(orgA.id, 'causal_graph') === true,
    'Org A has causal graph pilot access',
  );
  t(
    pilotAccessEngine.hasPilotFeatureAccess(orgA.id, 'cash_unblock') === true,
    'Org A has cash unblock queue pilot access',
  );

  // ---- TEST 2: Unauthorized grant attempt (non-admin) ----
  console.log('\n2. Unauthorized grant attempt...');
  try {
    pilotAccessEngine.grantPilotAccess({
      organization_id: orgB.id,
      granted_by: regularUserId,
      approved_features: ['receivables'],
      read_only: true,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    t(false, 'Non-admin grant should have thrown');
  } catch (err: any) {
    t(err.message.includes('platform administrator'), 'Non-admin grant rejected', err.message);
  }

  // ---- TEST 3: Feature scope enforcement (non-approved feature rejected) ----
  console.log('\n3. Feature scope enforcement...');
  try {
    pilotAccessEngine.grantPilotAccess({
      organization_id: orgB.id,
      granted_by: adminUserId,
      approved_features: ['advanced_ai', 'integrations'],
      read_only: true,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    t(false, 'Non-approved feature grant should have thrown');
  } catch (err: any) {
    t(
      err.message.includes('not an approved read-only pilot feature'),
      'Non-approved features rejected',
      err.message,
    );
  }
  t(
    pilotAccessEngine.hasPilotFeatureAccess(orgB.id, 'receivables') === false,
    'Org B has no receivables access after rejected grant',
  );

  // ---- TEST 4: Expired grant ----
  console.log('\n4. Expired grant...');
  const expiredOrg = authStore.createOrganizationDraft({
    name: 'Expired Org',
    size: '11-50 employees',
    industry: 'IT Services & SaaS',
    created_by_user_id: adminUserId,
  });
  pilotAccessEngine.grantPilotAccess({
    organization_id: expiredOrg.id,
    granted_by: adminUserId,
    approved_features: ['receivables'],
    read_only: true,
    starts_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    expires_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // already expired
  });
  pilotAccessEngine.expireGrants();
  t(
    pilotAccessEngine.hasPilotFeatureAccess(expiredOrg.id, 'receivables') === false,
    'Expired grant no longer grants access',
  );
  const grantAfterExpiry = pilotAccessEngine.getPilotAccess(expiredOrg.id);
  t(
    grantAfterExpiry === null || grantAfterExpiry?.status === 'expired',
    'Grant marked expired',
    grantAfterExpiry?.status,
  );

  // ---- TEST 5: Revoked grant ----
  console.log('\n5. Revoked grant...');
  const revokeOrg = authStore.createOrganizationDraft({
    name: 'Revoke Org',
    size: '11-50 employees',
    industry: 'IT Services & SaaS',
    created_by_user_id: adminUserId,
  });
  pilotAccessEngine.grantPilotAccess({
    organization_id: revokeOrg.id,
    granted_by: adminUserId,
    approved_features: ['receivables'],
    read_only: true,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  t(
    pilotAccessEngine.hasPilotFeatureAccess(revokeOrg.id, 'receivables') === true,
    'Revoke Org has access before revoke',
  );
  const grantToRevoke = pilotAccessEngine.listGrants(revokeOrg.id)[0];
  const revoked = pilotAccessEngine.revokePilotAccess({
    grant_id: grantToRevoke.id,
    revoked_by: adminUserId,
  });
  t(revoked?.status === 'revoked', 'Grant status revoked', revoked?.status);
  t(
    pilotAccessEngine.hasPilotFeatureAccess(revokeOrg.id, 'receivables') === false,
    'Access removed after revocation',
  );
  // Non-admin cannot revoke
  try {
    pilotAccessEngine.revokePilotAccess({ grant_id: 'x', revoked_by: regularUserId });
    t(false, 'Non-admin revoke should have thrown');
  } catch (err: any) {
    t(err.message.includes('platform administrator'), 'Non-admin revoke rejected', err.message);
  }

  // ---- TEST 6: Cross-tenant isolation ----
  console.log('\n6. Cross-tenant isolation...');
  t(
    pilotAccessEngine.hasPilotFeatureAccess(orgB.id, 'receivables') === false,
    'Org B cannot access Org A receivables grant',
  );
  t(
    pilotAccessEngine.listGrants(orgB.id).length === 0,
    'Org B has no grants',
  );
  const grantsForA = pilotAccessEngine.listGrants(orgA.id);
  t(
    grantsForA.every((g) => g.organization_id === orgA.id),
    'Grants for Org A only contain Org A',
  );

  // ---- TEST 7: Payment entitlement independence ----
  console.log('\n7. Payment entitlement independence...');
  const subBefore = billingStore.getSubscription(orgA.id);
  const paymentsBefore = billingStore.getPayments(orgA.id).length;
  t(
    subBefore.status === 'trialing' || subBefore.status === 'active',
    'Org A has a default subscription state',
    subBefore.status,
  );
  t(
    paymentsBefore === 0,
    'Org A has no payment records (pilot grant created none)',
    String(paymentsBefore),
  );
  const subAfter = billingStore.getSubscription(orgA.id);
  const paymentsAfter = billingStore.getPayments(orgA.id).length;
  t(subAfter?.id === subBefore?.id, 'Subscription not replaced by pilot grant');
  t(paymentsAfter === paymentsBefore, 'No payment records created by pilot grant', String(paymentsAfter));

  // ---- TEST 8: Normal unpaid organization cannot use pilot grants ----
  console.log('\n8. Normal unpaid organization (no grant)...');
  const freshOrg = authStore.createOrganizationDraft({
    name: 'Fresh Unpaid Org',
    size: '11-50 employees',
    industry: 'IT Services & SaaS',
    created_by_user_id: regularUserId,
  });
  t(
    pilotAccessEngine.hasPilotFeatureAccess(freshOrg.id, 'receivables') === false,
    'Fresh org has no pilot access',
  );
  t(pilotAccessEngine.getPilotAccess(freshOrg.id) === null, 'Fresh org has no grant');

  // ---- TEST 9: Read-only enforcement (no mutation/execution features) ----
  console.log('\n9. Read-only enforcement...');
  const check = pilotAccessEngine.checkPilotAccess(orgA.id, 'receivables');
  t(check.allowed === true, 'CheckPilotAccess allowed for receivables');
  t(grant.read_only === true, 'Grant read_only flag is true');
  const mutationFeatures = ['advanced_ai', 'integrations', 'multi_user'];
  const nonReadonly = grant.approved_features.filter((f) => mutationFeatures.includes(f));
  t(nonReadonly.length === 0, 'No mutation/execution features in grant', JSON.stringify(nonReadonly));

  console.log('\n==========================================');
  console.log(`PILOT ACCESS TEST SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');

  return { passed, failed };
}
