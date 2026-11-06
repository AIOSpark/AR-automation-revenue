"use client";

import React, { useState } from "react";
import {
  ArrowRight,
  Play,
  Search,
  Bell,
  Inbox,
  Sparkles,
  FileText,
  Users,
  BarChart2,
  Settings,
  Star,
  Check,
} from "lucide-react";
import { SparkIcon } from "../landing/LandingLogos";

interface ProductHeroProps {
  onOpenWaitlist: () => void;
}

export function ProductHero({ onOpenWaitlist }: ProductHeroProps) {
  const [activeFilter, setActiveFilter] = useState("All (24)");
  const [selectedEmail, setSelectedEmail] = useState("acme");
  const [isApproved, setIsApproved] = useState(false);

  const emails = [
    {
      id: "acme",
      avatar: "A",
      avatarBg: "bg-purple-600/30 text-purple-300 border-purple-500/40",
      company: "Acme Corp",
      subject: "Partnership opportunity",
      preview: "We're exploring a partnership...",
      time: "2h ago",
      starred: true,
      tag: "High Value",
      tagColor: "bg-red-500/15 text-[#EF4444] border-red-500/30",
    },
    {
      id: "global",
      avatar: "G",
      avatarBg: "bg-blue-600/30 text-blue-300 border-blue-500/40",
      company: "Global Systems",
      subject: "Pricing inquiry",
      preview: "Can you share pricing for...",
      time: "4h ago",
      starred: false,
      tag: "Needs Reply",
      tagColor: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    },
    {
      id: "bright",
      avatar: "B",
      avatarBg: "bg-pink-600/30 text-pink-300 border-pink-500/40",
      company: "BrightTech",
      subject: "Product demo request",
      preview: "Would love to see a demo...",
      time: "6h ago",
      starred: true,
      tag: "Follow Up",
      tagColor: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    },
    {
      id: "nextgen",
      avatar: "N",
      avatarBg: "bg-indigo-600/30 text-indigo-300 border-indigo-500/40",
      company: "NextGen Co",
      subject: "Integration question",
      preview: "How does your API handle...",
      time: "8h ago",
      starred: false,
      tag: "Normal",
      tagColor: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30",
    },
  ];

  return (
    <section className="relative pt-28 pb-20 md:pt-36 md:pb-28 bg-[#07080B] text-white overflow-hidden">
      {/* Background Cosmic Deep Orb & Arc Glow */}
      <div className="absolute top-1/4 right-0 w-[650px] h-[650px] bg-[#EF4444]/15 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute -top-20 -right-20 w-[720px] h-[720px] rounded-full border border-red-500/15 pointer-events-none shadow-[inset_0_0_80px_rgba(239,68,68,0.12)] [mask-image:radial-gradient(ellipse_70%_70%_at_65%_45%,#000_30%,transparent_75%)]" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* LEFT COLUMN: HERO COPY */}
          <div className="lg:col-span-5 space-y-6">
            {/* Tagline */}
            <div className="text-xs font-semibold tracking-wider text-neutral-400 uppercase">
              AI SALES INBOX
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-bold text-white tracking-tight leading-[1.12]">
              One inbox. <br />
              More <span className="text-[#EF4444]">opportunities.</span>
            </h1>

            {/* Subtext */}
            <p className="text-neutral-300 text-base sm:text-lg leading-relaxed max-w-lg">
              AIOSpark turns your business emails into a pipeline — by finding high-value conversations, drafting smart replies, and getting your approval before anything is sent.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                onClick={onOpenWaitlist}
                className="px-6 py-3.5 rounded-lg bg-[#EF4444] hover:bg-[#DC2626] text-white font-semibold text-sm sm:text-base flex items-center gap-2 shadow-lg shadow-red-500/25 transition-all cursor-pointer active:scale-95"
              >
                <span>Try the product</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={onOpenWaitlist}
                className="px-5 py-3.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 text-white font-medium text-sm sm:text-base flex items-center gap-2.5 transition-all cursor-pointer active:scale-95"
              >
                <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                  <Play className="w-2.5 h-2.5 fill-white text-white ml-0.5" />
                </div>
                <span>Watch 2 min demo</span>
              </button>
            </div>

            {/* Social Proof Row */}
            <div className="flex items-center gap-4 pt-4 border-t border-white/[0.06]">
              {/* Avatar stack */}
              <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full border-2 border-[#07080B] bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-[10px] font-bold text-white">
                  SJ
                </div>
                <div className="w-8 h-8 rounded-full border-2 border-[#07080B] bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center text-[10px] font-bold text-white">
                  MR
                </div>
                <div className="w-8 h-8 rounded-full border-2 border-[#07080B] bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-[10px] font-bold text-white">
                  AL
                </div>
                <div className="w-8 h-8 rounded-full border-2 border-[#07080B] bg-gradient-to-tr from-blue-500 to-cyan-500 flex items-center justify-center text-[10px] font-bold text-white">
                  DK
                </div>
              </div>

              {/* Review Text */}
              <div>
                <div className="text-xs font-medium text-neutral-300">
                  Trusted by growing businesses
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="flex items-center text-amber-400">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <span className="text-[11px] font-medium text-neutral-400">
                    4.8/5 (200+ Reviews)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: 3D TILTED EMAIL WORKSTATION MOCKUP */}
          <div className="lg:col-span-7 relative">
            <div className="relative mx-auto max-w-lg lg:max-w-none [perspective:1200px]">
              
              {/* Main Workstation Container */}
              <div
                className="w-full rounded-2xl bg-[#0D0F17]/95 border border-white/10 shadow-[0_30px_70px_-15px_rgba(0,0,0,0.95)] backdrop-blur-xl overflow-hidden p-3 sm:p-4 transition-transform duration-500 hover:[transform:none]"
                style={{
                  transform: "rotateY(-3deg) rotateX(2deg)",
                  transformStyle: "preserve-3d",
                }}
              >
                {/* Header bar inside Dashboard */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.08]">
                  <div className="flex items-center gap-1.5">
                    <SparkIcon className="w-4 h-4 text-[#EF4444]" />
                    <span className="text-xs font-bold text-white tracking-wide">AIOSpark</span>
                  </div>

                  {/* Search mock */}
                  <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08] text-[11px] text-neutral-400 w-60">
                    <Search className="w-3 h-3 text-neutral-500" />
                    <span>Search emails, customers, or opportunities...</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] text-neutral-400">
                      <Bell className="w-3 h-3" />
                    </div>
                  </div>
                </div>

                {/* 3-Column Workstation Layout */}
                <div className="grid grid-cols-12 gap-2 sm:gap-3 text-xs">
                  
                  {/* Column 1: Left Mini Nav Sidebar (2.5 Cols) */}
                  <div className="col-span-3 sm:col-span-2 space-y-1 font-medium border-r border-white/[0.08] pr-1.5 text-[11px]">
                    <div className="px-2 py-1.5 rounded-md bg-white/[0.08] text-white font-semibold flex items-center justify-between border-l-2 border-[#EF4444]">
                      <div className="flex items-center gap-1.5">
                        <Inbox className="w-3 h-3 text-[#EF4444]" />
                        <span>Inbox</span>
                      </div>
                    </div>

                    <div className="px-2 py-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.02] flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-1.5 truncate">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span className="truncate">Opportunities</span>
                      </div>
                      <span className="text-[9px] px-1 py-0.2 rounded-full bg-amber-500/20 text-amber-400 font-mono">
                        12
                      </span>
                    </div>

                    <div className="px-2 py-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.02] flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-1.5 truncate">
                        <FileText className="w-3 h-3 text-blue-400" />
                        <span className="truncate">Drafts</span>
                      </div>
                      <span className="text-[9px] px-1 py-0.2 rounded-full bg-white/10 text-neutral-300 font-mono">
                        4
                      </span>
                    </div>

                    <div className="px-2 py-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.02] flex items-center gap-1.5 cursor-pointer">
                      <Users className="w-3 h-3 text-neutral-500" />
                      <span>Customers</span>
                    </div>

                    <div className="px-2 py-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.02] flex items-center gap-1.5 cursor-pointer">
                      <BarChart2 className="w-3 h-3 text-neutral-500" />
                      <span>Analytics</span>
                    </div>

                    <div className="px-2 py-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.02] flex items-center gap-1.5 cursor-pointer">
                      <Settings className="w-3 h-3 text-neutral-500" />
                      <span>Settings</span>
                    </div>
                  </div>

                  {/* Column 2: Middle Email List (5 Cols) */}
                  <div className="col-span-9 sm:col-span-5 space-y-2 border-r border-white/[0.08] pr-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">Priority Emails</span>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px]">
                      {["All (24)", "High Value (8)", "Needs Reply (6)", "Follow Up (4)"].map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setActiveFilter(tab)}
                          className={`px-2 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors cursor-pointer ${
                            activeFilter === tab
                              ? "bg-white/10 text-white font-semibold"
                              : "text-neutral-400 hover:text-white"
                          }`}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>

                    {/* Email Items List */}
                    <div className="space-y-1.5">
                      {emails.map((email) => {
                        const isSelected = selectedEmail === email.id;
                        return (
                          <div
                            key={email.id}
                            onClick={() => setSelectedEmail(email.id)}
                            className={`p-2 rounded-lg border transition-all cursor-pointer ${
                              isSelected
                                ? "bg-white/[0.06] border-white/15 shadow-sm"
                                : "bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.04]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 ${email.avatarBg}`}
                                >
                                  {email.avatar}
                                </div>
                                <div className="truncate">
                                  <div className="text-[11px] font-bold text-white truncate">
                                    {email.company}
                                  </div>
                                </div>
                              </div>
                              <div className="text-[9px] text-neutral-400 shrink-0 font-mono flex items-center gap-1">
                                {email.starred && <span className="text-amber-400">★</span>}
                                <span>{email.time}</span>
                              </div>
                            </div>

                            <div className="text-[10px] font-medium text-neutral-300 mt-1 truncate">
                              {email.subject}
                            </div>
                            <div className="text-[9px] text-neutral-500 truncate">
                              {email.preview}
                            </div>

                            <div className="mt-1.5 flex justify-end">
                              <span
                                className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full border ${email.tagColor}`}
                              >
                                {email.tag}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Column 3: Right Detail & AI Reply Pane (5 Cols) */}
                  <div className="col-span-12 sm:col-span-5 space-y-2.5 pt-2 sm:pt-0">
                    {/* Header */}
                    <div className="flex items-start justify-between pb-2 border-b border-white/[0.08]">
                      <div>
                        <div className="text-xs font-bold text-white">Acme Corp</div>
                        <div className="text-[10px] text-neutral-400">jason@acme.com</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/15 text-[#EF4444] border border-red-500/30 font-semibold">
                          ● High Value
                        </span>
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/5 text-neutral-300 border border-white/10">
                          Partnership
                        </span>
                      </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center gap-3 text-[11px] font-medium border-b border-white/[0.06] pb-1">
                      <span className="text-white font-semibold border-b border-white pb-1 -mb-1">
                        Summary
                      </span>
                      <span className="text-neutral-400">AI Draft (1)</span>
                    </div>

                    {/* Email Summary Box */}
                    <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                      <div className="text-[10px] font-bold text-neutral-300 flex items-center gap-1">
                        <SparkIcon className="w-2.5 h-2.5 text-sky-400" />
                        <span>Email Summary</span>
                      </div>
                      <ul className="text-[9px] text-neutral-400 space-y-1 pl-1">
                        <li className="flex items-start gap-1.5">
                          <span className="text-sky-400 mt-0.5">◆</span>
                          <span>Interested in a strategic partnership</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="text-sky-400 mt-0.5">◆</span>
                          <span>Looking for integration with their platform</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="text-sky-400 mt-0.5">◆</span>
                          <span className="text-emerald-400 font-semibold">Potential deal value: $50K - $100K</span>
                        </li>
                      </ul>
                    </div>

                    {/* AI Suggested Reply Box */}
                    <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] space-y-2">
                      <div className="text-[10px] font-bold text-white flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <SparkIcon className="w-2.5 h-2.5 text-[#EF4444]" />
                          <span>AI Suggested Reply</span>
                        </div>
                        <span className="text-[8px] text-neutral-400">Context: Warm Lead</span>
                      </div>

                      <div className="text-[9px] text-neutral-300 leading-relaxed bg-black/30 p-2 rounded border border-white/5">
                        <p>Hi Jason,</p>
                        <p className="mt-1">
                          Thanks for reaching out! We&apos;d love to explore a partnership with Acme Corp. Let&apos;s schedule a quick call this week to discuss your goals and how we can help.
                        </p>
                        <p className="mt-1">Best regards,<br />Team AIOSpark</p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={onOpenWaitlist}
                          className="px-2.5 py-1 rounded text-[10px] text-neutral-300 hover:text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setIsApproved(true)}
                          className="px-3 py-1 rounded text-[10px] font-semibold text-white bg-[#EF4444] hover:bg-[#DC2626] shadow-sm shadow-red-500/30 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          {isApproved ? (
                            <>
                              <Check className="w-3 h-3 text-white" />
                              <span>Sent!</span>
                            </>
                          ) : (
                            <span>Approve & Send</span>
                          )}
                        </button>
                      </div>
                    </div>

                  </div>

                </div>

              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
