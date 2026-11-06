"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  X,
  Minus,
  Send,
  RotateCw,
  Copy,
  Check,
  ChevronRight,
  ExternalLink,
  Mail,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Bot,
  Activity,
  User,
  Zap,
} from "lucide-react";

interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  action?: string;
  actionLabel?: string;
  actionPayload?: any;
  actionExecuted?: boolean;
  data?: any;
}

export function WorkstationCopilotAvatar() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [executedActions, setExecutedActions] = useState<Record<string, boolean>>({});
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);
  const [hasPromptedBadge, setHasPromptedBadge] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState("Workspace context");
  const [liveContext, setLiveContext] = useState<{ overdue: string; dso: string; exceptions: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const initialGreeting: Message = {
    id: "welcome-1",
    sender: "assistant",
    text: "Hello! I'm **Spark**, your AR Workstation Copilot.\n\nI can inspect your tenant's receivables, explain blockers, draft reviewable communications, and prepare approval requests for high-impact actions.\n\nWhat would you like to investigate?",
    timestamp: "Just now",
  };

  const [messages, setMessages] = useState<Message[]>([initialGreeting]);

  useEffect(() => {
    const loadWorkspaceContext = async () => {
      try {
        const meRes = await fetch("/api/auth/me");
        if (!meRes.ok) return;
        const meData = await meRes.json();
        const activeOrganizationId = meData.organization?.id;
        if (!activeOrganizationId) return;

        setOrganizationId(activeOrganizationId);
        setOrganizationName(meData.organization.name || "Active workspace");

        const metricsRes = await fetch(`/api/cfo/overview?organizationId=${encodeURIComponent(activeOrganizationId)}`);
        if (!metricsRes.ok) return;
        const metrics = await metricsRes.json();
        setLiveContext({
          overdue: formatCurrency(metrics.overdueMinorUnits || 0),
          dso: `${metrics.dsoDays || 0}d`,
          exceptions: Number(metrics.actionableExceptionCount || metrics.actionableExceptions?.length || 0),
        });
      } catch {
        // Keep the Copilot usable for navigation and retryable queries if telemetry is unavailable.
      }
    };

    loadWorkspaceContext();
  }, []);

  // Keyboard shortcut ⌘J / Ctrl+J
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape" && isOpen) setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !isMinimized) inputRef.current?.focus();
  }, [isOpen, isMinimized]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: query.trim(),
          history: messages.slice(-4),
          organizationId,
          currentPath: window.location.pathname,
        }),
      });

      const data = await res.json();
      if (data.success && data.response) {
        const assistantMsg: Message = {
          id: `assistant-${Date.now()}`,
          sender: "assistant",
          text: data.response.text,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          action: data.response.action,
          actionLabel: data.response.actionLabel,
          actionPayload: data.response.actionPayload,
          data: data.response.data,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        throw new Error(data.error || "Failed to get response");
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "assistant",
          text: `I encountered an operational issue: ${err.message || "Connection timeout"}. Let me know if you would like me to retry.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteAction = async (msgId: string, actionType: string, payload?: any) => {
    if (actionType === "NAVIGATE" && payload?.path) {
      router.push(payload.path);
      setIsOpen(false);
      return;
    }

    setExecutingActionId(msgId);
    try {
      const res = await fetch("/api/copilot/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType,
          payload,
          organizationId,
          idempotencyKey: `copilot-action:${msgId}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Approval request could not be created");

      setExecutedActions((prev) => ({ ...prev, [msgId]: true }));
      setMessages((prev) => [
        ...prev,
        {
          id: `confirm-${Date.now()}`,
          sender: "assistant",
          text: `✓ **Approval request created** for **${organizationName}**.\n\nThe action is pending controller review. Request ID: **${data.request.id}**. No external communication or invoice change has been dispatched yet.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `action-error-${Date.now()}`,
          sender: "assistant",
          text: `I couldn't create the approval request. ${error.message || "Please try again or open Approvals."}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setExecutingActionId(null);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleReset = () => {
    setMessages([initialGreeting]);
    setExecutedActions({});
  };

  const quickPrompts = [
    { label: "Why is cash stuck?", query: "Why is cash stuck? Break down the root causes" },
    { label: "Investigate Nexus Retail", query: "Investigate top bottleneck Nexus Retail INV-8841" },
    { label: "Draft dunning email", query: "Draft dunning email for Apex Logistics" },
    { label: "Simulate cash recovery", query: "Simulate cash recovery next 14 days" },
    { label: "Audit approvals", query: "Audit pending controller approvals" },
  ];

  return (
    <>
      {/* 1. FLOATING AVATAR TRIGGER (Bottom-right) */}
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3">
        {/* Helper Speech Prompt (Fades out once opened) */}
        {!isOpen && hasPromptedBadge && (
          <div
            onClick={() => {
              setIsOpen(true);
              setHasPromptedBadge(false);
            }}
            className="copilot-helper hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#12141A]/95 border border-white/10 shadow-xl backdrop-blur-md text-xs text-neutral-200 cursor-pointer hover:border-red-500/40 hover:text-white transition-all group"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Ask Spark Copilot</span>
            <kbd className="copilot-shortcut text-[10px] font-mono text-neutral-400 bg-black/40 px-1 py-0.5 rounded border border-white/10">⌘J</kbd>
            <span
              onClick={(e) => {
                e.stopPropagation();
                setHasPromptedBadge(false);
              }}
              className="text-neutral-500 hover:text-white ml-1 p-0.5"
            >
              ×
            </span>
          </div>
        )}

        {/* Tactile Avatar Disc */}
        <button
          onClick={() => {
            setIsOpen((prev) => !prev);
            setHasPromptedBadge(false);
          }}
          className={`copilot-trigger relative group w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3B30] ${
            isOpen
              ? "bg-[#FF3B30] text-white shadow-[0_0_25px_rgba(255,59,48,0.5)] rotate-90"
              : "bg-[#12141A] text-white border border-[#FF3B30]/40 shadow-[0_10px_35px_rgba(255,59,48,0.35)] hover:border-[#FF3B30] hover:scale-105 active:scale-95"
          }`}
          aria-label={isOpen ? "Close AI Copilot" : "Open AI Copilot"}
          title="Open Spark AR Copilot (⌘J)"
        >
          {/* Animated Glow Aura */}
          {!isOpen && (
            <span className="absolute inset-0 rounded-full bg-[#FF3B30]/20 animate-ping pointer-events-none" />
          )}

          {isOpen ? (
            <X className="w-6 h-6 transition-transform" />
          ) : (
            <div className="relative flex items-center justify-center">
              {/* Avatar Face Graphic */}
              <div className="copilot-face relative w-8 h-8 rounded-full bg-gradient-to-tr from-[#1E222D] to-[#12141A] border border-white/20 flex items-center justify-center shadow-inner">
                {/* Hologram Spark Visor */}
                <div className="w-4 h-4 rounded-full bg-[#FF3B30] flex items-center justify-center shadow-[0_0_12px_#FF3B30]">
                  <Sparkles className="w-2.5 h-2.5 text-white" />
                </div>
              </div>

              {/* Status Indicator */}
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-[#12141A] flex items-center justify-center shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              </span>

              {/* Exception notification chip */}
              <span className="absolute -bottom-1 -left-1 px-1.5 py-0.2 rounded-full bg-[#FF3B30] text-white text-[9px] font-bold font-mono shadow-sm">
                18
              </span>
            </div>
          )}
        </button>
      </div>

      {/* 2. COPILOT WORKSTATION WINDOW */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="spark-copilot-title"
          className={`copilot-panel fixed bottom-24 right-4 sm:right-6 z-50 w-[min(440px,calc(100vw-2rem))] rounded-2xl bg-[#0E1017]/98 border border-white/15 shadow-[0_25px_70px_rgba(0,0,0,0.95)] backdrop-blur-2xl flex flex-col overflow-hidden transition-all duration-300 font-sans ${
            isMinimized ? "h-16" : "h-[620px] max-h-[85vh]"
          }`}
        >
          {/* A. WORKSTATION CHROME HEADER */}
          <div className="copilot-header px-4 py-3 bg-[#141620] border-b border-white/[0.08] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              {/* Avatar Icon */}
              <div className="relative w-8 h-8 rounded-full bg-gradient-to-tr from-[#1E222D] to-[#12141A] border border-[#FF3B30]/40 flex items-center justify-center shadow-md">
                <div className="w-4 h-4 rounded-full bg-[#FF3B30] flex items-center justify-center shadow-[0_0_10px_#FF3B30]">
                  <Sparkles className="w-2.5 h-2.5 text-white animate-pulse" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-[#141620]" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span id="spark-copilot-title" className="text-xs font-bold text-white tracking-wide">Spark AI Copilot</span>
                  <span className="text-[9px] font-mono font-semibold text-[#FF3B30] bg-[#FF3B30]/10 px-1.5 py-0.2 rounded border border-[#FF3B30]/20">
                    O2C Agent
                  </span>
                </div>
                <div className="text-[10px] font-mono text-neutral-400 mt-0.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>{liveContext ? `Telemetry synced • ${organizationName}` : "Connecting to workspace telemetry…"}</span>
                </div>
              </div>
            </div>

            {/* Window Controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={handleReset}
                title="Reset conversation"
                aria-label="Reset Copilot conversation"
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setIsMinimized((prev) => !prev)}
                title={isMinimized ? "Expand" : "Minimize"}
                aria-label={isMinimized ? "Expand Copilot" : "Minimize Copilot"}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setIsOpen(false)}
                title="Close"
                aria-label="Close Copilot"
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* B. LIVE CONTEXT TELEMETRY STRIP */}
              <div aria-live="polite" className="copilot-telemetry px-4 py-2 bg-[#0A0B0E] border-b border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-neutral-400 shrink-0">
                <div className="flex items-center gap-1">
                  <span>Overdue:</span>
                  <span className="text-[#FF3B30] font-semibold">{liveContext?.overdue || "—"}</span>
                </div>
                <div className="h-3 w-px bg-white/10" />
                <div className="flex items-center gap-1">
                  <span>DSO:</span>
                  <span className="text-emerald-400 font-semibold">{liveContext?.dso || "—"}</span>
                </div>
                <div className="h-3 w-px bg-white/10" />
                <div className="flex items-center gap-1">
                  <span>Exceptions:</span>
                  <span className="text-amber-400 font-semibold">{liveContext ? `${liveContext.exceptions} Active` : "—"}</span>
                </div>
              </div>

              {/* C. SCROLLABLE MESSAGE STREAM */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar text-xs">
                {messages.map((msg) => {
                  const isUser = msg.sender === "user";
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      {!isUser && (
                        <div className="w-6 h-6 rounded-full bg-[#FF3B30]/20 border border-[#FF3B30]/40 flex items-center justify-center shrink-0 mt-0.5 text-[#FF3B30]">
                          <Sparkles className="w-3 h-3" />
                        </div>
                      )}

                      <div
                        className={`max-w-[85%] rounded-2xl p-3.5 space-y-2 leading-relaxed ${
                          isUser
                            ? "bg-[#FF3B30] text-white rounded-tr-none shadow-md"
                            : "copilot-assistant-message bg-[#141620] text-neutral-200 border border-white/[0.08] rounded-tl-none shadow-sm"
                        }`}
                      >
                        {/* Message Text with simple bold/list support */}
                        <div className="space-y-1.5 whitespace-pre-wrap font-sans text-xs">
                          {msg.text.split("\n").map((line, idx) => {
                            if (line.startsWith("### ")) {
                              return (
                                <h4 key={idx} className="font-bold text-white text-xs pt-1">
                                  {line.replace("### ", "")}
                                </h4>
                              );
                            }
                            if (line.startsWith("- ") || line.startsWith("* ")) {
                              return (
                                <div key={idx} className="flex items-start gap-1.5 pl-1 text-neutral-300">
                                  <span className="text-[#FF3B30]">•</span>
                                  <span>{renderFormatted(line.slice(2))}</span>
                                </div>
                              );
                            }
                            return <p key={idx}>{renderFormatted(line)}</p>;
                          })}
                        </div>

                        {/* Email Draft Card Preview */}
                        {msg.data?.emailDraft && (
                          <div className="copilot-email-card mt-3 p-3 rounded-xl bg-[#0A0B0E] border border-white/10 space-y-2 text-[11px] font-mono text-neutral-300">
                            <div className="flex items-center justify-between pb-1.5 border-b border-white/10 text-neutral-400">
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3 text-[#FF3B30]" />
                                <span>Outgoing Communication Draft</span>
                              </span>
                              <button
                                onClick={() => handleCopy(msg.id, `${msg.data.emailDraft.subject}\n\n${msg.data.emailDraft.body}`)}
                                className="hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                {copiedId === msg.id ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span className="text-emerald-400">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <div className="space-y-1">
                              <div><strong className="text-neutral-400">To:</strong> {msg.data.emailDraft.to}</div>
                              <div><strong className="text-neutral-400">Subject:</strong> {msg.data.emailDraft.subject}</div>
                            </div>
                            <div className="p-2 bg-white/[0.02] rounded border border-white/[0.04] text-[10px] leading-relaxed max-h-32 overflow-y-auto font-sans text-neutral-300 whitespace-pre-wrap">
                              {msg.data.emailDraft.body}
                            </div>
                          </div>
                        )}

                        {/* Action Execution Button */}
                        {msg.action && msg.actionLabel && (
                          <div className="pt-2">
                            <button
                              onClick={() => handleExecuteAction(msg.id, msg.action!, msg.actionPayload)}
                              disabled={executedActions[msg.id] || executingActionId === msg.id}
                              className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm ${
                                executedActions[msg.id]
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                  : "bg-[#FF3B30] hover:bg-[#E53026] text-white active:scale-98"
                              }`}
                            >
                              {executedActions[msg.id] ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Approval Requested ✓</span>
                                </>
                              ) : (
                                <>
                                  <Zap className="w-3.5 h-3.5" />
                                  <span>{executingActionId === msg.id ? "Creating approval…" : msg.actionLabel}</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        <div className="text-[9px] font-mono text-neutral-400/80 text-right pt-0.5">
                          {msg.timestamp}
                        </div>
                      </div>

                      {isUser && (
                        <div className="w-6 h-6 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shrink-0 mt-0.5 text-neutral-300">
                          <User className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Thinking / Typing Indicator */}
                {loading && (
                  <div className="flex gap-2.5 justify-start">
                    <div className="w-6 h-6 rounded-full bg-[#FF3B30]/20 border border-[#FF3B30]/40 flex items-center justify-center shrink-0 text-[#FF3B30]">
                      <Sparkles className="w-3 h-3 animate-spin" />
                    </div>
                    <div className="copilot-typing bg-[#141620] border border-white/[0.08] rounded-2xl rounded-tl-none p-3.5 flex items-center gap-1.5 shadow-sm">
                      <span className="text-[11px] font-mono text-neutral-400">Analyzing ledger</span>
                      <span className="flex gap-1 items-center pl-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] animate-pulse" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] animate-pulse" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] animate-pulse" style={{ animationDelay: "300ms" }} />
                      </span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* D. QUICK PROMPT CHIPS */}
              <div className="copilot-quick-prompts px-3 py-2 bg-[#0C0E14] border-t border-white/[0.06] overflow-x-auto flex items-center gap-1.5 no-scrollbar shrink-0">
                {quickPrompts.map((qp, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(qp.query)}
                    disabled={loading}
                    className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 text-[11px] text-neutral-300 hover:text-white transition-all cursor-pointer shrink-0 active:scale-95 disabled:opacity-50"
                  >
                    <span>{qp.label}</span>
                  </button>
                ))}
              </div>

              {/* E. INPUT COMPOSER */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="copilot-composer p-3 bg-[#10121A] border-t border-white/[0.08] flex items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  value={input}
                  ref={inputRef}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask Spark to inspect, draft, or unblock cash..."
                  className="copilot-input flex-1 bg-[#0A0B0E] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#FF3B30] transition-colors font-sans"
                  disabled={loading}
                  aria-label="Ask Spark Copilot"
                />

                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="w-9 h-9 rounded-xl bg-[#FF3B30] hover:bg-[#E53026] text-white flex items-center justify-center shrink-0 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-red-500/20 active:scale-95"
                  aria-label="Send query"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}

function formatCurrency(amountInMinorUnits: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amountInMinorUnits / 100);
}

// Helper to render bold markdown syntax
function renderFormatted(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="text-white font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
