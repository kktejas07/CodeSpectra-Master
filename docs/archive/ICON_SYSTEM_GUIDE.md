# Icon System Guide

## Overview

This guide explains how to properly use icons across CodeSpectra. We use **Lucide React** as our primary icon library for consistency, performance, and accessibility.

---

## Key Icon Packages

### Primary: Lucide React
- **Package**: `lucide-react`
- **Total Icons**: 1000+ icons
- **Version**: Latest (auto-installed)
- **Usage**: Most consistent, preferred for all UI

```tsx
import { Code2, Zap, Trophy } from 'lucide-react'

<Code2 className="w-6 h-6" />
```

---

## Icon System Architecture

### Three Layers

1. **Language Icons** (`lib/language-icons.ts`)
   - Specific to programming languages & technologies
   - Used in code scanner, challenges, learning
   - Maps language name → icon + color + metadata

2. **Global Icon System** (`lib/icon-system.ts`)
   - Categorized icon names
   - Central reference for all UI icons
   - Organized by: navigation, actions, status, features, etc.

3. **Language Badge Component** (`components/ui/language-badge.tsx`)
   - React component for language badges
   - Automatically displays correct icon
   - Works with language-icons system

---

## Language Icons System

### Supported Languages

```typescript
type LanguageType = 
  | 'javascript' | 'typescript' | 'python' | 'java' | 'cpp' | 'csharp'
  | 'php' | 'ruby' | 'go' | 'rust' | 'kotlin' | 'swift'
  | 'react' | 'vue' | 'angular' | 'node'
  | 'sql' | 'html' | 'css' | 'scss' | 'less'
  | 'mongodb' | 'postgresql' | 'mysql' | 'redis'
  | 'docker' | 'kubernetes' | 'aws' | 'azure' | 'gcp'
  | 'git' | 'webpack' | 'vite' | 'nextjs' | 'gatsby'
  | 'graphql' | 'rest' | 'other'
```

### Language Badge Configuration

Each language has:
- **icon**: Lucide icon name (e.g., 'Code2', 'Database')
- **label**: Display name
- **color**: Tailwind text color
- **bgColor**: Tailwind background color
- **description**: Tooltip/help text

### Example: JavaScript

```typescript
javascript: {
  icon: 'Code2',
  label: 'JavaScript',
  color: 'text-yellow-600',
  bgColor: 'bg-yellow-100',
  description: 'JavaScript',
}
```

---

## Using Language Badges

### Single Badge

```tsx
import { LanguageBadge } from '@/components/ui/language-badge'

<LanguageBadge language="javascript" size="md" />
// Output: [⚙️ JavaScript]
```

### Badge Group

```tsx
import { LanguageBadgeGroup } from '@/components/ui/language-badge'

<LanguageBadgeGroup 
  languages={['javascript', 'typescript', 'react', 'node']}
  maxDisplay={3}
  size="sm"
/>
// Output: [⚙️ JavaScript] [📄 TypeScript] [⚡ React] [+1 more]
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `language` | `string` | required | Language identifier |
| `variant` | `'default' \| 'outline' \| 'secondary' \| 'destructive'` | `'secondary'` | Badge style |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Badge size |
| `showIcon` | `boolean` | `true` | Display icon |
| `className` | `string` | `''` | Additional CSS |

---

## Global Icon System

### Categories

```typescript
ICON_SYSTEM = {
  navigation: { menu, close, back, home, settings, ... }
  actions: { add, edit, delete, save, upload, ... }
  status: { success, error, warning, loading, locked, ... }
  features: { dashboard, challenges, scanner, learning, ... }
  files: { file, image, pdf, folder, ... }
  social: { github, twitter, linkedin, ... }
  devTools: { git, terminal, bug, wrench, ... }
  charts: { lineChart, barChart, pieChart, ... }
  system: { admin, security, permissions, roles, ... }
  misc: { star, heart, bookmark, calendar, ... }
}
```

### Usage Examples

#### Get Icon by Category

```tsx
import { ICON_SYSTEM } from '@/lib/icon-system'
import * as Icons from 'lucide-react'

