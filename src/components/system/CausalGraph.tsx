import React from 'react';

export interface CausalNodeData {
  id: string;
  type: 'CUSTOMER' | 'PO' | 'INVOICE' | 'BLOCKER' | 'OUTCOME';
  label: string;
  sublabel?: string;
  amount?: string;
  isBlocker?: boolean;
  status?: string;
}

interface CausalGraphProps {
  nodes?: CausalNodeData[];
  title?: string;
  className?: string;
}

export function CausalGraph({
  nodes = [],
  title = 'O2C CAUSAL RELATIONSHIP MAP',
  className = '',
}: CausalGraphProps) {
  return (
    <div className={`bg-[#09090b] border border-[#27272a] p-6 space-y-6 ${className}`}>
      <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
        <div className="flex items-center space-x-2">
          <div className="w-[2px] h-4 bg-[#FF2D2D]" />
          <span className="text-xs font-mono uppercase tracking-widest text-[#FF2D2D] font-bold">
            {title}
          </span>
        </div>
        <span className="text-[10px] font-mono text-neutral-400">
          Analytical Causality Chain
        </span>
      </div>

      {/* Relationship Diagram */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 md:gap-0 relative py-4">
        {nodes.map((node, index) => {
          const isLast = index === nodes.length - 1;
          const isFinancialDominant = Boolean(node.amount);

          return (
            <React.Fragment key={node.id}>
              {/* Node Card */}
              <div
                className={`relative flex flex-col p-4 bg-[#121215] border ${
                  node.isBlocker || node.status
                    ? 'border-[#FF2D2D]/60 bg-red-950/20'
                    : isFinancialDominant
                    ? 'border-white/40 bg-[#18181c]'
                    : 'border-[#27272a]'
                } min-w-[150px] w-full md:w-auto text-left font-mono`}
              >
                {node.isBlocker && (
                  <div className="absolute top-0 left-0 bottom-0 w-[2px] bg-[#FF2D2D]" />
                )}

                <span className="text-[9px] uppercase tracking-wider text-neutral-400 font-semibold mb-1">
                  {node.type}
                </span>

                <div className="font-bold text-white text-xs sm:text-sm">
                  {node.label}
                </div>

                {node.amount && (
                  <div className="text-lg font-extrabold text-white font-mono-num mt-1 tracking-tight">
                    {node.amount}
                  </div>
                )}

                {node.sublabel && (
                  <div className="text-[10px] text-neutral-400 mt-1">
                    {node.sublabel}
                  </div>
                )}

                {node.status && (
                  <div className="text-[9px] uppercase font-bold text-[#FF2D2D] mt-2 pt-1 border-t border-red-900/60">
                    {node.status}
                  </div>
                )}
              </div>

              {/* Thin Connection Arrow */}
              {!isLast && (
                <div className="flex flex-col md:flex-row items-center justify-center py-1 md:py-0 md:px-2 text-neutral-400 font-mono text-xs shrink-0">
                  <span className="hidden md:inline">──────▶</span>
                  <span className="md:hidden">│<br />▼</span>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
export interface EvidenceItem {
  source: string;
  value: string;
  relationship?: string;
  date?: string;
  verification?: string;
}

export interface EvidenceBlockProps {
  title?: string;
  items: EvidenceItem[];
  className?: string;
}

export function EvidenceBlock({
  title = 'AUDITABLE EVIDENCE & RECONCILIATION PROVENANCE',
  items,
  className = '',
}: EvidenceBlockProps) {
  return (
    <div className={`bg-[#09090b] border border-[#27272a] p-4 space-y-3 font-mono text-xs ${className}`}>
      <div className="flex items-center justify-between border-b border-[#27272a] pb-2">
        <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-400">
          {title}
        </span>
        <span className="text-[9px] text-[#FF2D2D] font-bold bg-[#FF2D2D]/10 px-1.5 py-0.5 border border-[#FF2D2D]/30">
          VERIFIED DATA TRACE
        </span>
      </div>

      <div className="divide-y divide-[#27272a]">
        {items.map((item, idx) => (
          <div key={idx} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-white text-xs">{item.source}</span>
                {item.relationship && (
                  <span className="text-[9px] text-neutral-400 font-sans uppercase bg-[#121215] px-1.5 py-0.5 border border-[#27272a]">
                    {item.relationship}
                  </span>
                )}
              </div>
              {item.date && (
                <div className="text-[10px] text-neutral-500">{item.date}</div>
              )}
            </div>

            <div className="text-left sm:text-right shrink-0">
              <div className="font-bold font-mono-num text-white text-xs">{item.value}</div>
              {item.verification && (
                <div className="text-[10px] text-emerald-400 font-sans font-medium">
                  {item.verification}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

