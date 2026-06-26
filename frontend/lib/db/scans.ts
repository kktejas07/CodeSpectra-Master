/**
 * MongoDB repository for the code scanner data layer.
 *
 * Collections (mirror the Supabase schema with snake_case fields so the
 * existing API/UI shape does not have to change):
 *   - code_scans         : one row per scan run
 *   - code_metrics       : one row per scan with quality numbers
 *   - code_issues        : individual findings (bugs, smells, vulnerabilities)
 *   - suggested_fixes    : AI-generated fixes for issues
 *   - quality_gates      : per-project rule sets
 *   - scan_activities    : audit feed for the activities sidebar
 *
 * IDs are stored as strings (uuid v4 generated server-side) so existing API
 * payloads that use string ids do not need to change. We do NOT use Mongo
 * ObjectId for these because the existing UI treats ids as opaque strings.
 */

import { randomUUID } from 'node:crypto'
import type { Collection, Db, Filter, Sort } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

// ---------- Document types ----------

export interface CodeScanDoc {
  id: string
  user_id: string
  scan_type: string // 'manual' | 'github_file' | 'github_push' | ...
  language: string
  scan_status: string // 'queued' | 'running' | 'completed' | 'failed'
  scan_duration_ms?: number | null
  code_snippet?: string | null
  github_repo_url?: string | null
  github_repo_owner?: string | null
  github_repo_name?: string | null
  branch?: string | null
  commit_hash?: string | null
  file_path?: string | null
  project_id?: string | null
  created_at: string
  completed_at?: string | null
}

export interface CodeMetricsDoc {
  id: string
  scan_id: string
  overall_quality_score: number
  bugs: number
  vulnerabilities: number
  security_hotspots: number
  code_smells: number
  duplicated_code_percentage: number
  complexity_score: number
  maintainability_index: number
  test_coverage_percentage: number
  metrics_json: Record<string, unknown> | null
  created_at: string
}

export interface CodeIssueDoc {
  id: string
  scan_id: string
  project_id?: string | null
  user_id: string
  severity: 'blocker' | 'critical' | 'major' | 'minor' | 'info'
  type: 'bug' | 'vulnerability' | 'code_smell' | 'security_hotspot'
  status: 'open' | 'confirmed' | 'resolved' | 'false_positive' | 'wontfix'
  message: string
  rule?: string | null
  file_path?: string | null
  line_number?: number | null
  column_number?: number | null
  created_at: string
  updated_at: string
}

export interface SuggestedFixDoc {
  id: string
  issue_id: string
  scan_id: string
  user_id: string
  description: string
  patch?: string | null
  applied: boolean
  created_at: string
}

export interface QualityGateDoc {
  id: string
  project_id?: string | null
  user_id: string
  name: string
  conditions: Array<{
    metric: string
    op: '>' | '<' | '>=' | '<=' | '==' | '!='
    value: number
  }>
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface ScanActivityDoc {
  id: string
  user_id: string
  scan_id?: string | null
  type: string
  message: string
  metadata?: Record<string, unknown> | null
  created_at: string
}

// ---------- Collection accessors ----------

async function db(): Promise<Db> {
  return getMongoDb()
}

export async function codeScans(): Promise<Collection<CodeScanDoc>> {
  return (await db()).collection<CodeScanDoc>('code_scans')
}

export async function codeMetrics(): Promise<Collection<CodeMetricsDoc>> {
  return (await db()).collection<CodeMetricsDoc>('code_metrics')
}

export async function codeIssues(): Promise<Collection<CodeIssueDoc>> {
  return (await db()).collection<CodeIssueDoc>('code_issues')
}

export async function suggestedFixes(): Promise<Collection<SuggestedFixDoc>> {
  return (await db()).collection<SuggestedFixDoc>('suggested_fixes')
}

export async function qualityGates(): Promise<Collection<QualityGateDoc>> {
  return (await db()).collection<QualityGateDoc>('quality_gates')
}

export async function scanActivities(): Promise<Collection<ScanActivityDoc>> {
  return (await db()).collection<ScanActivityDoc>('scan_activities')
}

// ---------- Common helpers ----------

export function newId(): string {
  return randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** Build a Mongo sort object from `{ field, direction }` shape. */
export function sortBy(field: string, direction: 'asc' | 'desc' = 'desc'): Sort {
  return { [field]: direction === 'asc' ? 1 : -1 }
}

// ---------- Scan repository ----------

export async function insertScan(
  scan: Omit<CodeScanDoc, 'id' | 'created_at'> & Partial<Pick<CodeScanDoc, 'id' | 'created_at'>>,
): Promise<CodeScanDoc> {
  const doc: CodeScanDoc = {
    id: scan.id ?? newId(),
    created_at: scan.created_at ?? nowIso(),
    ...scan,
  } as CodeScanDoc
  const col = await codeScans()
  await col.insertOne(doc)
  return doc
}

export async function insertMetrics(
  metrics: Omit<CodeMetricsDoc, 'id' | 'created_at'> & Partial<Pick<CodeMetricsDoc, 'id' | 'created_at'>>,
): Promise<CodeMetricsDoc> {
  const doc: CodeMetricsDoc = {
    id: metrics.id ?? newId(),
    created_at: metrics.created_at ?? nowIso(),
    ...metrics,
  } as CodeMetricsDoc
  const col = await codeMetrics()
  await col.insertOne(doc)
  return doc
}

/** List scans for a user with their joined metrics (single roundtrip via $lookup). */
export async function listScansWithMetrics(
  userId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<Array<CodeScanDoc & { code_metrics: CodeMetricsDoc | null }>> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100)
  const offset = Math.max(opts.offset ?? 0, 0)
  const col = await codeScans()

  const rows = await col
    .aggregate<CodeScanDoc & { code_metrics: CodeMetricsDoc | null }>([
      { $match: { user_id: userId } },
      { $sort: { created_at: -1 } },
      { $skip: offset },
      { $limit: limit },
      {
        $lookup: {
          from: 'code_metrics',
          localField: 'id',
          foreignField: 'scan_id',
          as: 'code_metrics',
        },
      },
      { $addFields: { code_metrics: { $arrayElemAt: ['$code_metrics', 0] } } },
    ])
    .toArray()

  return rows
}

// ---------- Issue repository ----------

export interface ListIssuesParams {
  projectId?: string | null
  scanId?: string | null
  userId?: string | null
  severity?: string | null
  status?: string | null
  page?: number
  limit?: number
}

export async function listIssues(params: ListIssuesParams = {}): Promise<{
  data: CodeIssueDoc[]
  total: number
  page: number
  limit: number
}> {
  const page = Math.max(params.page ?? 1, 1)
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100)

