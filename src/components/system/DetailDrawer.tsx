'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface DetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function DetailDrawer({ isOpen, onClose, title, subtitle, children }: DetailDrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end font-sans"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="workstation-drawer-panel bg-[#12141A] border-l border-white/[0.08] w-full max-w-lg h-full overflow-y-auto p-6 space-y-6 flex flex-col justify-between shadow-2xl relative">
        <div className="space-y-6">
          {/* Drawer Header */}
          <div className="flex items-start justify-between border-b border-white/[0.08] pb-4 gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white tracking-tight">{title}</h2>
              {subtitle && <p className="text-xs text-neutral-400 font-sans leading-relaxed">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[#181B23] border border-white/[0.08] text-neutral-400 hover:text-white transition cursor-pointer shrink-0"
              title="Close drawer (Esc)"
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Content */}
          <div className="space-y-4">{children}</div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-white/[0.08] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#181B23] border border-white/[0.08] rounded-lg text-xs font-sans font-medium text-neutral-300 hover:text-white transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
