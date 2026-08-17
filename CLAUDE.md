# CodeSpectra - Essential Reference

## �� 🗺��️ Project Structure
- **Frontend**: `/frontend` - Next.js 13+ App Router (React/TS)
- **Backend**: `/backend` - FastAPI Python service
- **Docs**: `/docs` - Documentation
- **Key Frontend Paths**:
  - `/frontend/app/dashboard/admin/` - SuperAdmin routes
  - `/frontend/app/dashboard/admin/settings/` - Platform settings
  - `/frontend/lib/page-permissions.ts` - Route access control
  - `/frontend/lib/use-page-guard.ts` - Access control hook
- **Key Backend Paths**:
  - `/backend/routers/` - API endpoints
  - `/backend/core/dependencies.py` - Redis client init
  - `/backend/core/config.py` - Env config (Upstash Redis)
  - `/backend/services/` - Business logic

## �� 🔑 SuperAdmin Access
SuperAdmin pages require:
1. Route in `ADMIN_ONLY_ROUTES` (frontend/lib/page-permissions.ts)
2. Component guard: `usePageGuard('superadmin')`
3. Examples: `/dashboard/admin/*`, `/dashboard/admin/settings/*`

## �� 💾 Redis Status
- **Implemented**: Redis client in backend (Upstash REST API)
- **Used for**: Rate limiting in AI endpoints (`backend/routers/ai.py`)
- **Fallback**: In-memory rate limiting when Redis not configured
- **Config**: Requires `.env` variables:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
- **Missing**: No SuperAdmin UI to configure Redis/settings
- **Audit Note**: "Upstash Redis config exists in `.env.example` but isn't wired yet"

## �� 🛠��️ Common Patterns
- **Adding Admin Page**: 
  1. Create `page.tsx` under `/frontend/app/dashboard/admin/[name]/`
  2. Add route to `ADMIN_ONLY_ROUTES` in page-permissions.ts
  3. Add label to `ROUTE_LABELS` and icon to `ICON_MAP` in layout.tsx
  4. Run `yarn build` to verify
- **Settings Sections**: Managed via URL `?section=` param in settings page
- **API Protection**: Backend routes should validate superadmin role

## �� 📝 Ponytail Principles (Lazy Dev)
1. **YAGNI**: Don't build unless needed
2. **Reuse**: Check existing code before writing new
3. **Stdlib/Native**: Use built-ins before dependencies
4. **One-line solutions**: Prefer simple over complex
5. **Minimum viable code**: Write least that works
6. **Root-cause fixes**: Fix shared functions, not callers
7. **Explain simplifications**: Add `ponytail:` comment with ceiling

## �� 🚨 Not Lazy About
- Input validation at trust boundaries
- Error handling preventing data loss
- Security measures
- Accessibility basics
- Understanding the problem fully before solving
- Anything explicitly requested

## �� 🔧 Development Commands
- Frontend dev: `yarn dev` (from `/frontend`)
- Backend dev: `uvicorn server:app --reload` (from `/backend`)
- Build: `yarn build` (frontend)
- Verify types: Included in build step