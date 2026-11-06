"use client";

import { UserCheck, Building2, ShieldCheck, Landmark } from "lucide-react";

export function TrustSection() {
  const roles = [
    { label: "CFOs", icon: Landmark },
    { label: "Finance Heads", icon: Building2 },
    { label: "Controllers", icon: ShieldCheck },
    { label: "AR Managers", icon: UserCheck },
  ];

  return (
    <section className="py-16 bg-[#050505] border-b border-neutral-800/80 text-center">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <h2 className="text-xl sm:text-2xl font-semibold text-white tracking-tight mb-8">
          Built for modern finance teams.
        </h2>

        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-12">
          {roles.map((role, idx) => {
            const Icon = role.icon;
            return (
              <div
                key={idx}
                className="flex items-center gap-2.5 px-4 py-2 rounded-lg bg-neutral-900/60 border border-neutral-800 text-neutral-300 text-sm font-medium"
              >
                <Icon className="w-4 h-4 text-[#FF2D2D]" />
                <span>{role.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

