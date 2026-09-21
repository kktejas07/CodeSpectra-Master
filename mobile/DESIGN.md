# CodeSpectra Mobile — Design System Record

Generated via `ui-ux-pro-max --design-system` ("coding education edtech
developer dark") + web brand tokens. Server theme (`bootstrap.theme`)
overrides everything below at runtime; this file is the offline fallback
spec and the rulebook for stages 2–4.

## Style

Dark OLED minimal, developer-tool mood (precision, high-end utility).
Dark-first; light theme ships as a complete separate palette (never
inferred). One icon family (Lucide, stroke 2), SVG only, no emoji icons.

## Color (brand wins on primary)

| Token      | Dark      | Light     | Source                              |
|------------|-----------|-----------|-------------------------------------|
| primary    | `#00D681` | `#00C777` | web `globals.css` emerald (brand)   |
| background | `#080D17` | `#FAFCFB` | web bg tokens                       |
| card       | `#0E1626` | `#FFFFFF` | elevated surface                    |
| text       | `#F1F5F9` | `#0F172A` | ≥4.5:1 both modes                   |
| muted      | `#94A3B8` | `#64748B` | secondary ≥3:1 on dark              |
| border     | `#1E293B` | `#E2E8F0` | visible in both modes               |
| danger     | `#F87171` | `#DC2626` | destructive actions                 |

Rules: semantic tokens only, never raw hex in screens; status is never
color-alone (label + dot); scrim 40–60% black.

## Typography

Inter (headings + body) via `@expo-google-fonts/inter` (stage 2).
Scale: 13 / 15 / 17 / 20 / 24 / 28. Body 15–17px on phone (no iOS
auto-zoom), 1.5 line-height, tabular figures for scores/timers.
Dynamic Type must not break layouts.

## Touch & motion

44×44pt minimum targets, 8dp gaps, 4/8dp spacing rhythm. Press feedback
(opacity/scale 0.95–1.05) within 100ms. Micro-interactions 150–300ms,
ease-out enter / faster exit, stagger lists 30–50ms. Respect
reduced-motion. No hover-dependent interactions.

## Navigation

Bottom tabs (icon + label, ≤8 ICT total but ≤5 visible per role —
learner sees 6 incl. profile; judge/admin add one each), active state
via primary color + weight, badges sparingly (unread/pending only,
cleared on visit). Predictable back, deep-linkable routes, safe-area
compliance top + bottom, no content behind fixed bars.

## Forms (login pattern)

Visible labels above inputs (login v1 uses placeholders + error text —
upgrade to floating labels in stage-2 polish pass), semantic keyboards
(email-address, number-pad for TOTP), password visibility toggle
(stage 2), error below the field with recovery path, button
loading→success/error states, ≥44px input height.
