'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, ArrowRight, CornerDownLeft } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CommandItem {
  label: string;
  type: 'NAVIGATION' | 'INTELLIGENCE' | 'SYSTEM' | 'GOVERNANCE';
  href: string;
  description: string;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = [
    { label: 'Order-to-Cash Command Center', type: 'NAVIGATION', href: '/dashboard', description: 'Real-time telemetry, pressure map, and cash metrics' },
    { label: 'Customer 360 Exposure Directory', type: 'NAVIGATION', href: '/customers', description: 'Debtor risk profiles, payment velocity, and concentration telemetry' },
    { label: 'Cash Unblock Queue', type: 'NAVIGATION', href: '/cash-unblock', description: 'Simulate and execute working capital recovery' },
    { label: 'Receivables Ledger', type: 'NAVIGATION', href: '/receivables', description: 'Active gross ledger balance and aging schedules' },
    { label: 'Order-to-Cash Causal Graph', type: 'INTELLIGENCE', href: '/causal-graph', description: 'Interactive root-cause tree mapping commercial disputes' },
    { label: 'CFO Telemetry Cockpit', type: 'NAVIGATION', href: '/cfo', description: 'Executive liquidity, DSO forecasting, and capital health' },
    { label: 'AI Exception Room', type: 'INTELLIGENCE', href: '/exceptions', description: 'PO mismatches, POD tracking, and rate discrepancies' },
    { label: 'AI Investigations', type: 'INTELLIGENCE', href: '/investigations', description: 'Autonomous agent inquiry logs and reasoning traces' },
    { label: 'AI Agent Roster', type: 'SYSTEM', href: '/agents', description: 'Agent loop configuration, guardrails, and policies' },
    { label: 'Approval Queue & Audit Log', type: 'GOVERNANCE', href: '/approvals', description: 'Human-in-the-loop review and compliance verification' },
    { label: 'ERP & Ledger Integrations', type: 'SYSTEM', href: '/settings/integrations', description: 'Connect SAP, NetSuite, Tally, or Zoho' },
    { label: 'Workstation Settings & Organization', type: 'SYSTEM', href: '/settings', description: 'Company profile, team RBAC, and system configuration' },
    { label: 'Billing & Commercial Subscription', type: 'SYSTEM', href: '/settings/billing', description: 'Plan tiers, invoice quotas, and Razorpay billing' },
  ];

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()) ||
    c.type.toLowerCase().includes(query.toLowerCase()) ||
    c.description.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          router.push(filtered[selectedIndex].href);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, filtered, selectedIndex, router]);

  if (!isOpen) return null;

  const handleSelect = (href: string) => {
    router.push(href);
    onClose();
  };

  const badgeStyle = (type: CommandItem['type']) => {
    switch (type) {
      case 'INTELLIGENCE':
        return 'text-[#FF3B30] bg-[#FF3B30]/10 border-[#FF3B30]/20';
      case 'GOVERNANCE':
        return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
      case 'SYSTEM':
        return 'text-sky-400 bg-sky-400/10 border-sky-400/20';
      default:
        return 'text-neutral-300 bg-white/[0.04] border-white/[0.08]';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-start justify-center pt-20 sm:pt-28 p-4 font-sans"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="workstation-dialog-panel bg-[#12141A] border border-white/[0.12] max-w-xl w-full rounded-2xl overflow-hidden shadow-2xl relative font-sans flex flex-col">
        {/* Search Input Bar */}
        <div className="flex items-center space-x-3 px-4 py-3.5 border-b border-white/[0.08] bg-[#181B23]">
          <Search className="w-4 h-4 text-[#FF3B30] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands, views, or telemetry..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-white placeholder-neutral-500 font-sans text-xs sm:text-sm focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.08] transition"
            title="Close command palette (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto divide-y divide-white/[0.04] text-xs">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-neutral-400 font-sans space-y-1">
              <p className="text-white font-medium text-xs">No matching destinations found</p>
              <p className="text-[11px] text-neutral-500">Try searching for receivables, unblock, or cfo.</p>
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.href + item.label}
                  onClick={() => handleSelect(item.href)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`p-3.5 cursor-pointer transition-colors flex items-center justify-between group ${
                    isSelected
                      ? 'bg-white/[0.06] border-l-2 border-[#FF3B30]'
                      : 'hover:bg-white/[0.03] border-l-2 border-transparent'
                  }`}
                >
                  <div className="space-y-0.5 min-w-0 pr-3">
                    <div className="flex items-center space-x-2">
                      <span className={`text-[10px] font-sans font-medium px-2 py-0.5 rounded border ${badgeStyle(item.type)}`}>
                        {item.type}
                      </span>
                      <span className="text-white font-semibold font-sans text-xs group-hover:text-[#FF3B30] transition-colors truncate">
                        {item.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400 font-sans truncate pl-0.5">
                      {item.description}
                    </p>
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5 text-neutral-400 text-[11px]">
                    {isSelected && (
                      <span className="hidden sm:inline-flex items-center gap-1 text-neutral-300 font-sans text-[11px]">
                        <span>Open</span>
                        <CornerDownLeft className="w-3 h-3 text-[#FF3B30]" />
                      </span>
                    )}
                    {!isSelected && (
                      <ArrowRight className="w-3.5 h-3.5 group-hover:text-white transition-colors" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div className="p-2.5 bg-[#0E1015] border-t border-white/[0.08] text-[11px] text-neutral-400 flex items-center justify-between font-sans px-4">
          <div className="flex items-center space-x-3">
            <span><kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-neutral-300 text-[10px]">↑</kbd> <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-neutral-300 text-[10px]">↓</kbd> Navigate</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-neutral-300 text-[10px]">↵</kbd> Select</span>
          </div>
          <span><kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-neutral-300 text-[10px]">Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
