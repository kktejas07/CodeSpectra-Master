> **Auto-Generated Documentation**
> **Last Updated**: 2026-07-08
> **Source**: CodeSpectra Codebase Audit
> **Auto-Update Rule**: This document must be regenerated when API endpoints or database schemas change.

# Scanner API

## POST /api/scanner/init

Legacy endpoint — now a no-op. Scanner seed data is auto-initialized on startup.

**Response (200):**
```json
{
  "status": "ok",
  "message": "Scanner seed data is now auto-initialized on startup. This endpoint is a no-op."
}
```

## GET /api/scanner/metrics

Fetch per-file metrics. Query parameters:

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | Filter by project |
| `scanId` | string | Filter by scan |
| `page` | number | Default 1 |
| `limit` | number | Default 20 (max 100) |

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "scan_id": "uuid",
      "project_id": "proj_1",
      "user_id": "uuid",
      "file_path": "src/main.js",
      "lines_of_code": 150,
      "language": "javascript",
      "complexity": 12,
      "created_at": "2026-07-01T00:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 42 }
}
```

**Auth**: Not required for GET.

## POST /api/scanner/metrics

Create file metrics (auth required).

**Auth**: `requireAuth()`

**Request Body** (array or single):
```json
[{
  "scan_id": "uuid",
  "project_id": "proj_1",
  "file_path": "src/main.js",
  "lines_of_code": 150,
  "language": "javascript",
  "complexity": 12
}]
```

**Response (201):**
```json
{
  "data": [{ "id": "uuid", "user_id": "uuid", ... }],
  "count": 1
}
```

## GET /api/scanner/issues

List issues with optional filters.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | string | |
| `scanId` | string | |
| `severity` | string | `blocker`, `critical`, `major`, `minor`, `info` |
| `status` | string | `open`, `confirmed`, `resolved`, `false_positive`, `wontfix` |
| `page` | number | Default 1 |
| `limit` | number | Default 20 (max 100) |

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "scan_id": "uuid",
      "project_id": "proj_1",
      "user_id": "uuid",
      "severity": "critical",
      "type": "bug",
      "status": "open",
      "message": "Null pointer dereference",
      "rule": "no-null/no-null",
      "file_path": "src/main.js",
      "line_number": 42,
      "column_number": 10,
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 5 }
}
```

## POST /api/scanner/issues

Create a new issue.

**Auth**: `requireAuth()`

**Request Body:**
```json
{
  "scan_id": "uuid",
  "severity": "critical",
  "type": "bug",
  "message": "Null pointer dereference",
  "file_path": "src/main.js",
  "line_number": 42
}
```

**Response (201):** Created issue document with `id`, `user_id`, timestamps.

## POST /api/scanner/issues/bulk

(Bulk issue creation — URI defined but implementation at `frontend/app/api/scanner/issues/bulk/route.ts`)

## POST /api/scanner/init

See above — no-op.

## GET /api/scanner/quality-gates

List quality gates.

## POST /api/scanner/quality-gates

Create a quality gate.

## GET /api/scanner/quality-ratings

List quality ratings.

## POST /api/scanner/quality-ratings

Create a quality rating.

## GET /api/scanner/activities

List scan activities.

## POST /api/scanner/activities

Create scan activity.

---

## Related Endpoints

### POST /api/analyze-code
Trigger code analysis (returns AI analysis, not scanner metrics).

### POST /api/generate-fixes
Generate AI-based fixes for scan issues.

### POST /api/apply-fix
Apply a suggested fix.

### GET /api/analysis-history
List past code analyses.

### POST /api/check-quality-gate
Check code against a quality gate definition.

### POST /api/quality-gates/export
Export quality gates as JSON.

### POST /api/quality-gates/import
Import quality gates from JSON.

## Scanner Data Flow

```
User submits code
       │
       ▼
POST /api/scanner/metrics ───┐
POST /api/scanner/issues   ──┤
POST /api/analyze-code     ──┤
       │                      │
       ▼                      ▼
  code_metrics ◄────── code_scans ──────► code_issues
  collection               collection      collection
       │                      │
       ▼                      ▼
  file_metrics          suggested_fixes
  collection            collection
```
