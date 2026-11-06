'use client';

import React, { useState } from 'react';
import { Check, Zap, Building2, ShieldCheck, ArrowRight, HelpCircle } from 'lucide-react';

export interface PlanCardProps {
  currentPlanId?: string;
  onSelectPlan: (tier: 'starter' | 'growth' | 'enterprise', interval: 'monthly' | 'annual') => void;
}

export function PlanPicker({ currentPlanId = 'starter', onSelectPlan }: PlanCardProps) {
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly');

  const prices = {
    starter: interval === 'monthly' ? '₹4,999' : '₹3,999',
    growth: interval === 'monthly' ? '₹14,999' : '₹11,999',
    enterprise: 'Custom',
  };

  return (
    <div className="w-full max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Header & Interval Toggle */}
      <div className="text-center mb-12">
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl">
          Simple, Transparent Billing for Finance Teams
        </h2>
        <p className="mt-3 max-w-2xl mx-auto text-base text-slate-600">
          Unlock cash flow, automate collections, and eliminate manual AP disputes. Upgrade or downgrade anytime.
        </p>

        {/* Monthly / Annual Toggle */}
        <div className="mt-8 flex justify-center items-center gap-3">
          <span className={`text-sm font-medium ${interval === 'monthly' ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>
            Monthly Billing
          </span>
          <button
            type="button"
            onClick={() => setInterval(interval === 'monthly' ? 'annual' : 'monthly')}
            className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none bg-slate-900"
            role="switch"
            aria-checked={interval === 'annual'}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                interval === 'annual' ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className={`text-sm font-medium flex items-center gap-1.5 ${interval === 'annual' ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>
            Annual Billing
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              Save 20%
            </span>
          </span>
        </div>
      </div>

      {/* 3-Card Consumer SaaS Comparison Layout */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-8 items-stretch">
        {/* CARD 1: STARTER */}
        <div className="relative flex flex-col rounded-2xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-md transition-shadow">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-slate-900">Starter</h3>
            <p className="text-sm text-slate-500 mt-1">Essential AR automation for growing SMBs.</p>
          </div>
          <div className="mb-6">
            <span className="text-4xl font-extrabold text-slate-900">{prices.starter}</span>
            <span className="text-sm text-slate-500 font-medium"> / month</span>
            {interval === 'annual' && <p className="text-xs text-emerald-600 mt-1 font-medium">Billed annually (₹47,988/year)</p>}
          </div>

          <ul className="mb-8 space-y-3 text-sm text-slate-700 flex-1">
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-slate-900 shrink-0 mt-0.5" />
              <span>Up to <strong>500 Invoices</strong> / month</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-slate-900 shrink-0 mt-0.5" />
              <span>CSV & Excel batch data upload</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-slate-900 shrink-0 mt-0.5" />
              <span>11-category AI root-cause classification</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-slate-900 shrink-0 mt-0.5" />
              <span>Layer 18 Human Approval Queue</span>
            </li>
          </ul>

          <button
            type="button"
            disabled={currentPlanId === 'starter'}
            onClick={() => onSelectPlan('starter', interval)}
            className={`w-full rounded-lg py-3 px-4 text-center font-medium text-sm transition-colors ${
              currentPlanId === 'starter'
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm'
            }`}
          >
            {currentPlanId === 'starter' ? 'Current Plan' : 'Start Starter Tier'}
          </button>
        </div>

        {/* CARD 2: GROWTH (RECOMMENDED / HIGHLIGHTED) */}
        <div className="relative flex flex-col rounded-2xl border-2 border-indigo-600 bg-white p-8 shadow-xl transform lg:-translate-y-2">
          {/* Recommended Badge */}
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 py-1 px-3.5 text-xs font-semibold text-white tracking-wide uppercase shadow-sm">
            Most Popular
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              Growth <Zap className="h-4 w-4 text-indigo-600 fill-indigo-600" />
            </h3>
            <p className="text-sm text-slate-500 mt-1">Complete O2C intelligence with ERP sync.</p>
          </div>
          <div className="mb-6">
            <span className="text-4xl font-extrabold text-slate-900">{prices.growth}</span>
            <span className="text-sm text-slate-500 font-medium"> / month</span>
            {interval === 'annual' && <p className="text-xs text-emerald-600 mt-1 font-medium">Billed annually (₹143,988/year)</p>}
          </div>

          <ul className="mb-8 space-y-3 text-sm text-slate-700 flex-1">
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>Up to <strong>5,000 Invoices</strong> / month</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>Native <strong>Tally ERP & Zoho Books</strong> Sync</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>CFO Intelligence & Cash Unlocked Attribution</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>Automated WhatsApp & Email Reminders</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>Priority Customer Support</span>
            </li>
          </ul>

          <button
            type="button"
            disabled={currentPlanId === 'growth'}
            onClick={() => onSelectPlan('growth', interval)}
            className={`w-full rounded-lg py-3.5 px-4 text-center font-semibold text-sm transition-colors ${
              currentPlanId === 'growth'
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md'
            }`}
          >
            {currentPlanId === 'growth' ? 'Current Plan' : 'Start Growth Tier'}
          </button>
        </div>

        {/* CARD 3: ENTERPRISE */}
        <div className="relative flex flex-col rounded-2xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-md transition-shadow">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              Enterprise <Building2 className="h-4 w-4 text-slate-600" />
            </h3>
            <p className="text-sm text-slate-500 mt-1">For large corporations with complex workflows.</p>
          </div>
          <div className="mb-6">
            <span className="text-4xl font-extrabold text-slate-900">{prices.enterprise}</span>
            <p className="text-xs text-slate-500 mt-1 font-medium">Custom SLA & Negotiated Contracts</p>
          </div>

          <ul className="mb-8 space-y-3 text-sm text-slate-700 flex-1">
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-slate-900 shrink-0 mt-0.5" />
              <span><strong>Unlimited Invoices</strong> & Custom Limits</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-slate-900 shrink-0 mt-0.5" />
              <span>Custom ERP Adapters (SAP, Oracle, Dynamics)</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-slate-900 shrink-0 mt-0.5" />
              <span>SAML SSO & Custom Security Policies</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-slate-900 shrink-0 mt-0.5" />
              <span>Dedicated Account Manager & On-Prem Support</span>
            </li>
          </ul>

          <button
            type="button"
            onClick={() => onSelectPlan('enterprise', interval)}
            className="w-full rounded-lg py-3 px-4 text-center font-medium text-sm border border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white transition-colors"
          >
            Contact Sales
          </button>
        </div>
      </div>

      {/* FAQ / Feature Comparison Expansion */}
      <div className="mt-16 border-t border-slate-200 pt-10">
        <h4 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-indigo-600" /> Frequently Asked Questions
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-600">
          <div>
            <h5 className="font-semibold text-slate-900">How does the 14-day free pilot work?</h5>
            <p className="mt-1">You can test AIOSpark on your existing ledger data with zero risk. Upgrades take effect immediately.</p>
          </div>
          <div>
            <h5 className="font-semibold text-slate-900">Are payments GST-compliant?</h5>
            <p className="mt-1">Yes. Razorpay generates GST tax invoices automatically with your company GSTIN.</p>
          </div>
          <div>
            <h5 className="font-semibold text-slate-900">Can I upgrade or downgrade anytime?</h5>
            <p className="mt-1">Prorated adjustments apply automatically on plan changes. Downgrades take effect next cycle.</p>
          </div>
          <div>
            <h5 className="font-semibold text-slate-900">What payment methods are supported?</h5>
            <p className="mt-1">UPI (Google Pay, PhonePe), Net Banking across 50+ Indian banks, and all major Credit/Debit cards.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
