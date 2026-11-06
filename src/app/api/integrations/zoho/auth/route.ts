import { NextRequest, NextResponse } from "next/server";
import { resolveTenantContext, validatePermission } from "@/lib/tenant/middleware";
import { createOAuthState } from "@/lib/auth/oauth-state";

export async function GET(request: NextRequest) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, "edit", "integrations");
  if (permissionError) return permissionError;

  const isProduction = process.env.NODE_ENV === "production";
  const clientId = process.env.ZOHO_CLIENT_ID || (isProduction ? "" : "mock_zoho_client_id_123");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (isProduction ? "" : "http://localhost:3000");
  if (isProduction && (!clientId || !appUrl || !process.env.ZOHO_CLIENT_SECRET)) {
    return NextResponse.json({ error: "Zoho OAuth is not configured" }, { status: 503 });
  }
  const redirectUri = `${appUrl}/api/integrations/zoho/callback`;
  const scope =
    "ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.customerpayments.READ";
  const returnTo = new URL(request.url).searchParams.get("returnTo") === "/onboarding"
    ? "/onboarding"
    : "/settings/integrations";
  const state = createOAuthState({
    organizationId: context!.organization.id,
    userId: context!.user.id,
    returnTo,
  });
  if (!state) return NextResponse.json({ error: "OAuth state signing is not configured" }, { status: 503 });

  const accountsDomain = (process.env.ZOHO_ACCOUNTS_DOMAIN || "https://accounts.zoho.com").replace(/\/$/, "");
  const authUrl = `${accountsDomain}/oauth/v2/auth?scope=${encodeURIComponent(scope)}&client_id=${clientId}&response_type=code&access_type=offline&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

  return NextResponse.json({
    authUrl,
    organizationId: context!.organization.id,
  });
}
