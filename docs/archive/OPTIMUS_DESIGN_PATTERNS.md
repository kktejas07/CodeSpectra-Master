# Optimus Design Patterns - CodeSpectra Implementation Guide

## Overview
This guide shows how to apply Optimus design patterns to CodeSpectra pages.

---

## 1. LANDING PAGE PATTERNS

### Hero Section
```
Pattern Structure:
┌─────────────────────────────────┐
│  Navigation (sticky, minimal)    │
├─────────────────────────────────┤
│  Large Headline (60-72px)        │
│  Subheadline (18-20px)           │
│  CTA Buttons (primary + outline) │
│  Optional: Hero Image/Animation  │
└─────────────────────────────────┘

Implementation:
- Max width: 1200px (centered)
- Padding: 120px vertical, 48px horizontal
- Headline: Bold, text-balance
- CTA: Two buttons minimum (primary + secondary)
- Background: Solid white or subtle gradient

Example in React:
<section className="pt-32 pb-24 px-6 max-w-6xl mx-auto text-center space-y-8">
  <h1 className="text-6xl lg:text-7xl font-bold text-foreground">
    Headline text
  </h1>
  <p className="text-xl text-muted-foreground">
    Subheadline
  </p>
  <div className="flex gap-4 justify-center">
    <Button size="lg">Primary CTA</Button>
    <Button size="lg" variant="outline">Secondary CTA</Button>
  </div>
</section>
```

### Social Proof Section
```
Pattern: Customer logos + key metrics
┌────────────────────┬────────────────────┬────────────────────┐
│ Metric + Company 1 │ Metric + Company 2 │ Metric + Company 3 │
│ "20 days saved"    │ "98% faster"       │ "300% increase"    │
│ Netflix Logo       │ Stripe Logo        │ Linear Logo        │
└────────────────────┴────────────────────┴────────────────────┘

Implementation:
- Grid: 2-4 columns
- Each cell: metric, number, company
- Metrics: Large, bold (48-60px numbers)
- Company logos: Grayscale, 120x40px max
- Background: Subtle secondary color

Code:
<section className="py-16 bg-secondary/30 border-t border-border">
  <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
    {[...].map(item => (
      <div key={item.id} className="text-center">
        <p className="text-4xl font-bold text-foreground">{item.metric}</p>
        <p className="text-sm text-muted-foreground mt-2">{item.label}</p>
        <img src={item.logo} className="h-8 mt-4 mx-auto grayscale" />
      </div>
    ))}
  </div>
</section>
```

### Features Section (4-Column Grid)
```
Pattern: Icon + Title + Description
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│      Icon       │      Icon       │      Icon       │      Icon       │
│    Feature 1    │    Feature 2    │    Feature 3    │    Feature 4    │
│  Description...  │  Description...  │  Description...  │  Description...  │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘

Implementation:
- Grid: 4 columns on desktop, 2 on tablet, 1 on mobile
- Icon: 48-64px, colored (use primary or accent)
- Title: 18-20px, semibold
- Description: 14-16px, muted-foreground
- Card: Optional border, padding
- Hover: Subtle border color change

Code:
<section className="py-20">
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
    {features.map(feature => (
      <div key={feature.id} className="space-y-4 p-6 rounded-lg border border-border hover:border-primary/50 transition">
        <feature.icon className="w-8 h-8 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
        <p className="text-sm text-muted-foreground">{feature.description}</p>
      </div>
    ))}
  </div>
</section>
```

### Process Section (3-Step)
```
Pattern: Roman numerals + Step title + Description
I. First Step         II. Second Step      III. Third Step
   Description           Description          Description
   
Implementation:
- Roman numerals: 48-64px, light weight, primary color
- Title: 20-24px, semibold
- Description: 14-16px, muted-foreground
- Layout: Flex row with space-between
- Line connectors optional (→ → on desktop)

Code:
<section className="py-20 grid grid-cols-1 md:grid-cols-3 gap-12">
  {steps.map((step, idx) => (
    <div key={idx} className="space-y-4">
      <div className="text-5xl font-light text-primary">
        {['I', 'II', 'III'][idx]}
      </div>
      <h3 className="text-xl font-semibold text-foreground">{step.title}</h3>
      <p className="text-muted-foreground">{step.description}</p>
    </div>
  ))}
</section>
```

