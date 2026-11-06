'use client';

import React, { useEffect, useState } from 'react';
import type {
  CashUnblockSimulationResult, 
  ScenarioOption,
} from '@/lib/intelligence/cash-unblock-simulator';
import { SignalRail } from '@/components/system/SignalLine';
import { CausalGraph } from '@/components/system/CausalGraph';

interface CashUnblockSimulatorModalProps {
  invoiceId: string;
  orgId?: string;
  isOpen: boolean;
  onClose: () => void;
  onExecuteAction?: (actionType: string, invoiceId: string) => void;
}

export function CashUnblockSimulatorModal({
  invoiceId,
  orgId,
  isOpen,
  onClose,
  onExecuteAction,
}: CashUnblockSimulatorModalProps) {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);
  const [simulation, setSimulation] = useState<CashUnblockSimulationResult | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSimulation(null);
    fetch('/api/cash-unblock/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId, orgId, selectedActionType: selectedScenarioId || undefined }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setSimulation(json?.simulation ?? null))
      .catch(() => setSimulation(null));
  }, [invoiceId, orgId, selectedScenarioId, isOpen]);

  if (!isOpen) return null;

  if (!simulation) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="workstation-dialog-panel bg-[#0D111C] border border-[#1E293B] rounded-xl max-w-md w-full p-6 text-center space-y-4">
          <h3 className="text-sm font-mono font-bold text-white uppercase">SIMULATION UNAVAILABLE</h3>
          <p className="text-xs text-neutral-400">Not enough connected O2C information exists for invoice {invoiceId} to model this scenario reliably.</p>
          <button onClick={onClose} className="px-4 py-1.5 rounded bg-neutral-800 text-white font-mono text-xs">CLOSE</button>
        </div>
      </div>
    );
  }

  const activeScenario: ScenarioOption = simulation.activeScenario;
  const formattedActualOutstanding = `₹${(simulation.actualOutstandingMinorUnits / 100).toLocaleString('en-IN')}`;
  const formattedPotentialUnblocked = `₹${(activeScenario.potentiallyUnblockedMinorUnits / 100).toLocaleString('en-IN')}`;

  const handleExecuteConfirmed = () => {
    setShowExitConfirmModal(false);
    onClose();
    if (onExecuteAction) {
      onExecuteAction(activeScenario.actionType, invoiceId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="workstation-dialog-panel bg-[#080B11] border border-[#1E283D] rounded-xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl text-xs text-neutral-300 font-sans overflow-hidden">
        
        {/* HEADER BAR */}
        <div className="p-4 bg-[#0E1320] border-b border-[#1E283D] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <SignalRail status="active" thickness={4} className="h-7" />
            <div>
              <div className="flex items-center gap-2 font-mono text-[10px]">
                <span className="text-cyan-400 font-bold uppercase tracking-widest">CASH UNBLOCK SIMULATOR</span>
                <span className="text-neutral-500">|</span>
                <span className="text-amber-400 font-bold uppercase bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                  SCENARIO MODE (READ-ONLY)
                </span>
              </div>
              <h2 className="text-base font-mono font-bold text-white tracking-tight">
                Case: {simulation.customerName} <span className="text-neutral-400 font-normal">({simulation.invoiceNumber})</span>
              </h2>
            </div>
          </div>

          <button onClick={onClose} className="text-neutral-400 hover:text-white text-lg p-1">✕</button>
        </div>

        {/* DISCLAIMER STRIP */}
        <div className="bg-[#121826] border-b border-[#1E283D] px-4 py-2 flex items-center justify-between text-[11px] font-mono shrink-0">
          <span className="text-neutral-400">
            ⚠️ <strong>DISCLAIMER:</strong> {simulation.disclaimer}
          </span>
          <span className="text-neutral-500 hidden sm:inline">DATA STATE: {new Date(simulation.dataFreshnessTimestamp).toLocaleTimeString()}</span>
        </div>

        {/* DATA CONFLICT ALERT (IF ANY) */}
        {simulation.hasDataConflict && (
          <div className="bg-amber-950/30 border-b border-amber-500/40 px-4 py-2 text-amber-300 font-mono text-[11px] flex items-center gap-2 shrink-0">
            <span>🚨 <strong>DATA CONFLICT DETECTED:</strong> {simulation.dataConflictNote}</span>
          </div>
        )}

        {/* MAIN SIMULATOR BODY */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          
          {/* TOP COMPARISON BAR: ACTUAL vs SCENARIO */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ACTUAL BASELINE */}
            <div className="p-4 rounded-lg bg-[#0E1320] border border-[#1E283D] space-y-3">
              <div className="flex justify-between items-center border-b border-[#1A2336] pb-2 font-mono">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-neutral-400 inline-block" />
                  1. ACTUAL BASELINE
                </span>
                <span className="text-[10px] text-neutral-400 uppercase bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700">
                  REAL ERP FACTS
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-neutral-500 uppercase block">ACTUAL OUTSTANDING</span>
                  <span className="text-base font-bold text-white">{formattedActualOutstanding}</span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 uppercase block font-semibold">PRIMARY BLOCKER</span>
                  <span className="text-xs font-bold text-rose-400 block mt-0.5">{simulation.actualPrimaryBlocker}</span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 uppercase block font-semibold">DEPENDENCY</span>
                  <span className="text-xs text-neutral-300 block">{simulation.actualDependency}</span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 uppercase block font-semibold">STATUS</span>
                  <span className="text-xs text-amber-400 font-bold block">{simulation.actualStatus}</span>
                </div>
              </div>
            </div>

            {/* HYPOTHETICAL SCENARIO RESULT */}
            <div className="p-4 rounded-lg bg-[#0A1224] border border-cyan-500/40 space-y-3 shadow-lg relative overflow-hidden">
              <div className="flex justify-between items-center border-b border-cyan-500/30 pb-2 font-mono">
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse inline-block" />
                  2. HYPOTHETICAL SCENARIO IMPACT
                </span>
                <span className="text-[10px] text-cyan-300 font-bold uppercase bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/40">
                  SCENARIO ONLY (UNCOMMITTED)
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-neutral-400 uppercase block">POTENTIALLY UNBLOCKED</span>
                  <span className="text-base font-bold text-emerald-400">{formattedPotentialUnblocked}</span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-400 uppercase block font-semibold">POTENTIAL NEW STATE</span>
                  <span className="text-xs font-bold text-cyan-300 block">{activeScenario.potentialNewState}</span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-400 uppercase block font-semibold">REMAINING DEPENDENCY</span>
                  <span className="text-xs text-amber-300 font-bold block">{activeScenario.remainingDependency}</span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-400 uppercase block font-semibold">STRUCTURAL CONFIDENCE</span>
                  <span className="text-xs text-white font-bold block">{activeScenario.confidence}</span>
                </div>
              </div>
            </div>
          </div>

          {/* SCENARIO SELECTOR TAB STRIP */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <SignalRail status="active" thickness={3} className="h-3.5" />
              3. SELECT ACTION TO SIMULATE
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
              {simulation.scenarios.map((scen) => {
                const isSelected = scen.id === activeScenario.id;
                return (
                  <button
                    key={scen.id}
                    onClick={() => setSelectedScenarioId(scen.id)}
                    className={`p-3.5 rounded-lg border text-left transition relative cursor-pointer ${
                      isSelected
                        ? 'bg-[#0E172A] border-cyan-500 text-white shadow-md'
                        : 'bg-[#0E1320] border-[#1E283D] text-neutral-400 hover:border-neutral-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs flex items-center gap-2 text-white">
                        {scen.actionLabel}
                        {scen.isRecommended && (
                          <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-1.5 py-0.5 rounded">
                            RECOMMENDED BY AIOSPARK
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-neutral-500">({scen.ownerTeam})</span>
                    </div>

                    <p className="text-[11px] font-sans text-neutral-300 line-clamp-2">{scen.description}</p>

                    {scen.whyNotPreferredReason && (
                      <div className="mt-2 text-[10px] text-amber-400/90 font-mono bg-amber-950/30 p-1.5 rounded border border-amber-500/20">
                        ⚠️ Not Preferred: {scen.whyNotPreferredReason}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* CAUSAL DIAGRAM IN SCENARIO MODE */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              4. HYPOTHETICAL O2C CAUSAL PATH (SCENARIO MODE)
            </h3>
            <CausalGraph 
              title={`SCENARIO PATH: ${activeScenario.actionLabel.toUpperCase()}`}
              nodes={activeScenario.scenarioNodes.map(n => ({
                id: n.id,
                type: (n.type === 'ACTION' ? 'BLOCKER' : (n.type === 'CUSTOMER' ? 'CUSTOMER' : (n.type === 'PO' ? 'PO' : (n.type === 'INVOICE' ? 'INVOICE' : 'OUTCOME')))),
                label: n.label,
                sublabel: n.sublabel,
                amount: n.amount,
                status: n.status,
                isBlocker: n.isBlocker || n.isScenarioHypothetical,
              }))}
            />
          </div>

          {/* ASSUMPTIONS & RISKS SECTION */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans text-xs">
            {/* ASSUMPTIONS */}
            <div className="p-4 rounded-lg bg-[#0E1320] border border-[#1E283D] space-y-3">
              <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider">5. SCENARIO ASSUMPTIONS</h4>
              <div className="space-y-2">
                {activeScenario.assumptions.map((asm) => (
                  <div key={asm.id} className="p-2.5 rounded bg-[#080B11] border border-[#182236] space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between items-center">
                      <span className="text-neutral-200 font-medium font-sans">{asm.label}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                        asm.status === 'SUPPORTED' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-amber-950 text-amber-400 border-amber-800'
                      }`}>
                        {asm.status}
                      </span>
                    </div>
                    {asm.riskNote && <div className="text-[10px] text-neutral-500">Note: {asm.riskNote}</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* RISKS & UNCERTAINTIES */}
            <div className="p-4 rounded-lg bg-[#0E1320] border border-[#1E283D] space-y-3">
              <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider">6. RISKS & UNCERTAINTIES</h4>
              <div className="space-y-2 text-[11px]">
                <div className="p-2.5 rounded bg-[#080B11] border border-[#182236] text-neutral-300">
                  • <strong>Payment Timing:</strong> Payment receipt remains uncommitted and dependent on buyer AP disbursement runs.
                </div>
                <div className="p-2.5 rounded bg-[#080B11] border border-[#182236] text-neutral-300">
                  • <strong>Secondary Blockers:</strong> Resolving {simulation.actualPrimaryBlocker} does not prevent buyer from raising secondary pricing or delivery disputes later.
                </div>
                <div className="p-2.5 rounded bg-[#080B11] border border-[#182236] text-neutral-300">
                  • <strong>Accounting Integrity:</strong> Running this simulation has <strong>zero effect</strong> on actual ledger balances.
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="p-4 bg-[#0E1320] border-t border-[#1E283D] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            onClick={() => setSelectedScenarioId(null)}
            className="px-3 py-1.5 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 font-mono text-xs"
          >
            RESET SCENARIO
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-[#141C2E] text-neutral-300 hover:text-white font-mono text-xs border border-neutral-700"
            >
              RETURN TO CASE
            </button>

            <button
              onClick={() => setShowExitConfirmModal(true)}
              className="px-5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs shadow-md transition"
            >
              [EXECUTE SCENARIO ACTION]
            </button>
          </div>
        </div>
      </div>

      {/* CONFIRMATION BEFORE LEAVING SCENARIO MODE TO EXECUTE */}
      {showExitConfirmModal && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="workstation-dialog-panel bg-[#0D111C] border border-[#1E293B] rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl text-xs font-sans">
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <SignalRail status="critical" thickness={3} className="h-4" />
              LEAVING SCENARIO MODE
            </h3>

            <p className="text-neutral-300 leading-relaxed">
              You are leaving <strong>Scenario Mode (Read-Only)</strong>. The following real, auditable action will be dispatched through the backend workflow:
            </p>

            <div className="p-3 bg-[#080B11] rounded border border-[#182236] font-mono text-xs text-emerald-400 font-bold">
              Action: {activeScenario.actionLabel}
            </div>

            <p className="text-[11px] text-neutral-400">
              State freshness will be verified and RBAC policy permissions applied before execution.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowExitConfirmModal(false)}
                className="px-3 py-1.5 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 font-mono text-xs"
              >
                CANCEL
              </button>
              <button
                onClick={handleExecuteConfirmed}
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs"
              >
                CONFIRM & DISPATCH REAL ACTION
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
