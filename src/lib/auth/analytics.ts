// AIOSpark Authentication Instrumentation & Funnel Tracking

export type AuthFunnelEvent =
  | "signup_started"
  | "signup_completed"
  | "email_verified"
  | "first_login"
  | "password_reset_requested"
  | "logout_completed";

export interface EventPayload {
  email?: string;
  userId?: string;
  authProviderId?: string;
  companyName?: string;
  roleTitle?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export function trackAuthFunnelEvent(event: AuthFunnelEvent, payload?: EventPayload): void {
  const timestamp = new Date().toISOString();
  const eventLog = {
    event: `[AUTH_FUNNEL] ${event}`,
    timestamp,
    ...payload,
  };

  // Structured logging for analytics pipeline
  console.log(JSON.stringify(eventLog));
}
