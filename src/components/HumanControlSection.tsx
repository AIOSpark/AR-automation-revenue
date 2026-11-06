"use client";

import { Shield, Lock, History, CheckSquare, Users } from "lucide-react";

export function HumanControlSection() {
  const pillars = [
    {
      title: "One-Click Approval Workflows",
      desc: "AI draft actions require explicit manager sign-off before dispatching to external buyers or portals.",
      icon: CheckSquare,
    },
    {
      title: "Role-Based Access Control (RBAC)",
      desc: "Granular permissions for CFOs, Controllers, AR Managers, and Finance Executives.",
      icon: Users,
    },
    {
      title: "Immutable Action Audit Trails",
      desc: "Complete step-by-step history recording why every blocker was flagged and who authorized resolution.",
      icon: History,
    },
    {
      title: "Controlled Automation Boundaries",
      desc: "Configure strict thresholds for automated follow-ups versus mandatory human intervention.",
      icon: Lock,
    },
  ];

  return (
    <section id="security" className="py-24 bg-[#0A0B0E] border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight mb-4">
            AI when you need speed. <br />
            <span className="font-serif-editorial text-[#FF3B30] font-normal italic">
              Human control when decisions matter.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-neutral-400">
            Enterprise finance demands uncompromising governance. AIOSpark keeps your AR team in absolute command of every financial action.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pillars.map((pillar, idx) => {
            const Icon = pillar.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-2xl workstation-card border border-white/[0.08] hover:border-[#FF3B30]/40 transition-all flex items-start gap-4"
              >
                <div className="w-11 h-11 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-[#FF3B30] shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-1.5">{pillar.title}</h3>
                  <p className="text-sm text-neutral-400 leading-relaxed font-normal">{pillar.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
