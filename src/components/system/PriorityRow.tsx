import React from 'react';
import Link from 'next/link';
import { ArrowRight, Zap } from 'lucide-react';

interface PriorityRowProps {
  rankNumber: string; // e.g. "01", "02"
  title: string;
  subtitle: string;
  amount: string;
  blockerCategory: string;
  recommendedAction: string;
  actionUrl?: string;
  isCritical?: boolean;
  confidenceScore?: number;
  onSelect?: () => void;
  className?: string;
}

export function PriorityRow({
  rankNumber,
  title,
  subtitle,
  amount,
  blockerCategory,
  recommendedAction,
  actionUrl,
  isCritical = false,
  confidenceScore,
  onSelect,
  className = '',
}: PriorityRowProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onSelect) onSelect();
    }
  };

  const content = (
    <div
      onClick={!actionUrl ? onSelect : undefined}
      onKeyDown={!actionUrl ? handleKeyDown : undefined}
      tabIndex={!actionUrl && onSelect ? 0 : undefined}
      className={`relative workstation-card ${
        isCritical ? 'border-[#FF3B30]/40 bg-[#181B23]/90' : 'border-white/[0.08] bg-[#12141A]'
      } p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-150 hover:border-[#FF3B30]/60 group ${
        !actionUrl && onSelect ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3B30]' : actionUrl ? 'cursor-pointer' : ''
      } ${className}`}
    >
      {/* Left signal & info */}
      <div className="flex items-center space-x-3.5 min-w-0">
        <div className="flex items-center shrink-0">
          <span className={`font-mono text-xs font-semibold px-2 py-1 rounded-md border transition-colors ${
            isCritical
              ? 'bg-[#FF3B30]/15 text-[#FF3B30] border-[#FF3B30]/30 font-bold'
              : 'bg-white/[0.05] border-white/[0.08] text-neutral-300 group-hover:text-white'
          }`}>
            {rankNumber}
          </span>
        </div>

        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <span className="font-bold text-white text-sm truncate group-hover:text-[#FF3B30] transition-colors">{title}</span>
            {isCritical && (
              <span className="text-[10px] font-sans uppercase bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/30 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                <Zap className="w-3 h-3" />
                <span>Priority Action</span>
              </span>
            )}
            {confidenceScore !== undefined && (
              <span className="text-[10px] font-mono-num tabular-nums text-neutral-400 bg-white/[0.04] border border-white/[0.08] px-1.5 py-0.5 rounded flex items-center gap-1">
                <span className="text-emerald-400 font-bold">{Math.round(confidenceScore * 100)}%</span>
                <span>AI confidence</span>
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-400 font-sans truncate">{subtitle}</p>
        </div>
      </div>

      {/* Center blocker & amount */}
      <div className="flex items-center justify-between md:justify-end space-x-6 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-white/[0.08]">
        <div className="text-left md:text-right">
          <div className="text-[10px] text-neutral-400 font-sans uppercase font-medium tracking-wide">Outstanding</div>
          <div className="text-sm md:text-base font-bold text-white font-mono-num tabular-nums group-hover:text-emerald-400 transition-colors">
            {amount}
          </div>
        </div>

        {actionUrl ? (
          <span className="px-3 py-1.5 bg-[#181B23] border border-white/[0.12] text-[#FF3B30] font-sans font-semibold text-xs rounded-lg group-hover:bg-[#FF3B30] group-hover:text-white transition-all flex items-center gap-1.5 shadow-sm">
            <span>Resolve</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        ) : (
          <span className="text-xs font-semibold text-[#FF3B30] group-hover:underline flex items-center gap-1">
            <span>{recommendedAction}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    </div>
  );

  if (actionUrl) {
    return (
      <Link href={actionUrl} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3B30] rounded-xl">
        {content}
      </Link>
    );
  }

  return content;
}

export type PriorityLevel = 'P0' | 'P1' | 'P2' | 'P3';

export interface PriorityIndicatorProps {
  level: PriorityLevel;
  className?: string;
}

export function PriorityIndicator({ level, className = '' }: PriorityIndicatorProps) {
  const levelMap: Record<PriorityLevel, { text: string; bg: string; border: string }> = {
    P0: { text: 'text-[#FF3B30]', bg: 'bg-[#FF3B30]/10', border: 'border-[#FF3B30]/30' },
    P1: { text: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/30' },
    P2: { text: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/30' },
    P3: { text: 'text-neutral-400', bg: 'bg-white/[0.04]', border: 'border-white/[0.08]' },
  };

  const style = levelMap[level] || levelMap.P3;

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 border font-mono text-[9px] uppercase font-bold tracking-wider ${style.text} ${style.bg} ${style.border} ${className}`}>
      {level}
    </span>
  );
}

