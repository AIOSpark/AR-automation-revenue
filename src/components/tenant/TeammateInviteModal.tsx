"use client";

import { useState } from "react";
import { UserPlus, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { Role } from "@/lib/tenant/permissions";

interface TeammateInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function TeammateInviteModal({ isOpen, onClose, onSuccess }: TeammateInviteModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("Finance Executive");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/tenant/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send teammate invite");
      }

      setSuccessMsg(`Invite successfully sent to ${email} as ${role}`);
      setEmail("");
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050505]/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white text-base font-medium transition-colors"
        >
          ✕
        </button>

        <div className="flex items-center gap-2 mb-2">
          <span className="p-1.5 rounded-lg bg-[#FF2D2D]/10 text-[#FF2D2D] border border-[#FF2D2D]/20">
            <UserPlus className="w-4 h-4" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-[#FF2D2D]">
            Teammate Access Invite
          </span>
        </div>

        <h3 className="text-2xl font-bold text-white mb-2">
          Invite Teammate to Workspace
        </h3>
        <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
          Invite a colleague with role-based access control. They will complete Layer 2 registration upon accepting.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/50 border border-[#FF2D2D]/50 text-red-200 text-xs flex items-center gap-2 font-mono">
            <AlertTriangle className="w-4 h-4 text-[#FF2D2D] shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/50 text-emerald-200 text-xs flex items-center gap-2 font-mono">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
              Teammate Work Email <span className="text-[#FF2D2D]">*</span>
            </label>
            <input
              type="email"
              required
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
              Assigned Role <span className="text-[#FF2D2D]">*</span>
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all cursor-pointer font-sans"
            >
              <option value="Admin">Admin — Full operational access</option>
              <option value="Finance Manager">Finance Manager — Ledger write & action approvals</option>
              <option value="Finance Executive">Finance Executive — Ledger write, no approvals</option>
              <option value="Viewer">Viewer — Read-only access</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-white bg-[#FF2D2D] hover:bg-[#e02424] transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-[#FF2D2D]/20 active:scale-95"
          >
            {loading ? (
              <span>Sending Invite...</span>
            ) : (
              <>
                <span>Send Teammate Invite</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
