// AIOSpark Layer 2 Auth System Test Suite

import { executeSignup, executeLogin, executeForgotPassword, confirmEmailVerification } from "../supabase";
import { authStore } from "../store";
import { createSessionToken, revokeSessionToken, verifySessionToken } from "../session";
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

  // Test 4: Login Failure Case - Unverified Email Gate
  const unverifiedLogin = await executeLogin("sarah@apexsolutions.com", "Password123!");
  assert(unverifiedLogin.success === false && unverifiedLogin.requiresEmailVerification === true, "4a. Login Constraint - Unverified Email Gate Enforced");

  // Test 5: Email Verification Happy Path
  const verifyResult = await confirmEmailVerification("sarah@apexsolutions.com");
  assert(verifyResult.success === true && verifyResult.user?.email_verified === true, "5a. Email Verification - Email Confirmed Successfully");

  // Test 6: Login Happy Path (Post-Verification)
  const loginHappy = await executeLogin("sarah@apexsolutions.com", "Password123!");
  assert(loginHappy.success === true, "6a. Login Happy Path - Verified User Authenticated");
  assert(loginHappy.sessionToken !== undefined, "6b. Login Happy Path - Short-lived Token Generated");

  // Test 7: Password Reset Flow (Provider Delegated)
  const resetResult = await executeForgotPassword("sarah@apexsolutions.com");
  assert(resetResult.success === true, "7a. Password Reset - Delegated Provider Flow Initiated");

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

  console.log("\n==========================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================\n");

  return { passed, failed };
}
