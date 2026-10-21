# CodeSpectra Development Rules

## Multi-Session Coordination

This repo is worked by MULTIPLE AI sessions at once (opencode tabs, claude-code, cursor). Collisions happen when sessions edit the same files without knowing. Follow this protocol in EVERY session, every task:

1. **Read `WORKING.md` first** — it is the shared coordination ledger. Check what other sessions have claimed and their status.
2. **Claim before you touch**: before editing, add a row to `WORKING.md` (session, task, files claimed, status, timestamp). Update it when done or abandoned.
3. **Check the repo state** before starting: `git status`, `git log --oneline -5`, `git stash list`.
4. **Commit small and often.** Uncommitted edits are invisible to other sessions — a large uncommitted diff is how collisions happen. After each atomic unit: commit + update `WORKING.md`.
5. **Never revert/`git checkout`/`git stash`/force-overwrite files another session has claimed** without confirming that session is finished. If a file is claimed by someone else, wait or coordinate — do NOT clobber.
6. **One writer per file at a time.** If you need a file another session owns, either wait for their claim to clear or use `/freeze` to scope your own edits and stay out of their files.
7. **Never `git push --force` / `git reset --hard`** — other sessions are working from the same branch and losing commits breaks them.
8. **At task end**: commit, update `WORKING.md` history row, and leave the working tree clean (nothing uncommitted).

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

## Sidebar Visibility & DB Permissions Flow

### How it works (3-layer filter in `layout.tsx`)

1. **Role filter (always)** — `page-permissions.ts` route arrays determine what each role CAN see
2. **DB permissions (when loaded)** — `/api/user/my-permissions` returns `readable` + `denied` routes
3. **Denied filter (always)** — pages explicitly denied in DB are hidden

### Key files
| File | Purpose |
|---|---|
| `frontend/lib/page-permissions.ts` | Route arrays + ROUTE_LABELS + section headers |
| `frontend/app/dashboard/dashboard-shell.tsx` | Sidebar rendering + 3-layer filter (`layout.tsx` is the thin server wrapper) |
| `frontend/app/api/user/my-permissions/route.ts` | Returns `{ readable, denied }` for logged-in role |
| `frontend/app/api/admin/permissions/roles/route.ts` | CRUD for role permissions (saves ALL resources including denied) |
| `frontend/lib/route-auth.ts` | 60s in-memory permission cache (`_permCache`), `getAPIUser()` |
| `frontend/components/ui/data-table.tsx` | Reusable DataTable with bulk select, pagination, search, filters |

### Adding a new page to the sidebar
1. Create `page.tsx` under `frontend/app/dashboard/`
2. Add route to `ALL_USER_ROUTES` / `ADMIN_ONLY_ROUTES` / `TENANT_ADMIN_ROUTES` / `JUDGE_ROUTES` in `page-permissions.ts`
3. Add label to `ROUTE_LABELS` in `page-permissions.ts`
4. Add icon to `ICON_MAP` in `layout.tsx` — **routes without icons don't appear in sidebar**
5. Run `yarn build` to verify

### Removing a page from the sidebar
1. Go to `/dashboard/admin/permissions` → select role → uncheck `read` → Save
2. The save **preserves the denied entry** (empty actions) in the `roles` collection
3. `/api/user/my-permissions` returns it in the `denied` array
4. Sidebar layer 3 hides it

### What NOT to do
- Do NOT remove routes from `page-permissions.ts` to hide pages — that breaks RBAC for all roles
- Do NOT manually delete permission entries from the `roles` MongoDB collection
- Always use the permissions UI to toggle read on/off

### Debugging sidebar not filtering
1. Check MongoDB: `db.roles.findOne({role:"user"})` — verify permissions have `actions: ['read']`
2. Check the `roles` API saves ALL resources (not just those with actions). The old code had `filter(p => p.actions.length > 0)` which dropped denied pages silently
3. Check `layout.tsx` has `permsLoaded` gate — sidebar waits for API before applying DB filter
4. Build locally if server `yarn build` produces stale output (`.next` webpack cache issue)
5. Deploy: `tar czf .next` from local → `docker cp` to server → restart service

### Ponytail: sidebar permissions known ceilings
- `useMemo` dependency on `allowedRoutes`/`deniedRoutes` Sets — works because new Set() is a new reference
- 60s permission cache in `route-auth.ts` — `invalidatePermissionCache()` on role save, cache auto-expires
- Local `.next` build preferred over server build when server produces stale output (webpack cache issue)

