import React from 'react';

interface MetricItem {
  label: string;
  value: string;
  sublabel?: string;
  signal?: boolean;
  highlightColor?: 'default' | 'red' | 'emerald' | 'amber';
}

interface FinancialBandProps {
  heroMetric?: MetricItem;
  metrics: MetricItem[];
  className?: string;
}

export function FinancialBand({ heroMetric, metrics, className = '' }: FinancialBandProps) {
  const textColorMap = {
    default: 'text-white',
    red: 'text-[#FF3B30]',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
  };

  return (
    <div className={`w-full workstation-card rounded-xl overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08] flex flex-col lg:flex-row ${className}`}>
      {heroMetric && (
        <div className="p-6 lg:w-1/3 bg-[#181B23]/80 flex flex-col justify-center relative overflow-hidden group">
          {heroMetric.signal && (
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-[#FF3B30] via-[#FF3B30]/60 to-transparent" />
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${heroMetric.signal ? "bg-[#FF3B30] animate-pulse" : "bg-neutral-400"}`} />
              <span className="text-xs font-semibold tracking-wider uppercase text-neutral-300 font-sans">
                {heroMetric.label}
              </span>
            </div>
            {heroMetric.signal && (
              <span className="text-[9px] font-mono uppercase bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30 px-1.5 py-0.5 rounded font-bold tracking-wider">
                Action Required
              </span>
            )}
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold font-mono-num tabular-nums text-white mt-2 tracking-tight group-hover:text-[#FF3B30] transition-colors">
            {heroMetric.value}
          </div>
          {heroMetric.sublabel && (
            <p className="text-xs text-neutral-400 mt-1.5 font-sans leading-relaxed">
              {heroMetric.sublabel}
            </p>
          )}
        </div>
      )}

      {(() => {
        const gridColsClass =
          metrics.length === 1 ? 'md:grid-cols-1' :
          metrics.length === 2 ? 'md:grid-cols-2' :
          metrics.length === 3 ? 'md:grid-cols-3' :
          'md:grid-cols-4';
        return (
          <div className={`grid grid-cols-2 ${gridColsClass} flex-1 divide-x divide-y md:divide-y-0 divide-white/[0.08]`}>
            {metrics.map((metric, idx) => (
              <div key={idx} className="p-5 flex flex-col justify-center space-y-1.5 hover:bg-white/[0.02] transition-colors">
                <span className="text-xs font-medium tracking-wide uppercase text-neutral-400 font-sans">
                  {metric.label}
                </span>
                <div className={`text-xl sm:text-2xl font-bold font-mono-num tabular-nums tracking-tight ${textColorMap[metric.highlightColor || 'default']}`}>
                  {metric.value}
                </div>
                {metric.sublabel && (
                  <span className="text-xs text-neutral-400 leading-snug">
                    {metric.sublabel}
                  </span>
                )}
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
