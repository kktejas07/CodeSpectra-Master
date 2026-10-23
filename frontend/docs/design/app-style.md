# CodeSpectra app style (royal blue, bento)

Applies to every dashboard, admin, candidate and public screen. Source of truth
for colours is `app/globals.css`; building blocks are in
`components/app/page-kit.tsx` (app screens) and `components/landing/*`
(marketing pages: `PageHero`, `BentoShell`, `BentoCard`).

## Colour
- Use theme tokens only: `bg-background`, `bg-card`, `text-foreground`,
  `text-muted-foreground`, `border-border`, `bg-primary` / `text-primary`,
  `bg-primary/10`, `ring-ring`, `bg-muted`, `bg-accent`.
- Brand = royal blue `#2F5BE7` (`primary`). Never hard-code green/mint/teal/
  emerald as brand colour. `green-*` is only for success / live / passed;
  `red-*`/`destructive` for errors and failures; `amber-*` for warnings.
- No dark-only literals on normal surfaces: `text-white`, `text-slate-200/300/400`,
  `bg-slate-900/950`, `bg-[#0xxxxx]`, `from-[#0…]` must be replaced with tokens.
  They are fine ONLY on a surface that is dark in both themes (e.g. a
  `bg-primary` banner, a video/code canvas, a webcam frame).
- Text contrast ≥ 4.5:1 in light AND dark.

## Shape and depth
- Page/section cards: `rounded-3xl` (Panel), smaller tiles `rounded-2xl`,
  controls `rounded-lg`/`rounded-xl`, pills `rounded-full`.
- Soft shadow in light, none in dark (Panel/Card already do this).
- Interactive cards lift: use `<Panel interactive>`.

## Layout
- Start every app screen with `<PageHeader title description icon actions />`.
- Metric rows: `<StatCard>` inside a grid. Card collections: `<BentoGrid>`
  (4 → 2 → 1 columns, vary spans with `sm:col-span-2`, `lg:row-span-2`).
- Empty states: `components/ui/empty-state.tsx` with plain-language copy
  that says what to do next.

## Type and copy
- Sentence case. No ALL-CAPS labels, no `font-mono` for ordinary labels
  (mono only for code, IDs, timers, scores). Numbers: `tabular-nums`.
- Plain words from the user's side ("No assessments yet — you'll see tests
  you're invited to here"), not system words ("telemetry", "engine").
- Never invent numbers, testimonials, customers or features.

## Motion
- Card grids enter with `.cs-stagger` (via BentoGrid). Hover: 150–300 ms.
- Everything must respect `prefers-reduced-motion` (use `motion-reduce:`).
- Don't animate dense data tables.

## Accessibility
- Visible focus on every control, labels on inputs, `aria-label` on icon-only
  buttons, `alt` on images (empty alt for decoration), 44 px touch targets
  on primary actions.

## Bento cards (`components/bento`)
- `BentoGrid cols={4|6}`: 1 column on phones, 2 on tablets, 4 or 6 on desktop.
  Cards take `span` (desktop columns), `smSpan` (tablet) and `rows`.
- Anatomy: card (28px radius, 8px padding) → `BentoWell` (20px, dot-grid stage
  for a visual) → `BentoBody` (icon + title row, text, tags, `BentoAction` pill).
- Variants: `BentoStat` (big number, delta, sparkline or `visual`),
  `BentoFeature`, `BentoList`, `BentoChart`, `BentoCta`, `BentoProof`, `BentoMedia`;
  `BentoSkeleton` / `BentoEmpty` for loading and empty cards.
- One `tone="brand"` card per grid at most; `tint` for a recommendation.
- Every card that loads data shows a skeleton, an empty state that says what to
  do next, and an error line. Proof cards show counted numbers only.
- Server-safe (no hooks): use them in server components on public pages.
