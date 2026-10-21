'use client'
import { useLocaleDates } from '@/lib/i18n/use-dates'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Loader2, Play, Send, Clock, CheckCircle2, XCircle, Code2, FileText, Trophy, MessageSquare } from 'lucide-react'
import { SkeletonCard, SkeletonButton, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { useT } from '@/lib/i18n/client'

interface Problem {
  id: string
  title: string
  description: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  points: number
  input_format?: string
  output_format?: string
  constraints?: string[]
  sample_input?: string
  sample_output?: string
  test_cases?: { input: string; expected: string; hidden: boolean }[]
}

interface Submission {
  id: string
  status: 'pending' | 'running' | 'accepted' | 'wrong_answer' | 'time_limit' | 'runtime_error'
  score: number
  test_cases_passed: number
  test_cases_total: number
  output?: string
  error?: string
  created_at: string
}

interface Codeathon {
  id: string
  title: string
  status: string
  problems?: Problem[]
}

const LANGUAGE_TEMPLATES: Record<string, string> = {
  javascript: `function solve(input) {\n  // Your solution here\n  return '';\n}\n`,
  python: `def solve(input):\n    # Your solution here\n    return ""\n`,
  java: `public class Solution {\n    public static String solve(String input) {\n        // Your solution here\n        return "";\n    }\n}\n`,
  cpp: `#include <iostream>\n#include <string>\nusing namespace std;\n\nstring solve(string input) {\n    // Your solution here\n    return "";\n}\n`,
}

const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C++' },
]

