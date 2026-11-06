'use client';

import React from 'react';
import Link from 'next/link';
import { DollarSign, AlertCircle, ShieldAlert, Sparkles, ArrowUpRight } from 'lucide-react';

export interface DashboardMetricsProps {
  totalReceivables: number;
  overdue: number;
  atRisk: number;
  cashUnblockedOpportunity: number;
  computedAt: string | null;
  loading?: boolean;
}

export function CoreDashboardMetricsCards({
  totalReceivables,
  overdue,
  atRisk,
  cashUnblockedOpportunity,
  computedAt,
  loading = false,
}: DashboardMetricsProps) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-neutral-900/60 border border-neutral-800/60 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: 'Total Receivables',
      amount: formatCurrency(totalReceivables),
      subtitle: 'Total active outstanding ledger balance',
      icon: DollarSign,
      color: 'text-white',
      accentBg: 'bg-white/5 border-white/10',
      glow: '',
      filter: 'all',
    },
    {
      title: 'Overdue',
      amount: formatCurrency(overdue),
      subtitle: 'Invoices past contracted due date',
      icon: AlertCircle,
      color: 'text-[#FF2D2D]',
      accentBg: 'bg-red-950/40 border-red-800/40',
      glow: 'group-hover:border-[#FF2D2D]/40 group-hover:shadow-[0_0_20px_rgba(255,45,45,0.15)]',
      filter: 'overdue',
    },
    {
      title: 'At Risk',
      amount: formatCurrency(atRisk),
      subtitle: 'Due in 14 days from high-delay buyers',
      icon: ShieldAlert,
      color: 'text-amber-400',
      accentBg: 'bg-amber-950/40 border-amber-800/40',
      glow: 'group-hover:border-amber-500/40 group-hover:shadow-[0_0_20px_rgba(245,158,11,0.15)]',
      filter: 'at_risk',
    },
    {
      title: 'Cash Unblocked',
      amount: formatCurrency(cashUnblockedOpportunity),
      subtitle: 'Actionable overdue invoices with zero blockers',
      icon: Sparkles,
      color: 'text-emerald-400',
      accentBg: 'bg-emerald-950/40 border-emerald-800/40',
      glow: 'group-hover:border-emerald-500/40 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]',
      filter: 'unblocked',
    },
  ];

  return (
    <div className="space-y-3 mb-8">
      <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1 font-mono tracking-wider">
        <span className="flex items-center gap-1.5 font-bold uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Executive Financial Aggregates
        </span>
        {computedAt && (
          <span className="text-neutral-500">
            Updated {new Date(computedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={`/dashboard?filter=${card.filter}`}
            className={`group relative workstation-card-interactive p-5 block border border-white/[0.08] transition-all duration-300 ${card.glow}`}
          >
            {/* Top status line accent indicator */}
            <div className={`absolute top-0 left-4 right-4 h-0.5 rounded-full ${card.color.replace('text-', 'bg-')} opacity-60 group-hover:opacity-100 transition-opacity`} />

            <div className="flex items-center justify-between mb-3 pt-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 group-hover:text-white transition-colors">
                {card.title}
              </span>
              <div className={`p-2 rounded-xl border ${card.accentBg} transition-transform duration-300 group-hover:scale-110`}>
                <card.icon className={`w-4 h-4 ${card.color}`} />
              </div>
            </div>

            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold tracking-tight text-white font-mono leading-none">{card.amount}</span>
              <ArrowUpRight className="w-4 h-4 text-neutral-500 group-hover:text-white transition-all duration-200 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>

            <p className="text-[11px] text-neutral-400 mt-2.5 leading-relaxed font-sans">{card.subtitle}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

