'use client';

import React, { useEffect, useState } from 'react';

export default function AdminAiTasksPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [validationReport, setValidationReport] = useState<any>(null);
  const [validating, setValidating] = useState(false);

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/observability');
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch observability metrics', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const handleRunValidation = async () => {
    setValidating(true);
    try {
      const res = await fetch('/api/observability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'validate_model',
          candidateModelVersion: 'AIOSpark-O2C-v2.0-Candidate',
        }),
      });
      const json = await res.json();
      if (json.success) {
        setValidationReport(json.report);
      }
    } catch (err) {
      console.error('Failed to run model validation', err);
    } finally {
      setValidating(false);
    }
  };

  if (loading) {
    return <div className="p-8 font-sans text-neutral-400">Loading AIOSpark Observability Console...</div>;
  }

  const { aiQuality, infrastructure } = data || {};
  const summary = aiQuality?.summary || {};
  const categories = Object.keys(summary.category_breakdown || {});

  return (
    <div className="min-h-screen bg-[#050505] p-8 font-sans text-neutral-100 space-y-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* HEADER */}
        <div className="flex justify-between items-center glass-panel p-6 rounded-2xl border border-neutral-800/80 shadow-2xl">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Admin Console — AI Quality & Observability</h1>
            <p className="text-xs text-neutral-400 mt-1">
              Category-level AI classification feedback loop, override rate degradation alerts & infrastructure latency metrics.
            </p>
          </div>
          <button
            onClick={handleRunValidation}
            disabled={validating}
            className="px-4 py-2 bg-[#FF2D2D] hover:bg-[#E02424] text-white text-xs font-semibold rounded-xl shadow-lg transition"
          >
            {validating ? 'Running Gate Validation...' : 'Run Pre-Deployment Gate Test'}
          </button>
        </div>

        {/* ALERTS SECTION */}
        {aiQuality?.activeAlerts?.length > 0 && (
          <div className="bg-red-950/40 border border-red-800/80 p-6 rounded-2xl space-y-4 shadow-[0_0_30px_rgba(239,68,68,0.15)]">
            <h2 className="text-sm font-bold text-red-400 flex items-center space-x-2">
              <span>⚠️</span>
              <span>Active AI-Quality Degradation Alerts ({aiQuality.activeAlerts.length})</span>
            </h2>
            <div className="space-y-3">
              {aiQuality.activeAlerts.map((alert: any, idx: number) => (
                <div key={idx} className="p-4 bg-neutral-900/80 border border-red-900/60 rounded-xl text-xs space-y-1">
                  <div className="flex justify-between font-semibold text-red-300">
                    <span>Category: {alert.category}</span>
                    <span className="font-mono-num">Override Rate: {(alert.override_rate * 100).toFixed(1)}%</span>
                  </div>
                  <p className="text-neutral-300">{alert.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AGGREGATE STATS CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="glass-panel p-6 rounded-2xl border border-neutral-800/80 space-y-2">
            <div className="text-xs text-neutral-400 font-medium">Reviewed AI Outputs</div>
            <div className="text-3xl font-extrabold text-white font-mono-num">{summary.total_reviewed || 0}</div>
            <p className="text-[11px] text-neutral-500">Total human review events</p>
          </div>
          <div className="glass-panel p-6 rounded-2xl border border-neutral-800/80 space-y-2">
            <div className="text-xs text-neutral-400 font-medium">Classification Accuracy (Proxy)</div>
            <div className="text-3xl font-extrabold text-emerald-400 font-mono-num">
              {((summary.overall_accuracy_proxy || 0) * 100).toFixed(1)}%
            </div>
            <p className="text-[11px] text-neutral-500">Approved unmodified</p>
          </div>
          <div className="glass-panel p-6 rounded-2xl border border-neutral-800/80 space-y-2">
            <div className="text-xs text-neutral-400 font-medium">Human Override Rate</div>
            <div className={`text-3xl font-extrabold font-mono-num ${(summary.overall_override_rate || 0) > 0.3 ? 'text-red-400' : 'text-amber-400'}`}>
              {((summary.overall_override_rate || 0) * 100).toFixed(1)}%
            </div>
            <p className="text-[11px] text-neutral-500">Rejected + Modified</p>
          </div>
          <div className="glass-panel p-6 rounded-2xl border border-neutral-800/80 space-y-2">
            <div className="text-xs text-neutral-400 font-medium">Unit Cost (Current Tenant)</div>
            <div className="text-3xl font-extrabold text-indigo-400 font-mono-num">
              ${infrastructure?.unitCost?.total_cost_usd || '1.50'}
            </div>
            <p className="text-[11px] text-neutral-500">AI Tokens + Infra Overhead</p>
          </div>
        </div>

        {/* PRE-DEPLOYMENT VALIDATION REPORT MODAL / CARD */}
        {validationReport && (
          <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">Pre-Deployment Candidate Model Validation Report</h2>
              <span className={`px-3 py-1 text-xs font-bold rounded-full uppercase ${validationReport.gate_passed ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'}`}>
                {validationReport.gate_passed ? 'GATE PASSED' : 'GATE FAILED'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-xs font-mono bg-neutral-950 p-4 rounded-xl border border-neutral-800">
              <div>Candidate: <strong>{validationReport.candidate_model_version}</strong></div>
              <div>Accuracy: <strong>{(validationReport.overall_accuracy * 100).toFixed(1)}%</strong></div>
              <div>Regressions: <strong>{validationReport.regression_count}</strong></div>
            </div>
            <div className="space-y-2 text-xs">
              <h3 className="font-semibold text-neutral-300">Curated Test Results:</h3>
              <div className="space-y-1">
                {validationReport.test_results?.map((tr: any) => (
                  <div key={tr.test_id} className="flex justify-between p-2 rounded bg-neutral-950 font-mono text-[11px]">
                    <span>{tr.name} ({tr.expected_category})</span>
                    <span className={tr.passed ? 'text-emerald-400' : 'text-red-400'}>
                      {tr.passed ? '✓ PASSED' : '✗ REGRESSION'} ({tr.confidence})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CATEGORY BREAKDOWN TABLE */}
        <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 space-y-6">
          <h2 className="text-lg font-bold text-white">Layer 14 Taxonomy Category Breakdown (11 Categories)</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-300">
              <thead className="bg-neutral-950 text-neutral-400 uppercase font-mono border-b border-neutral-800">
                <tr>
                  <th className="p-3">Category</th>
                  <th className="p-3">Reviewed</th>
                  <th className="p-3">Approved</th>
                  <th className="p-3">Rejected</th>
                  <th className="p-3">Modified</th>
                  <th className="p-3">Accuracy (Proxy)</th>
                  <th className="p-3">Override Rate</th>
                  <th className="p-3">False Positive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {categories.map((catKey) => {
                  const m = summary.category_breakdown[catKey];
                  const isHighOverride = m.human_override_rate > 0.3;
                  return (
                    <tr key={catKey} className="hover:bg-neutral-800/40">
                      <td className="p-3 font-semibold text-white">{catKey}</td>
                      <td className="p-3 font-mono">{m.total_reviewed}</td>
                      <td className="p-3 font-mono text-emerald-400">{m.approved_unmodified}</td>
                      <td className="p-3 font-mono text-red-400">{m.rejected}</td>
                      <td className="p-3 font-mono text-amber-400">{m.modified}</td>
                      <td className="p-3 font-mono">{(m.accuracy_proxy * 100).toFixed(1)}%</td>
                      <td className={`p-3 font-mono font-bold ${isHighOverride ? 'text-red-400' : 'text-neutral-300'}`}>
                        {(m.human_override_rate * 100).toFixed(1)}%
                      </td>
                      <td className="p-3 font-mono">{(m.false_positive_rate * 100).toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
