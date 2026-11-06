import React from 'react';

export interface SignalRailProps {
  status?: 'active' | 'critical' | 'warning' | 'success' | 'neutral';
  orientation?: 'vertical' | 'horizontal';
  thickness?: number;
  className?: string;
}

export function SignalRail({
  status = 'active',
  orientation = 'vertical',
  thickness = 3,
  className = '',
}: SignalRailProps) {
  const statusColorMap = {
    active: 'bg-[#FF2D2D]',
    critical: 'bg-[#FF2D2D] shadow-[0_0_6px_#FF2D2D]',
    warning: 'bg-amber-400',
    success: 'bg-emerald-400',
    neutral: 'bg-neutral-600',
  };

  const style = orientation === 'horizontal'
    ? { height: `${thickness}px` }
    : { width: `${thickness}px` };

  return (
    <div
      style={style}
      className={`shrink-0 transition-colors ${statusColorMap[status]} ${className}`}
    />
  );
}

// Retain SignalLine export alias for backwards compatibility across existing calls
export const SignalLine = SignalRail;

