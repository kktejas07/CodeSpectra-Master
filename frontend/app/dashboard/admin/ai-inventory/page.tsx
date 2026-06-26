'use client'

/**
 * /dashboard/admin/ai-inventory — comprehensive AI-component inventory.
 *
 * Lists 13 categories with progressive (chunked) loading. Each category
 * is fetched separately so the first paint shows the summary counts,
 * then individual lists hydrate in the background. A dependency
 * vulnerability tab pulls `/api/ai-inventory/audit` on demand.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  ScanLine,
  ShieldAlert,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react'

interface CategorySummary {
  id: string
  label: string
  total: number
  active: number
}

interface InventoryItem {
  id: string
  category: string
  name: string
  purpose: string
  module: string
  status: 'active' | 'inactive' | 'recommended'
  source?: string
  version?: string
}

interface Finding {
  package: string
  installed: string
  ecosystem: 'pypi' | 'npm'
  severity: 'low' | 'medium' | 'high' | 'critical'
  cve?: string
  summary: string
  fix: string
}

interface AuditResponse {
  scanned_at: string
  advisory_count: number
  python: { findings: Finding[]; count: number }
  npm: { findings: Finding[]; count: number }
  note: string
}

type Tab = 'inventory' | 'audit'

const SEVERITY_COLOR: Record<Finding['severity'], string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-amber-500/15 text-amber-500',
  high: 'bg-orange-500/15 text-orange-500',
  critical: 'bg-destructive/15 text-destructive',
}

const STATUS_COLOR: Record<InventoryItem['status'], string> = {
  active: 'bg-primary/15 text-primary border-primary/40',
  inactive: 'bg-muted text-muted-foreground border-border/60',
  recommended: 'bg-sky-500/15 text-sky-500 border-sky-500/40',
}

export default function AiInventoryPage() {
  const [tab, setTab] = useState<Tab>('inventory')
  const [summary, setSummary] = useState<CategorySummary[] | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [items, setItems] = useState<Record<string, InventoryItem[]>>({})
  const [loadingCat, setLoadingCat] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [audit, setAudit] = useState<AuditResponse | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)

  const loadSummary = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/ai-inventory', { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'summary failed')
      setSummary(j.categories as CategorySummary[])
      if (!activeCategory && j.categories[0]) setActiveCategory(j.categories[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [activeCategory])

  const loadCategory = useCallback(async (cat: string) => {
    setLoadingCat(cat)
    setError(null)
    try {
      const res = await fetch(`/api/ai-inventory?category=${cat}&limit=50`, {
        cache: 'no-store',
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'category failed')
      setItems((prev) => ({ ...prev, [cat]: j.items as InventoryItem[] }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingCat(null)
    }
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  useEffect(() => {
    if (activeCategory && !items[activeCategory]) {
      void loadCategory(activeCategory)
    }
  }, [activeCategory, items, loadCategory])

  async function runAudit() {
    setAuditLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai-inventory/audit', { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'audit failed')
      setAudit(j as AuditResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAuditLoading(false)
    }
  }

  const totals = useMemo(() => {
    if (!summary) return { total: 0, active: 0 }
    return summary.reduce(
      (acc, c) => ({
        total: acc.total + c.total,
        active: acc.active + c.active,
      }),
      { total: 0, active: 0 },
    )
  }, [summary])

  return (
    <div className="space-y-6" data-testid="ai-inventory-page">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <ScanLine className="h-7 w-7 text-primary" /> AI inventory
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Auto-discovered catalog of every AI surface in CodeSpectra:
          automations, agents, LLM models, MCP tools, connectors,
          GenAI run logs, and recommended open-source frameworks.
        </p>
      </header>

      <div className="flex gap-1">
        <Button
          variant={tab === 'inventory' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setTab('inventory')}
          data-testid="ai-inv-tab-inventory"
        >
          Inventory
        </Button>
        <Button
          variant={tab === 'audit' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => {
            setTab('audit')
            if (!audit) void runAudit()
          }}
          data-testid="ai-inv-tab-audit"
        >
          <ShieldAlert className="mr-1 h-3 w-3" /> Vulnerability audit
        </Button>
        <div className="ml-auto" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSummary(null)
            setItems({})
            void loadSummary()
            if (activeCategory) void loadCategory(activeCategory)
          }}
          data-testid="ai-inv-refresh"
        >
          <RefreshCw className="mr-1 h-3 w-3" /> Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </Card>
      )}

      {tab === 'inventory' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Total components" value={totals.total} highlight />
            <KpiCard label="Active" value={totals.active} />
            <KpiCard label="Inactive" value={totals.total - totals.active - (summary?.find((s) => s.id === 'web_scraping_tools')?.total ?? 0) - (summary?.find((s) => s.id === 'os_agent_frameworks')?.total ?? 0)} />
            <KpiCard label="Recommendations" value={(summary?.find((s) => s.id === 'web_scraping_tools')?.total ?? 0) + (summary?.find((s) => s.id === 'os_agent_frameworks')?.total ?? 0)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <Card className="overflow-hidden">
              <p className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Categories
              </p>
              {!summary ? (
                <div className="p-4 text-xs text-muted-foreground">
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Loading…
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {summary.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setActiveCategory(c.id)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40 ${
                          activeCategory === c.id ? 'bg-muted/60' : ''
                        }`}
                        data-testid={`ai-inv-cat-${c.id}`}
                      >
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        <span className="flex-1 font-medium">{c.label}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {c.active}/{c.total}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="overflow-hidden">
              <p className="border-b border-border px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                {activeCategory ?? '—'}
              </p>
              {!activeCategory || loadingCat === activeCategory ? (
                <div className="p-6 text-xs text-muted-foreground">
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Loading…
                </div>
              ) : !items[activeCategory] || items[activeCategory].length === 0 ? (
                <div className="p-6 text-xs text-muted-foreground">
                  Nothing here yet.
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {items[activeCategory].map((it) => (
                    <li
                      key={it.id}
                      className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto]"
                      data-testid={`ai-inv-item-${it.id}`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{it.name}</p>
                          {it.version && (
                            <span className="text-[10px] text-muted-foreground">
                              v{it.version}
                            </span>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${STATUS_COLOR[it.status]}`}
                          >
                            {it.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{it.purpose}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {it.module}
                        </p>
                      </div>
                      {it.source && (
                        <a
                          href={it.source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 self-start text-xs text-primary hover:underline"
                        >
                          source <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      {tab === 'audit' && (
        <Card className="space-y-4 p-5" data-testid="ai-inv-audit-panel">
          {auditLoading ? (
            <p className="text-xs text-muted-foreground">
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Scanning dependencies…
            </p>
          ) : audit ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold">Dependency vulnerabilities</h2>
                <Badge variant="outline" className="text-[10px]">
                  scanned {new Date(audit.scanned_at).toLocaleString()}
                </Badge>
                <Badge className="ml-auto">
                  {audit.python.count + audit.npm.count} finding(s)
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">{audit.note}</p>
              <FindingTable title="Python (PyPI)" findings={audit.python.findings} />
              <FindingTable title="JavaScript (npm)" findings={audit.npm.findings} />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No audit run yet.</p>
          )}
        </Card>
      )}
    </div>
  )
}

function KpiCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <Card className={`p-4 ${highlight ? 'border-primary/40' : ''}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${highlight ? 'text-primary' : ''}`}>
        {value}
      </p>
    </Card>
  )
}

function FindingTable({ title, findings }: { title: string; findings: Finding[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold">{title}</p>
      {findings.length === 0 ? (
        <p className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-3 py-1 text-[11px] text-primary">
          <CheckCircle2 className="h-3 w-3" /> No known issues
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-md border border-border/60">
          {findings.map((f) => (
            <li key={f.package + (f.cve ?? '')} className="grid gap-1 px-3 py-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3 w-3 text-destructive" />
                <span className="font-mono text-xs">
                  {f.package} {f.installed}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${SEVERITY_COLOR[f.severity]}`}>
                  {f.severity}
                </span>
                {f.cve && (
                  <a
                    href={`https://nvd.nist.gov/vuln/detail/${f.cve}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-primary hover:underline"
                  >
                    {f.cve}
                  </a>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">{f.summary}</p>
              <p className="text-[11px] text-primary">→ {f.fix}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
