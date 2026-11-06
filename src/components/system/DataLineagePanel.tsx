"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Database, FileText, ShieldCheck } from "lucide-react";

type LineageData = {
  entityType: string;
  sourceSystem?: string | null;
  sourceId?: string | null;
  importBatchId?: string | null;
  sourceFileName?: string | null;
  sourceSheetName?: string | null;
  sourceRowNumber?: number | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

interface DataLineagePanelProps {
  entityType: string;
  entityId: string;
}

function display(value?: string | number | null): string {
  return value === undefined || value === null || value === "" ? "Not recorded" : String(value);
}

export function DataLineagePanel({ entityType, entityId }: DataLineagePanelProps) {
  const [data, setData] = useState<LineageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entityId) return;
    const controller = new AbortController();

    const loadLineage = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/data-lineage/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`, {
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load record lineage.");
        }
        setData(payload.data || null);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load record lineage.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadLineage();
    return () => controller.abort();
  }, [entityId, entityType]);

  return (
    <section className="workstation-card border border-white/[0.08] rounded-xl p-5 space-y-4" aria-labelledby={`${entityType}-lineage-title`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-2 text-emerald-400" aria-hidden="true">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <h2 id={`${entityType}-lineage-title`} className="text-sm font-semibold text-white">Source &amp; audit trail</h2>
            <p className="mt-1 text-xs leading-relaxed text-neutral-400">Trace this record back to the ledger source used by AIOSpark.</p>
          </div>
        </div>
        {!loading && !error && data && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Verified origin
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Loading source lineage">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-12 animate-pulse rounded-lg bg-white/[0.04]" />)}
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500"><Database className="h-3 w-3" aria-hidden="true" /> Source system</div>
            <div className="font-medium text-white">{display(data.sourceSystem)}</div>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Source record</div>
            <div className="break-all font-mono text-neutral-200">{display(data.sourceId)}</div>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500"><FileText className="h-3 w-3" aria-hidden="true" /> Import source</div>
            <div className="truncate font-medium text-neutral-200" title={display(data.sourceFileName)}>{display(data.sourceFileName)}</div>
            <div className="mt-1 text-[11px] text-neutral-500">{data.sourceSheetName ? `${data.sourceSheetName} · ` : ""}Row {display(data.sourceRowNumber)}</div>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Import batch</div>
            <div className="break-all font-mono text-neutral-200">{display(data.importBatchId)}</div>
            <div className="mt-1 text-[11px] text-neutral-500">Created by {display(data.createdBy)}</div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-neutral-400">No provenance metadata has been recorded for this record.</div>
      )}
    </section>
  );
}