const iconName = ICON_SYSTEM.navigation.menu  // 'Menu'
const IconComponent = Icons[iconName]
<IconComponent className="w-6 h-6" />
```

#### Dynamic Icon Rendering

```tsx
function ActionButton({ action }) {
  const iconName = ICON_SYSTEM.actions[action]
  const IconComponent = Icons[iconName]
  
  return (
    <button>
      <IconComponent className="w-4 h-4" />
      {action}
    </button>
  )
}
```

#### Find Icon by Search

```tsx
import { findIcon } from '@/lib/icon-system'

const result = findIcon('delete')
// { category: 'actions', key: 'delete', icon: 'Trash2' }
```

---

## Icon Sizing Standards

### Standard Sizes

```typescript
// Small (toolbar, badges)
className="w-4 h-4"

// Medium (buttons, headers)
className="w-5 h-5"

// Large (page headers, hero)
className="w-6 h-6"

// Extra Large (full-page icons)
className="w-8 h-8"
```

### Responsive Sizing

```tsx
<Icon className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6" />
```

---

## Icon Colors & Styling

### Using Tailwind Colors

```tsx
// Primary
<Code2 className="text-primary" />

// Status colors
<CheckCircle className="text-green-600" />
<AlertCircle className="text-red-600" />
<Clock className="text-yellow-600" />

// With background
<div className="bg-blue-100 p-2 rounded">
  <Code2 className="text-blue-600" />
</div>
```

### Hover & Interaction States

```tsx
<button className="hover:text-primary transition-colors">
  <Edit2 className="w-5 h-5" />
</button>
```

---

## Best Practices

### ✅ Do

1. **Use Lucide Icons** for all UI elements
   ```tsx
   import { Settings } from 'lucide-react'
   ```

2. **Reference ICON_SYSTEM** for consistency
   ```tsx
   const icon = ICON_SYSTEM.features.scanner
   ```

3. **Use LanguageBadge** for language/tech badges
   ```tsx
   <LanguageBadge language="python" />
   ```

4. **Consistent Sizing**
   ```tsx
   // Good
   <Icon className="w-6 h-6" />
   
   // Bad
   <Icon size={24} />
   ```

5. **Color Contrast**
   ```tsx
   // Good - sufficient contrast
   <Icon className="text-primary" />
   
   // Bad - low contrast
   <Icon className="text-gray-300" />
   ```

### ❌ Don't

1. **Don't use emojis** as icon replacements
2. **Don't mix icon packages** - stick to Lucide
3. **Don't hardcode icon names** - use ICON_SYSTEM
4. **Don't forget accessibility** - add titles/labels
5. **Don't use arbitrary sizes** - stick to standards

---

## Code Examples

### Example 1: Challenge Language Badge

```tsx
// app/dashboard/challenges/page.tsx
import { LanguageBadge } from '@/components/ui/language-badge'

export function ChallengeCard({ challenge }) {
  return (
    <Card>
      <h3>{challenge.title}</h3>
      <p>{challenge.description}</p>
      
      {/* Language badges with proper icons */}
      <div className="flex gap-2 mt-4">
        {challenge.languages.map(lang => (
          <LanguageBadge key={lang} language={lang} size="sm" />
        ))}
      </div>
    </Card>
  )
}
```

### Example 2: Status Indicators

```tsx
// components/status-indicator.tsx
import * as Icons from 'lucide-react'
import { ICON_SYSTEM } from '@/lib/icon-system'

export function StatusIndicator({ status }) {
  const iconName = ICON_SYSTEM.status[status]
  const IconComponent = Icons[iconName]
  
  const colors = {
    success: 'text-green-600',
    error: 'text-red-600',
    warning: 'text-yellow-600',
    loading: 'text-blue-600 animate-spin',
  }
  
  return <IconComponent className={`w-5 h-5 ${colors[status]}`} />
}
```

### Example 3: Feature Menu

```tsx
// components/feature-menu.tsx
import * as Icons from 'lucide-react'
import { ICON_SYSTEM } from '@/lib/icon-system'

const FEATURES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'challenges', label: 'Challenges' },
  { key: 'scanner', label: 'Code Scanner' },
]

