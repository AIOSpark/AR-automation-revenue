import { NextRequest, NextResponse } from "next/server";
import { integrationsStore } from "@/lib/adapters/store";
import { resolveTenantContext } from "@/lib/tenant/middleware";
import { verifyOAuthState } from "@/lib/auth/oauth-state";

export async function GET(request: NextRequest) {
  const context = await resolveTenantContext(request);
  if (!context) return NextResponse.redirect(new URL("/login?error=unauthorized", request.url));
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  let orgId = "";
  let returnTo = "/settings/integrations";

  try {
    const state = verifyOAuthState(searchParams.get("state"));
    if (!state || state.userId !== context.user.id) throw new Error("Invalid OAuth state");
    orgId = state.organizationId;
    returnTo = state.returnTo;
  } catch {
    return NextResponse.redirect(new URL(`${returnTo}?error=zoho_invalid_state`, request.url));
  }

  if (orgId !== context.organization.id) {
    return NextResponse.redirect(new URL(`${returnTo}?error=zoho_tenant_mismatch`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL(`${returnTo}?error=zoho_auth_denied`, request.url));
  }

  const isProduction = process.env.NODE_ENV === "production";
  const clientId = process.env.ZOHO_CLIENT_ID || (isProduction ? "" : "mock_zoho_client_id_123");
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (isProduction ? "" : "http://localhost:3000");
  if (isProduction && (!clientId || !clientSecret || !appUrl)) {
    return NextResponse.redirect(new URL(`${returnTo}?error=zoho_not_configured`, request.url));
  }
  const redirectUri = `${appUrl}/api/integrations/zoho/callback`;
  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  let resolvedApiDomain = process.env.ZOHO_BOOKS_API_DOMAIN || "https://www.zohoapis.com";
  let resolvedOrganizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;

  if (clientSecret) {
    const accountsDomain = (process.env.ZOHO_ACCOUNTS_DOMAIN || "https://accounts.zoho.com").replace(/\/$/, "");
    const tokenResponse = await fetch(`${accountsDomain}/oauth/v2/token`, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenResponse.ok) {
      return NextResponse.redirect(new URL(`${returnTo}?error=zoho_token_exchange_failed`, request.url));
    }

    const tokenData = await tokenResponse.json();
    accessToken = tokenData.access_token;
    refreshToken = tokenData.refresh_token;
    const apiDomain = tokenData.api_domain || process.env.ZOHO_BOOKS_API_DOMAIN || "https://www.zohoapis.com";

    if (!resolvedOrganizationId) {
      const organizationsResponse = await fetch(`${apiDomain.replace(/\/$/, "")}/books/v3/organizations`, {
        redirect: "error",
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      });
      if (!organizationsResponse.ok) {
        return NextResponse.redirect(new URL(`${returnTo}?error=zoho_organization_lookup_failed`, request.url));
      }
      const organizationsPayload = await organizationsResponse.json();
      const organizations = organizationsPayload.organizations || [];
      if (organizations.length !== 1) {
        return NextResponse.redirect(new URL(`${returnTo}?error=zoho_organization_selection_required`, request.url));
      }
      resolvedOrganizationId = String(organizations[0].organization_id);
    }

    resolvedApiDomain = apiDomain;
  }

  if (!accessToken) {
    return NextResponse.redirect(new URL(`${returnTo}?error=zoho_token_exchange_required`, request.url));
  }
  if (!resolvedOrganizationId) {
    return NextResponse.redirect(new URL(`${returnTo}?error=zoho_organization_required`, request.url));
  }

  // The integration store encrypts this configuration before persistence.
  integrationsStore.saveIntegration({
    organization_id: orgId,
    adapter_type: "zoho",
    rawConfig: {
      credentials: {
        token: accessToken,
        organizationId: resolvedOrganizationId,
        apiDomain: typeof resolvedApiDomain === "string" ? resolvedApiDomain : process.env.ZOHO_BOOKS_API_DOMAIN || "https://www.zohoapis.com",
        accountsDomain: process.env.ZOHO_ACCOUNTS_DOMAIN || "https://accounts.zoho.com",
        clientId,
        clientSecret,
        refreshToken,
      },
      expiresAt: Date.now() + 3600 * 1000,
    },
    status: "connected",
  });

  return NextResponse.redirect(new URL(`${returnTo}?status=zoho_connected`, request.url));
}
