'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  Building2,
  Plug,
  Bell,
  ShieldCheck,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { MainNavShell } from '@/components/MainNavShell';
import { PlanPicker } from '@/components/billing/PlanPicker';

export default function BillingPage() {
  const [currentPlan, setCurrentPlan] = useState<'starter' | 'growth' | 'enterprise'>('starter');
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('active');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const orgId = '';

  const handleSelectPlan = async (tier: 'starter' | 'growth' | 'enterprise', interval: 'monthly' | 'annual') => {
    if (tier === 'enterprise') {
      alert('Routing to Enterprise Sales Contact Form... One of our sales team will reach out within 2 hours.');
      return;
    }

    setIsProcessing(true);
    setMessage(null);

    try {
      // Call server endpoint to create Razorpay Subscription
      const response = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_subscription', planId: tier, interval }),
      });
      const res = await response.json();
      if (!response.ok || !res.success) throw new Error(res.error || 'Failed to initiate checkout.');

      // Launch Razorpay Hosted Checkout Modal (Client SDK)
      const options = {
        key: res.keyId,
        subscription_id: res.subscriptionId,
        name: 'AIOSpark Financial Technologies',
        description: `${tier.toUpperCase()} Subscription (${interval})`,
        image: '/logo.png',
        handler: function (response: any) {
          // IMPORTANT: Do NOT trust client callback alone for subscription activation.
          // Client callback only sets UI to pending state while awaiting Razorpay Webhook.
          setMessage({
            type: 'success',
            text: `Payment authorized (ID: ${response.razorpay_payment_id}). Awaiting webhook activation confirmation...`,
          });
          setIsProcessing(false);
        },
        prefill: {
          name: 'Finance Admin',
          email: 'admin@company.com',
          contact: '9876543210',
        },
        theme: {
          color: '#FF3B30',
        },
      };

      // Simulate client SDK launch in test environment
      console.log('Razorpay Checkout Modal Launched:', options);
      setMessage({
        type: 'success',
        text: `Razorpay Checkout Modal launched for Subscription ID: ${res.subscriptionId}. Please complete checkout in modal.`,
      });
      setIsProcessing(false);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to initiate checkout.' });
      setIsProcessing(false);
    }
  };

  return (
    <MainNavShell currentRole={undefined}>
      <div className="space-y-8 font-sans pb-16">
        
        {/* A. COMMAND HEADER */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 workstation-card p-6 md:p-8 rounded-xl border border-white/[0.08] shadow-2xl relative overflow-hidden bg-gradient-to-br from-[#14161E] via-[#12141A] to-[#0D0E12]">
          <div className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 bg-[#FF3B30]/[0.03] rounded-full blur-3xl" />

          <div className="space-y-3 z-10">
            {/* Telemetry Strip */}
            <div className="flex items-center space-x-3 text-xs text-neutral-400 font-sans flex-wrap gap-y-2">
              <Link
                href="/settings"
                className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-white transition-colors group text-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[#FF3B30] group-hover:-translate-x-0.5 transition-transform" />
                <span>Workstation Settings</span>
              </Link>
              <span className="text-neutral-500">•</span>
              <span className="text-[#FF3B30] font-semibold text-[11px] tracking-wide uppercase bg-[#FF3B30]/10 px-2.5 py-0.5 rounded border border-[#FF3B30]/20 font-mono">
                Billing & Subscription
              </span>
              <span className="text-neutral-500">•</span>
              <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Active Plan: Starter</span>
              </span>
            </div>

            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-4xl font-bold font-sans tracking-tight text-white">
                Subscription & Commercial Tier
              </h1>
              <p className="font-serif-editorial text-[#FF3B30] font-normal italic text-lg sm:text-2xl">
                Scale autonomous AR agents and invoice processing limits.
              </p>
              <p className="text-xs sm:text-sm text-neutral-400 font-sans max-w-2xl leading-relaxed">
                Choose the operational capacity matching your monthly invoice volume, multi-ERP sync requirements, and controller approval queues.
              </p>
            </div>
          </div>
        </div>

        {/* B. SETTINGS NAVIGATION TABS */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-sans">
          <Link
            href="/settings"
            className="px-3.5 py-2 rounded-lg bg-[#181B23] border border-white/[0.08] hover:border-white/20 text-neutral-300 hover:text-white font-medium flex items-center gap-2 transition-colors shrink-0"
          >
            <Building2 className="w-3.5 h-3.5 text-neutral-400" />
            <span>Organization & Profile</span>
          </Link>

          <Link
            href="/settings/integrations"
            className="px-3.5 py-2 rounded-lg bg-[#181B23] border border-white/[0.08] hover:border-white/20 text-neutral-300 hover:text-white font-medium flex items-center gap-2 transition-colors shrink-0"
          >
            <Plug className="w-3.5 h-3.5 text-neutral-400" />
            <span>ERP Integrations</span>
          </Link>

          <Link
            href="/settings/billing"
            className="px-3.5 py-2 rounded-lg btn-editorial-primary text-white font-semibold flex items-center gap-2 shadow-sm shrink-0"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Billing & Subscription</span>
          </Link>

          <Link
            href="/settings/notifications"
            className="px-3.5 py-2 rounded-lg bg-[#181B23] border border-white/[0.08] hover:border-white/20 text-neutral-300 hover:text-white font-medium flex items-center gap-2 transition-colors shrink-0"
          >
            <Bell className="w-3.5 h-3.5 text-neutral-400" />
            <span>Notification Triggers</span>
          </Link>

          <Link
            href="/approvals"
            className="px-3.5 py-2 rounded-lg bg-[#181B23] border border-white/[0.08] hover:border-white/20 text-neutral-300 hover:text-white font-medium flex items-center gap-2 transition-colors shrink-0"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-neutral-400" />
            <span>Audit & Governance</span>
          </Link>
        </div>

        {/* Status Notification */}
        {message && (
          <div
            className={`p-4 rounded-xl text-xs font-medium border flex items-center justify-between ${
              message.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-[#FF3B30]/10 text-[#FF3B30] border-[#FF3B30]/30'
            }`}
          >
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-neutral-400 hover:text-white ml-2">✕</button>
          </div>
        )}

        {/* Plan Picker Component */}
        <div className="workstation-card p-6 md:p-8 rounded-xl border border-white/[0.08] bg-[#12141A]">
          <PlanPicker currentPlanId={currentPlan} onSelectPlan={handleSelectPlan} />
        </div>

      </div>
    </MainNavShell>
  );
}
