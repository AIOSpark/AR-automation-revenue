'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainNavShell } from '@/components/MainNavShell';
import { ArrowLeft, Building2 } from 'lucide-react';
import { FinancialBand } from '@/components/system/FinancialBand';
import { IntelligencePanel } from '@/components/system/IntelligencePanel';
import { SectionHeader } from '@/components/system/SectionHeader';
import { StatusIndicator } from '@/components/system/StatusIndicator';
import { DataLineagePanel } from '@/components/system/DataLineagePanel';
import { formatCurrency } from '@/lib/ui/formatters';

export default function Customer360Page() {
  const params = useParams();
  const router = useRouter();
  const customerId = (params?.id as string) || '';

  const [loading, setLoading] = useState(true);
  const [customerData, setCustomerData] = useState<any>(null);
  const [role, setRole] = useState<string | undefined>(undefined);
  const [investigating, setInvestigating] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const handleRunInvestigation = async () => {
    if (!customerId) return;
    setInvestigating(true);
    setActionNotice(null);

    try {
      const res = await fetch('/api/agents/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          investigationType: 'customer',
        }),
      });

      if (!res.ok) throw new Error(`Investigation failed: HTTP ${res.status}`);
      const json = await res.json();
      setActionNotice('✅ Investigation complete. Analysis updated.');
    } catch (err: any) {
      setActionNotice(`❌ Investigation failed: ${err.message}`);
    } finally {
      setInvestigating(false);
    }
  };

  React.useEffect(() => {
    const fetchCustomer = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/customers/${customerId}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            setCustomerData(json);
          }
        }

        // Resolve the authenticated user's actual organization role.
        const membersRes = await fetch('/api/tenant/members');
        if (membersRes.ok) {
          const mData = await membersRes.json();
          setRole(mData.currentRole ?? null);
        }
      } catch (err) {
        console.error('Failed to fetch customer 360', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCustomer();
  }, [customerId]);

  const profile = customerData?.profile;
  const invoicesList = customerData?.tabsData?.invoices || [];

  return (
    <MainNavShell currentRole={role}>
      <div className="space-y-8 font-sans pb-16">
        {/* BREADCRUMB */}
        <div className="flex items-center justify-between font-mono text-xs">
          <Link href="/cfo" className="inline-flex items-center space-x-2 text-neutral-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4 text-[#FF2D2D]" />
            <span>BACK TO CFO COMMAND CENTER</span>
          </Link>
          <StatusIndicator status={profile?.riskBand === 'high' ? 'CRITICAL' : 'ACTIONABLE'} />
        </div>

        {actionNotice && (
          <div className="p-4 bg-[#09090b] border border-[#FF2D2D] text-white text-xs font-mono flex items-center justify-between">
            <span>{actionNotice}</span>
            <button onClick={() => setActionNotice(null)} className="text-neutral-400 hover:text-white">✕</button>
          </div>
        )}

        {/* 1. CUSTOMER HEADER */}
        <div className="bg-[#09090b] border border-[#27272a] p-6 space-y-4 font-mono">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-[#121215] border border-[#27272a] text-[#FF2D2D]">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] text-neutral-400 uppercase tracking-widest">
                  CUSTOMER 360 / {customerId.toUpperCase()}
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-0.5">
                  {profile?.customerName || customerId.toUpperCase()}
                </h1>
                <div className="text-xs text-neutral-400 font-sans mt-0.5">
                  Account ID: {customerId.toUpperCase()} • Risk Classification: <span className="text-white font-bold uppercase">{profile?.riskBand || 'UNKNOWN'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleRunInvestigation}
                disabled={investigating}
                className="px-4 py-2 bg-[#FF2D2D] hover:bg-[#e02424] text-white text-xs font-mono font-bold transition cursor-pointer"
              >
                {investigating ? 'INVESTIGATING...' : 'RUN CUSTOMER INVESTIGATION'}
              </button>
            </div>
          </div>
        </div>

        {/* 2. FINANCIAL BAND */}
        <FinancialBand
          heroMetric={{
            label: "TOTAL OUTSTANDING EXPOSURE",
            value: formatCurrency(profile?.totalOutstandingMinorUnits || 0),
            sublabel: `${formatCurrency(profile?.totalOverdueMinorUnits || 0)} overdue past contracted credit terms.`,
            signal: (profile?.totalOverdueMinorUnits || 0) > 0,
          }}
          metrics={[
            { label: "OVERDUE CAPITAL", value: formatCurrency(profile?.totalOverdueMinorUnits || 0), highlightColor: "red" },
            { label: "AVERAGE DSO", value: `${profile?.avgPaymentTimeDaysT12M || 30} DAYS`, highlightColor: "amber", sublabel: "Avg payment cycle" },
            { label: "CREDIT LIMIT", value: formatCurrency(profile?.creditLimitMinorUnits || 0) },
            { label: "RISK BAND", value: (profile?.riskBand || "LOW").toUpperCase(), highlightColor: profile?.riskBand === 'high' ? 'red' : 'emerald' },
          ]}
        />

        <DataLineagePanel entityType="customer" entityId={customerId} />

        {/* 3. AIOSPARK CUSTOMER SYNTHESIS */}
        <div className="space-y-4">
          <SectionHeader title="CUSTOMER INTELLIGENCE SYNTHESIS" signal />
          <IntelligencePanel
            title="AIOSPARK CUSTOMER 360 SYNTHESIS"
            whatChanged={`${profile?.customerName || 'Customer'} has ${formatCurrency(profile?.totalOverdueMinorUnits || 0)} overdue.`}
            whyItMatters={`Account exhibits ${profile?.riskBand || 'normal'} risk parameters across active ledger.`}
            evidence={[
              `Historical Payment Cycle: ${profile?.avgPaymentTimeDaysT12M || 30} days`,
              `Total Outstanding Exposure: ${formatCurrency(profile?.totalOutstandingMinorUnits || 0)}`,
            ]}
            recommendedAction="Monitor payment commitments and review open invoice blockers"
            financialImpact={formatCurrency(profile?.totalOutstandingMinorUnits || 0)}
            actionUrl="/receivables"
          />
        </div>

        {/* 4. OUTSTANDING INVOICES TABLE */}
        <div className="space-y-4">
          <SectionHeader
            title="OUTSTANDING CUSTOMER RECEIVABLES"
            subtitle="Ledger invoices for this customer account"
            signal
          />

          <div className="bg-[#09090b] border border-[#27272a] overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-[#121215] text-neutral-400 font-mono text-[10px] uppercase border-b border-[#27272a]">
                <tr>
                  <th className="py-3 px-4">INVOICE</th>
                  <th className="py-3 px-4 text-right">TOTAL AMOUNT</th>
                  <th className="py-3 px-4 text-right">OUTSTANDING</th>
                  <th className="py-3 px-4">DUE DATE</th>
                  <th className="py-3 px-4">STATUS</th>
                  <th className="py-3 px-4 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272a] font-mono">
                {invoicesList.length > 0 ? (
                  invoicesList.map((inv: any) => (
                    <tr
                      key={inv.id}
                      onClick={() => router.push(`/invoices/${inv.id}`)}
                      className="hover:bg-[#121215] transition cursor-pointer"
                    >
                      <td className="py-3.5 px-4 font-bold text-white">{inv.number || inv.invoice_number || inv.id}</td>
                      <td className="py-3.5 px-4 text-right font-mono-num text-white">{formatCurrency(inv.amount_minor_units || (inv.amount * 100) || 0)}</td>
                      <td className="py-3.5 px-4 text-right font-mono-num text-[#FF2D2D] font-bold">{formatCurrency(inv.amount_minor_units || (inv.amount * 100) || 0)}</td>
                      <td className="py-3.5 px-4 text-neutral-300">{inv.due_date || 'N/A'}</td>
                      <td className="py-3.5 px-4">
                        <StatusIndicator status={inv.status === 'open' ? 'ACTIONABLE' : 'VERIFIED'} />
                      </td>
                      <td className="py-3.5 px-4 text-right text-[#FF2D2D] font-bold hover:underline">
                        INSPECT →
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-neutral-400 font-sans">
                      No invoices found for this customer.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainNavShell>
  );
}
