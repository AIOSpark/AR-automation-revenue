"use client";

import { useState, useEffect } from "react";
import { Building2, ChevronDown, Check, Plus, ShieldCheck } from "lucide-react";

export function OrgSwitcher({ className = "" }: { className?: string }) {
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string>("");
  const [activeRole, setActiveRole] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchOrgs();
  }, []);

  const fetchOrgs = async () => {
    try {
      const res = await fetch("/api/tenant/organizations");
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data.organizations || []);
        setActiveOrgId(data.activeOrganizationId || "");
        setActiveRole(data.activeRole || "");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSwitchOrg = async (orgId: string) => {
    setIsOpen(false);
    try {
      const res = await fetch("/api/tenant/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: orgId }),
      });

      if (res.ok) {
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const activeOrg = organizations.find((o) => o.id === activeOrgId) || organizations[0];

  return (
    <div className={`relative inline-block text-left ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3.5 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-white font-medium text-xs flex items-center gap-2.5 transition-all cursor-pointer shadow-sm"
      >
        <Building2 className="w-4 h-4 text-[#FF2D2D]" />
        <div className="text-left font-sans">
          <span className="font-bold block text-white leading-tight">
            {activeOrg?.name || "Select Organization"}
          </span>
          <span className="text-[10px] text-neutral-400 font-mono">
            Role: <span className="text-[#FF2D2D] font-bold">{activeRole || "Owner"}</span>
          </span>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0 ml-1" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl p-2 z-50 animate-in fade-in duration-150">
          <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-neutral-400 border-b border-neutral-800 mb-1">
            My Connected Organizations
          </div>

          <div className="space-y-1">
            {organizations.map((org) => {
              const isCurrent = org.id === activeOrgId;
              return (
                <button
                  key={org.id}
                  onClick={() => handleSwitchOrg(org.id)}
                  className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                    isCurrent
                      ? "bg-neutral-800 text-white border border-neutral-700"
                      : "text-neutral-300 hover:bg-neutral-800/60"
                  }`}
                >
                  <div>
                    <span className="font-bold text-white block">{org.name}</span>
                    <span className="text-[10px] text-neutral-400 font-mono">{org.role}</span>
                  </div>
                  {isCurrent && <Check className="w-4 h-4 text-[#FF2D2D]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
