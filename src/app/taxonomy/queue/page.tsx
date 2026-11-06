'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { MainNavShell } from '@/components/MainNavShell';
import { PAYMENT_DELAY_CATEGORIES, categoryDefinitionsMap, PaymentDelayCategory } from '@/lib/taxonomy/definitions';
import { StructurallyEnforcedEvidenceDisplay } from '@/components/StructurallyEnforcedEvidenceDisplay';
import { HelpCircle, AlertCircle, FileText, CheckCircle2, ArrowRight } from 'lucide-react';

interface UnknownQueueItem {
  id: string;
  invoiceNumber: string;
  customerName: string;
  amountFormatted: string;
  dueDate: string;
  reason: string;
  createdAt: string;
}

function NeedsClassificationContent() {
  const searchParams = useSearchParams();
  const [role, setRole] = useState<string | undefined>(undefined);

  const [queue, setQueue] = useState<UnknownQueueItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [queueError, setQueueError] = useState<string | undefined>(undefined);
  const [reclassifyNotice, setReclassifyNotice] = useState<string | undefined>(undefined);

  // Fetch unclassified records from genuine Exception Intelligence API and resolve authenticated role
  React.useEffect(() => {
    let isMounted = true;
    const fetchQueueAndRole = async () => {
      try {
        setLoading(true);
        setQueueError(undefined);

        // 1. Resolve role
        const membersRes = await fetch('/api/tenant/members');
        if (membersRes.ok && isMounted) {
          const mData = await membersRes.json();
          setRole(mData.currentRole ?? null);
        }

        // 2. Fetch genuine UNKNOWN taxonomy exceptions
        const res = await fetch('/api/exceptions?type=UNKNOWN');
        if (res.ok && isMounted) {
          const json = await res.json();
          const items = json.data?.items || [];
          const mapped: UnknownQueueItem[] = items.map((item: any) => ({
            id: item.id,
            invoiceNumber: item.invoiceNumber || item.id,
            customerName: item.customerName || 'Unknown Customer',
            amountFormatted: item.affectedAmountFormatted || '₹0',
            dueDate: item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-IN') : 'N/A',
            reason: item.recommendedAction || 'Needs human classification review',
            createdAt: item.createdAt,
          }));
          setQueue(mapped);
        } else if (isMounted) {
          setQueueError('Unable to load unclassified queue records from Exception Intelligence.');
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Failed to fetch taxonomy queue data:', err);
          setQueueError('Network error connecting to Exception Intelligence API.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchQueueAndRole();
    return () => {
      isMounted = false;
    };
  }, []);

  const [selectedCategoryMap, setSelectedCategoryMap] = useState<Record<string, PaymentDelayCategory>>({});

  const handleManualReclassify = (id: string) => {
    const selectedCat = selectedCategoryMap[id];
    if (!selectedCat) return;

    // No backend endpoint exists to persist taxonomy reclassification.
    // Acknowledge locally without claiming the change was saved.
    setQueue((prev) => prev.filter((item) => item.id !== id));
    setReclassifyNotice(
      `Locally removed invoice ${id} from queue. Reclassification to '${categoryDefinitionsMap.get(selectedCat)?.title}' was not persisted — no backend taxonomy endpoint exists.`,
    );
    setTimeout(() => setReclassifyNotice(undefined), 8000);
  };

  return (
    <MainNavShell currentRole={role}>
      <div className="p-6 max-w-6xl mx-auto space-y-6 font-sans">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <HelpCircle className="w-5 h-5 text-amber-400" />
              <h1 className="text-2xl font-bold text-white tracking-tight">Needs Classification Queue</h1>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Invoices classified as <strong className="text-amber-400 font-mono">UNKNOWN</strong> routed for human review & manual classification.
            </p>
          </div>

          <div className="px-3 py-1.5 bg-amber-950/40 border border-amber-800 rounded-xl text-amber-300 font-mono text-xs">
            {loading ? '...' : queue.length} Invoices Pending Review
          </div>
        </div>

        {queueError && (
          <div className="p-3 bg-red-950/40 border border-red-800 rounded-lg text-red-300 text-xs font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{queueError}</span>
          </div>
        )}

        {reclassifyNotice && (
          <div className="p-3 bg-amber-950/40 border border-amber-800 rounded-lg text-amber-300 text-xs font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{reclassifyNotice}</span>
          </div>
        )}

        {/* Queue Items List */}
        {loading ? (
          <div className="p-12 text-center bg-neutral-950 border border-neutral-800 rounded-2xl space-y-3 font-mono text-xs text-neutral-400">
            <div className="animate-spin w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full mx-auto" />
            <p>Loading unclassified records from Exception Intelligence...</p>
          </div>
        ) : queue.length === 0 ? (
          <div className="p-12 text-center bg-neutral-950 border border-neutral-800 rounded-2xl space-y-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <h3 className="text-base font-bold text-white">No Unclassified Invoices</h3>
            <p className="text-xs text-neutral-400 max-w-md mx-auto">
              The taxonomy queue is empty. No unclassified invoice records are available from the
              current data source. Classification review will appear here when exception records
              are ingested into the organization ledger.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {queue.map((item) => (
              <div
                key={item.id}
                className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-sm space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
                  <div>
                    <div className="flex items-center space-x-3">
                      <span className="font-bold text-white text-base">{item.customerName}</span>
                      <span className="font-mono text-xs text-neutral-400">({item.invoiceNumber})</span>
                      <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-950/60 text-amber-400 border border-amber-800">
                        UNKNOWN
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">Due: {item.dueDate} • Reason: {item.reason}</p>
                  </div>

                  <span className="text-xl font-bold font-mono text-white">{item.amountFormatted}</span>
                </div>

                {/* Human Reclassification Action Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                  <div className="flex items-center space-x-3 flex-1">
                    <span className="text-xs font-mono text-neutral-400">Assign Category:</span>
                    <select
                      value={selectedCategoryMap[item.id] || ''}
                      onChange={(e) =>
                        setSelectedCategoryMap({
                          ...selectedCategoryMap,
                          [item.id]: e.target.value as PaymentDelayCategory,
                        })
                      }
                      className="px-3 py-1.5 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-[#FF2D2D]"
                    >
                      <option value="">Select Category...</option>
                      {PAYMENT_DELAY_CATEGORIES.filter((c) => c !== 'UNKNOWN').map((cat) => (
                        <option key={cat} value={cat}>
                          {categoryDefinitionsMap.get(cat)?.title} ({cat})
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    disabled={!selectedCategoryMap[item.id]}
                    onClick={() => handleManualReclassify(item.id)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#FF2D2D] hover:bg-[#FF2D2D]/90 disabled:opacity-40 text-white transition flex items-center space-x-2"
                  >
                    <span>Confirm Classification</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAXONOMY REFERENCE DOCUMENTATION SECTION */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-white">Payment-Delay Classification Taxonomy Reference</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {Array.from(categoryDefinitionsMap.values()).map((def) => (
              <div key={def.category} className="p-3 bg-neutral-900 border border-neutral-800 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{def.title}</span>
                  <span className="font-mono text-[10px] text-[#FF2D2D] bg-[#FF2D2D]/10 px-1.5 py-0.5 rounded border border-[#FF2D2D]/30">
                    {def.category}
                  </span>
                </div>
                <p className="text-neutral-400 text-[11px] leading-relaxed">{def.definition}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MainNavShell>
  );
}

export default function NeedsClassificationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050505] text-white p-8 font-mono text-xs">Loading queue...</div>}>
      <NeedsClassificationContent />
    </Suspense>
  );
}
