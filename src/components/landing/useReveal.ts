"use client";

import { useEffect, useState } from "react";

/**
 * Progressive-enhancement scroll reveal.
 *
 * - Adds `js-reveal` to <html> on mount so CSS can scope the hidden state.
 * - Default CSS state is fully visible; `.js-reveal .reveal:not(.is-visible)`
 *   is hidden only when JS is available.
 * - IntersectionObserver threshold 0.1, rootMargin "0px 0px -10% 0px".
 * - Unobserves after reveal. Immediate fallback marks everything visible so
 *   nothing can stay hidden if the observer never fires.
 */
export function useReveal() {
  const [visible, setVisible] = useState<Set<string>>(new Set());

  useEffect(() => {
    document.documentElement.classList.add("js-reveal");
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.target.id) {
            setVisible((prev) => {
              if (prev.has(entry.target.id)) return prev;
              const next = new Set(prev);
              next.add(entry.target.id);
              entry.target.classList.add("is-visible");
              observer.unobserve(entry.target);
              return next;
            });
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -10% 0px" }
    );

    const els = document.querySelectorAll<HTMLElement>("[data-aios-reveal]");
    els.forEach((el) => {
      el.classList.add("reveal");
      observer.observe(el);
    });

    // Immediate fallback: guarantee visibility so nothing stays hidden.
    const fallback = setTimeout(() => {
      document
        .querySelectorAll<HTMLElement>(".reveal:not(.is-visible)")
        .forEach((el) => {
          el.classList.add("is-visible");
          observer.unobserve(el);
        });
    }, 100);

    return () => {
      clearTimeout(fallback);
      observer.disconnect();
    };
  }, []);

  const isVisible = (id: string) => visible.has(id);
  return { visible, isVisible };
}
