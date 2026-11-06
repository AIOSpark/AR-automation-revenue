"use client";

export function trackAnalyticsEvent(eventName: string, payload?: Record<string, unknown>) {
  console.log(`[Analytics Event] ${eventName}`, payload || {});
}

export function handleCTAClick(eventName: string, payload?: Record<string, unknown>) {
  trackAnalyticsEvent(eventName, payload);
}
