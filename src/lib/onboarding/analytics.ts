// AIOSpark Onboarding Activation Funnel Instrumentation

export type OnboardingFunnelEvent =
  | "onboarding_welcome_viewed"
  | "onboarding_company_setup_completed"
  | "onboarding_connection_method_chosen"
  | "onboarding_import_started"
  | "onboarding_import_completed"
  | "onboarding_landed_on_dashboard";

export interface OnboardingEventPayload {
  organizationId?: string;
  userId?: string;
  method?: "tally" | "zoho" | "csv";
  fyStartMonth?: string;
  currency?: string;
  totalRows?: number;
  successCount?: number;
  skippedCount?: number;
  [key: string]: unknown;
}

export function trackOnboardingEvent(event: OnboardingFunnelEvent, payload?: OnboardingEventPayload): void {
  const timestamp = new Date().toISOString();
  const eventLog = {
    event: `[ONBOARDING_ACTIVATION] ${event}`,
    timestamp,
    ...payload,
  };

  console.log(JSON.stringify(eventLog));
}
