import React from 'react';

export interface ExposureItem {
  label: string;
  amount: string;
  percentage: number;
  isBlocker?: boolean;
}

interface ExposureBarProps {
  items: ExposureItem[];
  title?: string;
  className?: string;
}

export function ExposureBar({ items, title = 'FINANCIAL EXPOSURE DISTRIBUTION', className = '' }: ExposureBarProps) {
  return (
    <div className={`bg-[#09090b] border border-[#27272a] p-5 space-y-4 ${className}`}>
      {title && (
        <div className="flex items-center space-x-2 border-b border-[#27272a] pb-3">
          <div className="w-[2px] h-4 bg-[#FF2D2D]" />
          <span className="text-xs font-mono uppercase tracking-widest text-[#FF2D2D] font-bold">
            {title}
          </span>
        </div>
      )}

      <div className="space-y-3 font-sans">
        {items.map((item, idx) => (
          <div key={idx} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">{item.label}</span>
              <span className={`font-mono-num font-bold ${item.isBlocker ? 'text-[#FF2D2D]' : 'text-white'}`}>
                {item.amount} ({item.percentage}%)
              </span>
            </div>
            <div className="h-2 w-full bg-[#121215] border border-[#27272a] p-0.5">
              <div
                className={`h-full ${item.isBlocker ? 'bg-[#FF2D2D]' : 'bg-neutral-300'} transition-all duration-300`}
                style={{ width: `${Math.min(100, Math.max(2, item.percentage))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
export function DataLedger<T>({
  columns,
  data,
  onRowClick,
  className = '',
}: {
  columns: Array<{ key: string; header: string; align?: 'left' | 'right' | 'center'; render?: (item: T) => React.ReactNode }>;
  data: T[];
  onRowClick?: (item: T) => void;
  className?: string;
}) {
  return (
    <div className={`bg-[#09090b] border border-[#27272a] overflow-x-auto ${className}`}>
      <table className="w-full text-left text-xs font-sans">
        <thead className="bg-[#121215] text-neutral-400 font-mono text-[10px] uppercase border-b border-[#27272a] tracking-wider">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`py-3.5 px-4 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#27272a] font-mono">
          {data.map((row, idx) => (
            <tr
              key={idx}
              onClick={() => onRowClick && onRowClick(row)}
              className={`hover:bg-[#121215] transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
            >
              {columns.map((col) => (
                <td key={col.key} className={`py-3.5 px-4 ${col.align === 'right' ? 'text-right font-mono-num' : ''}`}>
                  {col.render ? col.render(row) : (row as any)[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EntityHeader({
  title,
  exposure,
  overdue,
  dso,
  status,
  className = '',
}: {
  title: string;
  exposure?: string;
  overdue?: string;
  dso?: string | number;
  status?: string;
  className?: string;
}) {
  return (
    <div className={`bg-[#09090b] border border-[#27272a] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono ${className}`}>
      <div className="space-y-1">
        <div className="flex items-center space-x-2 text-[10px] text-neutral-400">
          <span className="text-[#FF2D2D] font-bold">FINANCIAL DOSSIER</span>
          <span>/</span>
          <span>ENTITY SPECIFICATION</span>
        </div>
        <h1 className="text-xl font-bold text-white uppercase">{title}</h1>
      </div>

      <div className="flex items-center gap-6 text-xs">
        {exposure && (
          <div className="text-left md:text-right">
            <span className="text-[10px] text-neutral-400 block uppercase">EXPOSURE</span>
            <span className="text-sm font-bold text-white font-mono-num">{exposure}</span>
          </div>
        )}
        {overdue && (
          <div className="text-left md:text-right">
            <span className="text-[10px] text-neutral-400 block uppercase">OVERDUE</span>
            <span className="text-sm font-bold text-[#FF2D2D] font-mono-num">{overdue}</span>
          </div>
        )}
        {dso && (
          <div className="text-left md:text-right">
            <span className="text-[10px] text-neutral-400 block uppercase">DSO</span>
            <span className="text-sm font-bold text-white font-mono-num">{dso} DAYS</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function CommandHeader({
  contextLabel = 'O2C INTELLIGENCE',
  title,
  subtitle,
  actions,
  className = '',
}: {
  contextLabel?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#27272a] pb-4 ${className}`}>
      <div className="space-y-1 font-mono">
        <div className="text-[10px] text-neutral-400 uppercase tracking-widest flex items-center space-x-2">
          <span className="w-1.5 h-1.5 bg-[#FF2D2D]" />
          <span>{contextLabel}</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-white uppercase tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-neutral-400 font-sans">{subtitle}</p>}
      </div>

      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}

