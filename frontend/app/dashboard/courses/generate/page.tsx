'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Sparkles, ArrowRight, ArrowLeft, Loader2, Play, CheckCircle2, Video, Database, BookOpen, Layers, Zap, Clock, ShieldAlert } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { SkeletonCard, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { useAuth } from '@/lib/auth-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useFocusTrap } from '@/hooks/use-focus-trap'
import { COURSE_LEVELS, INDUSTRIES, subjectsForIndustry, estimateCourse } from '@/lib/courses/syllabus'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'

const LEVELS = [...COURSE_LEVELS]

export default function GenerateCoursePage() {
  const apiError = useApiError()
  const { t } = useT()
  const gate = usePageGuard('user')
  const { user } = useAuth()
  const router = useRouter()

  const [step, setStep] = useState(1)
  const [industry, setIndustry] = useState<(typeof INDUSTRIES)[number]['id']>('software')
  const [technology, setTechnology] = useState('')
  const [level, setLevel] = useState('')
  const [goal, setGoal] = useState('')
  const industrySubjects = subjectsForIndustry(industry)
  const subjectNames = industrySubjects.map(s => s.name)
  const preview = technology ? estimateCourse(technology, level || 'Beginner') : null
  // ponytail: length comes from the catalog syllabus for topic + level (courses are shared per
  // topic/level), so there is no duration picker — we show the real estimate instead.
  const levelPreview = technology && level ? estimateCourse(technology, level) : null
  
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTask, setCurrentTask] = useState('Initializing AI Agents...')
  const [showUpsell, setShowUpsell] = useState(false)
  const upsellRef = useFocusTrap<HTMLDivElement>(showUpsell, () => setShowUpsell(false))
  
  const [userCredits, setUserCredits] = useState<number | null>(null)
  const { startTour, setTourSeen } = useTour()

  useEffect(() => {
    fetch('/api/user/ai-credits')
      .then(res => res.json())
      .then(data => {
        if (data.balance !== undefined) {
          setUserCredits(data.balance)
        }
      })
      .catch(console.error)
  }, [])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const courseGenerateTour: TourStep[] = [
        {
          target: '[data-tour="course-generate-header"]',
          title: t('learning.generateCustomCourses'),
          description: t('learning.describeAnyTopicAndAiBuilds224'),
          position: 'bottom',
        },
        {
          target: '[data-tour="course-generate-credits"]',
          title: t('learning.watchYourCredits'),
          description: t('learning.eachGenerationCosts10CreditsTop719'),
          position: 'bottom',
        },
        {
          target: '[data-tour="course-generate-wizard"]',
          title: t('learning.pickTopicAndLevel'),
          description: t('learning.chooseASubjectSetYourLeveld66'),
          position: 'top',
        },
      ]
      autoPlayPageTour('course-generate', courseGenerateTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return (
    <div className="space-y-6 py-10">
      <SkeletonText lines={2} />
      <SkeletonCard />
    </div>
  )

  const handleNext = () => setStep(step + 1)
  const handleBack = () => setStep(step - 1)

  const startGeneration = async () => {
    if (!technology || !level) {
      return
    }
    if (userCredits !== null && userCredits < 10) {
      setShowUpsell(true)
      return
    }

    try {
      setGenerating(true)
      setStep(4)
      setProgress(20)
      setCurrentTask('Building syllabus from catalog...')

      const genRes = await csrfFetch('/api/user/courses/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ technology, level, goal }),
      })
      const genData = await genRes.json().catch(() => ({}))

      if (genRes.status === 403) {
        setShowUpsell(true)
        setGenerating(false)
        setStep(3)
        return
      }
      if (!genRes.ok) {
        throw new Error(apiError(genData, t('learning.generationFailed')))
      }

      if (typeof genData.creditsCharged === 'number' && userCredits !== null) {
        setUserCredits(Math.max(0, userCredits - genData.creditsCharged))
      } else {
        fetch('/api/user/ai-credits')
          .then(r => r.json())
          .then(d => { if (d.balance !== undefined) setUserCredits(d.balance) })
          .catch(() => {})
      }

      setProgress(100)
      setCurrentTask(genData.message || 'Course ready')
      setTimeout(() => {
        if (genData.course_id) {
          router.push(`/dashboard/courses/${genData.course_id}`)
        } else {
          router.push('/dashboard/courses')
        }
      }, 1000)
    } catch (e) {
      console.error(e)
      setGenerating(false)
      setStep(3)
      setCurrentTask('Generation failed')
    }
  }

  return (
    <div className="space-y-8">
      
      {/* Header */}
      <div data-tour="course-generate-header">
        <PageHeader
          title={t('learning.aiVideoCourseGenerator')}
          description={t('learning.pickATechnologyLevelAndLengthdc2')}
          icon={<Sparkles />}
          className="mb-0"
          actions={
            <>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/dashboard/courses"><ArrowLeft className="h-4 w-4" />{' '}{t('learning.courses')}</Link>
              </Button>
              <div className="flex items-center gap-2 border border-border bg-card px-4 py-1.5 rounded-full" data-tour="course-generate-credits">
                <Zap className="h-4 w-4 text-amber-500" aria-hidden />
                <span className="text-sm font-medium tabular-nums">{t('learning.creditsValue', { value: userCredits !== null ? userCredits : '…' })}</span>
              </div>
            </>
          }
        />
      </div>

      {!generating ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Main Wizard Area */}
          <div className="md:col-span-2">
            <Card className="rounded-3xl p-8 border-border/70 overflow-hidden relative" data-tour="course-generate-wizard">
              {/* Animated decorative shapes */}
              <div aria-hidden className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />

              <div className="relative z-10">
                {/* Step 1: Technology */}
                <div className={`transition-all duration-500 ${step === 1 ? 'opacity-100 translate-x-0' : 'opacity-0 absolute -translate-x-full pointer-events-none'}`}>
                  <h2 className="text-2xl font-bold mb-6">{t('learning.whatDoYouWantToLearn')}</h2>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {INDUSTRIES.map(ind => (
                      <button
                        key={ind.id}
                        type="button"
                        onClick={() => { setIndustry(ind.id); setTechnology('') }}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${industry === ind.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
                      >
                        {ind.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3 mb-6">
                    {subjectNames.map(tech => (
                      <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }} aria-pressed={technology === tech} 
                        key={tech}
                        onClick={() => setTechnology(tech)}
                        className={`px-4 py-3 rounded-xl border-2 cursor-pointer transition-all ${technology === tech ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
                      >
                        <span className="font-medium">{tech}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-3 mb-8">
                    <Label>{t('learning.orEnterACustomTopic')}</Label>
                    <Input aria-label={t('learning.orEnterACustomTopic')} 
                      placeholder={t('learning.eGQuantumComputingWithQiskit')} 
                      value={!subjectNames.includes(technology) ? technology : ''}
                      onChange={(e) => setTechnology(e.target.value)}
                      className="bg-background/50 backdrop-blur-sm"
                    />
                  </div>
                  {preview && (
                    <p className="text-xs text-muted-foreground mb-4">{t('learning.titleModulecountModulesMinlessonsLessonsce6', { title: preview.title, moduleCount: preview.moduleCount, minLessons: preview.minLessons, estimatedHours: preview.estimatedHours })}</p>
                  )}
                  <Button onClick={handleNext} disabled={!technology} className="w-full">{t('learning.nextStep')}{' '}<ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>

                {/* Step 2: Level */}
                <div className={`transition-all duration-500 ${step === 2 ? 'opacity-100 translate-x-0' : 'opacity-0 absolute translate-x-full pointer-events-none'}`}>
                  <h2 className="text-2xl font-bold mb-6">{t('learning.customizeTheExperience')}</h2>
                  
                  <div className="space-y-6 mb-8">
                    <div>
                      <Label className="mb-3 block text-base">{t('learning.currentExperienceLevel')}</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {LEVELS.map(l => (
                          <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }} aria-pressed={level === l} 
                            key={l}
                            onClick={() => setLevel(l)}
                            className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all ${level === l ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
                          >
                            <span className="font-medium">{l}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {levelPreview && (
                      <p className="text-sm text-muted-foreground" aria-live="polite">{t('learning.estimatedLength')}{' '}<strong className="text-foreground tabular-nums">~{levelPreview.estimatedHours}h</strong>{' '}{t('learning.acrossModulecountModulesTheLengthIsf53', { moduleCount: levelPreview.moduleCount })}</p>
                    )}
                  </div>

                  <div className="flex gap-4">
                    <Button onClick={handleBack} variant="outline" className="w-1/3">{t('common.back')}</Button>
                    <Button onClick={handleNext} disabled={!level} className="w-2/3">{t('learning.nextStep')}{' '}<ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Step 3: Goal & Finalize */}
                <div className={`transition-all duration-500 ${step === 3 ? 'opacity-100 translate-x-0' : 'opacity-0 absolute translate-x-full pointer-events-none'}`}>
                  <h2 className="text-2xl font-bold mb-6">{t('learning.whatIsYourPrimaryGoal')}</h2>
                  <div className="space-y-6 mb-8">
                    <div>
                      <Label className="mb-3 block">{t('learning.describeWhatYouWantToAchievec48')}</Label>
                      <Input aria-label={t('learning.describeWhatYouWantToAchievec48')} 
                        placeholder={t('learning.eGIWantToBuildc4c')} 
                        value={goal}
                        onChange={(e) => setGoal(e.target.value)}
                        className="bg-background/50 backdrop-blur-sm"
                      />
                    </div>
                    
                    <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl">
                      <h4 className="text-base font-semibold flex items-center gap-2 mb-2"><Sparkles className="h-4 w-4 text-primary"/>{' '}{t('learning.summary')}</h4>
                      <ul className="text-sm space-y-2 text-muted-foreground">
                        <li>{t('learning.topic')}{' '}<strong className="text-foreground">{technology}</strong></li>
                        <li>{t('learning.level3')}{' '}<strong className="text-foreground">{level}</strong></li>
                        {levelPreview && (
                          <li>{t('learning.length')}{' '}<strong className="text-foreground tabular-nums">~{levelPreview.estimatedHours}h</strong></li>
                        )}
                        <li>{t('learning.cost')}{' '}<strong className="text-amber-500">{t('learning.n10Credits')}</strong></li>
                      </ul>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <Button onClick={handleBack} variant="outline" className="w-1/3">{t('common.back')}</Button>
                    <Button onClick={startGeneration} className="w-2/3">
                      <Zap className="mr-2 h-4 w-4" />{' '}{t('learning.generateCourse')}</Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Sidebar Info */}
          <div className="hidden md:block">
            <Card className="rounded-3xl p-6 bg-muted/30 border-border/70 h-full">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Video className="h-5 w-5 text-primary" />{' '}{t('learning.howItWorks')}</h3>
              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:translate-x-0 before:h-full before:w-0.5 before:bg-linear-to-b before:from-transparent before:via-border before:to-transparent">
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-card bg-primary text-primary-foreground shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    <Database className="h-4 w-4" />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-border bg-background shadow">
                    <p className="font-bold text-sm">{t('learning.n1Research')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('learning.aiScoursDocumentationAndBestPractices')}</p>
                  </div>
                </div>
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-card bg-primary text-primary-foreground shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-border bg-background shadow">
                    <p className="font-bold text-sm">{t('learning.n2Scripting')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('learning.draftingEngagingVideoScripts')}</p>
                  </div>
                </div>
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-card bg-primary text-primary-foreground shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    <Play className="h-4 w-4" />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-border bg-background shadow">
                    <p className="font-bold text-sm">{t('learning.n3Synthesis')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('learning.generatingAiAvatarsAndVideoFiles')}</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        /* Generation Loading State */
        <Card className="max-w-2xl mx-auto rounded-3xl p-12 text-center border-primary/30 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-muted">
            <div 
              className="h-full bg-primary transition-all duration-1000 ease-out" 
              style={{ width: `${progress}%` }} 
            />
          </div>
          
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-24 h-24 mb-8 relative">
              <div className="absolute inset-0 border-4 border-primary/25 rounded-full" />
              <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin motion-reduce:animate-none" />
              <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-primary" />
            </div>
            
            <h2 className="text-3xl font-bold mb-4 text-foreground">{t('learning.generatingYourCourse')}</h2>
            
            <p className="text-xl text-muted-foreground mb-8 min-h-7.5 transition-all">
              {currentTask}
            </p>
            
            <div className="w-full max-w-md bg-secondary/50 rounded-lg p-4 text-left border border-border/50">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">{t('learning.progress')}</span>
                <span className="font-medium tabular-nums text-primary">{progress}%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                <Clock className="inline h-3 w-3 mr-1" />{t('learning.keepThisPageOpenYoullGof86')}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Out-of-credits modal */}
      {showUpsell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowUpsell(false)}>
          <Card
            ref={upsellRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="course-upsell-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl p-6 sm:p-8 border-amber-500/30 shadow-2xl relative overflow-hidden"
          >
            <div aria-hidden className="absolute -top-20 -right-20 w-40 h-40 bg-amber-500/20 rounded-full blur-3xl" />

            <div className="relative z-10 text-center">
              <div className="mx-auto w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-6">
                <ShieldAlert aria-hidden className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 id="course-upsell-title" className="text-2xl font-bold mb-3">{t('learning.notEnoughAiCredits')}</h2>
              <p className="text-muted-foreground mb-8">{t('learning.generatingAFullVideoCourseUses037')}{userCredits !== null ? <>{' '}{t('learning.andYouHave')}{' '}<span className="tabular-nums">{userCredits}</span></> : null}{t('learning.upgradeYourPlanOrTopUpe6c')}</p>
              <div className="space-y-3">
                <Button asChild className="w-full">
                  <Link href="/dashboard/pricing">
                    <Zap aria-hidden className="mr-2 h-4 w-4" />{' '}{t('learning.seePlansAndCredits')}</Link>
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => setShowUpsell(false)}>{t('common.cancel')}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

    </div>
  )
}
