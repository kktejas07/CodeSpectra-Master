# Icon System Quick Reference

## One-Minute Setup

### Import & Use Language Badge
```tsx
import { LanguageBadge } from '@/components/ui/language-badge'

<LanguageBadge language="python" />
```

### Import & Use Icon System
```tsx
import { ICON_SYSTEM } from '@/lib/icon-system'
import { Settings } from 'lucide-react'

const icon = ICON_SYSTEM.navigation.settings
<Settings className="w-6 h-6" />
```

---

## Supported Languages

```
Frontend:      JavaScript, TypeScript, React, Vue, Angular, HTML, CSS, SCSS, Less
Backend:       Python, Java, C++, C#, PHP, Ruby, Go, Rust, Kotlin, Swift, Node.js
Databases:     SQL, MongoDB, PostgreSQL, MySQL, Redis
Cloud:         Docker, Kubernetes, AWS, Azure, GCP
Build Tools:   Git, Webpack, Vite, Next.js, Gatsby, GraphQL, REST
```

---

## Icon Categories

| Category | Use For | Examples |
|----------|---------|----------|
| `navigation` | Menus, navigation | menu, home, settings, user |
| `actions` | Buttons, CRUD | add, edit, delete, save |
| `status` | States, alerts | success, error, loading, locked |
| `features` | Main features | dashboard, challenges, scanner |
| `files` | File/folder icons | file, image, pdf, folder |
| `social` | Social links | github, twitter, linkedin |
| `devTools` | Dev utilities | git, terminal, bug, package |
| `charts` | Analytics/graphs | lineChart, barChart, trend |
| `system` | Admin panel | admin, security, roles |
| `misc` | General | star, bookmark, calendar |

---

## Common Icon Names

```
NAVIGATION:
  menu, close, back, forward, home, settings, user, search, sort

ACTIONS:
  add, edit, delete, save, upload, download, copy, refresh

STATUS:
  success (CheckCircle), error (AlertCircle), loading (Loader)
  warning (AlertTriangle), locked (Lock), active (Circle)

FEATURES:
  dashboard (LayoutGrid), challenges (Zap), scanner (Code2)
  learning (BookOpen), interviews (Mic), leaderboard (BarChart3)
```

---

## Code Snippets

### Single Language Badge
```tsx
<LanguageBadge language="javascript" size="md" />
<LanguageBadge language="python" size="sm" showIcon={true} />
```

### Multiple Language Badges
```tsx
<LanguageBadgeGroup 
  languages={['python', 'typescript', 'react']} 
  maxDisplay={3}
  size="sm"
/>
```

### Get Language Config
```tsx
import { getLanguageConfig } from '@/lib/language-icons'

const config = getLanguageConfig('python')
console.log(config.icon)    // 'Code'
console.log(config.label)   // 'Python'
console.log(config.color)   // 'text-blue-700'
```

### Get Icon from System
```tsx
import { ICON_SYSTEM } from '@/lib/icon-system'

const iconName = ICON_SYSTEM.features.scanner  // 'Code2'
const iconName = ICON_SYSTEM.actions.delete    // 'Trash2'
```

### Dynamic Icon Component
```tsx
import * as Icons from 'lucide-react'

const iconName = 'Code2'
const IconComponent = Icons[iconName]
<IconComponent className="w-6 h-6" />
```

### Icon Sizes
```tsx
<Icon className="w-4 h-4" />  // Small (16px)
<Icon className="w-5 h-5" />  // Medium (20px)
<Icon className="w-6 h-6" />  // Large (24px)
<Icon className="w-8 h-8" />  // XL (32px)
```

---

## LanguageBadge Props

| Prop | Type | Default | Example |
|------|------|---------|---------|
| `language` | `string` | required | `"python"` |
| `variant` | `'default' \| 'outline' \| 'secondary' \| 'destructive'` | `'secondary'` | `variant="outline"` |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | `size="lg"` |
| `showIcon` | `boolean` | `true` | `showIcon={false}` |
| `className` | `string` | `''` | `className="my-2"` |

