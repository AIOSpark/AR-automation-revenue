'use client';

import React, { useEffect, useState } from 'react';

export default function AdminBetaTrackerPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [selectedOrg, setSelectedOrg] = useState<string>('org_beta_acme');
  const [notesInput, setNotesInput] = useState('');
  const [issueTitle, setIssueTitle] = useState('');
  const [affectedLayer, setAffectedLayer] = useState('Layer 7 — Data Adapter');
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const fetchBetaData = async () => {
    try {
      const res = await fetch(`/api/admin/beta?organizationId=${selectedOrg}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch beta metrics', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBetaData();
  }, [selectedOrg]);

  const handleRecordCheckIn = async () => {
    if (!notesInput) return;
    setActionMsg('Saving weekly check-in log...');
    try {
      const issues = issueTitle ? [{ title: issueTitle, affected_layer: affectedLayer }] : [];
      const res = await fetch('/api/admin/beta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record_checkin',
          organizationId: selectedOrg,
          weekStartDate: '2026-03-02',
          notes: notesInput,
          issuesRaised: issues,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionMsg('Recorded weekly check-in successfully!');
        setNotesInput('');
        setIssueTitle('');
        fetchBetaData();
      }
    } catch (err: any) {
      setActionMsg(`Failed: ${err.message}`);
    }
  };

  const handleConvertTask = async (checkInLogId: string, issueId: string) => {
    setActionMsg('Converting issue to engineering task...');
    try {
      const res = await fetch('/api/admin/beta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'convert_issue_to_task',
          organizationId: selectedOrg,
          checkInLogId,
          issueId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionMsg(`Successfully converted to Task ${json.task.id}!`);
        fetchBetaData();
      }
    } catch (err: any) {
      setActionMsg(`Conversion failed: ${err.message}`);
    }
  };

  const handleTagClassification = async (isCorrect: boolean) => {
    setActionMsg('Tagging classification result...');
    try {
      const res = await fetch('/api/admin/beta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'tag_classification',
          organizationId: selectedOrg,
          weekStartDate: '2026-03-02',
          exceptionId: `exp_${Date.now()}`,
          isCorrect,
          notes: isCorrect ? 'Verified correct by human review' : 'Incorrect classification flagged by human review',
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionMsg(`Logged classification tag: ${isCorrect ? '✓ Correct' : '✗ AI Error'}`);
        fetchBetaData();
      }
    } catch (err: any) {
      setActionMsg(`Failed to tag: ${err.message}`);
    }
  };

  if (loading) {
    return <div className="p-8 font-sans text-neutral-400">Loading Beta Metrics Tracker...</div>;
  }

  const { snapshots, checkInLogs, engineeringTasks, humanTags } = data || {};
  const currentSnap = snapshots?.[snapshots.length - 1] || {};

  return (
    <div className="min-h-screen bg-[#050505] p-6 md:p-8 font-sans text-neutral-100 space-y-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-6 rounded-2xl border border-neutral-800/80 shadow-2xl">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Admin Console — Private Beta Metrics Tracker</h1>
            <p className="text-xs text-neutral-400 mt-1">
              Weekly quantitative performance tracking across beta organizations, cash unlocked attribution, and engineering feedback loops.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <label className="text-xs text-neutral-400 font-medium">Beta Org:</label>
            <select
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 text-xs text-white rounded-xl px-3 py-2 focus:outline-none focus:border-[#FF2D2D]/60 transition"
            >
              <option value="org_beta_acme">Acme Enterprises (Tally ERP)</option>
              <option value="org_beta_tata">TATA Retail (Zoho ERP)</option>
              <option value="org_beta_reliance">Reliance Logistics (CSV Only)</option>
            </select>
          </div>
        </div>

        {actionMsg && (
          <div className="p-4 glass-panel border border-[#FF2D2D]/30 text-white text-xs font-mono rounded-2xl shadow-xl">
            {actionMsg}
          </div>
        )}

        {/* METRICS CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="glass-panel p-6 rounded-2xl border border-neutral-800/80 space-y-2 shadow-2xl">
            <div className="text-xs text-neutral-400 font-medium">Invoices Processed</div>
            <div className="text-3xl font-extrabold text-white font-mono-num">{currentSnap.invoices_processed_cumulative || 0}</div>
            <p className="text-[11px] text-emerald-400 font-mono-num">+{currentSnap.invoices_processed_week_delta || 0} this week</p>
          </div>
          <div className="glass-panel p-6 rounded-2xl border border-neutral-800/80 space-y-2 shadow-2xl">
            <div className="text-xs text-neutral-400 font-medium">Attributed Cash Unlocked</div>
            <div className="text-3xl font-extrabold text-emerald-400 font-mono-num">
              ₹{((currentSnap.cash_unlocked_amount_minor_units || 0) / 100).toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-neutral-500 font-mono">14-Day AI Action Attribution (Est.)</p>
          </div>
          <div className="glass-panel p-6 rounded-2xl border border-neutral-800/80 space-y-2 shadow-2xl">
            <div className="text-xs text-neutral-400 font-medium">Estimated Time Saved</div>
            <div className="text-3xl font-extrabold text-indigo-400 font-mono-num">{currentSnap.time_saved_hours_estimate || 0} hrs</div>
            <p className="text-[11px] text-neutral-500">0.5h per resolved exception</p>
          </div>
          <div className="glass-panel p-6 rounded-2xl border border-neutral-800/80 space-y-2 shadow-2xl">
            <div className="text-xs text-neutral-400 font-medium">Collection Effectiveness Delta</div>
            <div className="text-3xl font-extrabold text-emerald-400 font-mono-num">
              +{currentSnap.collection_effectiveness_delta || 0}%
            </div>
            <p className="text-[11px] text-neutral-500">vs Pre-Beta Baseline</p>
          </div>
        </div>

        {/* HUMAN CLASSIFICATION TAGGING UI */}
        <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-white">Human Classification Quality Review</h2>
              <p className="text-xs text-neutral-400">Periodic human confirmation of AI taxonomy accuracy (Deliberate Value Validation)</p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => handleTagClassification(true)}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-xl shadow"
              >
                Tag Sample as Correct (✓)
              </button>
              <button
                onClick={() => handleTagClassification(false)}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold rounded-xl shadow"
              >
                Tag Sample as AI Error (✗)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-xs font-mono bg-neutral-950 p-4 rounded-xl border border-neutral-800">
            <div>Human Tagged Samples: <strong>{currentSnap.issues_reviewed_count || 0}</strong></div>
            <div>Confirmed Correct: <strong>{currentSnap.issues_correctly_classified || 0}</strong></div>
            <div>Explicit AI Mistakes: <strong className="text-red-400">{currentSnap.ai_error_count || 0}</strong></div>
          </div>
        </div>

        {/* WEEKLY CHECK-IN LOG & ENGINEERING FEEDBACK PATHWAY */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* LOG CHECK-IN FORM */}
          <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 space-y-4">
            <h2 className="text-lg font-bold text-white">Record Weekly Check-In Call</h2>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-neutral-400 mb-1">Check-in Notes / Feedback</label>
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Notes from customer call..."
                  rows={3}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">Specific Issue Raised (Optional)</label>
                <input
                  type="text"
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  placeholder="e.g. Date parsing error on Tally export"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-2.5 text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">Affected Layer</label>
                <select
                  value={affectedLayer}
                  onChange={(e) => setAffectedLayer(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-2.5 text-white focus:outline-none"
                >
                  <option value="Layer 5 — ERP Integrations">Layer 5 — ERP Integrations</option>
                  <option value="Layer 7 — CSV Importer">Layer 7 — CSV Importer</option>
                  <option value="Layer 14 — Classification Taxonomy">Layer 14 — Classification Taxonomy</option>
                  <option value="Layer 15 — Exception Detection">Layer 15 — Exception Detection</option>
                  <option value="Layer 18 — Human Approvals">Layer 18 — Human Approvals</option>
                  <option value="Layer 27 — Billing Engine">Layer 27 — Billing Engine</option>
                </select>
              </div>
              <button
                onClick={handleRecordCheckIn}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow transition"
              >
                Record Weekly Check-In Log
              </button>
            </div>
          </div>

          {/* CHECK-IN LOGS & ENGINEERING CONVERTER LIST */}
          <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 space-y-4">
            <h2 className="text-lg font-bold text-white">Check-In Logs & Engineering Conversion</h2>

            <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
              {checkInLogs?.map((log: any) => (
                <div key={log.id} className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl text-xs space-y-2">
                  <div className="flex justify-between text-neutral-400 font-mono">
                    <span>Week: {log.week_start_date}</span>
                    <span>Logged by: {log.logged_by_user_id}</span>
                  </div>
                  <p className="text-neutral-200">{log.notes}</p>
                  {log.issues_raised?.map((iss: any) => (
                    <div key={iss.id} className="flex justify-between items-center p-2 bg-neutral-900 rounded border border-neutral-800">
                      <div>
                        <span className="font-semibold text-white">{iss.title}</span>
                        <div className="text-[10px] text-neutral-500">{iss.affected_layer}</div>
                      </div>
                      {iss.converted_to_task ? (
                        <span className="text-[10px] text-emerald-400 font-mono font-bold">✓ Task {iss.engineering_task_id}</span>
                      ) : (
                        <button
                          onClick={() => handleConvertTask(log.id, iss.id)}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded"
                        >
                          Feed Back to Eng
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* TRACKED ENGINEERING TASKS FROM BETA */}
        <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 space-y-4">
          <h2 className="text-lg font-bold text-white">Tracked Engineering Tasks from Beta Feedback</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {engineeringTasks?.map((task: any) => (
              <div key={task.id} className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl space-y-2">
                <div className="font-bold text-indigo-400">{task.title}</div>
                <p className="text-neutral-400 text-[11px]">{task.description}</p>
                <div className="flex justify-between text-[10px] font-mono text-neutral-500">
                  <span>Status: {task.status.toUpperCase()}</span>
                  <span>{new Date(task.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
