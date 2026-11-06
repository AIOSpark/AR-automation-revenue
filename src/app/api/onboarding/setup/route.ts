import { NextRequest, NextResponse } from "next/server";
import { resolveTenantContext, validatePermission } from "@/lib/tenant/middleware";
import { onboardingStore } from "@/lib/onboarding/store";
import { trackOnboardingEvent } from "@/lib/onboarding/analytics";

export async function POST(request: NextRequest) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, "edit", "organization_settings");
  if (permissionError) return permissionError;

  try {
    const body = await request.json();
    const { industry, annual_revenue_range, currency, fy_start_month, default_payment_terms, timezone, country } = body;

    // Explicit Non-Negotiable Constraint Validations
    if (!currency || !fy_start_month || !default_payment_terms) {
      return NextResponse.json(
        { error: "Currency, Financial Year Start Month, and Default Payment Terms must be specified explicitly" },
        { status: 400 }
      );
    }

    const updatedOrg = onboardingStore.saveCompanySetup({
      organization_id: context!.organization.id,
      industry: industry || "IT Services & SaaS",
      annual_revenue_range: annual_revenue_range || "10-50Cr",
      currency,
      fy_start_month,
      default_payment_terms,
      timezone: timezone || "Asia/Kolkata",
      country: country || "India",
    });

    trackOnboardingEvent("onboarding_company_setup_completed", {
      organizationId: context!.organization.id,
      userId: context!.user.id,
      fyStartMonth: fy_start_month,
      currency,
    });

    return NextResponse.json({
      message: "Company financial parameters saved successfully",
      organization: updatedOrg,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