export default function ProblemPage({ params }: { params: Promise<{ id: string; problemId: string }> }) {
  const { t } = useT()
  const { id, problemId } = use(params)
  const router = useRouter()
  const gate = usePageGuard('user')
  const addToast = useToast()

  const [codeathon, setCodeathon] = useState<Codeathon | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('javascript')
  const [submitting, setSubmitting] = useState(false)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [activeTab, setActiveTab] = useState('description')

  useEffect(() => {
    void fetchData()
  }, [id, problemId])

  async function fetchData() {
    try {
      const [codeathonRes, problemRes] = await Promise.all([
        csrfFetch(`/api/codeathons/${id}`, { credentials: 'include' }),
        // No per-problem GET route exists; the problems list applies the
        // contest-visibility rule and strips hidden test cases.
        fetch(`/api/codeathons/${id}/problems`, { credentials: 'include' }),
      ])

      if (codeathonRes.ok) {
        const data = await codeathonRes.json() as Codeathon
        setCodeathon(data)
      }

      if (problemRes.ok) {
        const data = await problemRes.json() as { problems?: Problem[] }
        const found = (data.problems || []).find((p) => String(p.id) === String(problemId))
        if (found) {
          setProblem(found)
          setCode(LANGUAGE_TEMPLATES[language])
        }
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function submitCode() {
    if (!code.trim()) {
      addToast({ type: 'error', title: t('compete.error'), message: t('compete.pleaseWriteSomeCodeFirst') })
      return
    }

    setSubmitting(true)
    setActiveTab('submissions')
    try {
      const res = await csrfFetch(`/api/codeathons/${id}/problems/${problemId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code, language, codeathon_id: id, problem_id: problemId }),
      })

      const data = await res.json() as Submission & { error?: string }
      if (!res.ok) throw new Error(data.error || t('compete.submissionFailed'))

      setSubmissions(prev => [data, ...prev])
      addToast({
        type: data.status === 'accepted' ? 'success' : 'error',
        title: data.status === 'accepted' ? t('compete.accepted') : t('compete.notAccepted'),
        message: `${data.test_cases_passed}/${data.test_cases_total} test cases passed`,
      })
    } catch (e) {
      addToast({ type: 'error', title: t('compete.error'), message: e instanceof Error ? e.message : t('compete.failed') })
    } finally {
      setSubmitting(false)
    }
  }

  async function runCode() {
    if (!code.trim()) {
      addToast({ type: 'error', title: t('compete.error'), message: t('compete.pleaseWriteSomeCodeFirst') })
      return
    }

    try {
      const res = await csrfFetch(`/api/codeathons/${id}/problems/${problemId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code, language, input: problem?.sample_input || '' }),
      })

      const data = await res.json() as { output?: string; error?: string; executionTime?: number }
      if (!res.ok) throw new Error(data.error || t('compete.runFailed'))

      addToast({
        type: 'success',
        title: t('compete.codeRan'),
        message: data.output || t('compete.noOutput'),
      })
    } catch (e) {
      addToast({ type: 'error', title: t('compete.error'), message: e instanceof Error ? e.message : t('compete.failed') })
    }
  }

  function handleLanguageChange(lang: string) {
    setLanguage(lang)
    setCode(LANGUAGE_TEMPLATES[lang] || '')
  }

  if (!gate.ready || loading) return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <SkeletonButton />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-48 bg-muted/60 rounded animate-pulse" />
          <div className="h-4 w-32 bg-muted/40 rounded animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonCard />
        <div className="space-y-3">
          <div className="flex gap-2">
            <SkeletonButton />
            <SkeletonButton />
          </div>
          <div className="h-[50vh] rounded-lg bg-muted/30 animate-pulse" />
        </div>
      </div>
    </div>
  )

  if (!problem) {
    return (
      <Panel className="mx-auto max-w-md p-10 text-center">
        <p className="font-semibold text-foreground">{t('compete.problemNotFound')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('compete.itMayHaveBeenRemovedFrom8f5')}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push(`/dashboard/codeathons/${id}`)}>{t('compete.backToCodeathon')}</Button>
      </Panel>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-3 gap-1 text-muted-foreground" onClick={() => router.push(`/dashboard/codeathons/${id}`)}>
          <ArrowLeft className="h-4 w-4" aria-hidden />{' '}{t('compete.backToCodeathon')}</Button>
        <PageHeader
          className="mb-0"
          icon={<Code2 />}
          title={problem.title}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={
                problem.difficulty === 'Hard' ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400' :
                problem.difficulty === 'Easy' ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400' :
                'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
              }>
                {problem.difficulty}
              </Badge>
              <span className="text-sm tabular-nums text-muted-foreground">{t('compete.pointsPoints', { points: problem.points })}</span>
            </span>
          }
        />
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Problem description */}
        <Card className="max-h-[70vh] gap-0 overflow-y-auto rounded-3xl p-5">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex h-auto w-full flex-wrap">
              <TabsTrigger value="description" className="flex-1"><FileText className="h-4 w-4 mr-1" />{t('compete.description')}</TabsTrigger>
              <TabsTrigger value="submissions" className="flex-1"><Code2 className="h-4 w-4 mr-1" />{t('compete.submissionsCount', { count: submissions.length })}</TabsTrigger>
              <TabsTrigger value="forum" className="flex-1"><MessageSquare className="h-4 w-4 mr-1" />{t('compete.discussion')}</TabsTrigger>
              <TabsTrigger value="leaderboard" className="flex-1"><Trophy className="h-4 w-4 mr-1" />{t('compete.leaderboard')}</TabsTrigger>
            </TabsList>

            <TabsContent value="description" className="space-y-4 mt-4">
              <div className="prose prose-sm max-w-none">
                <p className="whitespace-pre-wrap text-sm text-foreground">{problem.description}</p>
              </div>

              {problem.input_format && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-foreground">{t('compete.inputFormat')}</h3>
                  <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">{problem.input_format}</pre>
                </div>
              )}

              {problem.output_format && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-foreground">{t('compete.outputFormat')}</h3>
                  <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">{problem.output_format}</pre>
                </div>
              )}

              {problem.constraints && problem.constraints.length > 0 && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-foreground">{t('compete.constraints')}</h3>
                  <ul className="list-disc pl-4 text-xs space-y-1">
                    {problem.constraints.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}

              {problem.sample_input && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-foreground">{t('compete.sampleInput')}</h3>
                  <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">{problem.sample_input}</pre>
                </div>
              )}

              {problem.sample_output && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-foreground">{t('compete.sampleOutput')}</h3>
                  <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">{problem.sample_output}</pre>
                </div>
              )}
            </TabsContent>

            <TabsContent value="submissions" className="space-y-3 mt-4">
              {submissions.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t('compete.noSubmissionsYetWriteYourSolution710')}</p>
              ) : (
                submissions.map(sub => (
                  <div key={sub.id} className="flex items-center justify-between rounded-xl border border-border/70 p-3">
                    <div className="flex items-center gap-2">
                      {sub.status === 'accepted' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                      ) : sub.status === 'pending' || sub.status === 'running' ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <span className="text-xs capitalize">{sub.status.replace('_', ' ')}</span>
                    </div>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{sub.test_cases_passed}/{sub.test_cases_total}</span>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="forum" className="space-y-3 mt-4">
              <ForumSection codeathonId={id} problemId={problemId} />
            </TabsContent>

            <TabsContent value="leaderboard" className="mt-4">
              <LeaderboardSection codeathonId={id} />
            </TabsContent>
          </Tabs>
        </Card>

        {/* Right: Code editor */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={language} onValueChange={handleLanguageChange}>
              <SelectTrigger className="w-40" aria-label={t('common.language')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map(l => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={runCode}>
              <Play className="h-4 w-4 mr-1" />{t('compete.run')}</Button>
            <Button size="sm" onClick={submitCode} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}{t('common.submit')}</Button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border" style={{ height: '50vh' }}>
            <Editor
              language={language}
              value={code}
              onChange={(v) => setCode(v || '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// Lazy load Monaco editor
function Editor(props: React.ComponentProps<typeof import('@monaco-editor/react').default>) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="h-full bg-[#1e1e1e] animate-pulse" />
  // Dynamic import to avoid SSR issues
  const MonacoEditor = require('@monaco-editor/react').default
  return <MonacoEditor {...props} />
}

// Leaderboard Section Component — overall codeathon standings from
// GET /api/codeathons/[id]/leaderboard ({ leaderboard, event_type }).
// Entries are per-codeathon aggregates (no per-problem breakdown is stored).
function LeaderboardSection({ codeathonId }: { codeathonId: string }) {
  const { t } = useT()
  interface LeaderboardEntry {
    user_id?: string
    team_id?: string
    user_name?: string
    team_name?: string
    total_score?: number
    problems_solved?: number
    last_submission_at?: string
  }
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [eventType, setEventType] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { void fetchBoard() }, [codeathonId])

  async function fetchBoard() {
    try {
      const res = await csrfFetch(`/api/codeathons/${codeathonId}/leaderboard`, { credentials: 'include' })
      if (!res.ok) throw new Error(t('compete.failedToLoadLeaderboard'))
      const data = await res.json() as { leaderboard?: LeaderboardEntry[]; event_type?: string }
      setEntries(data.leaderboard || [])
      setEventType(data.event_type || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('compete.failedToLoadLeaderboard'))
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
  if (error) return <p className="text-sm text-destructive text-center py-4">{error}</p>
  if (entries.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">{t('compete.noLeaderboardEntriesYetBeThe5fa')}</p>

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground text-center">{eventType === 'team' ? t('compete.overallTeamStandings') : t('compete.overallStandings')}</p>
      {entries.map((e, i) => (
        <div key={e.user_id || e.team_id || i} className="flex items-center justify-between rounded-xl border border-border/70 p-3">
          <div className="flex items-center gap-2">
            <span className="w-6 text-xs font-bold tabular-nums text-muted-foreground">#{i + 1}</span>
            <span className="text-xs font-medium">{(e.team_name || e.user_name || t('compete.unknown'))}</span>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{e.total_score ?? 0}{' '}{t('compete.pts2')}{' '}{e.problems_solved ?? 0}{' '}{t('compete.solved')}</span>
        </div>
      ))}
    </div>
  )
}

// Forum Section Component
function ForumSection({ codeathonId, problemId }: { codeathonId: string; problemId: string }) {
  const { formatDateTime } = useLocaleDates()
  const { t } = useT()
  const addToast = useToast()
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newPost, setNewPost] = useState('')
  const [posting, setPosting] = useState(false)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')

  useEffect(() => { void fetchPosts() }, [codeathonId, problemId])

  async function fetchPosts() {
    try {
      const res = await csrfFetch(`/api/codeathons/${codeathonId}/problems/${problemId}/forum`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json() as { posts: any[] }
        setPosts(data.posts || [])
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function handlePost() {
    if (!newPost.trim()) return
    setPosting(true)
    try {
      const res = await csrfFetch(`/api/codeathons/${codeathonId}/problems/${problemId}/forum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: newPost.trim() }),
      })
      if (res.ok) {
        setNewPost('')
        void fetchPosts()
        addToast({ type: 'success', title: t('compete.posted') })
      }
    } catch {
      addToast({ type: 'error', title: t('compete.failedToPost') })
    } finally {
      setPosting(false)
    }
  }

  async function handleReply(postId: string) {
    if (!replyContent.trim()) return
    try {
      const res = await csrfFetch(`/api/codeathons/${codeathonId}/problems/${problemId}/forum/${postId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: replyContent.trim() }),
      })
      if (res.ok) {
        setReplyContent('')
        setReplyTo(null)
        void fetchPosts()
      }
    } catch {
      addToast({ type: 'error', title: t('compete.failedToReply') })
    }
  }

  if (loading) return <div className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input value={newPost} onChange={e => setNewPost(e.target.value)} placeholder={t('compete.askAQuestionOrShareA904')} aria-label={t('compete.newDiscussionPost')} className="flex-1" />
        <Button size="sm" onClick={handlePost} disabled={posting || !newPost.trim()} aria-label={t('compete.post')}>
          {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">{t('compete.noDiscussionsYetBeTheFirstcb1')}</p>
      ) : (
        <div className="space-y-3">
          {posts.map(post => (
            <div key={post.id} className="space-y-2 rounded-xl border border-border/70 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{post.user_name}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(post.created_at)}</span>
              </div>
              <p className="text-sm text-foreground">{post.content}</p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setReplyTo(replyTo === post.id ? null : post.id)}>{t('compete.reply')}{post.reply_count || 0})
                </Button>
              </div>
              {replyTo === post.id && (
                <div className="flex gap-2 mt-2">
                  <Input value={replyContent} onChange={e => setReplyContent(e.target.value)} placeholder={t('compete.writeAReply')} aria-label={t('compete.reply2')} className="flex-1" />
                  <Button size="sm" onClick={() => handleReply(post.id)}>{t('compete.send')}</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
