// Authentication Configuration & Provider Settings

export const AUTH_CONFIG = {
  provider: "supabase", // Managed provider choice: Supabase Auth
  devBypassEmailVerification:
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_BYPASS_EMAIL_VERIFICATION === "true", // Default: false
  
  // Future Expansion Flags (Config-driven OAuth / SAML SSO)
  features: {
    googleOAuthEnabled: process.env.FEATURE_ENABLE_GOOGLE_AUTH === "true",
    microsoftOAuthEnabled: process.env.FEATURE_ENABLE_MICROSOFT_AUTH === "true",
    samlSsoEnabled: process.env.FEATURE_ENABLE_SAML_SSO === "true",
    mfaEnabled: process.env.FEATURE_ENABLE_MFA === "true",
  },
  
  // Industry & Size Options for Signup
  companySizes: [
    "1-10 employees",
    "11-50 employees",
    "51-200 employees",
    "201-1000 employees",
    "1000+ employees",
  ],
  
  industries: [
    "Logistics & Supply Chain",
    "Manufacturing & Industrial",
    "IT Services & SaaS",
    "Healthcare & Pharmaceuticals",
    "Retail & E-commerce",
    "Financial Services & Banking",
    "Construction & Real Estate",
    "Consulting & Professional Services",
    "Other",
  ],
};

// Soft Validation for Free Email Domains (Does NOT hard-block signup)
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "protonmail.com",
]);

export function validateWorkEmail(email: string): { isValid: boolean; isFreeEmail: boolean; error?: string } {
  if (!email || typeof email !== "string") {
    return { isValid: false, isFreeEmail: false, error: "Email is required" };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return { isValid: false, isFreeEmail: false, error: "Please enter a valid email address" };
  }

  const domain = email.trim().split("@")[1]?.toLowerCase();
  const isFreeEmail = FREE_EMAIL_DOMAINS.has(domain);

  return { isValid: true, isFreeEmail };
}
