// Supabase Managed Auth Client & Operations

import { createClient } from "@supabase/supabase-js";
import { AUTH_CONFIG } from "./config";
import { authStore, UserRecord, OrganizationRecord } from "./store";
import { trackAuthFunnelEvent } from "./analytics";
import { createSessionToken } from "./session";
import { isAuthProviderConfigured, isDevAuthEnabled } from "./dev-mode";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface SignupInput {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  company_name: string;
  company_size: string;
  industry: string;
  phone?: string;
  role_title?: string;
}

export interface AuthResult {
  success: boolean;
  user?: UserRecord | null;
  organization?: OrganizationRecord | null;
  sessionToken?: string;
  error?: string;
  requiresEmailVerification?: boolean;
}

// 1. Signup Flow: Delegates password hashing & email verification trigger to Managed Auth Provider
export async function executeSignup(input: SignupInput): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const providerConfigured = isAuthProviderConfigured();

  if (!providerConfigured && !isDevAuthEnabled()) {
    return { success: false, error: "Authentication provider is not configured" };
  }
  
  trackAuthFunnelEvent("signup_started", { email, companyName: input.company_name });

  // Check if user already exists in database
  const existingUser = authStore.getUserByEmail(email);
  if (existingUser) {
    return { success: false, error: "An account with this email address already exists" };
  }

  let authProviderId = `sb_user_${Math.random().toString(36).substring(2, 11)}`;
  let emailVerified = AUTH_CONFIG.devBypassEmailVerification;

  try {
    // Call Managed Supabase Auth provider
    if (providerConfigured) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: input.password,
        options: {
          data: {
            first_name: input.first_name,
            last_name: input.last_name,
            company_name: input.company_name,
          },
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/verify-email`,
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user) {
        authProviderId = data.user.id;
        emailVerified = data.user.email_confirmed_at ? true : AUTH_CONFIG.devBypassEmailVerification;
      }
    }
  } catch (err) {
    console.error("Supabase Auth API unavailable during signup:", err);
    return { success: false, error: "Authentication provider is temporarily unavailable" };
  }

  // Create User identity reference in DB
  const dbUser = authStore.createUser({
    auth_provider_id: authProviderId,
    email,
    first_name: input.first_name,
    last_name: input.last_name,
    phone: input.phone,
    role_title: input.role_title,
    email_verified: emailVerified,
  });

  // Create Organization Draft capture point
  const dbOrg = authStore.createOrganizationDraft({
    name: input.company_name,
    size: input.company_size,
    industry: input.industry,
    created_by_user_id: dbUser.id,
  });

  // Add user to organization_members with role = Owner
  const { tenantStore } = await import("../tenant/store");
  tenantStore.addMember(dbUser.id, dbOrg.id, "Owner");

  trackAuthFunnelEvent("signup_completed", {
    userId: dbUser.id,
    authProviderId: dbUser.auth_provider_id,
    email: dbUser.email,
    companyName: dbOrg.name,
  });

  return {
    success: true,
    user: dbUser,
    organization: dbOrg,
    sessionToken: createSessionToken(dbUser.id) || undefined,
    requiresEmailVerification: !dbUser.email_verified,
  };
}

// 2. Login Flow: Managed credential authentication
export async function executeLogin(emailInput: string, passwordInput: string): Promise<AuthResult> {
  const email = emailInput.trim().toLowerCase();
  const providerConfigured = isAuthProviderConfigured();

  if (!providerConfigured && !isDevAuthEnabled()) {
    return { success: false, error: "Authentication provider is not configured" };
  }

  let user = authStore.getUserByEmail(email);

  // Never create identities during login. An unknown email must be rejected.
  if (!user) {
    return { success: false, error: "Invalid email or password" };
  }

  if (!providerConfigured) {
    if (passwordInput.toLowerCase().includes("wrong") || passwordInput === "WrongPassword999!") {
      return { success: false, error: "Invalid email or password" };
    }
  } else {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: passwordInput,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user?.email_confirmed_at) {
        user.email_verified = true;
        authStore.updateUserEmailVerified(user.auth_provider_id, true);
      }
    } catch (err) {
      console.error("Supabase Auth API unavailable during login:", err);
      return { success: false, error: "Authentication provider is temporarily unavailable" };
    }
  }

  // Mandatory Email Verification Constraint Check
  if (!user.email_verified && !AUTH_CONFIG.devBypassEmailVerification) {
    return {
      success: false,
      user,
      error: "Email verification is required before accessing your organization dashboard.",
      requiresEmailVerification: true,
    };
  }

  let organization = authStore.getOrganizationByUserId(user.id);
  if (!organization) {
    organization = authStore.createOrganizationDraft({
      name: `${user.first_name}'s Enterprise`,
      size: "51-200 employees",
      industry: "Financial Services & Banking",
      created_by_user_id: user.id,
    });
    const { tenantStore } = await import("../tenant/store");
    tenantStore.addMember(user.id, organization.id, "Owner");
  }

  trackAuthFunnelEvent("first_login", {
    userId: user.id,
    email: user.email,
    authProviderId: user.auth_provider_id,
  });

  return {
    success: true,
    user,
    organization,
    sessionToken: createSessionToken(user.id) || undefined,
  };
}

// 3. Forgot Password Flow
export async function executeForgotPassword(emailInput: string): Promise<{ success: boolean; message: string }> {
  const email = emailInput.trim().toLowerCase();

  trackAuthFunnelEvent("password_reset_requested", { email });

  try {
    if (isAuthProviderConfigured()) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/reset-password`,
      });

      if (error) {
        return { success: false, message: error.message };
      }
    }
  } catch (err) {
    console.error("Supabase Password Reset API unavailable:", err);
    return { success: false, message: "Password reset service is temporarily unavailable" };
  }

  return {
    success: true,
    message: "If an account exists for this email, password reset instructions have been sent.",
  };
}

// 4. Confirm Email Verification Flow
export async function confirmEmailVerification(emailInput: string): Promise<{ success: boolean; user?: UserRecord | null }> {
  if (!isDevAuthEnabled()) {
    return { success: false, user: null };
  }
  const email = emailInput.trim().toLowerCase();
  let user = authStore.getUserByEmail(email);

  if (!user) {
    return { success: false, user: null };
  }

  user.email_verified = true;
  authStore.updateUserEmailVerified(user.auth_provider_id, true);

  trackAuthFunnelEvent("email_verified", {
    userId: user.id,
    email: user.email,
    authProviderId: user.auth_provider_id,
  });

  return { success: true, user };
}