### Adding bulk-select to tables
Use the reusable `DataTable` component from `components/ui/data-table.tsx`:
```tsx
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
```
- Built-in: checkbox column, select all, bulk action bar, search, filters, pagination
- See `admin/exams/page.tsx` or `admin/codeathons/page.tsx` for usage examples

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

### Production Server (verified 2026-08-09)

| Item | Value |
|---|---|
| Host | `65.21.196.49` (Ubuntu noble, Docker Swarm managed by Dokploy) |
| SSH | `sshpass -p '<pass>' ssh root@65.21.196.49` |
| Frontend service | `codespectra-frontend-dmeptb` (1 replica) |
| Frontend image | `codespectra-frontend-dmeptb:latest` — **always roll to `:latest`, never `:patched`** |
| Dockerfile build context | `./frontend` (Dockerfile copies `frontend/` into image) |
| Container WORKDIR | `/app` (Next.js app root: `app/`, `components/`, `lib/`) |
| Container CMD | `npx next start -p 80` (exposed internally; host TLS via traefik) |
| Mongo service | `codespectra-mongo-iadpbk` (mongo:8) |
| Related | `codespectra-backend-cd7lq6` (FastAPI, 1 replica) |

### Deploy / roll the frontend

```bash
# Build a new image from frontend/ context (or let Dokploy build it), then:
docker service update --image codespectra-frontend-dmeptb:latest --force codespectra-frontend-dmeptb
# Wait for convergence:
docker service ps codespectra-frontend-dmeptb --format "{{.Name}} {{.Image}} {{.CurrentState}}"
# Verify routes flipped (new paths 200, old paths 404):
curl -s -o /dev/null -w "%{http_code}" https://codespectra.ai/dashboard/assessments
```

### Known pitfalls (DO NOT repeat)

- **`codespectra-frontend-dmeptb:patched` is STALE** (built Aug 7, pre-`exams→assessments`/`tenants→organizations` rename). It is NOT the current image. The old AGENTS.md flow (`docker commit ... :patched`) produced it and left the service pinned to old code — the root cause of the Aug 9 outage.
- **Dokploy builds `:latest` but does not always roll the service** — a failed deploy can leave a working `:latest` sitting un-rolled. If routes look old after a deploy, check `docker service inspect codespectra-frontend-dmeptb --format "{{.Spec.TaskTemplate.ContainerSpec.Image}}"` and force-update to `:latest`.
- **Dockerfile `RUN apk add docker-cli`** — the image is a build image, not a runtime shell host; don't try to `docker exec ... yarn build` against a running task for deployment.
- Container workdir is `/app` for the frontend image; the git repo root (`frontend/...`) is NOT inside the container — build happens at image build time from `./frontend`.

### Verify what's live

- `docker ps --filter name=codespectra-frontend` → image must be `codespectra-frontend-dmeptb:latest`
- Compiled routes inside container: `docker exec <task> ls /app/.next/server/app/dashboard/` → should show `assessments` (not `exams`), and `admin/organizations` (not `admin/tenants`)
- External: `/dashboard/assessments` and `/dashboard/admin/organizations` return 200; `/dashboard/exams` and `/dashboard/admin/tenants` return 404

### Push Gate (mandatory before every `git push`)

GitHub Actions runs *on* pushed code — it physically cannot run *before* a push.
So the gate is three layers, and every session follows all three:

1. **Local fast gate (you run it):** `sh scripts/pre-push-gate.sh` from the repo
   root (tsc + vitest + offline backend-unit, ~2 min). Do NOT push on red.
   Slow gates (`yarn build`, docker image, dep/secret audits) run in Actions —
   check them after pushing and fix-forward (new commit) on red. Never amend a
   pushed commit.
2. **CI on `dev-fixes`:** every push runs the pipeline
   (`.github/workflows/ci.yml`). Red required job = stop and fix, same session.
3. **`main` is protected:** Dokploy deploys from `main` only. Land via PR with
   all required checks green (repo Settings → Branches → protection rule on
   `main`: require PR, require status checks, no direct pushes, no force-pushes).
   Never push directly to `main`, never `git push --force` (see Coordination §7).

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