export function FeatureMenu() {
  return (
    <nav>
      {FEATURES.map(feature => {
        const iconName = ICON_SYSTEM.features[feature.key]
        const IconComponent = Icons[iconName]
        
        return (
          <a key={feature.key} className="flex items-center gap-2">
            <IconComponent className="w-5 h-5" />
            {feature.label}
          </a>
        )
      })}
    </nav>
  )
}
```

---

## Migration Guide

### Old Way (Don't Do This)

```tsx
// ❌ Avoid: hardcoded icon names
<Icon name="javascript" />

// ❌ Avoid: emoji icons
<span>⚙️ Settings</span>

// ❌ Avoid: arbitrary sizing
<Settings size={22} />
```

### New Way (Do This)

```tsx
// ✅ Correct: language badge
<LanguageBadge language="javascript" />

// ✅ Correct: icon system reference
<Settings className={ICON_SYSTEM.navigation.settings} />

// ✅ Correct: standard sizing
<Settings className="w-6 h-6" />
```

---

## Adding New Languages

### Step 1: Add to Type

```typescript
// lib/language-icons.ts
export type LanguageType = 
  | 'javascript'
  | 'typescript'
  | 'newlang'  // ← Add here
  | 'other'
```

### Step 2: Add Configuration

```typescript
newlang: {
  icon: 'Code2',        // Lucide icon name
  label: 'New Lang',    // Display name
  color: 'text-blue-600',        // Text color
  bgColor: 'bg-blue-100',        // Background color
  description: 'New Language',   // Description
}
```

### Step 3: Use

```tsx
<LanguageBadge language="newlang" />
```

---

## Adding New Icons to System

### Step 1: Update ICON_SYSTEM

```typescript
// lib/icon-system.ts
misc: {
  // ... existing icons
  newicon: 'IconName',  // Add here
}
```

### Step 2: Use

```tsx
import { ICON_SYSTEM } from '@/lib/icon-system'
import { IconName } from 'lucide-react'

const icon = ICON_SYSTEM.misc.newicon  // 'IconName'
```

---

## Icon Reference

### Lucide React Common Icons

| Purpose | Icon | Usage |
|---------|------|-------|
| Code | `Code`, `Code2`, `FileCode` | Programming, files |
| Database | `Database`, `Server` | Data, backend |
| Settings | `Settings`, `Cog` | Configuration |
| Users | `User`, `Users`, `Users2` | Accounts, teams |
| Status | `CheckCircle`, `AlertCircle`, `Clock` | States |
| Navigation | `Menu`, `ChevronRight`, `ArrowRight` | Navigation |
| Actions | `Plus`, `Edit2`, `Trash2` | CRUD operations |
| Files | `File`, `Folder`, `Download` | File management |

### Finding Icons

Visit https://lucide.dev for:
- Complete icon library
- Visual preview
- Copy icon names directly
- Search by keyword

---

## Troubleshooting

### Icon not rendering

```tsx
// ❌ Wrong: Icon name as string not imported
<Icon name="Settings" />

// ✅ Correct: Import and use component
import { Settings } from 'lucide-react'
<Settings className="w-6 h-6" />
```

### Styling not working

```tsx
// ❌ Wrong: Using size prop
<Settings size={24} />

// ✅ Correct: Using className
<Settings className="w-6 h-6" />
```

### Language badge not showing

```tsx
// ❌ Wrong: Invalid language
<LanguageBadge language="invalid" />

// ✅ Correct: Use supported type
<LanguageBadge language="python" />
```

---

## Summary

| Component | Purpose | Example |
|-----------|---------|---------|
| `LanguageBadge` | Single language badge | `<LanguageBadge language="python" />` |
| `LanguageBadgeGroup` | Multiple language badges | `<LanguageBadgeGroup languages={['js', 'ts']} />` |
| `language-icons.ts` | Language configurations | `getLanguageConfig('python')` |
| `icon-system.ts` | Global icon references | `ICON_SYSTEM.features.scanner` |
| `lucide-react` | Icon components | `<Settings className="w-6 h-6" />` |

---

## Resources

- **Lucide Icons**: https://lucide.dev
- **Tailwind Colors**: https://tailwindcss.com/docs/customizing-colors
- **Lucide React Docs**: https://lucide.dev/guide/packages/lucide-react
- **Accessibility**: https://www.w3.org/WAI/ARIA/apg/patterns/icon-button/