### Pricing Section
```
Pattern: 3-tier pricing table
┌──────────┬──────────┬──────────┐
│ Starter  │   Pro    │Enterprise│
│  Free    │  $24/mo  │  Custom  │
│  Plan    │(Featured)│   Plan   │
│Features  │Features  │Features  │
│  CTA     │  CTA     │  CTA     │
└──────────┴──────────┴──────────┘

Implementation:
- 3 cards: flex layout
- Middle card: Highlighted (ring, scale)
- Price: Large (36-48px), bold
- Features: Bullet list with checkmarks
- CTA: Full width button
- Background: Subtle color for featured

Code:
<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
  {plans.map(plan => (
    <div 
      key={plan.id} 
      className={`p-8 rounded-lg border transition ${
        plan.featured 
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20 md:scale-105'
          : 'border-border'
      }`}
    >
      <h3 className="text-xl font-semibold text-foreground">{plan.name}</h3>
      <div className="text-4xl font-bold text-foreground mt-4">${plan.price}</div>
      <ul className="mt-6 space-y-3">
        {plan.features.map(f => (
          <li key={f} className="text-sm text-muted-foreground flex gap-2">
            <Check className="w-4 h-4 text-primary" /> {f}
          </li>
        ))}
      </ul>
      <Button className="w-full mt-8">{plan.cta}</Button>
    </div>
  ))}
</div>
```

---

## 2. DASHBOARD PATTERNS

### Metric Card
```
Pattern: Label + Large Number + Trend
┌─────────────────────┐
│ Label               │
│ 12,450              │ ← Large number
│ +12% this month     │ ← Trend
└─────────────────────┘

Code:
<div className="p-6 rounded-lg bg-card border border-border">
  <div className="space-y-2">
    <p className="text-sm text-muted-foreground">Label</p>
    <p className="text-3xl font-semibold text-foreground">12,450</p>
    <p className="text-xs text-green-600">+12% this month</p>
  </div>
</div>
```

### Issue Card (HackerRank/SonarQube style)
```
Pattern: Title + Description + Severity Badge + Action
┌────────────────────────────────────────────┐
│ Issue Title         │ [Severity Badge]     │
│ Description of issue with details          │
│ Line: 42 | Effort: 15 min                  │
│ [View Details]  [Suggest Fix]              │
└────────────────────────────────────────────┘

Code:
<div className="p-6 rounded-lg bg-card border border-border hover:border-primary/50 transition">
  <div className="flex justify-between items-start mb-3">
    <h3 className="font-semibold text-foreground">{issue.title}</h3>
    <span className={`px-3 py-1 rounded text-xs font-medium ${severityColors[issue.severity]}`}>
      {issue.severity}
    </span>
  </div>
  <p className="text-sm text-muted-foreground mb-3">{issue.description}</p>
  <div className="flex gap-4 text-xs text-muted-foreground mb-4">
    <span>Line: {issue.line}</span>
    <span>Effort: {issue.effort}min</span>
  </div>
  <div className="flex gap-2">
    <Button size="sm" variant="outline">Details</Button>
    <Button size="sm">Suggest Fix</Button>
  </div>
</div>
```

### Challenge Card (HackerRank style)
```
Pattern: Title + Description + Difficulty + Stats + Action
┌──────────────────────────────────────────────────┐
│ Challenge Title    [Difficulty Badge]            │
│ Challenge description about what to solve        │
│ 1,234 solved | 89% success rate | 15 min avg    │
│ [Solve Challenge] or [View Solution]             │
└──────────────────────────────────────────────────┘

Code:
<div className="p-6 rounded-lg bg-card border border-border hover:border-primary/50 transition cursor-pointer">
  <div className="flex justify-between items-start mb-3">
    <h3 className="font-semibold text-foreground text-lg">{challenge.title}</h3>
    <span className={`px-3 py-1 rounded text-xs font-medium ${difficultyColors[challenge.difficulty]}`}>
      {challenge.difficulty}
    </span>
  </div>
  <p className="text-sm text-muted-foreground mb-4">{challenge.description}</p>
  <div className="flex gap-4 text-xs text-muted-foreground mb-4">
    <span>{challenge.solved.toLocaleString()} solved</span>
    <span>{challenge.successRate}% success rate</span>
  </div>
  <Button className="w-full">Solve Challenge</Button>
</div>
```

