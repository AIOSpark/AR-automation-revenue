import React from 'react';

export interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
  status?: string;
  isCurrent?: boolean;
  isCompleted?: boolean;
}

interface TimelineProps {
  events: TimelineEvent[];
  className?: string;
}

export function Timeline({ events, className = '' }: TimelineProps) {
  if (!events || events.length === 0) {
    return (
      <div className={`p-6 text-center space-y-2 font-sans ${className}`}>
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Telemetry Audit Stream Active</span>
        </div>
        <p className="text-xs text-neutral-400 max-w-md mx-auto leading-relaxed">
          Operational O2C financial events, agent dispatch actions, and controller approvals will stream here automatically upon ledger sync.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-0 relative font-sans text-xs ${className}`}>
      {/* Thin vertical rule */}
      <div className="absolute left-[85px] top-3 bottom-3 w-[1px] bg-white/[0.08]" />

      {events.map((evt, idx) => (
        <div key={idx} className="flex items-start space-x-6 py-3 relative group">
          {/* Date Label */}
          <div className="w-[70px] shrink-0 text-right text-[11px] font-mono-num font-medium text-neutral-400 pt-0.5">
            {evt.date}
          </div>

          {/* Timeline Node */}
          <div className="relative shrink-0 mt-1">
            <div
              className={`w-2 h-2 rounded-full border ${
                evt.isCurrent
                  ? 'bg-[#FF3B30] border-[#FF3B30]'
                  : 'bg-[#12141A] border-neutral-500'
              }`}
            />
          </div>

          {/* Event Content */}
          <div className="space-y-0.5 font-sans min-w-0">
            <div className="flex items-center space-x-2">
              <span className={`font-semibold text-xs ${evt.isCurrent ? 'text-white' : 'text-neutral-200'}`}>
                {evt.title}
              </span>
              {evt.status && (
                <span className="text-[10px] font-mono uppercase bg-white/[0.04] border border-white/[0.08] text-neutral-300 px-1.5 py-0.5 rounded">
                  {evt.status}
                </span>
              )}
            </div>
            {evt.description && (
              <p className="text-xs text-neutral-400 leading-relaxed">
                {evt.description}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
