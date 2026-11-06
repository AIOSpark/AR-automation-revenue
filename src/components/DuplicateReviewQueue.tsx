'use client';

import React, { useState } from 'react';
import { Layers, CheckCircle, AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';

interface DuplicateItem {
  id: string;
  incomingInvoice: string;
  customerName: string;
  amount: string;
  confidence: number;
}

export default function DuplicateReviewQueueComponent() {
  const [duplicates, setDuplicates] = useState<DuplicateItem[]>([
    {
      id: 'dup_1',
      incomingInvoice: 'INV-999',
      customerName: 'Acme Corp',
      amount: '₹1,200.00',
      confidence: 0.85,
    },
  ]);

  const handleAction = (id: string, action: 'merge' | 'reject') => {
    setDuplicates((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-amber-950/50 text-amber-400 border border-amber-800 rounded-lg">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Possible Duplicates Review Queue</h3>
            <p className="text-xs text-neutral-400">Review near-match records flagged by the import pipeline deduplication pass.</p>
          </div>
        </div>
        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-950/40 text-amber-400 border border-amber-800">
          {duplicates.length} Pending Review
        </span>
      </div>

      {duplicates.length === 0 ? (
        <div className="p-6 text-center text-xs text-neutral-500 bg-neutral-900/50 rounded-lg border border-neutral-800">
          <ShieldCheck className="w-6 h-6 mx-auto mb-2 text-emerald-500" />
          No pending ambiguous duplicate records in queue.
        </div>
      ) : (
        <div className="space-y-3">
          {duplicates.map((item) => (
            <div
              key={item.id}
              className="p-4 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-between"
            >
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-white">{item.customerName}</span>
                  <span className="text-xs text-neutral-400">({item.incomingInvoice})</span>
                  <span className="text-xs font-mono text-[#FF2D2D] bg-[#FF2D2D]/10 px-2 py-0.5 rounded border border-[#FF2D2D]/30">
                    {item.amount}
                  </span>
                </div>
                <div className="text-xs text-amber-400 mt-1 flex items-center space-x-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{Math.round(item.confidence * 100)}% match confidence with existing invoice</span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleAction(item.id, 'reject')}
                  className="px-3 py-1.5 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition"
                >
                  Create New Record
                </button>
                <button
                  onClick={() => handleAction(item.id, 'merge')}
                  className="px-3 py-1.5 text-xs rounded bg-[#FF2D2D] hover:bg-[#FF2D2D]/90 text-white font-medium transition flex items-center space-x-1"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Merge (Update)</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