### Metrics Dashboard (SonarQube style)
```
Pattern: 8 key metrics displayed in grid
┌─────────────────────────────────────────┐
│ Quality Score │ Bugs    │ Vulns │ Smells│
│     75/100    │   12    │  3    │  45   │
├─────────────────────────────────────────┤
│ Duplicates    │ Complex │ Covers│ Hotspot
│    12%        │   42    │  65%  │   8   │
└─────────────────────────────────────────┘

Code:
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
  {metrics.map(metric => (
    <div key={metric.id} className="p-4 rounded-lg bg-card border border-border">
      <p className="text-xs text-muted-foreground mb-1">{metric.label}</p>
      <p className="text-2xl font-bold text-foreground">{metric.value}</p>
      {metric.trend && (
        <p className={`text-xs mt-1 ${metric.trend > 0 ? 'text-red-600' : 'text-green-600'}`}>
          {metric.trend > 0 ? '↑' : '↓'} {Math.abs(metric.trend)}
        </p>
      )}
    </div>
  ))}
</div>
```

### Leaderboard (HackerRank style)
```
Pattern: Ranked list with scores
┌─────┬──────────────────┬───────┬─────────┐
│ #   │ User             │ Score │ Solves  │
├─────┼──────────────────┼───────┼─────────┤
│ 1   │ john_dev         │ 2,850 │ 145     │
│ 2   │ sarah_coder      │ 2,720 │ 142     │
│ 3   │ alex_programmer  │ 2,590 │ 138     │
└─────┴──────────────────┴───────┴─────────┘

Code:
<div className="space-y-2">
  {leaderboard.map((entry, idx) => (
    <div key={entry.id} className="flex items-center justify-between p-4 rounded-lg bg-card border border-border hover:border-primary/50">
      <div className="flex items-center gap-4">
        <span className="text-lg font-bold text-primary w-8 text-right">#{idx + 1}</span>
        <span className="text-foreground font-medium">{entry.username}</span>
      </div>
      <div className="flex items-center gap-8">
        <span className="text-foreground font-semibold">{entry.score.toLocaleString()}</span>
        <span className="text-muted-foreground">{entry.solves} solves</span>
      </div>
    </div>
  ))}
</div>
```

---

## 3. COLOR USAGE PATTERNS

### Severity Levels (SonarQube)
```
Critical:  Red (#DC2626)      - Immediate action needed
Major:     Orange (#EA580C)   - Important issues
Minor:     Amber (#F59E0B)    - Good to fix
Info:      Blue (#3B82F6)     - Informational

Usage:
- Badges: Background with darker text
- Text: Use color directly
- Cards: Subtle background, border color
```

### Difficulty Levels (HackerRank)
```
Easy:      Green (#16A34A)    - For beginners
Medium:    Amber (#F59E0B)    - Intermediate level
Hard:      Red (#DC2626)      - Advanced problems
Expert:    Purple (#7C3AED)   - Expert level

Usage:
- Badges: Same as severity
- Visual indicators: Dots/bars
- Filter tags: Outlined pills
```

### Status Colors
```
Success:   Green (#16A34A)    - Passed, approved
Warning:   Amber (#F59E0B)    - Attention needed
Error:     Red (#DC2626)      - Failed, critical
Info:      Blue (#3B82F6)     - Information
Pending:   Gray (#6B7280)     - In progress
```

---

## 4. RESPONSIVE PATTERNS

