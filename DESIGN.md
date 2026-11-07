# Design System: Warm Editorial & Tactile Financial Workstation

<!-- impeccable:design-schema 1 -->

## Direction & Thesis
AIOSpark's UI replaces generic, floating dark-mode AI templates (glowing halos, floating neon cards, abstract particles) with a **Warm Editorial & Tactile Financial Workstation**. It pairs high-density financial telemetry with human typography, warm stone/charcoal surfaces, tactile borders, and audit-grade transparency.

## Color Palette
- **Background Ground**: Deep obsidian stone `#0A0B0E`
- **Elevated Surfaces**: `#12141A`, `#181B23`, `#20242F`
- **Primary Signal Accent**: Warm Crimson `#FF3B30` (`#E53026` hover)
- **Warning / Alert**: Warm Amber `#F59E0B`
- **Positive / Verified**: Muted Emerald `#10B981`
- **Border Rules**: `rgba(255, 255, 255, 0.08)` subtle, `rgba(255, 59, 48, 0.4)` active
- **Foreground Text**: Primary `#F3F4F6`, Muted `#9CA3AF`, Subtle `#6B7280`

## Typography
- **Serif Editorial Display Accents**: `Newsreader` (italic serif) for signature editorial emphasis in main headlines & section highlights (`font-serif-editorial`).
- **UI Sans-Serif**: `Geist` / System Sans-Serif for clear navigation, labels, and readable body copy.
- **Financial Monospace**: `Geist Mono` (`font-mono-num`) with `font-variant-numeric: tabular-nums` for precise alignment of INR figures, DSO days, and percentage values.

## Architectural Surfaces & Tactile Affordances
- **Cards**: `.workstation-card` with 1px subtle white borders (`rgba(255, 255, 255, 0.08)`), subtle inset light highlight (`inset 0 1px 0 rgba(255, 255, 255, 0.04)`), and soft 12px drop blur shadows.
- **Interactive Cards**: `.workstation-card-interactive` featuring smooth 150ms spring lift (`translateY(-2px)`) and crimson border highlight on hover.
- **Buttons**: `.btn-editorial-primary` using subtle linear crimson gradients with light inset borders and tactile press responses.
- **No Kicker Labels**: Headings speak with their own typography weight without generic eyebrow tags.

## Component Grammar
- **Navigation Shell**: Fixed top navigation for landing page and left sticky sidebar for app workstation with live telemetry indicators ("TELEMETRY ONLINE", "ROLE VERIFIED").
- **Financial Telemetry**: Number-first metric bands with tabular figures and clear color-coded risk indicators (Crimson for blockers, Amber for overdue, Emerald for settled).
- **Causal Evidence Displays**: Audit-grade investigation cards mapping PO discrepancies and line item root cause trees.