---

## LanguageBadgeGroup Props

| Prop | Type | Default | Example |
|------|------|---------|---------|
| `languages` | `string[]` | required | `['js', 'ts', 'react']` |
| `maxDisplay` | `number` | `5` | `maxDisplay={3}` |
| `variant` | `string` | `'secondary'` | `variant="outline"` |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | `size="sm"` |
| `showIcons` | `boolean` | `true` | `showIcons={true}` |
| `className` | `string` | `''` | `className="gap-3"` |

---

## Icon System Helper Functions

```tsx
// Get icon from category
import { getIcon } from '@/lib/icon-system'
getIcon('features', 'scanner')  // 'Code2'

// Get all icons from category
import { getIconsFromCategory } from '@/lib/icon-system'
getIconsFromCategory('navigation')  // { menu, close, back, ... }

// Search for icon
import { findIcon } from '@/lib/icon-system'
findIcon('delete')
// { category: 'actions', key: 'delete', icon: 'Trash2' }
```

## Language Icons Helper Functions

```tsx
// Get language config
import { getLanguageConfig } from '@/lib/language-icons'
getLanguageConfig('python')  // Full config with icon, color, etc.

// Get all languages
import { getAllLanguages } from '@/lib/language-icons'
getAllLanguages()  // Array of all supported languages

// Find language by label
import { getLanguageByLabel } from '@/lib/language-icons'
getLanguageByLabel('Python')  // 'python'
```

---

## Best Practices

✅ **DO:**
- Use `<LanguageBadge>` for language badges
- Reference `ICON_SYSTEM` for consistency
- Use standard sizes (w-4, w-5, w-6)
- Import from `lucide-react` for custom icons

❌ **DON'T:**
- Use emoji as icons
- Hardcode icon names
- Mix icon packages
- Use arbitrary icon sizes

---

## File Locations

```
lib/rbac.ts                          ← RBAC utilities (client-safe)
lib/rbac-server.ts                   ← RBAC utilities (server-only)
lib/language-icons.ts                ← Language configurations
lib/icon-system.ts                   ← Global icon references
components/ui/language-badge.tsx     ← Badge components
ICON_SYSTEM_GUIDE.md                 ← Full documentation
```

---

## Common Patterns

### Challenge Card
```tsx
<Card>
  <h3>{challenge.title}</h3>
  <LanguageBadgeGroup languages={challenge.langs} size="sm" />
</Card>
```

### Admin Menu
```tsx
{ICON_SYSTEM.system.admin && (
  <Settings className="w-5 h-5" />
)}
```

### Code Editor
```tsx
<div>
  <LanguageBadge language={language} size="sm" />
  <CodeEditor value={code} />
</div>
```

### Status Indicator
```tsx
<div className="flex items-center gap-2">
  <CheckCircle className="w-5 h-5 text-green-600" />
  <span>Success</span>
</div>
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Icon not showing | Import from `lucide-react`, not as string |
| Wrong language badge | Check `language-icons.ts` for valid names |
| Icon sizing wrong | Use `className="w-X h-X"`, not `size` prop |
| Build errors | Make sure server code in `rbac-server.ts` |
| Low contrast | Use `text-primary` or adequate color classes |

---

## Documentation Links

- **Full Guide**: `ICON_SYSTEM_GUIDE.md` (527 lines)
- **Summary**: `ICON_SYSTEM_SUMMARY.md` (317 lines)
- **This File**: `ICON_QUICK_REFERENCE.md`
- **Lucide Icons**: https://lucide.dev
- **Tailwind CSS**: https://tailwindcss.com

---

## Version Info

- **Lucide React**: Latest (auto-installed)
- **Supported Languages**: 40+
- **Total Icons**: 1000+ (from Lucide)
- **Categories**: 13
- **Last Updated**: 2026-04-17
