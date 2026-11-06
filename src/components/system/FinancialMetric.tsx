import React from 'react';

export type DataProvenanceType = 'ACTUAL' | 'PREDICTED' | 'SCENARIO' | 'AI_FINDING' | 'RECOMMENDATION' | 'VERIFIED';

interface FinancialMetricProps {
  label: string;
  value: string | number;
  sublabel?: string;
  hero?: boolean;
  signal?: boolean;
  provenance?: DataProvenanceType;
  statusText?: string;
  statusColor?: 'emerald' | 'red' | 'amber' | 'neutral';
  trend?: string;
  onClick?: () => void;
  className?: string;
}

export function FinancialMetric({
  label,
  value,
  sublabel,
  hero = false,
  signal = false,
  provenance,
  statusText,
  statusColor = 'neutral',
  trend,
  onClick,
  className = '',
}: FinancialMetricProps) {
  const provenanceMap: Record<DataProvenanceType, { label: string; style: string }> = {
    ACTUAL: { label: 'ACTUAL OUTSTANDING', style: 'metric-status-provenance-actual' },
    PREDICTED: { label: 'PREDICTED RECOVERABLE', style: 'metric-status-provenance-predicted' },
    SCENARIO: { label: 'SCENARIO IMPACT', style: 'metric-status-provenance-scenario' },
    AI_FINDING: { label: 'AI SYNTHESIZED FINDING', style: 'metric-status-provenance-ai' },
    RECOMMENDATION: { label: 'RECOMMENDED ACTION', style: 'metric-status-provenance-recommendation' },
    VERIFIED: { label: 'VERIFIED LEDGER TRACE', style: 'metric-status-provenance-verified' },
  };

  return (
    <div
      onClick={onClick}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? 'button' : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      className={`workstation-metric relative flex flex-col justify-between p-4 transition-all duration-150 ease-in-out ${
        onClick
          ? 'cursor-pointer hover:border-neutral-600 hover:bg-[#0d0d10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500'
          : ''
      } ${className}`}
    >
        <div className={`metric-content space-y-1 ${signal ? 'metric-content-signal' : ''}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="metric-label text-[10px] font-mono uppercase tracking-widest font-semibold">
            {label}
          </span>
          {provenance && (
            <span className={`metric-status text-[8px] font-mono uppercase tracking-wider ${provenanceMap[provenance].style}`}>
              {provenanceMap[provenance].label}
            </span>
          )}
          {statusText && !provenance && (
            <span
              className={`metric-status metric-status-${statusColor} text-[9px] font-mono uppercase tracking-wider`}
            >
              {statusText}
            </span>
          )}
        </div>

        <div
          className={`metric-value font-mono-num font-bold tracking-tight ${
            hero ? 'metric-value-hero text-3xl sm:text-4xl' : 'text-xl sm:text-2xl'
          }`}
        >
          {value}
        </div>

        {trend && (
          <div className="metric-trend text-[10px] font-mono pt-0.5">
            {trend}
          </div>
        )}
      </div>

      {sublabel && (
        <div className="metric-sublabel text-[11px] mt-2 pt-2">
          {sublabel}
        </div>
      )}
    </div>
  );
}
