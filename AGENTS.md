# CodeSpectra Development Rules

## Permission System

When adding a new dashboard page, follow this rule:

### Step 1: Register the route in `frontend/lib/page-permissions.ts`
Add the route to ONE of these arrays:
- `ADMIN_ONLY_ROUTES` — superadmin only (e.g. `/dashboard/admin/*`)
- `TENANT_ADMIN_ROUTES` — org admin & above (e.g. `/dashboard/admin/team`)
- `ALL_USER_ROUTES` — all authenticated users (e.g. `/dashboard/problems`)

### Step 2: RBAC is auto-generated
Do NOT manually edit `SUPERADMIN_PAGES`, `TENANT_ADMIN_PAGES`, or `USER_PAGES` in `frontend/lib/rbac.ts`. They are auto-generated from `page-permissions.ts`.

### Step 3: Add page guard in component
```tsx
import { usePageGuard } from '@/lib/use-page-guard'

export default function MyPage() {
  const gate = usePageGuard('superadmin') // or 'tenant_admin' or 'user'
  if (!gate.ready) return <LoadingSpinner />
  return <div>Page content</div>
}
```

### Step 4: Verify
- Run `yarn build` — it validates TypeScript consistency
- Visit `/dashboard/admin/permissions` — auto-detects RBAC gaps

---

## Null Safety

Always guard `.toLowerCase()`, `.toUpperCase()`, `.charAt()` on potentially null/undefined values with `|| ''`:
```ts
// BAD: crashes if name is undefined
item.name.toLowerCase()

// GOOD: safe
(item.name || '').toLowerCase()
```

---

## CRUD Operations

Every API entity that has a list page should also have:
- `POST /api/[entity]` — create
- `GET /api/[entity]/[id]` — read single
- `PATCH /api/[entity]/[id]` — update
- `DELETE /api/[entity]/[id]` — delete

---

## Deployment

Server runs Docker Swarm managed by Dokploy. Frontend container: `codespectra-frontend-dmeptb`. To deploy:
```bash
# Build on server
docker exec <container> sh -c "cd /app && yarn build"
docker commit <container> codespectra-frontend-dmeptb:patched
docker service update --image codespectra-frontend-dmeptb:patched --force codespectra-frontend-dmeptb
```

---

## MongoDB Collections

Database: `codespectra`. Key collections: `users`, `platform_settings`, `challenges`, `problems`, `submissions`, `workflows`.
