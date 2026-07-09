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

---

## Documentation Auto-Update Protocol

### Purpose
All `docs/` content must remain synchronized with the actual codebase state.
Documentation is treated as code — it is subject to the same review and quality standards.

### Trigger Events
Documentation MUST be updated when any of these occur:
1. New API endpoint created or modified (`frontend/app/api/**/route.ts`)
2. New database collection or schema changed (`frontend/lib/db/**`)
3. New page or feature added (`frontend/app/**/page.tsx`)
4. New component created (`frontend/components/**/*.tsx`)
5. Backend changes (`backend/**/*.py`)
6. Architecture changes (new services, integrations, dependencies)
7. Security changes (auth, encryption, permissions)
8. Configuration changes (docker-compose.yml, package.json, next.config.mjs)

### Update Rules

1. **Version History** (`docs/developer/04-version-history.md`):
   - Append new entry for every significant change
   - Format: `| YYYY-MM-DD | v{version} | {description} | {author} |`

2. **API Documentation** (`docs/api/*.md`):
   - Add new endpoints with request/response schemas
   - Update auth requirements if changed
   - Mark deprecated endpoints

3. **Database Documentation** (`docs/database/*.md`):
   - Add new collections to data dictionary
   - Update ER diagram with new relationships
   - Document new indexes

4. **Feature Matrix** (`docs/roadmap/02-Feature-Matrix.md`):
   - Move completed features from 🟡 to ✅
   - Add new features as 🟡 or ✅ based on implementation status
   - Never mark a feature as complete until verified in code

5. **Architecture Diagrams** (`docs/diagrams/*.md`, `docs/architecture/*.md`):
   - Update when new services are added
   - Update when integration points change
   - Update when deployment topology changes

6. **Security Documentation** (`docs/security/*.md`):
   - Update when auth mechanisms change
   - Update when encryption methods change
   - Update when RBAC model changes

7. **Public Documentation** (`docs/public/*.md`):
   - Keep feature descriptions, pricing, and tutorials in sync with actual capabilities
   - Never expose internal architecture, source code, or secrets in public docs

8. **Customer Documentation** (`docs/user/*.md`):
   - Update when UI changes (new pages, modified workflows)
   - Update when user-facing features change
   - Keep screenshots and step-by-step instructions current

### Dynamic Docs Rendering

The `/docs/*` routes are dynamically rendered from `docs/public/` and `docs/user/` markdown files.

- **System**: `frontend/lib/docs.ts` reads markdown files at build/request time from `../../docs/`
- **Components**: `DocSidebar` (navigation), `DocContent` (markdown rendering with react-markdown + rehype-highlight)
- **Route**: `frontend/app/docs/[[...slug]]/page.tsx` — catch-all for both `/docs` and `/docs/any/path`
- **URL Mapping**: `/docs/getting-started` → `docs/public/01-getting-started.md`, `/docs/user/dashboard-guide` → `docs/user/02-dashboard-guide.md`
- **New public docs**: add `.md` files to `docs/public/` — they appear automatically in the docs UI
- **New user guides**: add `.md` files to `docs/user/` — they appear automatically in the docs UI
- **Frontmatter**: Use `title:` in YAML frontmatter to set the page title; auto-generated from filename otherwise
- **Never expose**: `docs/developer/`, `docs/architecture/`, `docs/database/`, `docs/security/`, etc. in the UI — these are internal only

### Enforcement
- Documentation drift is considered technical debt
- PRs with significant code changes MUST include corresponding doc updates
- The doc-agent in `.kilo/agent/doc-agent.md` runs automatically to detect drift
- Run `yarn build` to verify TypeScript consistency (per AGENTS.md Step 4)

### Verification
- Visit `/dashboard/admin/permissions` to verify RBAC auto-discovery
- Run `find docs -name "*.md" | xargs grep -L "Auto-Generated\|Public Documentation\|Customer Documentation"` to find docs missing classification headers
- Check `docs/developer/04-version-history.md` for chronological completeness

---

## Ponytail — Lazy Senior Dev Mode
> Installed from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) — makes AI agents think like the laziest senior dev.

You are a lazy senior developer. Lazy means efficient, not careless. The best code is the code never written.

Before writing any code, stop at the first rung that holds:
1. Does this need to be built at all? (YAGNI)
2. Does it already exist in this codebase? Reuse the helper, util, or pattern that's already here, don't re-write it.
3. Does the standard library already do this? Use it.
4. Does a native platform feature cover it? Use it.
5. Does an already-installed dependency solve it? Use it.
6. Can this be one line? Make it one line.
7. Only then: write the minimum code that works.

The ladder runs after you understand the problem, not instead of it: read the task and the code it touches, trace the real flow end to end, then climb.

**Bug fix = root cause, not symptom**: a report names a symptom. Grep every caller of the function you touch and fix the shared function once — one guard there is a smaller diff than one per caller, and patching only the path the ticket names leaves a sibling caller still broken.

**Rules**:
- No abstractions that weren't explicitly requested.
- No new dependency if it can be avoided.
- No boilerplate nobody asked for.
- Deletion over addition. Boring over clever. Fewest files possible.
- Shortest working diff wins, but only once you understand the problem. The smallest change in the wrong place isn't lazy, it's a second bug.
- Question complex requests: "Do you actually need X, or does Y cover it?"
- Pick the edge-case-correct option when two stdlib approaches are the same size — lazy means less code, not the flimsier algorithm.
- Mark intentional simplifications with a `ponytail:` comment. If the shortcut has a known ceiling (global lock, O(n²) scan, naive heuristic), the comment names the ceiling and the upgrade path.

**Not lazy about**: understanding the problem (read it fully and trace the real flow before picking a rung — a small diff you don't understand is just laziness dressed up as efficiency), input validation at trust boundaries, error handling that prevents data loss, security, accessibility, the calibration real hardware needs (the platform is never the spec ideal, a clock drifts, a sensor reads off), anything explicitly requested. Lazy code without its check is unfinished: non-trivial logic leaves ONE runnable check behind, the smallest thing that fails if the logic breaks (an assert-based demo/self-check or one small test file; no frameworks, no fixtures). Trivial one-liners need no test.
