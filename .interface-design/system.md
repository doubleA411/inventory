# Stackwise interface system

## Direction

- Product context: a busy catering operator correcting stock, purchasing, billing, and event records under time pressure.
- Feel: calm, compact, trustworthy, and ledger-like. Prefer direct operational language over generic SaaS language.
- Signature pattern: a recoverable operational trail. Destructive-looking actions are named **Archive**, explain what leaves normal views, and point to one central restore location in Settings.
- Domain language: stockroom, batch, expiry, movement, bill, quotation, vendor, event, payment, ledger.

## Visual system

- Color world: paper white, shelf gray, ledger ink, fresh green for healthy states, amber for attention/archive, and brick red only for irreversible or financially blocked states.
- Depth: low-contrast borders and restrained shadows. Use elevation for sheets, dialogs, and active overlays—not as decoration on every card.
- Spacing: 4 px base unit; 16 px mobile page gutters; 24–32 px desktop gutters; 16 px compact cards; 24 px primary cards.
- Typography: Geist with Noto Sans Tamil fallback. Page title 24/600, section title 16/600, body and controls 14, metadata 12 muted. Use tabular numerals for quantities and money.
- Radius: preserve the existing modest radius scale. Avoid oversized pills except for short statuses and counts.

## Interaction patterns

- Primary action labels name the outcome: Record payment, Restock, Create invoice, Restore.
- Archive confirmations say what disappears from normal views and that the record is recoverable in Settings → Archived records.
- Keep financially meaningful records visible through cancellation when payments or linked documents exist; explain the safer next action inline.
- Empty states should state why the list is empty and offer the next useful action when one exists.
- Tables may remain dense on desktop, but mobile should expose records as stacked, labeled rows rather than requiring horizontal scanning.
- Mobile record rows use a two-column metadata grid: the record identity spans both columns, supporting identity sits directly below it, and short labeled facts follow in pairs. Daily actions remain visible at the bottom.
- Every icon-only control needs an accessible name and visible hover/focus treatment.

## Rejected patterns

- Permanent delete for business records.
- Vague actions such as Submit, OK, or Manage when a domain verb is available.
- Generic dashboard-card decoration that does not clarify priority or state.
- Motion on dense operational tables; reserve motion for spatial transitions and direct feedback.