### Mobile-First Layout
```
Mobile (< 640px):
- Single column layouts
- Stacked cards
- Full-width buttons
- Hamburger menu

Tablet (640px - 1024px):
- 2 columns
- Side-by-side cards
- Visible menu
- Adjusted spacing

Desktop (> 1024px):
- 3-4 columns
- Cards in grid
- Persistent sidebar
- Expanded spacing

Tailwind Classes:
grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 lg:grid-cols-4
p-4 md:p-6 lg:p-8
text-lg md:text-xl lg:text-2xl
flex flex-col md:flex-row
```

---

## 5. INTERACTION PATTERNS

### Hover States
```
Cards: Border color change
<div className="border-border hover:border-primary/50 transition">

Buttons: Color shift + slight scale
<button className="hover:opacity-90 active:scale-95 transition">

Links: Underline on hover
<a className="hover:underline">

Icons: Color change
<Icon className="text-muted-foreground hover:text-primary transition">
```

### Loading States
```
Button with spinner:
{loading ? (
  <>
    <Loader className="w-4 h-4 mr-2 animate-spin" />
    Loading...
  </>
) : (
  'Click me'
)}

Skeleton cards:
<div className="animate-pulse">
  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
  <div className="h-4 bg-muted rounded w-1/2" />
</div>
```

### Empty States
```
<div className="text-center p-12">
  <Icon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
  <p className="text-foreground font-medium">No data yet</p>
  <p className="text-sm text-muted-foreground">Get started by taking action</p>
  <Button className="mt-4">Primary CTA</Button>
</div>
```

---

## 6. FORM PATTERNS

### Input Group (Text with Icon)
```
<div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card">
  <Search className="w-4 h-4 text-muted-foreground" />
  <input 
    type="text" 
    placeholder="Search..."
    className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
  />
</div>
```

### Select/Dropdown
```
<select className="px-4 py-2 rounded-lg bg-card border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
  <option>Option 1</option>
  <option>Option 2</option>
</select>
```

### Filter Group
```
<div className="flex flex-wrap gap-2">
  {filters.map(filter => (
    <button key={filter.id} className={`px-3 py-1 rounded-full text-xs font-medium transition ${
      activeFilter === filter.id
        ? 'bg-primary text-primary-foreground'
        : 'bg-secondary text-foreground hover:bg-secondary/70'
    }`}>
      {filter.label}
    </button>
  ))}
</div>
```

---

## 7. TYPOGRAPHY PATTERNS

### Page Title
```
<div className="space-y-2">
  <h1 className="text-3xl md:text-4xl font-bold text-foreground">
    Page Title
  </h1>
  <p className="text-muted-foreground">Description or subtitle</p>
</div>
```

### Section Title
```
<div className="space-y-2 mb-6">
  <h2 className="text-2xl font-semibold text-foreground">
    Section Title
  </h2>
  <p className="text-sm text-muted-foreground">Optional description</p>
</div>
```

### Metric Labels
```
<div className="space-y-1">
  <p className="text-sm font-medium text-foreground">Label</p>
  <p className="text-2xl font-bold text-foreground">Value</p>
  <p className="text-xs text-muted-foreground">Subtitle</p>
</div>
```

---

## QUICK REFERENCE

### Spacing Scale
- xs: 4px (gap-1)
- sm: 8px (gap-2)
- md: 12px (gap-3)
- lg: 16px (gap-4)
- xl: 24px (gap-6)
- 2xl: 32px (gap-8)

### Border Radius
- sm: 4px (rounded)
- md: 8px (rounded-lg)
- lg: 12px (rounded-xl)
- full: 9999px (rounded-full)

### Font Sizes
- xs: 12px (text-xs)
- sm: 14px (text-sm)
- base: 16px (text-base)
- lg: 18px (text-lg)
- xl: 20px (text-xl)
- 2xl: 24px (text-2xl)
- 4xl: 36px (text-4xl)
- 6xl: 60px (text-6xl)

---

**Last Updated**: April 17, 2026  
**Version**: 1.0  
**For**: CodeSpectra Platform  
**Design System**: Modern Minimal (Optimus-inspired)
