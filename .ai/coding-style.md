# Coding Style

> Patterns we follow. Read before writing new code.

---

## Null Safety

Always guard string methods on potentially null/undefined values:

```ts
// BAD — crashes if name is undefined
item.name.toLowerCase()

// GOOD — safe
(item.name || '').toLowerCase()
```

Same for `.toUpperCase()`, `.charAt()`, `.slice()`, `.trim()`.

---

## Secrets/Keys in UI

- Never display real secret values on page load
- Use `type="password"` by default, switch to `type="text"` only after explicit reveal action
- Reveal always fetches from `/reveal` endpoint, never from draft state
- 30s auto-hide after reveal
- Draft state for secrets starts empty unless user types

Pattern:
```tsx
const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({})
const [revealedValues, setRevealedValues] = useState<Record<string, string>>({})
const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

const handleRevealToggle = useCallback(async (key: string) => {
  if (visibleFields[key]) {
    clearTimeout(timers.current[key])
    delete timers.current[key]
    setVisibleFields(v => ({ ...v, [key]: false }))
    setRevealedValues(v => { const n = { ...v }; delete n[key]; return n })
  } else {
    const res = await fetch(`/api/admin/server-secrets/reveal?key=${key}`, { credentials: 'include' })
    const json = await res.json().catch(() => ({}))
    if (res.ok && json.value) setRevealedValues(v => ({ ...v, [key]: json.value }))
    setVisibleFields(v => ({ ...v, [key]: true }))
    clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(() => {
      setVisibleFields(v => ({ ...v, [key]: false }))
      setRevealedValues(v => { const n = { ...v }; delete n[key]; return n })
      delete timers.current[key]
    }, 30_000)
  }
}, [visibleFields])
```

Input:
```tsx
<Input
  type={visibleFields[key] ? 'text' : 'password'}
  value={visibleFields[key] ? (revealedValues[key] ?? '') : ''}
/>
```

---

## API Routes

Every entity with a list page needs CRUD:
- `POST /api/<entity>` — create
- `GET /api/<entity>/[id]` — read single
- `PATCH /api/<entity>/[id]` — update
- `DELETE /api/<entity>/[id]` — delete

Use `requireSuperAdmin()` or `requireAuth()` from `@/lib/route-auth` for protection.

---

## RBAC for New Pages

1. Add route to `frontend/lib/page-permissions.ts` in appropriate array
2. Do NOT edit `rbac.ts` — it's auto-generated
3. Add `usePageGuard('superadmin'|'tenant_admin'|'user')` in the page component
4. Run `yarn build` to validate

---

## PATCH Handlers for Secrets

Always guard against saving masked values:
```ts
import { isMaskedSecret } from '@/lib/server-secrets-cache'
if (isMaskedSecret(v)) continue
```

---

## Naming

- Server secrets: `snake_case` (e.g., `resend_api_key`, `razorpay_key_secret`)
- TypeScript interfaces: `PascalCase` (e.g., `ServerSecretsRecord`)
- React components: `PascalCase` `.tsx` files
- Client components: `'use client'` at top of file

---

## Imports

Use `@/` path alias for all internal imports. No relative paths deeper than 2 levels.

---

## Development Philosophy (ponytail rules)

Every AI and developer should follow this before writing code:

1. **Does it need to be built at all?** (YAGNI)
2. **Does it already exist in this codebase?** Reuse, don't rewrite.
3. **Does the standard library do this?** Use it.
4. **Does a native platform feature cover it?** Use it.
5. **Does an already-installed dependency solve it?** Use it.
6. **Can this be one line?** Make it one line.
7. **Only then:** write the minimum code that works.

Bug fix = root cause, not symptom. Fix the shared function once — don't patch the caller's 8 places, fix the callee's 1 place.

**Rules**: No abstractions not requested. No new dep if avoidable. No boilerplate. Deletion over addition. Boring over clever. Fewest files. Shortest working diff that's correct.

**Not lazy about**: security, input validation, data loss prevention, accessibility.