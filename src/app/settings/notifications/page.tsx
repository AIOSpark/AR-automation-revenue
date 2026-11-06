"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Settings, Bell, Mail, ShieldCheck, CheckCircle2 } from "lucide-react";
import { OrgSwitcher } from "@/components/tenant/OrgSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AlertType } from "@/lib/alerts/types";

interface PrefState {
  alertType: AlertType;
  title: string;
  description: string;
  dashboard: boolean;
  email: boolean;
}

const DEFAULT_PREFS: PrefState[] = [
  {
    alertType: "severely_overdue_invoice",
    title: "Severely Overdue Invoice",
    description: "Triggers when an invoice crosses critical threshold per Layer 15 severity rules.",
    dashboard: true,
    email: true,
  },
  {
    alertType: "missed_payment_promise",
    title: "Missed Payment Promise",
    description: "Triggers when a customer commitment transitions to broken status.",
    dashboard: true,
    email: true,
  },
  {
    alertType: "new_high_risk_customer",
    title: "New High-Risk Customer Escalation",
    description: "Triggers ONLY on first transition into High risk rating band.",
    dashboard: true,
    email: false,
  },
  {
    alertType: "successful_reconciliation",
    title: "Successful Payment Reconciliation",
    description: "Triggers when a payment match is approved in Layer 21.",
    dashboard: true,
    email: false,
  },
];

export default function NotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<PrefState[]>(DEFAULT_PREFS);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const togglePref = async (alertType: AlertType, channel: "dashboard" | "email") => {
    const target = prefs.find((p) => p.alertType === alertType);
    if (!target) return;

    const newValue = !target[channel];

    setPrefs((prev) =>
      prev.map((p) => (p.alertType === alertType ? { ...p, [channel]: newValue } : p))
    );

    try {
      await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_preference",
          alertType,
          channel,
          enabled: newValue,
        }),
      });
      setStatusNotice(`✅ Updated preference: ${target.title} (${channel}) set to ${newValue ? "ENABLED" : "DISABLED"}.`);
    } catch (err: any) {
      setStatusNotice(`❌ Error updating preference: ${err.message}`);
    }
  };

  return (
    <div className="notifications-page min-h-screen font-sans">
      {/* Header */}
      <header className="notifications-header px-4 sm:px-6 py-3.5 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="AIOSpark Logo"
              className="h-8 w-auto bg-white rounded p-0.5 object-contain"
            />
          </Link>
            <OrgSwitcher className="notifications-org-switcher" />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <ThemeToggle className="notifications-theme-toggle" />
            <Link
              href="/dashboard"
              className="notifications-dashboard-link px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <span>Dashboard</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="notifications-hero p-5 sm:p-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-4 h-4 text-[#FF2D2D]" />
              <span className="text-xs font-mono uppercase tracking-widest text-[#FF2D2D] font-bold">
                Notification Preferences & Channel Governance
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Alert Preferences Settings</h1>
            <p className="notifications-muted text-xs mt-1">
              Configure which proactive alert types you receive across enabled channels.
            </p>
          </div>
        </div>

        {statusNotice && (
          <div className="notifications-status mb-6 p-4 rounded-2xl text-xs font-mono">
            {statusNotice}
          </div>
        )}

        <div className="notifications-preferences p-5 sm:p-6 rounded-3xl space-y-6">
          <div className="divide-y divide-neutral-800">
            {prefs.map((p) => (
              <div key={p.alertType} className="py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold">{p.title}</h3>
                  <p className="notifications-muted text-xs leading-relaxed max-w-xl">{p.description}</p>
                </div>

                <div className="flex items-center gap-6 font-mono text-xs">
                  {/* Dashboard Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={p.dashboard}
                      onChange={() => togglePref(p.alertType, "dashboard")}
                      className="notification-checkbox w-4 h-4 rounded text-[#FF2D2D] focus:ring-0 cursor-pointer"
                    />
                    <Bell className="w-3.5 h-3.5 text-neutral-400" />
                    <span className="notifications-muted">In-App</span>
                  </label>

                  {/* Email Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={p.email}
                      onChange={() => togglePref(p.alertType, "email")}
                      className="notification-checkbox w-4 h-4 rounded text-[#FF2D2D] focus:ring-0 cursor-pointer"
                    />
                    <Mail className="w-3.5 h-3.5 text-neutral-400" />
                    <span className="notifications-muted">Email</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
