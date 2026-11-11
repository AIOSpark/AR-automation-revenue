// AIOSpark Layer 2 Auth System Test Suite

import { executeSignup, executeLogin, executeForgotPassword, confirmEmailVerification } from "../supabase";
import { authStore } from "../store";
import { createSessionToken, revokeSessionToken, verifySessionToken } from "../session";
import { isSessionSecretStrong } from "../dev-mode";
import { sessionRevocationStore } from "../session-store";

export async function runAuthTestSuite() {
  console.log("\n==========================================");
  console.log("RUNNING AIOSPARK LAYER 2 AUTH TEST SUITE");
  console.log("==========================================\n");

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

  authStore.clearAll();

  // Configure a test session signing secret so session creation/verification works
  // in tests. Production requires AIOSPARK_SESSION_SECRET; tests set it explicitly.
  // Must be >= 43 base64url chars (32 bytes of entropy).
  process.env.AIOSPARK_SESSION_SECRET = "test-session-secret-do-not-use-in-production";

  // Test 1: Signup Happy Path
  const signupHappy = await executeSignup({
    first_name: "Sarah",
    last_name: "Jenkins",
    email: "sarah@apexsolutions.com",
    password: "Password123!",
    company_name: "Apex Enterprise Solutions",
    company_size: "51-200 employees",
    industry: "IT Services & SaaS",
    phone: "+91 98765 43210",
    role_title: "VP of Finance",
  });

  assert(signupHappy.success === true, "1a. Signup Happy Path - Returns Success");
  assert(signupHappy.user?.email === "sarah@apexsolutions.com", "1b. Signup Happy Path - User Email Recorded");
  assert(signupHappy.user?.auth_provider_id.startsWith("sb_user_") || false, "1c. Signup Happy Path - Provider Reference Only Stored");
  assert(signupHappy.organization?.name === "Apex Enterprise Solutions", "1d. Signup Happy Path - Organization Draft Persisted");

  // Test 2: Signup Failure Case - Duplicate Email
  const signupDuplicate = await executeSignup({
    first_name: "Sarah",
    last_name: "Jenkins",
    email: "sarah@apexsolutions.com",
    password: "DifferentPassword123!",
    company_name: "Apex Enterprise Solutions",
    company_size: "51-200 employees",
    industry: "IT Services & SaaS",
  });

  assert(signupDuplicate.success === false, "2a. Signup Failure - Duplicate Email Blocked");
  assert(signupDuplicate.error?.includes("already exists") || false, "2b. Signup Failure - Informative Error Message");

  // Test 3: Login Failure Case - Wrong Password
  const loginWrongPassword = await executeLogin("sarah@apexsolutions.com", "WrongPassword999!");
  assert(loginWrongPassword.success === false, "3a. Login Failure - Invalid Password Rejected");

  // Test 4: Login when provider unconfigured fails before email verification gate
  const unverifiedLogin = await executeLogin("sarah@apexsolutions.com", "Password123!");
  assert(
    unverifiedLogin.success === false && /not configured/i.test(unverifiedLogin.error || ""),
    "4a. Login fails closed when provider unconfigured (before email verification gate)"
  );

  // Test 5: Email Verification Happy Path
  const verifyResult = await confirmEmailVerification("sarah@apexsolutions.com");
  assert(verifyResult.success === true && verifyResult.user?.email_verified === true, "5a. Email Verification - Email Confirmed Successfully");

  // Test 6: Login when provider is unconfigured must fail closed
  // (No silent session creation with arbitrary passwords.)
  const loginUnconfigured = await executeLogin("sarah@apexsolutions.com", "Password123!");
  assert(
    loginUnconfigured.success === false && /not configured/i.test(loginUnconfigured.error || ""),
    "6a. Login fails closed when provider unconfigured (any password rejected)"
  );

  // Test 6b: Even common/weak passwords are rejected when provider is unconfigured
  const loginWeakPassword = await executeLogin("sarah@apexsolutions.com", "password123");
  assert(
    loginWeakPassword.success === false && /not configured/i.test(loginWeakPassword.error || ""),
    "6b. Login rejects arbitrary passwords when provider unconfigured"
  );

  // Test 6c: Unknown account + arbitrary password must not authenticate when provider unconfigured.
  // Returns generic error to avoid account enumeration (requirement #6).
  const loginUnknown = await executeLogin("nonexistent@apexsolutions.com", "AnyPassword123!");
  assert(
    loginUnknown.success === false && /invalid email or password/i.test(loginUnknown.error || ""),
    "6c. Unknown account rejected with generic error when provider unconfigured (no account enumeration)"
  );

  // Test 7a: Provider configured → login does not fail closed early with "not configured".
  // When Supabase credentials are present, login proceeds to the Supabase auth path.
  const env2 = process.env as unknown as Record<string, string | undefined>;
  const originalUrl2 = env2.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey2 = env2.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    env2.NEXT_PUBLIC_SUPABASE_URL = "https://test-project.supabase.co";
    env2.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key-abc123xyz";

    const loginConfigured = await executeLogin("sarah@apexsolutions.com", "Password123!");
    assert(
      !/not configured/i.test(loginConfigured.error || ""),
      "7a. Provider configured: login does not return 'not configured'"
    );
  } finally {
    if (originalUrl2 === undefined) delete env2.NEXT_PUBLIC_SUPABASE_URL;
    else env2.NEXT_PUBLIC_SUPABASE_URL = originalUrl2;
    if (originalKey2 === undefined) delete env2.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else env2.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey2;
  }

  // Test 7b: Password Reset Flow (Provider Delegated)
  const resetResult = await executeForgotPassword("sarah@apexsolutions.com");
  assert(resetResult.success === true, "7b. Password Reset - Delegated Provider Flow Initiated");

  // Test 8: Logout Flow Revokes the Server-Side Session
  sessionRevocationStore.clearAll();
  const logoutToken = createSessionToken(signupHappy.user!.id) ?? undefined;
  assert(logoutToken !== undefined && verifySessionToken(logoutToken) === signupHappy.user!.id, "8a. Logout Flow - Session token is valid before logout");
  assert(revokeSessionToken(logoutToken) === true, "8b. Logout Flow - Session token revocation accepted");
  assert(verifySessionToken(logoutToken) === null, "8c. Logout Flow - Revoked session token is rejected");

  // Test 9: Missing provider must fail closed unless explicit dev auth is enabled
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalTestMode = env.AIOSPARK_TEST_MODE;
  const originalDevAuth = env.AIOSPARK_DEV_AUTH;
  const originalSupabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    delete env.AIOSPARK_TEST_MODE;
    delete env.AIOSPARK_DEV_AUTH;
    delete env.NEXT_PUBLIC_SUPABASE_URL;
    delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const loginClosed = await executeLogin("sarah@apexsolutions.com", "Password123!");
    assert(
      loginClosed.success === false && /not configured/i.test(loginClosed.error || ""),
      "9a. Login fails closed when provider and explicit dev auth are absent"
    );

    const verifyClosed = await confirmEmailVerification("sarah@apexsolutions.com");
    assert(verifyClosed.success === false, "9b. Direct email verification is disabled without explicit dev auth");
  } finally {
    if (originalTestMode === undefined) delete env.AIOSPARK_TEST_MODE;
    else env.AIOSPARK_TEST_MODE = originalTestMode;
    if (originalDevAuth === undefined) delete env.AIOSPARK_DEV_AUTH;
    else env.AIOSPARK_DEV_AUTH = originalDevAuth;
    if (originalSupabaseUrl === undefined) delete env.NEXT_PUBLIC_SUPABASE_URL;
    else env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    if (originalSupabaseKey === undefined) delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseKey;
  }

  // Test 10: Session signing secret validation
  const env3 = process.env as unknown as Record<string, string | undefined>;
  const originalSessionSecret = env3.AIOSPARK_SESSION_SECRET;

  try {
    // 10a: Missing secret → session creation fails closed (returns null)
    delete env3.AIOSPARK_SESSION_SECRET;
    const tokenNoSecret = createSessionToken("user_no_secret");
    assert(
      tokenNoSecret === null,
      "10a. createSessionToken returns null when AIOSPARK_SESSION_SECRET is missing"
    );

    // 10b: Valid configured secret → signing and verification work
    env3.AIOSPARK_SESSION_SECRET = "test-session-secret-valid-1234567890abcdefghijklmnopqrstuvwxyz";
    const tokenValid = createSessionToken("user_valid_secret");
    assert(tokenValid !== null, "10b. createSessionToken returns token when secret is configured");
    assert(
      verifySessionToken(tokenValid!) === "user_valid_secret",
      "10c. verifySessionToken validates token signed with configured secret"
    );

    // 10d: Token signed with a different secret is rejected
    env3.AIOSPARK_SESSION_SECRET = "different-secret-67890abcdef1234567890xyzabcdefghijk";
    const tokenOtherSecret = createSessionToken("user_other_secret");
    env3.AIOSPARK_SESSION_SECRET = "test-session-secret-valid-1234567890abcdefghijklmnopqrstuvwxyz";
    assert(
      verifySessionToken(tokenOtherSecret!) === null,
      "10d. verifySessionToken rejects token signed with a different secret"
    );

    // 10e: Malformed token is rejected
    assert(
      verifySessionToken("not.a.valid.token") === null,
      "10e. verifySessionToken rejects malformed token"
    );
    assert(verifySessionToken(undefined) === null, "10f. verifySessionToken rejects undefined token");

    // 10g: Revoked token is rejected
    sessionRevocationStore.clearAll();
    const revocableToken = createSessionToken("user_revocable")!;
    assert(revokeSessionToken(revocableToken) === true, "10g. revokeSessionToken succeeds");
    assert(verifySessionToken(revocableToken) === null, "10h. verifySessionToken rejects revoked token");

    // 10i: Weak/short secret is rejected by strength check
    assert(
      isSessionSecretStrong("short") === false,
      "10i. isSessionSecretStrong rejects short secret"
    );
    assert(
      isSessionSecretStrong("") === false,
      "10j. isSessionSecretStrong rejects empty secret"
    );
    assert(
      isSessionSecretStrong(null!) === false,
      "10k. isSessionSecretStrong rejects null secret"
    );
    assert(
      isSessionSecretStrong("a-strong-enough-secret-key-minimum-forty-three-chars-xyz") === true,
      "10l. isSessionSecretStrong accepts sufficiently long secret"
    );

    // 10m: Weak secret causes createSessionToken to fail closed (returns null)
    env3.AIOSPARK_SESSION_SECRET = "weak";
    const tokenWeakSecret = createSessionToken("user_weak_secret");
    assert(
      tokenWeakSecret === null,
      "10m. createSessionToken returns null for weak/short secret"
    );

    // 10n: Restore valid secret and confirm signing works again
    env3.AIOSPARK_SESSION_SECRET = "test-session-secret-valid-1234567890abcdefghijklmnopqrstuvwxyz";
    const tokenAfterWeak = createSessionToken("user_after_weak");
    assert(tokenAfterWeak !== null, "10n. createSessionToken works again after restoring strong secret");
    assert(
      verifySessionToken(tokenAfterWeak!) === "user_after_weak",
      "10o. verifySessionToken validates token after restoring strong secret"
    );

    // 10p: With weak secret configured, no valid token can be created
    env3.AIOSPARK_SESSION_SECRET = "weak";
    const tokenWeakSecretSigned = createSessionToken("user_weak");
    assert(tokenWeakSecretSigned === null, "10p. createSessionToken returns null for weak secret");

    // Restore strong secret and confirm verification still works
    env3.AIOSPARK_SESSION_SECRET = "test-session-secret-valid-1234567890abcdefghijklmnopqrstuvwxyz";

    // 10q: OAuth state creation rejects weak secret
    env3.AIOSPARK_SESSION_SECRET = "weak";
    const { createOAuthState, verifyOAuthState } = await import("../oauth-state");
    const oauthStateWeak = createOAuthState({
      organizationId: "org_oauth",
      userId: "user_oauth",
      returnTo: "/onboarding",
    });
    assert(oauthStateWeak === null, "10q. createOAuthState returns null for weak secret");

    // 10r: OAuth state creation works with strong secret
    env3.AIOSPARK_SESSION_SECRET = "test-session-secret-valid-1234567890abcdefghijklmnopqrstuvwxyz";
    const oauthStateStrong = createOAuthState({
      organizationId: "org_oauth",
      userId: "user_oauth",
      returnTo: "/onboarding",
    });
    assert(oauthStateStrong !== null, "10r. createOAuthState returns state for strong secret");
    const verifiedOAuth = verifyOAuthState(oauthStateStrong!);
    assert(verifiedOAuth !== null, "10s. verifyOAuthState validates state signed with strong secret");

    // 10t: OAuth state creation rejects weak secret (repeat verification)
    env3.AIOSPARK_SESSION_SECRET = "weak";
    const oauthStateWeakAgain = createOAuthState({
      organizationId: "org_oauth2",
      userId: "user_oauth2",
      returnTo: "/onboarding",
    });
    assert(oauthStateWeakAgain === null, "10u. createOAuthState returns null for weak secret (repeat)");
  } finally {
    if (originalSessionSecret === undefined) delete env3.AIOSPARK_SESSION_SECRET;
    else env3.AIOSPARK_SESSION_SECRET = originalSessionSecret;
  }

  console.log("\n==========================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================\n");

  return { passed, failed };
}
