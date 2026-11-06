import React from 'react';

export type StatusType = 'ACTIONABLE' | 'WAITING' | 'INVESTIGATING' | 'VERIFIED' | 'CRITICAL' | 'HIGH' | 'MEDIUM';

interface StatusIndicatorProps {
  status: StatusType | string;
  className?: string;
  showPill?: boolean;
}

export function StatusIndicator({ status, className = '', showPill = true }: StatusIndicatorProps) {
  const normalized = status.toUpperCase();

  const statusConfig: Record<string, { dot: string; text: string; bg: string; border: string; label: string }> = {
    ACTIONABLE: {
      dot: 'bg-[#FF3B30]',
      text: 'text-[#FF3B30]',
      bg: 'bg-[#FF3B30]/10',
      border: 'border-[#FF3B30]/20',
      label: 'Actionable',
    },
    CRITICAL: {
      dot: 'bg-[#FF3B30]',
      text: 'text-[#FF3B30]',
      bg: 'bg-[#FF3B30]/10',
      border: 'border-[#FF3B30]/20',
      label: 'Critical',
    },
    WAITING: {
      dot: 'bg-amber-400',
      text: 'text-amber-400',
      bg: 'bg-amber-400/10',
      border: 'border-amber-400/20',
      label: 'Waiting',
    },
    HIGH: {
      dot: 'bg-amber-400',
      text: 'text-amber-400',
      bg: 'bg-amber-400/10',
      border: 'border-amber-400/20',
      label: 'High Risk',
    },
    INVESTIGATING: {
      dot: 'bg-sky-400',
      text: 'text-sky-400',
      bg: 'bg-sky-400/10',
      border: 'border-sky-400/20',
      label: 'Investigating',
    },
    MEDIUM: {
      dot: 'bg-sky-400',
      text: 'text-sky-400',
      bg: 'bg-sky-400/10',
      border: 'border-sky-400/20',
      label: 'Medium Risk',
    },
    VERIFIED: {
      dot: 'bg-emerald-400',
      text: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
      border: 'border-emerald-400/20',
      label: 'Verified',
    },
  };

  const current = statusConfig[normalized] || {
    dot: 'bg-neutral-400',
    text: 'text-neutral-300',
    bg: 'bg-white/[0.04]',
    border: 'border-white/[0.08]',
    label: status,
  };

  if (!showPill) {
    return (
      <div className={`inline-flex items-center space-x-1.5 font-sans text-xs font-medium ${className}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
        <span className={current.text}>{current.label}</span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md border font-sans text-[11px] font-medium ${current.bg} ${current.border} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
      <span className={current.text}>{current.label}</span>
    </div>
  );
}
