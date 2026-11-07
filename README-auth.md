# AIOSpark Authentication System (Layer 2)

## Overview & Managed Auth Provider Selection

AIOSpark uses **Supabase Auth** (`@supabase/supabase-js` & `@supabase/ssr`) as its managed authentication provider.

### Why Supabase Auth was Selected

1. **Strict Managed Auth Compliance**: Zero custom password hashing, zero custom session token signing, and zero application-level password reset token logic. All credentials and security primitives are managed exclusively by Supabase.
2. **Native Enterprise SAML/OIDC & MFA Ready**: Supabase Auth includes native support for Enterprise SAML 2.0 / OIDC SSO (Okta, Azure AD, Google Workspace), Multi-Factor Authentication (TOTP, WebAuthn), and OAuth 2.0 (Google, Microsoft), allowing future enterprise SSO enablement via dashboard configuration without UI code rewrites.
3. **Database & Multi-Tenant Integration**: Integrates directly with PostgreSQL and row-level security (RLS), supporting seamless link between `auth.users` and our application `users` and `organizations` tables for Layer 3 (Multi-Tenant RBAC).
4. **Secure Cookie-Based Web Sessions**: `@supabase/ssr` manages short-lived access tokens and refresh tokens in `httpOnly`, `secure`, `sameSite` cookies for Next.js App Router (Server Components, Client Components, Middleware).

---

## Environment Variables Configuration

Create a `.env.local` file with the following variables:

```env
# Managed Auth Provider Config
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# App Public URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Dev-only Email Verification Bypass (Defaults to false/off)
DEV_BYPASS_EMAIL_VERIFICATION=false
```

---

## Database Schema (`src/lib/auth/schema.sql`)

The database model strictly separates credential identity (managed by Supabase Auth) from user profile data and organization drafts:

### `users` Table
```sql
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  role_title TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `organizations` Table (Draft Capture Point for Layer 3)
```sql
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  size TEXT NOT NULL,
  industry TEXT NOT NULL,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Activation Funnel Instrumentation Metrics

All activation funnel events are instrumented in `src/lib/auth/analytics.ts` and logged with exact event names:

1. `signup_started`: Triggered when the user begins filling out the `/signup` form.
2. `signup_completed`: Triggered when user registration and organization draft creation succeed.
3. `email_verified`: Triggered when user email verification is confirmed by the provider.
4. `first_login`: Triggered on successful user authentication into a verified session.
5. `logout_completed`: Triggered when the user terminates their active session.

---

## Future Enterprise SSO & OAuth Expansion

To add Google/Microsoft OAuth or SAML/OIDC Enterprise SSO:
1. Enable the provider in the Supabase Dashboard under **Authentication -> Providers -> Enterprise SSO / OAuth**.
2. Configure client ID / metadata URL.
3. Set `FEATURE_ENABLE_GOOGLE_AUTH=true` or `FEATURE_ENABLE_SAML_SSO=true` in `src/lib/auth/config.ts`.
4. No custom authentication or session UI logic rewrite is required.
