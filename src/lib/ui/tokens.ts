// AIOSpark Centralized Design Tokens System (Layer 36 UI Pass)
// Consolidates severity & status colors, typography scales, card paddings, and contrast tokens.

export const SEVERITY_TOKENS = {
  critical: {
    label: 'Critical',
    bg: 'bg-red-950/60',
    text: 'text-red-400',
    border: 'border-red-800',
    badge: 'bg-red-950/80 text-red-300 border-red-800',
    dot: 'bg-red-500',
    hex: '#EF4444',
  },
  high: {
    label: 'High',
    bg: 'bg-amber-950/60',
    text: 'text-amber-400',
    border: 'border-amber-800',
    badge: 'bg-amber-950/80 text-amber-300 border-amber-800',
    dot: 'bg-amber-500',
    hex: '#F59E0B',
  },
  medium: {
    label: 'Medium',
    bg: 'bg-yellow-950/60',
    text: 'text-yellow-400',
    border: 'border-yellow-800',
    badge: 'bg-yellow-950/80 text-yellow-300 border-yellow-800',
    dot: 'bg-yellow-500',
    hex: '#EAB308',
  },
  low: {
    label: 'Low',
    bg: 'bg-emerald-950/60',
    text: 'text-emerald-400',
    border: 'border-emerald-800',
    badge: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
    dot: 'bg-emerald-500',
    hex: '#10B981',
  },
} as const;

export const STATUS_TOKENS = {
  active: { label: 'Active', badge: 'bg-emerald-950/60 text-emerald-400 border-emerald-800' },
  approved: { label: 'Approved', badge: 'bg-emerald-950/60 text-emerald-400 border-emerald-800' },
  connected: { label: 'Connected', badge: 'bg-emerald-950/60 text-emerald-400 border-emerald-800' },
  paid: { label: 'Paid', badge: 'bg-emerald-950/60 text-emerald-400 border-emerald-800' },
  pending: { label: 'Pending', badge: 'bg-amber-950/60 text-amber-400 border-amber-800' },
  trialing: { label: 'Trialing', badge: 'bg-amber-950/60 text-amber-400 border-amber-800' },
  warning: { label: 'Warning', badge: 'bg-amber-950/60 text-amber-400 border-amber-800' },
  rejected: { label: 'Rejected', badge: 'bg-red-950/60 text-red-400 border-red-800' },
  canceled: { label: 'Canceled', badge: 'bg-red-950/60 text-red-400 border-red-800' },
  past_due: { label: 'Past Due', badge: 'bg-red-950/60 text-red-400 border-red-800' },
  error: { label: 'Error', badge: 'bg-red-950/60 text-red-400 border-red-800' },
  open: { label: 'Open', badge: 'bg-blue-950/60 text-blue-400 border-blue-800' },
} as const;

export const TYPOGRAPHY_TOKENS = {
  pageTitle: 'text-2xl font-bold tracking-tight text-white',
  sectionTitle: 'text-lg font-bold text-white',
  cardTitle: 'text-sm font-semibold text-neutral-300',
  metricValue: 'text-3xl font-extrabold text-white tracking-tight',
  caption: 'text-xs text-neutral-400',
  monoLabel: 'text-[11px] font-mono text-neutral-500 uppercase tracking-wider',
} as const;

export const LAYOUT_TOKENS = {
  cardPadding: 'p-6',
  cardBg: 'bg-neutral-900',
  cardBorder: 'border border-neutral-800 rounded-2xl shadow-sm',
  tableHeaderBg: 'bg-neutral-950 text-neutral-400 uppercase font-mono text-[11px] border-b border-neutral-800',
  tableRowHover: 'hover:bg-neutral-800/40 transition-colors',
} as const;
