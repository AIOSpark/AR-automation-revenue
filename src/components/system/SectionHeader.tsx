import React from 'react';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  signal?: boolean;
  editorial?: boolean;
  className?: string;
}

export function SectionHeader({
  title,
  subtitle,
  action,
  signal = false,
  editorial = false,
  className = '',
}: SectionHeaderProps) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.08] pb-3 ${className}`}>
      <div className="flex items-center space-x-2.5">
        {signal && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] shrink-0" />
        )}
        <div>
          <h2 className="text-sm sm:text-base font-semibold tracking-tight text-white font-sans">
            {title}
          </h2>
          {subtitle && (
            <p className={`text-xs sm:text-[13px] text-neutral-400 mt-0.5 leading-normal ${editorial ? 'font-serif-editorial italic text-neutral-300' : 'font-sans'}`}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {action && <div className="shrink-0 text-xs font-medium">{action}</div>}
    </div>
  );
}