  const filter: Filter<CodeIssueDoc> = {}
  if (params.projectId) filter.project_id = params.projectId
  if (params.scanId) filter.scan_id = params.scanId
  if (params.userId) filter.user_id = params.userId
  if (params.severity) filter.severity = params.severity as CodeIssueDoc['severity']
  if (params.status) filter.status = params.status as CodeIssueDoc['status']

  const col = await codeIssues()
  const total = await col.countDocuments(filter)
  const data = await col
    .find(filter)
    .sort({ created_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray()

  return { data, total, page, limit }
}

export async function insertIssue(
  issue: Omit<CodeIssueDoc, 'id' | 'created_at' | 'updated_at'> &
    Partial<Pick<CodeIssueDoc, 'id' | 'created_at' | 'updated_at'>>,
): Promise<CodeIssueDoc> {
  const now = nowIso()
  const doc: CodeIssueDoc = {
    id: issue.id ?? newId(),
    created_at: issue.created_at ?? now,
    updated_at: issue.updated_at ?? now,
    ...issue,
  } as CodeIssueDoc
  const col = await codeIssues()
  await col.insertOne(doc)
  return doc
}

// ---------- Activity repository ----------

export async function logActivity(
  activity: Omit<ScanActivityDoc, 'id' | 'created_at'> &
    Partial<Pick<ScanActivityDoc, 'id' | 'created_at'>>,
): Promise<ScanActivityDoc> {
  const doc: ScanActivityDoc = {
    id: activity.id ?? newId(),
    created_at: activity.created_at ?? nowIso(),
    ...activity,
  } as ScanActivityDoc
  const col = await scanActivities()
  await col.insertOne(doc)
  return doc
}

export async function listActivities(
  userId: string,
  limit = 20,
): Promise<ScanActivityDoc[]> {
  const col = await scanActivities()
  return col
    .find({ user_id: userId })
    .sort({ created_at: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .toArray()
}

// ---------- Aggregated metrics ----------

export async function aggregateMetricsForUser(userId: string): Promise<{
  totalScans: number
  avgQuality: number
  totalBugs: number
  totalVulnerabilities: number
  totalCodeSmells: number
} | null> {
  const col = await codeScans()
  const rows = await col
    .aggregate<{
      totalScans: number
      avgQuality: number
      totalBugs: number
      totalVulnerabilities: number
      totalCodeSmells: number
    }>([
      { $match: { user_id: userId } },
      {
        $lookup: {
          from: 'code_metrics',
          localField: 'id',
          foreignField: 'scan_id',
          as: 'm',
        },
      },
      { $unwind: { path: '$m', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          totalScans: { $sum: 1 },
          avgQuality: { $avg: '$m.overall_quality_score' },
          totalBugs: { $sum: { $ifNull: ['$m.bugs', 0] } },
          totalVulnerabilities: { $sum: { $ifNull: ['$m.vulnerabilities', 0] } },
          totalCodeSmells: { $sum: { $ifNull: ['$m.code_smells', 0] } },
        },
      },
      { $project: { _id: 0 } },
    ])
    .toArray()
  return rows[0] ?? null
}
