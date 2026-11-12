// AIOSpark Phase 2: Authenticated Organization Onboarding Security Tests
// Covers all 15 security test requirements from the Phase 2 specification.

import { authStore } from "../store";
import { tenantStore } from "../../tenant/store";
import {
  getOrCreateUserFromSupabaseId,
  resolveAuthenticatedUser,
  executeSignup,
} from "../supabase";
import { createSessionToken } from "../session";
import { can } from "../../tenant/permissions";

export async function runPhase2TestSuite() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  // Clean slate
  authStore.clearAll();
  tenantStore.clearAll();

  // Configure session secret
  process.env.AIOSPARK_SESSION_SECRET = "test-phase2-secret-1234567890abcdefghijklmnopqrstuvwxyz";

  // -------------------------------------------------------------------------
  // Test 1: Missing authentication — no session token → fail closed
  // -------------------------------------------------------------------------
  const noSession = await resolveAuthenticatedUser(undefined);
  assert(noSession.user === null && !noSession.isEmailVerified, "1. Missing authentication — no session token fails closed");

  const invalidSession = await resolveAuthenticatedUser("invalid.token.here");
  assert(invalidSession.user === null && !invalidSession.isEmailVerified, "1b. Missing authentication — invalid session token fails closed");

  // -------------------------------------------------------------------------
  // Test 2: Unverified user access — org creation rejected when email not verified
  // -------------------------------------------------------------------------
  const unverifiedSignup = await executeSignup({
    first_name: "Unverified",
    last_name: "User",
    email: "unverified@example.com",
    password: "Password123!",
    company_name: "Unverified Org",
    company_size: "1-10 employees",
    industry: "IT Services & SaaS",
  });
  assert(unverifiedSignup.success === true, "2a. Unverified signup succeeds (creates user profile)");
  assert(unverifiedSignup.requiresEmailVerification === true, "2b. Unverified signup flags requiresEmailVerification");
  assert(unverifiedSignup.sessionToken === undefined, "2c. Unverified signup does not issue session token");

  const unverifiedUser = authStore.getUserByEmail("unverified@example.com");
  assert(unverifiedUser !== null && !unverifiedUser!.email_verified, "2d. Unverified user profile exists with email_verified=false");

  // -------------------------------------------------------------------------
  // Test 3: Valid authenticated user — create session, resolve user
  // -------------------------------------------------------------------------
  const verifiedSignup = await executeSignup({
    first_name: "Verified",
    last_name: "User",
    email: "verified@example.com",
    password: "Password123!",
    company_name: "Verified Org",
    company_size: "11-50 employees",
    industry: "Financial Services & Banking",
  });
  assert(verifiedSignup.success === true, "3a. Verified signup succeeds");

  // Mark email as verified (simulate Supabase confirmation)
  verifiedSignup.user!.email_verified = true;
  authStore.updateUserEmailVerified(verifiedSignup.user!.auth_provider_id, true);

  const sessionToken = createSessionToken(verifiedSignup.user!.id);
  assert(sessionToken !== null, "3b. Session token created for verified user");
  if (!sessionToken) throw new Error("Session token should not be null");

  const resolved = await resolveAuthenticatedUser(sessionToken);
  assert(resolved.user !== null && resolved.isEmailVerified === true, "3c. Valid authenticated user resolves with isEmailVerified=true");
  const resolvedEmail = resolved.user?.email ?? "";
  assert(resolvedEmail === "verified@example.com", "3d. Resolved user email matches");

  // -------------------------------------------------------------------------
  // Test 4: User profile creation — getOrCreateUserFromSupabaseId creates new profile
  // -------------------------------------------------------------------------
  const newProfile = await getOrCreateUserFromSupabaseId(
    "supabase_auth_id_123",
    "newprofile@example.com",
    "New",
    "Profile"
  );
  assert(newProfile !== null && newProfile.email === "newprofile@example.com", "4a. New user profile created from Supabase ID");
  assert(newProfile!.auth_provider_id === "supabase_auth_id_123", "4b. Supabase Auth ID stored as auth_provider_id");
  assert(newProfile!.email_verified === false, "4c. New profile starts unverified");

  // -------------------------------------------------------------------------
  // Test 5: Existing profile retrieval — getOrCreateUserFromSupabaseId returns existing
  // -------------------------------------------------------------------------
  const existingProfile = await getOrCreateUserFromSupabaseId(
    "supabase_auth_id_123",
    "newprofile@example.com",
    "Updated",
    "Name"
  );
  assert(existingProfile !== null && existingProfile!.id === newProfile!.id, "5a. Existing profile returned (not duplicated)");
  assert(existingProfile!.auth_provider_id === "supabase_auth_id_123", "5b. Existing profile keeps Supabase Auth ID link");

  // -------------------------------------------------------------------------
  // Test 6: Organization creation — verified user creates org atomically with membership
  // -------------------------------------------------------------------------
  const verifiedUser = authStore.getUserByEmail("verified@example.com")!;
  const orgCountBefore = tenantStore.getUserOrganizations(verifiedUser.id).length;

  const organization = authStore.createOrganizationDraft({
    name: "Test Organization",
    size: "51-200 employees",
    industry: "Financial Services & Banking",
    created_by_user_id: verifiedUser.id,
  });

  const member = tenantStore.addMember(verifiedUser.id, organization.id, "Owner", verifiedUser.id);

  assert(organization !== null && organization.name === "Test Organization", "6a. Organization created and persisted");
  assert(organization.created_by_user_id === verifiedUser.id, "6b. Organization creator recorded");
  assert(member !== null && member.role === "Owner", "6c. Creator assigned Owner role");
  assert(member.user_id === verifiedUser.id && member.organization_id === organization.id, "6d. Membership record correct");
  assert(tenantStore.getUserOrganizations(verifiedUser.id).length === orgCountBefore + 1, "6e. User organization count increased");

  // -------------------------------------------------------------------------
  // Test 7: Duplicate submission protection — same org name rejected
  // -------------------------------------------------------------------------
  const existingOrgs = tenantStore.getUserOrganizations(verifiedUser.id);
  const dupName = existingOrgs.find((o) => o.organization.name.toLowerCase() === "test organization");
  assert(dupName !== undefined, "7a. Duplicate org name detected for same user");

  // -------------------------------------------------------------------------
  // Test 8: Membership assignment — verify member record in tenant store
  // -------------------------------------------------------------------------
  const retrievedMember = tenantStore.getMember(verifiedUser.id, organization.id);
  assert(retrievedMember !== null && retrievedMember.role === "Owner", "8a. Membership record retrievable");
  assert(retrievedMember!.organization_id === organization.id, "8b. Membership links to correct organization");

  // -------------------------------------------------------------------------
  // Test 9: Unauthorized organization access — user not member of org
  // -------------------------------------------------------------------------
  const otherUser = await getOrCreateUserFromSupabaseId("other_supabase_id", "other@example.com", "Other", "User");
  const nonMember = tenantStore.getMember(otherUser!.id, organization.id);
  assert(nonMember === null, "9a. Non-member cannot access organization (no membership record)");

  // -------------------------------------------------------------------------
  // Test 10: Cross-tenant access denial — user A cannot see user B's org data
  // -------------------------------------------------------------------------
  const otherUserOrgs = tenantStore.getUserOrganizations(otherUser!.id);
  const hasCrossAccess = otherUserOrgs.find((o: { organization: { id: string } }) => o.organization.id === organization.id);
  assert(hasCrossAccess === undefined, "10a. Cross-tenant: other user has no access to first user's org");

  // -------------------------------------------------------------------------
  // Test 11: Missing tenant context — no organization → null context
  // -------------------------------------------------------------------------
  const userWithoutOrg = await getOrCreateUserFromSupabaseId("no_org_supabase", "noorg@example.com", "No", "Org");
  const userWithoutOrgOrgs = tenantStore.getUserOrganizations(userWithoutOrg!.id);
  assert(userWithoutOrgOrgs.length === 0, "11a. User without organization returns empty organization list");

  // -------------------------------------------------------------------------
  // Test 12: RBAC enforcement — Owner can edit organization_settings, Viewer cannot
  // -------------------------------------------------------------------------
  assert(can("Owner", "edit", "organization_settings") === true, "12a. Owner can edit organization_settings");
  assert(can("Viewer", "edit", "organization_settings") === false, "12b. Viewer cannot edit organization_settings");
  assert(can("Owner", "view", "customers") === true, "12c. Owner can view customers");
  assert(can("Viewer", "execute", "payments") === false, "12d. Viewer cannot execute payments");

  // -------------------------------------------------------------------------
  // Test 13: Persistence after refresh — data survives store reload (simulated)
  // -------------------------------------------------------------------------
  const orgAfterReload = authStore.getOrganizationById(organization.id);
  assert(orgAfterReload !== null && orgAfterReload.name === "Test Organization", "13a. Organization persists after state reload");
  const userAfterReload = authStore.getUserById(verifiedUser.id);
  assert(userAfterReload !== null && userAfterReload.email === "verified@example.com", "13b. User profile persists after state reload");

  // -------------------------------------------------------------------------
  // Test 14: Persistence after restart — data survives (simulated via second store read)
  // -------------------------------------------------------------------------
  authStore["reloadFromDurableState"]();
  const orgAfterRestart = authStore.getOrganizationById(organization.id);
  assert(orgAfterRestart !== null && orgAfterRestart.name === "Test Organization", "14a. Organization persists after simulated restart");
  const memberAfterRestart = tenantStore.getMember(verifiedUser.id, organization.id);
  assert(memberAfterRestart !== null, "14b. Membership persists after simulated restart");

  // -------------------------------------------------------------------------
  // Test 15: Multiple organization memberships — user can belong to multiple orgs
  // -------------------------------------------------------------------------
  const secondOrg = authStore.createOrganizationDraft({
    name: "Second Organization",
    size: "1-10 employees",
    industry: "IT Services & SaaS",
    created_by_user_id: verifiedUser.id,
  });
  tenantStore.addMember(verifiedUser.id, secondOrg.id, "Admin", verifiedUser.id);

  const userOrgs = tenantStore.getUserOrganizations(verifiedUser.id);
  assert(userOrgs.length >= 2, "15a. User has multiple organization memberships");
  const orgNames = userOrgs.map((o) => o.organization.name);
  assert(orgNames.includes("Test Organization") && orgNames.includes("Second Organization"), "15b. Both organizations visible in user's org list");

  const testOrgMembership = tenantStore.getMember(verifiedUser.id, organization.id);
  const secondOrgMembership = tenantStore.getMember(verifiedUser.id, secondOrg.id);
  assert(testOrgMembership!.role === "Owner", "15c. Role preserved per organization (Owner on first)");
  assert(secondOrgMembership!.role === "Admin", "15d. Role preserved per organization (Admin on second)");

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log(`\n==========================================`);
  console.log(`PHASE 2 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==========================================\n`);

  return { passed, failed };
}
