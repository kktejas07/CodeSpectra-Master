# CodeSpectra Theme Update to "Optimus Modern Minimal"

## Design System Analysis

The target design (Optimus) uses:
- **Color Palette**: Modern minimal with neutral base, purple/violet primary accent
- **Typography**: Clean, sans-serif (Geist or similar)
- **Spacing**: Generous, minimalist approach
- **Components**: Flat design, minimal shadows, subtle borders
- **Landing Page**: Hero-first, capabilities showcase, testimonials, pricing
- **Overall Feel**: Professional, modern, developer-friendly

## Current CodeSpectra Theme
- Uses purple primary color (similar)
- Dark mode with OKLCH colors
- Similar typography base
- More complex, enterprise-focused styling

## Update Strategy

### Phase 1: Core Theme (globals.css)
- Update color variables to match Optimus Modern Minimal
- Simplify color palette
- Adjust spacing and sizing
- Update border and shadow values

### Phase 2: Landing Page (app/page.tsx)
- Redesign hero section
- Add capabilities showcase section
- Include testimonials
- Update pricing section
- Add infrastructure/platform features

### Phase 3: Dashboard Pages
- Simplify existing dashboard styling
- Apply modern minimal theme
- Update card designs
- Adjust spacing and typography

### Phase 4: Component Updates
- Update Button components
- Update Card styling
- Update Badge components
- Update input/form styles

### Phase 5: Subpages
- Auth pages (login/signup)
- Profile pages
- Settings pages
- All admin pages

## Color Palette (Modern Minimal)

### Light Mode
- Background: #FFFFFF (white)
- Foreground: #0F0F0F (almost black)
- Primary: #7C3AED (purple/violet)
- Secondary: #F3F4F6 (light gray)
- Border: #E5E7EB (subtle gray)
- Muted: #9CA3AF (medium gray)
- Accent: #7C3AED (purple)

### Dark Mode
- Background: #0F172A (very dark blue-black)
- Foreground: #F8FAFC (near white)
- Primary: #8B5CF6 (bright purple)
- Secondary: #1E293B (dark gray-blue)
- Border: #334155 (medium gray)
- Muted: #64748B (lighter gray)
- Accent: #8B5CF6 (bright purple)

## Typography
- Font Family: Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
- Heading Sizes: 32px, 28px, 24px, 20px
- Body: 16px, 14px
- Line Heights: 1.5 for body, 1.2 for headings

## Spacing Scale
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- 2xl: 48px

## Border & Radius
- Border Width: 1px (subtle)
- Border Radius: 8px (consistent)
- Shadow: Minimal, only on hover/interactive states

## Implementation Files to Update

### Core Theme
- ✅ app/globals.css

### Pages (Priority Order)
- ✅ app/page.tsx (Landing)
- ⬜ app/auth/login/page.tsx
- ⬜ app/auth/signup/page.tsx
- ⬜ app/dashboard/page.tsx
- ⬜ app/dashboard/profile/page.tsx
- ⬜ app/dashboard/leaderboard/page.tsx
- ⬜ app/dashboard/support/page.tsx
- ⬜ app/dashboard/notifications/page.tsx
- ⬜ app/admin/billing/page.tsx
- ⬜ app/admin/integrations/page.tsx
- ⬜ app/pricing/page.tsx

### Components to Update
- ✅ Button
- ✅ Card
- ✅ Badge
- ⬜ Input
- ⬜ Select
- ⬜ Modal/Dialog
- ⬜ Tabs
- ⬜ Sidebar

## Progress Tracker
- [ ] Update globals.css
- [ ] Update landing page
- [ ] Update auth pages
- [ ] Update dashboard pages
- [ ] Update admin pages
- [ ] Update all components
- [ ] Test across all pages
- [ ] Update phase list
