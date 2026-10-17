'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Building2, 
  ChevronRight, 
  Search,
  Sparkles,
  Target,
  Briefcase,
  Plus
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AiCreditsWidget } from '@/components/ui/ai-credits-widget'
import { EmptyState } from '@/components/ui/empty-state'
import { AppBanner, BannerChip, bannerBtnPrimary } from '@/components/visuals'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/toast-context'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { MOCK_TESTS, mockTestQuery } from '@/lib/mock-tests'
import { formatDate } from '@/lib/format-datetime'


interface MockAttempt {
  id: string
  company: string
  role: string
  difficulty: string
  score: number
  total: number
  percentage: number
  submitted_at: string
}

export default function MockTestsPage() {
  const gate = usePageGuard('user')
  const router = useRouter()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [customData, setCustomData] = useState({ company: '', role: '', type: 'Tech', experience: 'Entry-level' })
  const [isGenerating, setIsGenerating] = useState(false)
  const { startTour, setTourSeen } = useTour()
  const [history, setHistory] = useState<MockAttempt[] | null>(null)
  const [historyError, setHistoryError] = useState(false)

  useEffect(() => {
    if (!gate.ready) return
    fetch('/api/mock-tests/attempts', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { items?: MockAttempt[] }) => setHistory(d.items || []))
      .catch(() => setHistoryError(true))
  }, [gate.ready])

  useEffect(() => {
    if (gate.ready) {
      const mockTestsTour: TourStep[] = [
        {
          target: '[data-tour="mock-tests-header"]',
          title: 'Company mock test library',
          description: 'Browse AI-generated role tests for top companies, built for job seekers practicing interviews.',
          position: 'bottom',
        },
        {
          target: '[data-tour="mock-tests-create"]',
          title: 'Generate custom company test',
          description: 'Generate a tailored test for any company and role for one AI credit.',
          position: 'left',
        },
        {
          target: '[data-tour="mock-tests-list"]',
          title: 'Start sample before spending',
          description: 'Pro tip: Start a Sample card first to preview the format before spending a credit on a custom test.',
          position: 'top',
        },
      ]
      autoPlayPageTour('mock-tests', mockTestsTour)}
  }, [gate.ready, startTour, setTourSeen])

  const filteredTests = MOCK_TESTS.filter(t => 
    t.company.toLowerCase().includes(search.toLowerCase()) || 
    t.role.toLowerCase().includes(search.toLowerCase())
  )

  const handleGenerate = () => {
    // Company and role travel as query params (a hyphenated slug can't be split
    // back reliably, e.g. "goldman-sachs-sde"); the slug is only the URL id.
    const slug = `${customData.company} ${customData.role}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    if (!slug) {
      toast({ type: 'error', title: 'Enter a valid company and role (letters or numbers)' })
      return
    }
    setIsGenerating(true)
    setIsModalOpen(false)
    router.push(`/dashboard/mock-tests/${slug}?${mockTestQuery(customData.company, customData.role)}`)
  }

  if (!gate.ready) return null

  return (
    <div className="flex-1 space-y-6">
      <div data-tour="mock-tests-header">
        <AppBanner
          eyebrow="Mock tests"
          title="Practise the test before the real one"
          description="Role-based tests for the companies you're applying to. AI writes a fresh set of questions each time."
          actions={
            <button type="button" data-tour="mock-tests-create" onClick={() => setIsModalOpen(true)} className={bannerBtnPrimary}>
              <Plus className="h-4 w-4" aria-hidden /> Create custom test
            </button>
          }
          art={
            <div className="flex flex-col items-end gap-3">
              <BannerChip icon={<Building2 />} label="Company and role" sub="Pick what you're applying for" />
              <BannerChip icon={<Sparkles />} label="Fresh questions" sub="Written by AI each time" className="mr-8" delay="0.6s" />
            </div>
          }
        />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by company or role…"
            aria-label="Search by company or role"
            className="pl-9 rounded-xl"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <AiCreditsWidget className="w-full shrink-0 sm:w-64" />
      </div>

      {filteredTests.length > 0 ? (
        <div className="cs-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 lg:gap-5" data-tour="mock-tests-list">
          {filteredTests.map((test) => (
            <Card key={test.id} className="group flex flex-col rounded-3xl border-border/70 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0">
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl border border-primary/20 bg-primary/10 shrink-0 flex items-center justify-center" aria-hidden="true">
                    <span className="text-sm font-bold text-primary">{(test.company || '').charAt(0)}</span>
                  </div>
                  <div>
                    <CardTitle className="text-base line-clamp-1">{test.company}</CardTitle>
                    <CardDescription className="line-clamp-1 mt-0.5">{test.role}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-4 flex-1">
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="secondary" className="flex items-center gap-1.5 font-normal text-xs bg-muted/60">
                    <Briefcase className="w-3 h-3 text-muted-foreground" /> {test.type}
                  </Badge>
                  <Badge variant="secondary" className="flex items-center gap-1.5 font-normal text-xs bg-muted/60">
                    <Target className="w-3 h-3 text-muted-foreground" /> {test.level}
                  </Badge>
                  <Badge variant="outline" className="font-normal text-xs">Sample</Badge>
                </div>
              </CardContent>
              <CardFooter className="pt-0">
                <Button 
                  className="w-full gap-2"
                  onClick={() => router.push(`/dashboard/mock-tests/${test.id}?${mockTestQuery(test.company, test.role)}`)}
                >
                  Start test <ChevronRight className="w-4 h-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
          <EmptyState
            variant="search"
            title="No tests found" 
            description={`Nothing matches "${search}" yet. Create a custom test for that company and role instead.`} 
            actionLabel="Create custom test"
            onAction={() => {
              setCustomData({ ...customData, company: search })
              setIsModalOpen(true)
            }}
          />
      )}

      <section aria-labelledby="mock-history-heading" className="space-y-3">
        <h2 id="mock-history-heading" className="text-lg font-semibold">Your attempts</h2>
        {historyError ? (
          <p className="text-sm text-destructive">Couldn&apos;t load your past attempts. Refresh to try again.</p>
        ) : history === null ? (
          <p className="text-sm text-muted-foreground">Loading your attempts…</p>
        ) : history.length === 0 ? (
          <EmptyState
            title="No attempts yet"
            description="Finish a mock test and your score will be saved here."
          />
        ) : (
          <Card className="rounded-3xl border-border/70 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30 text-left text-muted-foreground">
                    <th className="p-3 font-medium">Test</th>
                    <th className="p-3 font-medium">Level</th>
                    <th className="p-3 font-medium text-right">Score</th>
                    <th className="p-3 font-medium text-right">Taken</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((a) => (
                    <tr key={a.id} className="border-b border-border/40 last:border-0">
                      <td className="p-3">
                        <span className="font-medium">{a.company}</span>
                        <span className="text-muted-foreground"> · {a.role}</span>
                      </td>
                      <td className="p-3 capitalize">{a.difficulty}</td>
                      <td className="p-3 text-right tabular-nums">{a.score}/{a.total} ({a.percentage}%)</td>
                      <td className="p-3 text-right text-muted-foreground tabular-nums">{formatDate(a.submitted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> Create a custom test
            </DialogTitle>
            <DialogDescription>
              Provide details for the company and role you want to practice for. This uses 1 AI credit.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="company">Company name</Label>
              <Input 
                id="company" 
                placeholder="e.g. Stripe, Airbnb" 
                value={customData.company}
                onChange={(e) => setCustomData({...customData, company: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Target role</Label>
              <Input 
                id="role" 
                placeholder="e.g. Backend Developer" 
                value={customData.role}
                onChange={(e) => setCustomData({...customData, role: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="type">Test type</Label>
                <select 
                  id="type"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={customData.type}
                  onChange={(e) => setCustomData({...customData, type: e.target.value})}
                >
                  <option>Tech</option>
                  <option>Data</option>
                  <option>Product</option>
                  <option>Design</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="level">Experience level</Label>
                <select 
                  id="level"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={customData.experience}
                  onChange={(e) => setCustomData({...customData, experience: e.target.value})}
                >
                  <option>Entry-level</option>
                  <option>Mid-level</option>
                  <option>Senior</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={!customData.company || !customData.role || isGenerating}>
              {isGenerating ? (
                <>Generating… <Sparkles className="w-4 h-4 ml-2 animate-pulse motion-reduce:animate-none" /></>
              ) : (
                <>Generate test (1 credit)</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
