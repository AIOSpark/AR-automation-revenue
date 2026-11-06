'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  AlertOctagon,
  CreditCard,
  Bot,
  BarChart3,
  Plug,
  Settings,
  Activity,
  Award,
  ShieldCheck,
  Zap,
  GitCommit,
  Users,
  Search,
  CheckSquare,
  Upload,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { WorkstationCopilotAvatar } from './system/WorkstationCopilotAvatar';

interface MainNavShellProps {
  currentRole?: string;
  children: React.ReactNode;
}

export function MainNavShell({ currentRole, children }: MainNavShellProps) {
  const pathname = usePathname();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileNavOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileNavOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileNavOpen]);

  const o2cItems = [
    { name: 'Command Center', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Import & Data Input', href: '/onboarding', icon: Upload },
    { name: 'Receivables', href: '/receivables', icon: FileText },
    { name: 'Cash Unblock', href: '/cash-unblock', icon: Zap },
    { name: 'Customers', href: '/customers', icon: Users },
    { name: 'Exceptions', href: '/exceptions', icon: AlertOctagon },
    { name: 'Collections', href: '/collections', icon: Activity },
    { name: 'Payments', href: '/payments', icon: CreditCard },
  ];

  const intelligenceItems = [
    { name: 'AI Investigations', href: '/investigations', icon: Search },
    { name: 'AI Agents', href: '/agents', icon: Bot },
    { name: 'Causal Graph', href: '/causal-graph', icon: GitCommit },
  ];

  const managementItems = [
    { name: 'CFO Cockpit', href: '/cfo', icon: BarChart3 },
    { name: 'Reports', href: '/reports', icon: Award },
  ];

  const systemItems = [
    { name: 'ERP Integrations', href: '/settings/integrations', icon: Plug },
    { name: 'Approvals', href: '/approvals', icon: CheckSquare },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const navGroups = [
    { label: 'O2C INTELLIGENCE', items: o2cItems },
    { label: 'REASONING & AI', items: intelligenceItems },
    { label: 'MANAGEMENT', items: managementItems },
    { label: 'GOVERNANCE', items: systemItems },
  ];

  return (
    <div className="workstation-app min-h-screen bg-[#0A0B0E] text-[#F3F4F6] flex flex-col md:flex-row font-sans selection:bg-[#FF3B30]/30 selection:text-white">
      <a
        href="#workstation-content"
        className="workstation-skip-link"
      >
        Skip to workspace content
      </a>
      {/* Compact mobile command bar. The full navigation becomes a drawer below md. */}
      <div className="workstation-mobile-bar md:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-[#12141A]/95 border-b border-white/[0.08] backdrop-blur-xl">
        <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="AIOSpark Command Center">
          <img src="/logo-lockup.png" alt="AIOSpark" className="h-9 w-24 rounded-md bg-transparent object-contain" />
        </Link>
        <button
          type="button"
          onClick={() => setIsMobileNavOpen((open) => !open)}
          aria-expanded={isMobileNavOpen}
          aria-controls="workstation-navigation"
          aria-label={isMobileNavOpen ? 'Close workstation navigation' : 'Open workstation navigation'}
          className="min-h-11 min-w-11 rounded-xl border border-white/[0.1] bg-white/[0.04] text-neutral-200 flex items-center justify-center hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3B30]"
        >
          <span className="sr-only">Navigation</span>
          <span className="flex flex-col gap-1" aria-hidden="true">
            <span className="h-px w-4 bg-current" />
            <span className="h-px w-4 bg-current" />
            <span className="h-px w-4 bg-current" />
          </span>
        </button>
      </div>

      {isMobileNavOpen && (
        <button
          type="button"
          aria-label="Close workstation navigation"
          onClick={() => setIsMobileNavOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] md:hidden"
        />
      )}

      {/* Sidebar Navigation - Warm Editorial Financial Workstation OS Style */}
      <aside
        id="workstation-navigation"
        className={`workstation-sidebar fixed inset-y-0 left-0 z-50 w-72 bg-[#12141A] border-r border-white/[0.08] p-4 flex flex-col justify-between shrink-0 shadow-2xl transition-transform duration-200 ease-out md:static md:z-30 md:w-64 md:h-screen md:translate-x-0 md:transition-none ${
          isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="space-y-6 overflow-y-auto pr-1 custom-scrollbar">
          {/* Logo Header & Theme Toggle */}
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <Link href="/" className="flex items-center gap-2.5 min-w-0 group">
              <img src="/logo-lockup.png" alt="AIOSpark" className="h-10 w-28 rounded-md bg-transparent object-contain" />
            </Link>

            <ThemeToggle compact />
          </div>

          <div className="h-[1px] bg-gradient-to-r from-[#FF3B30]/40 via-white/[0.08] to-transparent" />

          {/* Grouped Nav Items */}
          <nav aria-label="Primary workstation navigation" className="space-y-5">
            {navGroups.map((group) => (
              <div key={group.label} className="space-y-1">
                <div className="px-2.5 mb-2 text-[10px] font-sans font-semibold text-neutral-400 uppercase tracking-wider flex items-center justify-between">
                  <span>{group.label}</span>
                  <span className="w-1 h-1 bg-white/[0.1] rounded-full" />
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isSettingsHub = item.href === '/settings';
                    const isActive = isSettingsHub
                      ? pathname === '/settings' || (pathname?.startsWith('/settings') && pathname !== '/settings/integrations')
                      : pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => setIsMobileNavOpen(false)}
                        className={`workstation-nav-item flex items-center justify-between px-3 py-2 text-xs font-sans transition-all group relative rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF3B30] ${
                          isActive
                            ? 'workstation-nav-item-active bg-[#181B23] text-white font-semibold shadow-sm'
                            : 'text-neutral-400 hover:text-white hover:bg-white/[0.04] font-medium'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <Icon
                            className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                              isActive ? 'text-[#FF3B30]' : 'text-neutral-400 group-hover:text-white'
                            }`}
                          />
                          <span className="truncate tracking-tight">{item.name}</span>
                        </div>
                        {isActive && (
                          <span className="w-1.5 h-1.5 bg-[#FF3B30] rounded-full shrink-0 shadow-[0_0_6px_#FF3B30]" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Footer Organization Workspace Status */}
        <div className="workstation-command-status mt-4 p-3 rounded-xl bg-[#0A0B0E] border border-white/[0.08] text-[11px] font-sans text-neutral-400 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white tracking-tight">Command Layer</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-white/[0.06]">
            <span>Role: <strong className="text-white font-medium">{currentRole}</strong></span>
            <span className="text-emerald-400 font-medium text-[10px]">Verified</span>
          </div>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <main id="workstation-content" tabIndex={-1} className="workstation-main flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full bg-[#0A0B0E] focus:outline-none">
        {children}
      </main>

      {/* Persistent Workstation AI Copilot Avatar */}
      <WorkstationCopilotAvatar />
    </div>
  );
}
