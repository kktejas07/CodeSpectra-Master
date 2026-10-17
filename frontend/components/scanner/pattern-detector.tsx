'use client'

import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, CheckCircle2, AlertCircle, Code, Coffee, Layers } from 'lucide-react'

export interface PatternResult {
  id: string
  name: string
  category: 'structural' | 'behavioral' | 'creational' | 'react' | 'anti-pattern'
  severity: 'info' | 'warning' | 'error'
  file: string
  line: number
  snippet: string
  description: string
}

interface PatternDetectorProps {
  files?: Array<{ path: string; content: string; language: string }>
  onAnalyze?: (patterns: PatternResult[]) => void
}

const PATTERNS: Array<{
  id: string
  name: string
  category: PatternResult['category']
  severity: PatternResult['severity']
  regex: RegExp
  description: string
  snippetLines?: number
}> = [
  {
    id: 'singleton',
    name: 'Singleton',
    category: 'creational',
    severity: 'info',
    regex: /\b(const|let|var)\s+\w+\s*=\s*(?:new\s+)?(?:\w+_instance|instance|singleton|sharedInstance|getInstance|shared)\b/,
    description: 'Singleton pattern — one global instance. Consider dependency injection for testability.',
  },
  {
    id: 'factory',
    name: 'Factory Method',
    category: 'creational',
    severity: 'info',
    regex: /\b(function|const)\s+\w*(?:Factory|factory|create\w*)\s*[=:]?\s*(?:\(|async\s*\()/,
    description: 'Factory pattern — creation logic centralized. Good for decoupling object creation.',
  },
  {
    id: 'observer',
    name: 'Observer / Event Emitter',
    category: 'behavioral',
    severity: 'info',
    regex: /\b(addEventListener|on\(|subscribe\(|removeEventListener|off\(|emit\(|publish\()/,
    description: 'Observer/event-emitter pattern — decoupled communication between components.',
  },
  {
    id: 'decorator',
    name: 'Decorator',
    category: 'structural',
    severity: 'info',
    regex: /@(?:\w+_decorator|decorator|logged| memoized|cached)\b/,
    description: 'Decorator pattern — behavior attached to objects without modifying their class.',
  },
  {
    id: 'adapter',
    name: 'Adapter',
    category: 'structural',
    severity: 'info',
    regex: /\b(adapter|convertTo|transformTo|toLegacy|toModern)\b/,
    description: 'Adapter pattern — interface conversion between incompatible types.',
  },
  {
    id: 'strategy',
    name: 'Strategy',
    category: 'behavioral',
    severity: 'info',
    regex: /\b(strategy|algorithms?|policy|route\d*)\s*[:=]\s*\{/,
    description: 'Strategy pattern — interchangeable algorithms selected at runtime.',
  },
  {
    id: 'useState',
    name: 'React useState',
    category: 'react',
    severity: 'info',
    regex: /useState\s*[<(]/,
    description: 'React state hook — ensure state updates are batched and stable setState reference.',
  },
  {
    id: 'useEffect',
    name: 'React useEffect',
    category: 'react',
    severity: 'warning',
    regex: /useEffect\s*\(/,
    description: 'React effect hook — verify dependency array; missing deps cause stale closures.',
  },
  {
    id: 'useCallback',
    name: 'React useCallback',
    category: 'react',
    severity: 'info',
    regex: /useCallback\s*\(/,
    description: 'React callback memoization — prevents unnecessary re-renders in child components.',
  },
  {
    id: 'useMemo',
    name: 'React useMemo',
    category: 'react',
    severity: 'info',
    regex: /useMemo\s*\(/,
    description: 'React memoization hook — caches expensive computations across renders.',
  },
  {
    id: 'useRef',
    name: 'React useRef',
    category: 'react',
    severity: 'info',
    regex: /useRef\s*[<(]/,
    description: 'React ref hook — mutable value that persists without causing re-renders.',
  },
  {
    id: 'async-await',
    name: 'Async/Await',
    category: 'behavioral',
    severity: 'info',
    regex: /\basync\s+(?:function|\(|(?:const|let|var)\s+\w+\s*=)/,
    description: 'Async/await pattern — prefer try/catch for error handling, avoid unhandled rejections.',
  },
  {
    id: 'try-catch',
    name: 'Try/Catch Block',
    category: 'behavioral',
    severity: 'info',
    regex: /\btry\s*\{/,
    description: 'Try-catch pattern — ensure catch blocks handle errors meaningfully, not just console.log.',
  },
  {
    id: 'deeply-nested',
    name: 'Deeply Nested Callbacks',
    category: 'anti-pattern',
    severity: 'warning',
    regex: /\{[\s\S]*?\{[\s\S]*?\{[\s\S]*?\{[\s\S]*?\{/,
    description: 'Callback Pyramid / Arrow hell — refactor with early returns, named functions, or async/await.',
  },
  {
    id: 'any-type',
    name: 'TypeScript any',
    category: 'anti-pattern',
    severity: 'warning',
    regex: /:\s*any\b/,
    description: 'TypeScript `any` type — disables type checking. Use `unknown` with type guards instead.',
  },
  {
    id: 'console-log',
    name: 'Console.log in code',
    category: 'anti-pattern',
    severity: 'info',
    regex: /\bconsole\.(log|debug|info|warn|error)\s*\(/,
    description: 'Console statement in source — remove or replace with a proper logging library before production.',
  },
  {
    id: 'magic-numbers',
    name: 'Magic Numbers',
    category: 'anti-pattern',
    severity: 'warning',
    regex: /(?<![A-Za-z_$])(?:0x[A-Fa-f0-9]+|(?:[1-9]\d{2,}))\b/,
    description: 'Magic numbers — extract to named constants for readability and maintainability.',
  },
  {
    id: 'global-mutation',
    name: 'Global State Mutation',
    category: 'anti-pattern',
    severity: 'error',
    regex: /\bwindow\.\w+\s*=/,
    description: 'Global window mutation — state should flow through React/context, not window globals.',
  },
  {
    id: 'inner-functions',
    name: 'Nested Function Expressions',
    category: 'anti-pattern',
    severity: 'info',
    regex: /\b(?:const|let|var)\s+\w+\s*=\s*(?:function\s*\([^)]*\)\s*\{[\s\S]*?\}\s*,\s*(?:function|async))/,
    description: 'Nested IIFE or long function expressions — consider named functions or module-level declarations.',
  },
  {
    id: 'promisify-callback',
    name: 'Callback → Promise Not Wrapped',
    category: 'anti-pattern',
    severity: 'warning',
    regex: /\bcallback\s*\(\s*(?:null|undefined|err)\s*,/,
    description: 'Node.js callback pattern not wrapped in promisify — use util.promisify or .then() conversion.',
  },
  {
    id: 'n-plus-1',
    name: 'Potential N+1 Query',
    category: 'anti-pattern',
    severity: 'warning',
    regex: /\.forEach\s*\([^)]*\)\s*=>\s*\{[^}]*\.find\(|for\s*\([^)]*\)\s*\{[^}]*\.query\(|for\s*\([^)]*\)\s*\{[^}]*await\s+\w+\.find\(/,
    description: 'Potential N+1 query pattern — fetching related data inside a loop. Use JOIN or batch queries.',
  },
  {
    id: 'hardcoded-secret',
    name: 'Hardcoded Credential',
    category: 'anti-pattern',
    severity: 'error',
    regex: /(?:password|secret|token|api[_-]?key)\s*[=:]\s*["'](?:(?!(YOUR|EXAMPLE|\$|HOME|USER))[A-Za-z0-9_\-]{8,})["']/i,
    description: 'Potential hardcoded secret detected — use environment variables instead.',
  },
  {
    id: 'sql-concat',
    name: 'SQL String Concatenation',
    category: 'anti-pattern',
    severity: 'error',
    regex: /[`"']\s*(?:SELECT|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\s+[^`"']+\+[^`"']+[`"']/i,
    description: 'SQL injection risk — use parameterized queries instead of string concatenation.',
  },
  {
    id: 'eval',
    name: 'eval() Usage',
    category: 'anti-pattern',
    severity: 'error',
    regex: /\beval\s*\(/,
    description: 'eval() is a code injection risk and performance anti-pattern — use JSON.parse for data or Function constructor alternatives.',
  },
  {
    id: 'inner-html',
    name: 'innerHTML Assignment',
    category: 'anti-pattern',
    severity: 'warning',
    regex: /\.innerHTML\s*=/,
    description: 'innerHTML assignment — XSS risk. Use textContent or sanitize with DOMPurify before setting HTML.',
  },
]

const CATEGORY_LABELS: Record<PatternResult['category'], string> = {
  structural: 'Structural',
  behavioral: 'Behavioral',
  creational: 'Creational',
  react: 'React',
  'anti-pattern': 'Anti-pattern',
}

const SEVERITY_COLOR: Record<PatternResult['severity'], string> = {
  info: 'bg-blue-500/20 text-primary border-blue-500/30',
  warning: 'bg-yellow-500/20 text-amber-700 dark:text-amber-400 border-yellow-500/30',
  error: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
}

const CATEGORY_ICONS: Record<PatternResult['category'], React.ReactNode> = {
  structural: <Layers className="w-4 h-4" />,
  behavioral: <Coffee className="w-4 h-4" />,
  creational: <Code className="w-4 h-4" />,
  react: <Code className="w-4 h-4" />,
  'anti-pattern': <AlertCircle className="w-4 h-4" />,
}

export function PatternDetector({ files = [], onAnalyze }: PatternDetectorProps) {
  const [filter, setFilter] = useState<'all' | 'info' | 'warning' | 'error'>('all')
  const [catFilter, setCatFilter] = useState<'all' | PatternResult['category']>('all')

  const patterns = useMemo<PatternResult[]>(() => {
    const results: PatternResult[] = []
    for (const file of files) {
      const lines = file.content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        for (const p of PATTERNS) {
          p.regex.lastIndex = 0
          if (p.regex.test(line)) {
            results.push({
              id: `${p.id}-${file.path}-${i}`,
              name: p.name,
              category: p.category,
              severity: p.severity,
              file: file.path,
              line: i + 1,
              snippet: line.trim().slice(0, 120),
              description: p.description,
            })
          }
        }
      }
    }
    onAnalyze?.(results)
    return results
  }, [files, onAnalyze])

  const filtered = patterns.filter(p => {
    if (filter !== 'all' && p.severity !== filter) return false
    if (catFilter !== 'all' && p.category !== catFilter) return false
    return true
  })

  const stats = {
    total: patterns.length,
    errors: patterns.filter(p => p.severity === 'error').length,
    warnings: patterns.filter(p => p.severity === 'warning').length,
    info: patterns.filter(p => p.severity === 'info').length,
  }

  const byCategory = Array.from(
    Object.entries(
      filtered.reduce<Record<string, PatternResult[]>>((acc, p) => {
        if (!acc[p.category]) acc[p.category] = []
        acc[p.category].push(p)
        return acc
      }, {})
    )
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(['all', 'error', 'warning', 'info'] as const).map(s => (
            <Button
              key={s}
              size="sm"
              variant={filter === s ? 'default' : 'outline'}
              className="h-8 text-xs"
              onClick={() => setFilter(s)}
            >
              {s === 'all' ? `All (${stats.total})` : `${s} (${s === 'error' ? stats.errors : s === 'warning' ? stats.warnings : stats.info})`}
            </Button>
          ))}
        </div>
        <select
          className="text-xs px-2 py-1 rounded border border-border bg-background text-foreground"
          value={catFilter}
          onChange={e => setCatFilter(e.target.value as typeof catFilter)}
        >
          <option value="all">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {patterns.length === 0 ? (
        <Card className="rounded-3xl p-6 border-dashed text-center">
          <CheckCircle2 className="w-8 h-8 text-green-400/60 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {files.length === 0
              ? 'No code provided. Add files to scan for patterns.'
              : 'No patterns detected in the provided code.'}
          </p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="rounded-3xl p-6 border-dashed text-center">
          <p className="text-sm text-muted-foreground">No patterns match the current filter.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {byCategory.map(([cat, catPatterns]) => (
            <Card key={cat} className="p-4">
              <div className="flex items-center gap-2 mb-3">
                {CATEGORY_ICONS[cat as PatternResult['category']]}
                <h4 className="text-sm font-semibold text-foreground">{CATEGORY_LABELS[cat as PatternResult['category']]}</h4>
                <Badge variant="outline" className="text-xs ml-auto">{catPatterns.length}</Badge>
              </div>
              <div className="space-y-2">
                {catPatterns.map(p => (
                  <div key={p.id} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                    <Badge variant="outline" className={`shrink-0 mt-0.5 ${SEVERITY_COLOR[p.severity]}`}>
                      {p.severity}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium text-foreground">{p.name}</p>
                        <span className="text-xs text-muted-foreground font-mono">{p.file}:{p.line}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">{p.description}</p>
                      {p.snippet && (
                        <code className="block text-xs font-mono bg-muted/50 rounded px-2 py-1 text-foreground/80 truncate">
                          {p.snippet}
                        </code>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}