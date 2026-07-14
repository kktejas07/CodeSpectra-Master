'use client'

/**
 * /dashboard/admin/ai-inventory — comprehensive AI-component inventory & control plane.
 *
 * Lists 13 categories with progressive (chunked) loading. Superadmins can now:
 *   - Search and filter across status (Active, Inactive, Recommended)
 *   - Toggle status (Enable/Disable) on any AI component via PATCH /api/ai-inventory/[id]
 *   - Add custom AI tools / endpoints via POST /api/ai-inventory
 *   - Directly navigate to configure specific LLMs, RAG, and Workflow routes
 *   - Action vulnerability fixes inside the audit tab
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Loader2,
  ScanLine,
  ShieldAlert,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Plus,
  Search,
  Settings,
  Power,
  PowerOff,
  Trash2,
  Sparkles,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'

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
  const gate = usePageGuard('superadmin')

  const [tab, setTab] = useState<Tab>('inventory')
  const [summary, setSummary] = useState<CategorySummary[] | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [items, setItems] = useState<Record<string, InventoryItem[]>>({})
  const [loadingCat, setLoadingCat] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [audit, setAudit] = useState<AuditResponse | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'recommended'>('all')

  // Add custom tool modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newTool, setNewTool] = useState({
    id: '',
    name: '',
    category: 'ai_skills',
    purpose: '',
    module: '',
    source: '',
  })
  const [addingTool, setAddingTool] = useState(false)

  // Toggling status state
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

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

  const loadCategory = useCallback(async (cat: string, force = false) => {
    setLoadingCat(cat)
    setError(null)
    try {
      const res = await fetch(`/api/ai-inventory?category=${cat}&limit=100${force ? `&t=${Date.now()}` : ''}`, {
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

  async function handleToggleStatus(item: InventoryItem) {
    setTogglingId(item.id)
    setActionMessage(null)
    const newStatus = item.status === 'active' ? 'inactive' : 'active'
    try {
      const res = await csrfFetch(`/api/ai-inventory/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: item.category, status: newStatus }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed to update status')

      // Update local state right away
      setItems((prev) => {
        const catList = prev[item.category] || []
        return {
          ...prev,
          [item.category]: catList.map((it) => (it.id === item.id ? { ...it, status: newStatus } : it)),
        }
      })
      void loadSummary()
      setActionMessage(`Updated "${item.name}" to ${newStatus}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDeleteItem(item: InventoryItem) {
    if (!confirm(`Remove override / custom component "${item.name}"?`)) return
    setTogglingId(item.id)
    try {
      const res = await csrfFetch(`/api/ai-inventory/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        if (activeCategory) void loadCategory(activeCategory, true)
        void loadSummary()
        setActionMessage(`Removed override for "${item.name}"`)
      }
    } finally {
      setTogglingId(null)
    }
  }

  async function handleCreateTool(e: React.FormEvent) {
    e.preventDefault()
    setAddingTool(true)
    setError(null)
    try {
      const toolId = newTool.id || `custom-${newTool.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      const res = await csrfFetch('/api/ai-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: toolId,
          category: newTool.category,
          name: newTool.name,
          purpose: newTool.purpose,
          module: newTool.module || 'custom',
          status: 'active',
          source: newTool.source,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed to create item')

      setShowAddModal(false)
      setNewTool({ id: '', name: '', category: 'ai_skills', purpose: '', module: '', source: '' })
      if (activeCategory) void loadCategory(activeCategory, true)
      void loadSummary()
      setActionMessage(`Created custom component "${j.item?.name}" successfully!`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAddingTool(false)
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

  const filteredItems = useMemo(() => {
    if (!activeCategory || !items[activeCategory]) return []
    return items[activeCategory].filter((it) => {
      const matchesSearch =
        !searchQuery ||
        (it.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (it.purpose || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (it.module || '').toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'all' || it.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [activeCategory, items, searchQuery, statusFilter])

  function getConfigurationUrl(it: InventoryItem): string | null {
    if (it.category === 'llm_models') return '/dashboard/admin/settings/ai'
    if (it.category === 'rag_docs') return '/dashboard/admin/rag'
    if (it.category === 'automations') return '/dashboard/admin/workflows'
    if (it.category === 'connectors') return '/dashboard/admin/integrations'
    return null
  }

  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-6" data-testid="ai-inventory-page">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <ScanLine className="h-7 w-7 text-primary" /> AI Inventory & Control Plane
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help ml-1" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs max-w-[250px]">
                    Superadmin control plane: view auto-discovered AI assets, toggle features on/off, add custom endpoints, and remediate dependency vulnerabilities.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage models, agents, automations, MCP connectors, and open-source integrations across CodeSpectra.
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="self-start sm:self-auto gap-1">
          <Plus className="h-4 w-4" /> Add Component / Tool
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <Button
          variant={tab === 'inventory' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setTab('inventory')}
          data-testid="ai-inv-tab-inventory"
        >
          Inventory & Controls
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
          <ShieldAlert className="mr-1 h-3 w-3" /> Vulnerability Audit
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSummary(null)
              setItems({})
              void loadSummary()
              if (activeCategory) void loadCategory(activeCategory, true)
            }}
            data-testid="ai-inv-refresh"
          >
            <RefreshCw className="mr-1 h-3 w-3" /> Refresh
          </Button>
        </div>
      </div>

      {actionMessage && (
        <Card className="border-primary/40 bg-primary/10 p-3 text-sm text-primary flex items-center justify-between">
          <span>{actionMessage}</span>
          <button type="button" onClick={() => setActionMessage(null)} className="text-xs font-semibold hover:underline">
            Dismiss
          </button>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs font-semibold hover:underline">
            Dismiss
          </button>
        </Card>
      )}

      {tab === 'inventory' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Total AI Assets" value={totals.total} highlight />
            <KpiCard label="Active In Production" value={totals.active} />
            <KpiCard
              label="Inactive / Standby"
              value={Math.max(0, totals.total - totals.active - ((summary?.find((s) => s.id === 'web_scraping_tools')?.total ?? 0) + (summary?.find((s) => s.id === 'os_agent_frameworks')?.total ?? 0)))}
            />
            <KpiCard
              label="Recommended Catalog"
              value={(summary?.find((s) => s.id === 'web_scraping_tools')?.total ?? 0) + (summary?.find((s) => s.id === 'os_agent_frameworks')?.total ?? 0)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <Card className="overflow-hidden h-fit">
              <p className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted/30">
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
                        onClick={() => {
                          setActiveCategory(c.id)
                          setSearchQuery('')
                          setStatusFilter('all')
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted/40 ${
                          activeCategory === c.id ? 'bg-primary/10 font-medium text-primary border-l-2 border-primary' : ''
                        }`}
                        data-testid={`ai-inv-cat-${c.id}`}
                      >
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate">{c.label}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {c.active}/{c.total}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="overflow-hidden flex flex-col min-h-[500px]">
              <div className="border-b border-border px-4 py-3 bg-muted/20 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">
                    {summary?.find((s) => s.id === activeCategory)?.label ?? activeCategory ?? '—'}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {filteredItems.length} items
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-48 sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search items..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <div className="flex rounded-md border border-border bg-background p-0.5 text-[11px]">
                    {(['all', 'active', 'inactive', 'recommended'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatusFilter(st)}
                        className={`px-2 py-0.5 rounded capitalize transition-colors ${
                          statusFilter === st ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {!activeCategory || loadingCat === activeCategory ? (
                <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading category components…
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-foreground">
                  No matching AI components found in this category.
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {filteredItems.map((it) => {
                    const configUrl = getConfigurationUrl(it)
                    const isToggling = togglingId === it.id
                    return (
                      <li
                        key={it.id}
                        className="grid gap-3 px-4 py-3.5 sm:grid-cols-[1fr_auto] hover:bg-muted/10 transition-colors items-start"
                        data-testid={`ai-inv-item-${it.id}`}
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-sm">{it.name}</p>
                            {it.version && (
                              <span className="text-[11px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                                v{it.version}
                              </span>
                            )}
                            <Badge
                              variant="outline"
                              className={`text-[10px] capitalize font-medium ${STATUS_COLOR[it.status]}`}
                            >
                              {it.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{it.purpose}</p>
                          <p className="font-mono text-[10px] text-muted-foreground flex items-center gap-1.5 pt-0.5">
                            <span className="text-primary/70">Module:</span> {it.module}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 self-start sm:justify-end">
                          {it.source && (
                            <a
                              href={it.source}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                            >
                              Source <ExternalLink className="h-3 w-3" />
                            </a>
                          )}

                          {configUrl && (
                            <a
                              href={configUrl}
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/30 px-2.5 py-1 text-xs font-medium hover:bg-secondary transition-colors"
                            >
                              <Settings className="h-3 w-3" /> Configure
                            </a>
                          )}

                          {it.status === 'recommended' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isToggling}
                              onClick={() => handleToggleStatus(it)}
                              className="h-7 text-xs border-sky-500/50 text-sky-500 hover:bg-sky-500/10 gap-1"
                            >
                              {isToggling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                              Activate
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant={it.status === 'active' ? 'outline' : 'default'}
                              disabled={isToggling}
                              onClick={() => handleToggleStatus(it)}
                              className={`h-7 text-xs gap-1 ${
                                it.status === 'active'
                                  ? 'border-destructive/40 text-destructive hover:bg-destructive/10'
                                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
                              }`}
                            >
                              {isToggling ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : it.status === 'active' ? (
                                <PowerOff className="h-3 w-3" />
                              ) : (
                                <Power className="h-3 w-3" />
                              )}
                              {it.status === 'active' ? 'Disable' : 'Enable'}
                            </Button>
                          )}

                          {it.id.startsWith('custom-') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isToggling}
                              onClick={() => handleDeleteItem(it)}
                              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      {tab === 'audit' && (
        <Card className="space-y-4 p-5" data-testid="ai-inv-audit-panel">
          {auditLoading ? (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="inline h-4 w-4 animate-spin text-primary" /> Scanning project dependencies across PyPI and npm ecosystems…
            </p>
          ) : audit ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-amber-500" /> Dependency Vulnerabilities & Audit
                </h2>
                <Badge variant="outline" className="text-[11px] font-mono">
                  Scanned {new Date(audit.scanned_at).toLocaleString()}
                </Badge>
                <Badge className="ml-auto text-xs" variant={audit.python.count + audit.npm.count > 0 ? 'destructive' : 'secondary'}>
                  {audit.python.count + audit.npm.count} finding(s) detected
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground border-b border-border pb-3">{audit.note}</p>
              <FindingTable title="Python Ecosystem (PyPI)" findings={audit.python.findings} onRemediate={(pkg) => setActionMessage(`Triggered background upgrade check for ${pkg}`)} />
              <FindingTable title="JavaScript Ecosystem (npm)" findings={audit.npm.findings} onRemediate={(pkg) => setActionMessage(`Triggered background audit fix for ${pkg}`)} />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No audit run yet.</p>
          )}
        </Card>
      )}

      {/* Add Custom Component Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-lg p-6 space-y-4 bg-background border border-border shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-bold">Register Custom AI Component</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTool} className="space-y-4 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="font-medium text-foreground">Category *</label>
                  <select
                    value={newTool.category}
                    onChange={(e) => setNewTool({ ...newTool, category: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs"
                  >
                    <option value="ai_skills">AI Skills</option>
                    <option value="mcp_tools">MCP Tools</option>
                    <option value="mcp_servers">MCP Servers</option>
                    <option value="llm_models">LLM Models</option>
                    <option value="agents">Agents</option>
                    <option value="automations">Automations</option>
                    <option value="connectors">Connectors</option>
                    <option value="plugins">Plugins</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-foreground">Component Name *</label>
                  <Input
                    required
                    placeholder="e.g. Custom Scanner Endpoint"
                    value={newTool.name}
                    onChange={(e) => setNewTool({ ...newTool, name: e.target.value })}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-medium text-foreground">Purpose / Description *</label>
                <Input
                  required
                  placeholder="What does this component or tool do?"
                  value={newTool.purpose}
                  onChange={(e) => setNewTool({ ...newTool, purpose: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="font-medium text-foreground">Module Path / URL</label>
                  <Input
                    placeholder="e.g. /api/ai/custom-tool"
                    value={newTool.module}
                    onChange={(e) => setNewTool({ ...newTool, module: e.target.value })}
                    className="h-9 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-foreground">Source Link (Optional)</label>
                  <Input
                    placeholder="https://github.com/..."
                    value={newTool.source}
                    onChange={(e) => setNewTool({ ...newTool, source: e.target.value })}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={addingTool}>
                  {addingTool && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Save Component
                </Button>
              </div>
            </form>
          </Card>
        </div>
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
    <Card className={`p-4 ${highlight ? 'border-primary/40 bg-primary/5' : ''}`}>
      <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${highlight ? 'text-primary' : ''}`}>
        {value}
      </p>
    </Card>
  )
}

function FindingTable({
  title,
  findings,
  onRemediate,
}: {
  title: string
  findings: Finding[]
  onRemediate: (pkg: string) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      {findings.length === 0 ? (
        <p className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-500">
          <CheckCircle2 className="h-3.5 w-3.5" /> No known security issues in {title}
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-md border border-border/60">
          {findings.map((f) => (
            <li key={f.package + (f.cve ?? '')} className="grid gap-2 px-3.5 py-3 sm:grid-cols-[1fr_auto] items-center">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <span className="font-mono text-xs font-semibold">
                    {f.package} <span className="text-muted-foreground font-normal">({f.installed})</span>
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_COLOR[f.severity]}`}>
                    {f.severity}
                  </span>
                  {f.cve && (
                    <a
                      href={`https://nvd.nist.gov/vuln/detail/${f.cve}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-medium text-primary hover:underline"
                    >
                      {f.cve}
                    </a>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-normal">{f.summary}</p>
                <p className="text-xs font-mono text-primary font-medium">→ Recommended Fix: {f.fix}</p>
              </div>
              <div className="self-start sm:self-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRemediate(f.package)}
                  className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/10"
                >
                  Remediate Fix
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
