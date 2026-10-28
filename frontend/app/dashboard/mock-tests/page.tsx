'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
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
import { AppBanner, Illustration, bannerBtnPrimary } from '@/components/visuals'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/toast-context'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { MOCK_TESTS, mockTestQuery } from '@/lib/mock-tests'
import { useLocaleDates } from '@/lib/i18n/use-dates'
import { useT } from '@/lib/i18n/client'


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
  const { formatDate } = useLocaleDates()
  const { t: tr } = useT()
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
    fetch('/api/mock-tests/attempts?status=submitted&page_size=5', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { items?: MockAttempt[] }) => setHistory(d.items || []))
      .catch(() => setHistoryError(true))
  }, [gate.ready])

  useEffect(() => {
    if (gate.ready) {
      const mockTestsTour: TourStep[] = [
        {
          target: '[data-tour="mock-tests-header"]',
          title: tr('practice.companyMockTestLibrary'),
          description: tr('practice.browseAiGeneratedRoleTestsForc85'),
          position: 'bottom',
        },
        {
          target: '[data-tour="mock-tests-create"]',
          title: tr('practice.generateCustomCompanyTest'),
          description: tr('practice.generateATailoredTestForAny341'),
          position: 'left',
        },
        {
          target: '[data-tour="mock-tests-list"]',
          title: tr('practice.startSampleBeforeSpending'),
          description: tr('practice.proTipStartASampleCardb65'),
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
      toast({ type: 'error', title: tr('practice.enterAValidCompanyAndRole58f') })
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
          eyebrow={tr('practice.mockTests')}
          title={tr('practice.practiseTheTestBeforeTheRealaaf')}
          description={tr('practice.roleBasedTestsForTheCompaniesa76')}
          actions={
            <button type="button" data-tour="mock-tests-create" onClick={() => setIsModalOpen(true)} className={bannerBtnPrimary}>
              <Plus className="h-4 w-4" aria-hidden />{' '}{tr('practice.createCustomTest')}</button>
          }
          art={
            <Illustration name="mock-test" inverse className="w-44" />
          }
        />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={tr('practice.searchByCompanyOrRole')}
            aria-label={tr('practice.searchByCompanyOrRole2')}
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
                  <Badge variant="outline" className="font-normal text-xs">{tr('practice.sample')}</Badge>
                </div>
              </CardContent>
              <CardFooter className="pt-0">
                <Button 
                  className="w-full gap-2"
                  onClick={() => router.push(`/dashboard/mock-tests/${test.id}?${mockTestQuery(test.company, test.role)}`)}
                >{tr('practice.startTest')}{' '}<ChevronRight className="w-4 h-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
          <EmptyState
            variant="search"
            title={tr('practice.noTestsFound')} 
            description={tr('practice.nothingMatchesSearchYetCreateA259', { search })} 
            actionLabel={tr('practice.createCustomTest')}
            onAction={() => {
              setCustomData({ ...customData, company: search })
              setIsModalOpen(true)
            }}
          />
      )}

      <section aria-labelledby="mock-history-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="mock-history-heading" className="text-lg font-semibold">{tr('practice.yourRecentAttempts')}</h2>
          <Link href="/dashboard/mock-tests/history" className="text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">{tr('practice.viewFullHistory')}</Link>
        </div>
        {historyError ? (
          <p className="text-sm text-destructive">{tr('practice.couldntLoadYourPastAttemptsRefresh80c')}</p>
        ) : history === null ? (
          <p className="text-sm text-muted-foreground">{tr('practice.loadingYourAttempts')}</p>
        ) : history.length === 0 ? (
          <EmptyState illustration="mock-test"
            title={tr('practice.noAttemptsYet')}
            description={tr('practice.finishAMockTestAndYourb62')}
          />
        ) : (
          <Card className="rounded-3xl border-border/70 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30 text-left text-muted-foreground">
                    <th className="p-3 font-medium">{tr('practice.test')}</th>
                    <th className="p-3 font-medium">{tr('practice.level')}</th>
                    <th className="p-3 font-medium text-right">{tr('practice.score')}</th>
                    <th className="p-3 font-medium text-right">{tr('practice.taken')}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((a) => (
                    <tr key={a.id} className="border-b border-border/40 last:border-0">
                      <td className="p-3">
                        <Link href={`/dashboard/mock-tests/history/${encodeURIComponent(a.id)}`} className="font-medium hover:text-primary hover:underline">{a.company}</Link>
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
              <Sparkles className="w-5 h-5 text-primary" />{' '}{tr('practice.createACustomTest')}</DialogTitle>
            <DialogDescription>{tr('practice.provideDetailsForTheCompanyAnd88a')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="company">{tr('practice.companyName')}</Label>
              <Input 
                id="company" 
                placeholder={tr('practice.eGStripeAirbnb')} 
                value={customData.company}
                onChange={(e) => setCustomData({...customData, company: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">{tr('practice.targetRole')}</Label>
              <Input 
                id="role" 
                placeholder={tr('practice.eGBackendDeveloper')} 
                value={customData.role}
                onChange={(e) => setCustomData({...customData, role: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="type">{tr('practice.testType')}</Label>
                <select 
                  id="type"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={customData.type}
                  onChange={(e) => setCustomData({...customData, type: e.target.value})}
                >
                  <option>{tr('practice.tech')}</option>
                  <option>{tr('practice.data')}</option>
                  <option>{tr('practice.product')}</option>
                  <option>{tr('practice.design')}</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="level">{tr('practice.experienceLevel')}</Label>
                <select 
                  id="level"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={customData.experience}
                  onChange={(e) => setCustomData({...customData, experience: e.target.value})}
                >
                  <option>{tr('practice.entryLevel')}</option>
                  <option>{tr('practice.midLevel')}</option>
                  <option>{tr('practice.senior')}</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>{tr('common.cancel')}</Button>
            <Button onClick={handleGenerate} disabled={!customData.company || !customData.role || isGenerating}>
              {isGenerating ? (
                <>{tr('practice.generating')}{' '}<Sparkles className="w-4 h-4 ml-2 animate-pulse motion-reduce:animate-none" /></>
              ) : (
                <>{tr('practice.generateTest1Credit')}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
