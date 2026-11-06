"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Settings,
  Building2,
  Users,
  CreditCard,
  Bell,
  Plug,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  UserPlus,
  Save,
  Globe,
  Clock,
  DollarSign,
  Calendar,
  Lock,
} from "lucide-react";
import { MainNavShell } from "@/components/MainNavShell";
import { SectionHeader } from "@/components/system/SectionHeader";
import { TeammateInviteModal } from "@/components/tenant/TeammateInviteModal";
import { Can } from "@/components/tenant/Can";

interface TeamMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

export default function SettingsHubPage() {
  const [role, setRole] = useState<string | undefined>(undefined);
  const [organization, setOrganization] = useState<any>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | undefined>(undefined);

  // Form state
  const [formData, setFormData] = useState({
    companyName: "Apex Enterprises",
    industry: "Financial Services & Banking",
    companySize: "51-200 employees",
    baseCurrency: "INR (₹) - Indian Rupee",
    fiscalYearStart: "April",
    defaultPaymentTerms: "Net 30 Days",
    timezone: "Asia/Kolkata (IST, UTC+05:30)",
  });

  useEffect(() => {
    fetchSettingsData();
  }, []);

  const fetchSettingsData = async () => {
    try {
      setLoading(true);
      const meRes = await fetch("/api/auth/me");
      if (meRes.ok) {
        const meData = await meRes.json();
        setOrganization(meData.organization);
        if (meData.organization) {
          setFormData((prev) => ({
            ...prev,
            companyName: meData.organization.name || prev.companyName,
            industry: meData.organization.industry || prev.industry,
            companySize: meData.organization.size || prev.companySize,
          }));
        }
      }

      const membersRes = await fetch("/api/tenant/members");
      if (membersRes.ok) {
        const mData = await membersRes.json();
        setRole(mData.currentRole ?? null);
        setMembers(mData.members || []);
      }
    } catch (err) {
      console.error("Failed to load settings data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOrg(true);
    setSaveNotice(undefined);

    // No PATCH endpoint exists for /api/tenant/organizations.
    // Do not simulate a successful save. Surface an honest notice instead.
    try {
      const res = await fetch('/api/tenant/organizations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setSaveNotice('Organization settings saved successfully.');
      } else if (res.status === 405) {
        setSaveNotice('Organization settings updates are not yet available via the API. Changes were not persisted.');
      } else {
        setSaveNotice('Failed to save organization settings.');
      }
    } catch (err) {
      setSaveNotice('Failed to save organization settings.');
    } finally {
      setSavingOrg(false);
    }
  };

  return (
    <MainNavShell currentRole={role}>
      <div className="settings-page space-y-8 font-sans pb-16">
        
        {/* A. COMMAND HEADER */}
        <div className="settings-header flex flex-col xl:flex-row xl:items-center justify-between gap-6 workstation-card p-6 md:p-8 rounded-xl border border-white/[0.08] shadow-2xl relative overflow-hidden bg-gradient-to-br from-[#14161E] via-[#12141A] to-[#0D0E12]">
          <div className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 bg-[#FF3B30]/[0.03] rounded-full blur-3xl" />

          <div className="space-y-3 z-10">
            {/* Telemetry Strip */}
            <div className="flex items-center space-x-3 text-xs text-neutral-400 font-sans flex-wrap gap-y-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-white transition-colors group text-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[#FF3B30] group-hover:-translate-x-0.5 transition-transform" />
                <span>Command Center</span>
              </Link>
              <span className="text-neutral-500">•</span>
              <span className="text-[#FF3B30] font-semibold text-[11px] tracking-wide uppercase bg-[#FF3B30]/10 px-2.5 py-0.5 rounded border border-[#FF3B30]/20 font-mono">
                System Administration
              </span>
              <span className="text-neutral-500">•</span>
              <span className="text-neutral-400 text-[11px] font-mono-num tabular-nums">
                Organization settings loaded
              </span>
              <span className="text-neutral-500 hidden sm:inline">•</span>
              <span className="text-neutral-300 font-medium text-[11px] hidden sm:inline">
                Role: {role}
              </span>
            </div>

            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-4xl font-bold font-sans tracking-tight text-white">
                Workstation Settings & Administration
              </h1>
              <p className="font-serif-editorial text-[#FF3B30] font-normal italic text-lg sm:text-2xl">
                Organization profile, team governance, and operational parameters.
              </p>
              <p className="text-xs sm:text-sm text-neutral-400 font-sans max-w-2xl leading-relaxed">
                Manage your enterprise corporate entity, team role-based permissions (RBAC), ERP connectors, and billing subscriptions.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 z-10 self-start xl:self-center">
            <Can I="create" a="users_invites" role={role}>
              <button
                onClick={() => setInviteModalOpen(true)}
                className="btn-editorial-primary px-3.5 py-2 text-xs font-semibold font-sans rounded-lg flex items-center gap-2 cursor-pointer shadow-md hover:scale-[1.02] active:scale-[0.98] transition-transform"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Invite Teammate</span>
              </button>
            </Can>
          </div>
        </div>

        {/* B. SETTINGS NAVIGATION TABS */}
        <div className="settings-nav flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-sans">
          <Link
            href="/settings"
            className="px-3.5 py-2 rounded-lg btn-editorial-primary text-white font-semibold flex items-center gap-2 shadow-sm shrink-0"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Organization & Profile</span>
          </Link>

          <Link
            href="/settings/integrations"
            className="px-3.5 py-2 rounded-lg bg-[#181B23] border border-white/[0.08] hover:border-white/20 text-neutral-300 hover:text-white font-medium flex items-center gap-2 transition-colors shrink-0"
          >
            <Plug className="w-3.5 h-3.5 text-neutral-400" />
            <span>ERP Integrations</span>
          </Link>

          <Link
            href="/settings/billing"
            className="px-3.5 py-2 rounded-lg bg-[#181B23] border border-white/[0.08] hover:border-white/20 text-neutral-300 hover:text-white font-medium flex items-center gap-2 transition-colors shrink-0"
          >
            <CreditCard className="w-3.5 h-3.5 text-neutral-400" />
            <span>Billing & Subscription</span>
          </Link>

          <Link
            href="/settings/notifications"
            className="px-3.5 py-2 rounded-lg bg-[#181B23] border border-white/[0.08] hover:border-white/20 text-neutral-300 hover:text-white font-medium flex items-center gap-2 transition-colors shrink-0"
          >
            <Bell className="w-3.5 h-3.5 text-neutral-400" />
            <span>Notification Triggers</span>
          </Link>

          <Link
            href="/approvals"
            className="px-3.5 py-2 rounded-lg bg-[#181B23] border border-white/[0.08] hover:border-white/20 text-neutral-300 hover:text-white font-medium flex items-center gap-2 transition-colors shrink-0"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-neutral-400" />
            <span>Audit & Governance</span>
          </Link>
        </div>

        {/* C. QUICK MODULE HUBS */}
          <div className="settings-shortcuts grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-sans">
          <Link
            href="/settings/integrations"
            className="workstation-card p-5 rounded-xl border border-white/[0.08] hover:border-[#FF3B30]/40 transition-all group flex flex-col justify-between space-y-3"
          >
            <div className="space-y-1.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[#FF3B30]">
                <Plug className="w-4 h-4" />
              </div>
              <div className="font-bold text-sm text-white group-hover:text-[#FF3B30] transition-colors">
                ERP & Banking Connectors
              </div>
              <p className="text-neutral-400 text-xs leading-relaxed">
                Connect SAP, NetSuite, Tally, Zoho Books, or import flat CSV files.
              </p>
            </div>
            <div className="text-[11px] text-[#FF3B30] font-semibold flex items-center gap-1 group-hover:underline pt-2 border-t border-white/[0.06]">
              <span>Manage Connectors</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </Link>

          <Link
            href="/settings/billing"
            className="workstation-card p-5 rounded-xl border border-white/[0.08] hover:border-[#FF3B30]/40 transition-all group flex flex-col justify-between space-y-3"
          >
            <div className="space-y-1.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[#FF3B30]">
                <CreditCard className="w-4 h-4" />
              </div>
              <div className="font-bold text-sm text-white group-hover:text-[#FF3B30] transition-colors">
                Billing & Subscription
              </div>
              <p className="text-neutral-400 text-xs leading-relaxed">
                Manage Starter, Growth, or Enterprise plans and Razorpay billing cycle.
              </p>
            </div>
            <div className="text-[11px] text-[#FF3B30] font-semibold flex items-center gap-1 group-hover:underline pt-2 border-t border-white/[0.06]">
              <span>Manage Subscription</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </Link>

          <Link
            href="/settings/notifications"
            className="workstation-card p-5 rounded-xl border border-white/[0.08] hover:border-[#FF3B30]/40 transition-all group flex flex-col justify-between space-y-3"
          >
            <div className="space-y-1.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[#FF3B30]">
                <Bell className="w-4 h-4" />
              </div>
              <div className="font-bold text-sm text-white group-hover:text-[#FF3B30] transition-colors">
                Alerts & Notifications
              </div>
              <p className="text-neutral-400 text-xs leading-relaxed">
                Configure email alerts for overdue breaches, broken promises, and disputes.
              </p>
            </div>
            <div className="text-[11px] text-[#FF3B30] font-semibold flex items-center gap-1 group-hover:underline pt-2 border-t border-white/[0.06]">
              <span>Notification Preferences</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </Link>

          <Link
            href="/approvals"
            className="workstation-card p-5 rounded-xl border border-white/[0.08] hover:border-[#FF3B30]/40 transition-all group flex flex-col justify-between space-y-3"
          >
            <div className="space-y-1.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[#FF3B30]">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="font-bold text-sm text-white group-hover:text-[#FF3B30] transition-colors">
                Governance & Policy
              </div>
              <p className="text-neutral-400 text-xs leading-relaxed">
                Controller approval thresholds, agent autonomy bounds, and audit logs.
              </p>
            </div>
            <div className="text-[11px] text-[#FF3B30] font-semibold flex items-center gap-1 group-hover:underline pt-2 border-t border-white/[0.06]">
              <span>Review Governance Rules</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </Link>
        </div>

        {/* D. ORGANIZATION PROFILE SETTINGS */}
        <div className="space-y-4">
          <SectionHeader
            title="Business Entity & Ledger Configuration"
            subtitle="Core organizational parameters governing accounting cycles and currency standards"
            editorial
            signal={false}
          />

          <form onSubmit={handleSaveOrganization} className="settings-form workstation-card p-6 rounded-xl border border-white/[0.08] space-y-6">
            {saveNotice && (
              <div className={`p-3.5 rounded-lg text-xs flex items-center justify-between ${saveNotice.includes('saved successfully') ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'}`}>
                <div className="flex items-center gap-2">
                  {saveNotice.includes('saved successfully') ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  )}
                  <span>{saveNotice}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-xs">
              {/* Company Name */}
              <div className="space-y-1.5">
                <label className="text-neutral-300 font-semibold block">
                  Company Legal Entity Name
                </label>
                <input
                  type="text"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="w-full px-3.5 py-2 bg-[#181B23] border border-white/[0.08] rounded-lg text-xs font-sans text-white focus:outline-none focus:border-[#FF3B30]/60 transition-colors"
                />
              </div>

              {/* Operating Industry */}
              <div className="space-y-1.5">
                <label className="text-neutral-300 font-semibold block">
                  Operating Industry
                </label>
                <select
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  className="w-full px-3.5 py-2 bg-[#181B23] border border-white/[0.08] rounded-lg text-xs font-sans text-white focus:outline-none focus:border-[#FF3B30]/60 transition-colors cursor-pointer"
                >
                  <option value="Financial Services & Banking">Financial Services & Banking</option>
                  <option value="IT Services & SaaS">IT Services & SaaS</option>
                  <option value="Manufacturing & Industrial">Manufacturing & Industrial</option>
                  <option value="Logistics & Supply Chain">Logistics & Supply Chain</option>
                  <option value="Healthcare & Pharmaceuticals">Healthcare & Pharmaceuticals</option>
                  <option value="Retail & E-commerce">Retail & E-commerce</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Organization Scale */}
              <div className="space-y-1.5">
                <label className="text-neutral-300 font-semibold block">
                  Organization Scale
                </label>
                <select
                  value={formData.companySize}
                  onChange={(e) => setFormData({ ...formData, companySize: e.target.value })}
                  className="w-full px-3.5 py-2 bg-[#181B23] border border-white/[0.08] rounded-lg text-xs font-sans text-white focus:outline-none focus:border-[#FF3B30]/60 transition-colors cursor-pointer"
                >
                  <option value="1-10 employees">1-10 employees</option>
                  <option value="11-50 employees">11-50 employees</option>
                  <option value="51-200 employees">51-200 employees</option>
                  <option value="201-1000 employees">201-1000 employees</option>
                  <option value="1000+ employees">1000+ employees</option>
                </select>
              </div>

              {/* Base Currency */}
              <div className="space-y-1.5">
                <label className="text-neutral-300 font-semibold block">
                  Base Accounting Currency
                </label>
                <input
                  type="text"
                  value={formData.baseCurrency}
                  disabled
                  className="w-full px-3.5 py-2 bg-[#181B23]/50 border border-white/[0.06] rounded-lg text-xs font-sans text-neutral-400 cursor-not-allowed"
                />
              </div>

              {/* Fiscal Year Start */}
              <div className="space-y-1.5">
                <label className="text-neutral-300 font-semibold block">
                  Financial Year Cycle Start
                </label>
                <select
                  value={formData.fiscalYearStart}
                  onChange={(e) => setFormData({ ...formData, fiscalYearStart: e.target.value })}
                  className="w-full px-3.5 py-2 bg-[#181B23] border border-white/[0.08] rounded-lg text-xs font-sans text-white focus:outline-none focus:border-[#FF3B30]/60 transition-colors cursor-pointer"
                >
                  <option value="April">April (Standard India Financial Year)</option>
                  <option value="January">January (Calendar Year)</option>
                  <option value="July">July</option>
                  <option value="October">October</option>
                </select>
              </div>

              {/* Standard Payment Terms */}
              <div className="space-y-1.5">
                <label className="text-neutral-300 font-semibold block">
                  Default Payment Terms Baseline
                </label>
                <select
                  value={formData.defaultPaymentTerms}
                  onChange={(e) => setFormData({ ...formData, defaultPaymentTerms: e.target.value })}
                  className="w-full px-3.5 py-2 bg-[#181B23] border border-white/[0.08] rounded-lg text-xs font-sans text-white focus:outline-none focus:border-[#FF3B30]/60 transition-colors cursor-pointer"
                >
                  <option value="Net 30 Days">Net 30 Days</option>
                  <option value="Net 15 Days">Net 15 Days</option>
                  <option value="Net 45 Days">Net 45 Days</option>
                  <option value="Net 60 Days">Net 60 Days</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end pt-4 border-t border-white/[0.08]">
              <button
                type="submit"
                disabled={savingOrg}
                className="btn-editorial-primary px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 cursor-pointer shadow-md hover:scale-[1.02] active:scale-[0.98] transition-transform"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingOrg ? "Saving..." : "Save Organization Settings"}</span>
              </button>
            </div>
          </form>
        </div>

        {/* E. TEAM MEMBERS & ACCESS CONTROL (RBAC) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionHeader
              title="Team Members & Role-Based Access Control (RBAC)"
              subtitle="Manage authorized users, assign operational roles, and enforce separation of duties"
              editorial
              signal={false}
              className="border-b-0 pb-0"
            />
            <Can I="create" a="users_invites" role={role}>
              <button
                onClick={() => setInviteModalOpen(true)}
                className="btn-editorial-primary px-3 py-1.5 text-xs font-semibold font-sans rounded-lg flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-transform shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Invite User</span>
              </button>
            </Can>
          </div>

          <div className="settings-team-table workstation-card border border-white/[0.08] overflow-x-auto shadow-xl rounded-xl">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-[#181B23] text-neutral-300 font-sans text-xs border-b border-white/[0.08]">
                <tr>
                  <th className="py-3 px-4 font-semibold text-neutral-300">Name & Identity</th>
                  <th className="py-3 px-4 font-semibold text-neutral-300">Email Address</th>
                  <th className="py-3 px-4 font-semibold text-neutral-300">Assigned Role</th>
                  <th className="py-3 px-4 font-semibold text-neutral-300">Permissions Scope</th>
                  <th className="py-3 px-4 text-right font-semibold text-neutral-300">Joined Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] font-sans">
                {members.length > 0 ? (
                  members.map((member) => (
                    <tr key={member.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-white flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#FF3B30]/10 border border-[#FF3B30]/30 text-[#FF3B30] flex items-center justify-center font-bold text-xs uppercase">
                          {member.name.charAt(0) || "U"}
                        </div>
                        <span>{member.name}</span>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-300 font-mono text-[11px]">
                        {member.email || "user@company.com"}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
                          member.role === "Owner"
                            ? "bg-[#FF3B30]/15 text-[#FF3B30] border-[#FF3B30]/30"
                            : member.role === "Admin"
                            ? "bg-amber-400/15 text-amber-400 border-amber-400/30"
                            : member.role === "Finance Manager"
                            ? "bg-emerald-400/15 text-emerald-400 border-emerald-400/30"
                            : "bg-white/[0.05] text-neutral-300 border-white/[0.08]"
                        }`}>
                          {member.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-400 text-xs">
                        {member.role === "Owner" && "Full administrative, financial, billing, and approval authority"}
                        {member.role === "Admin" && "System administration, integrations, and user management"}
                        {member.role === "Finance Manager" && "Approve financial resolutions, view receivables, manage disputes"}
                        {member.role === "Finance Executive" && "Operational ledger data entry, exceptions diagnosis"}
                        {member.role === "Viewer" && "Read-only access to reports and financial telemetry"}
                      </td>
                      <td className="py-3.5 px-4 text-right text-neutral-400 font-mono-num tabular-nums text-[11px]">
                        {member.created_at ? new Date(member.created_at).toLocaleDateString() : "Active"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-neutral-400 font-sans">
                      <div className="space-y-1">
                        <div className="text-white font-semibold">Active Owner: Sarah Jenkins</div>
                        <p className="text-xs text-neutral-400">Invite additional finance teammates to collaborate with tailored access controls.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Teammate Invite Modal */}
      <TeammateInviteModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        onSuccess={() => fetchSettingsData()}
      />
    </MainNavShell>
  );
}
