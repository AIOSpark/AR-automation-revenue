"use client";

import React from "react";
import { Mail, FileText, BarChart3, Users } from "lucide-react";

export function ProductCoreFeatures() {
  const features = [
    {
      icon: Mail,
      title: "AI-Powered Inbox",
      description: "Automatically sort, prioritize and categorize business emails.",
    },
    {
      icon: FileText,
      title: "Smart Draft Replies",
      description: "Get personalized, context-aware email drafts in seconds.",
    },
    {
      icon: BarChart3,
      title: "Opportunity Detection",
      description: "Identify high-value leads and partnership opportunities using AI.",
    },
    {
      icon: Users,
      title: "Approval Before Sending",
      description: "You stay in control. Review and approve every reply before it's sent.",
    },
  ];

  return (
    <section id="features" className="py-20 md:py-28 bg-[#FFFFFF] text-neutral-900 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header Row */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <div className="text-xs font-bold tracking-wider text-[#EF4444] uppercase mb-2">
              CORE FEATURES
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-bold text-neutral-900 tracking-tight leading-tight">
              Everything you need <br />
              to turn emails into revenue.
            </h2>
          </div>

          <p className="text-neutral-600 text-sm sm:text-base max-w-md leading-relaxed">
            AIOSpark automates the manual work, so you can focus on building relationships and closing deals.
          </p>
        </div>

        {/* 4 Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-neutral-200/90 p-6 shadow-sm hover:shadow-md hover:border-red-300 transition-all flex flex-col justify-between h-52 group"
              >
                <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-[#EF4444] transition-transform duration-200 group-hover:scale-105">
                  <Icon className="w-6 h-6" />
                </div>

                <div>
                  <h3 className="text-base font-bold text-neutral-900 mb-1.5">
                    {feature.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-neutral-500 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
