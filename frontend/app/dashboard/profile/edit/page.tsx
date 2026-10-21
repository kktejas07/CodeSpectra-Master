'use client'

import { useState, useMemo, useEffect } from 'react'
import { useFocusTrap } from '@/hooks/use-focus-trap'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { CAREER_GOAL_OPTIONS, POPULAR_CAREER_GOALS } from '@/lib/career-goals'
import { generateUsernameCandidate, isGenericUsername } from '@/lib/username'
import { ArrowLeft, ArrowRight, Save, CheckCircle2, User, Briefcase, GraduationCap, Code2, Award, Link as LinkIcon, Camera, Sparkles, Plus, Trash2, Eye, Lightbulb, ShieldCheck, X } from 'lucide-react'
import { FileText, Calendar, MapPin, UploadCloud, FileBadge2, Trophy, UserCircle, Search, MapPinIcon } from 'lucide-react'
import dynamic from 'next/dynamic'
import { usePageGuard } from '@/lib/use-page-guard'
import { PageHeader } from '@/components/app/page-kit'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'
import { useApiError } from '@/lib/i18n/use-api-error'

// Anon Aadhaar pulls in snarkjs / the ZK prover; load it only when its card renders.
const AnonAadhaarProfileCard = dynamic(
  () => import('@/components/kyc/AnonAadhaarProfileCard').then((m) => m.AnonAadhaarProfileCard),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-border/70 p-4 text-sm text-muted-foreground" aria-busy="true">
        Loading Aadhaar verification…
      </div>
    ),
  },
)

// Wizard Steps Configuration
const STEPS = (t: Translator) => ([
  { id: 1, title: t('account.basicDetails'), icon: User, required: true },
  { id: 2, title: t('account.resume'), icon: FileText, required: false },
  { id: 3, title: t('account.about'), icon: Sparkles, required: true },
  { id: 4, title: t('account.skills'), icon: Code2, required: true },
  { id: 5, title: t('account.education'), icon: GraduationCap, required: false },
  { id: 6, title: t('account.workExperience'), icon: Briefcase, required: true },
  { id: 7, title: t('account.accomplishmentsInitiatives'), icon: Trophy, required: false },
  { id: 8, title: t('account.personalDetails'), icon: UserCircle, required: false },
  { id: 9, title: t('account.socialLinks'), icon: LinkIcon, required: false },
])

// Parse the SSE stream returned by POST /api/ai/chat into plain text.
async function parseAiChatStream(res: Response): Promise<string> {
  const text = await res.text()
  let out = ''
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    let parsed: { delta?: string; error?: string } | null = null
    try {
      parsed = JSON.parse(payload) as { delta?: string; error?: string }
    } catch {
      continue
    }
    if (parsed?.error) throw new Error(parsed.error)
    if (parsed?.delta) out += parsed.delta
  }
  return out.trim()
}

export default function EditProfileWizard() {
  const apiError = useApiError()
  const { t } = useT()
  const gate = usePageGuard('user')
  const router = useRouter()
  const { user } = useAuth()
  const addToast = useToast()
  
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [aiDescBusy, setAiDescBusy] = useState<string | null>(null)

  // Form State
  const [basic, setBasic] = useState({ 
    firstName: '', lastName: '', username: '', email: '', phone: '', gender: '', 
    userType: '', purpose: '', designation: '', workExperience: '', 
    organisation: '', careerGoal: '', location: '', avatar: '', countryCode: '+91'
  })
  const [about, setAbout] = useState('')
  const [skills, setSkills] = useState('')
  const [experience, setExperience] = useState([{ id: '1', designation: '', organisation: '', employmentType: '', start: '', end: '', location: '', skills: '', description: '' }])
  const [education, setEducation] = useState([{ id: '1', qualification: '', course: '', specialization: '', college: '', start: '', end: '', courseType: '', percentage: '', cgpa: '', rollNumber: '', lateralEntry: false, skills: '', description: '' }])
  const [links, setLinks] = useState({ linkedin: '', github: '', portfolio: '' })
  
  // Accomplishments State
  const [projects, setProjects] = useState([{ id: '1', name: '', type: '', start: '', end: '', description: '', skills: '', link: '' }])
  const [achievements, setAchievements] = useState([{ id: '1', title: '', description: '', skills: '', link: '' }])
  const [responsibilities, setResponsibilities] = useState([{ id: '1', position: '', organisation: '', location: '', start: '', end: '', description: '', skills: '' }])
  const [certificates, setCertificates] = useState([{ id: '1', title: '', organisation: '', issued: '', expiry: '', description: '', skills: '', link: '' }])

  // New Form State for Unstop Layout
  const [personalDetails, setPersonalDetails] = useState({ pronouns: '', dob: '', currentAddress: '', permanentAddress: '', sameAsCurrent: false, hobbies: '' })

  const [showTips, setShowTips] = useState(false)
  const [isPhoneVerified, setIsPhoneVerified] = useState(false)
  const [phoneVerifyBusy, setPhoneVerifyBusy] = useState(false)
  const [phoneOtpSent, setPhoneOtpSent] = useState(false)
  const [phoneOtp, setPhoneOtp] = useState('')
  const [showEmailUpdate, setShowEmailUpdate] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailOtpSent, setEmailOtpSent] = useState(false)
  const [emailOtp, setEmailOtp] = useState('')
  const [emailReauth, setEmailReauth] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [profileLoadFailed, setProfileLoadFailed] = useState(false)
  const tipsRef = useFocusTrap<HTMLDivElement>(showTips, () => setShowTips(false))
  const emailRef = useFocusTrap<HTMLDivElement>(showEmailUpdate, () => { if (!emailBusy) setShowEmailUpdate(false) })
  const phoneRef = useFocusTrap<HTMLDivElement>(phoneOtpSent, () => { if (!phoneVerifyBusy) setPhoneOtpSent(false) })
  const [careerSearch, setCareerSearch] = useState('')
  const [aadhaarDeferredNote, setAadhaarDeferredNote] = useState(true)

  // Hydrate from Mongo (fallback: localStorage) so refresh shows real data.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/user/extended-profile', { credentials: 'include' })
        if (!res.ok && res.status >= 500) throw new Error(String(res.status))
        const json = await res.json()
        const data = json?.data
        if (!cancelled && data) {
          if (data.basic) setBasic(prev => ({ ...prev, ...data.basic, email: prev.email || user?.email || '' }))
          if (data.about) setAbout(data.about)
          if (data.skills) setSkills(typeof data.skills === 'string' ? data.skills : (data.skills || []).join(', '))
          if (Array.isArray(data.experience) && data.experience.length) setExperience(data.experience)
          if (Array.isArray(data.education) && data.education.length) setEducation(data.education)
          if (data.links) setLinks(prev => ({ ...prev, ...data.links }))
          if (Array.isArray(data.projects) && data.projects.length) setProjects(data.projects)
          if (Array.isArray(data.achievements) && data.achievements.length) setAchievements(data.achievements)
          if (Array.isArray(data.certificates) && data.certificates.length) setCertificates(data.certificates)
          if (data.personalDetails) setPersonalDetails(prev => ({ ...prev, ...data.personalDetails }))
          return
        }
      } catch {
        // Saving now could overwrite the stored profile with this (partial) form.
        if (!cancelled) setProfileLoadFailed(true)
      }
      try {
        const raw = localStorage.getItem('codeSpectra_extendedProfile')
        if (!raw || cancelled) return
        const data = JSON.parse(raw)
        if (data.about) setAbout(data.about)
        if (data.skills) setSkills(data.skills)
        if (data.links) setLinks(prev => ({ ...prev, ...data.links }))
        if (data.phone || data.location || data.designation || data.avatar) {
          setBasic(prev => ({
            ...prev,
            phone: data.phone || prev.phone,
            location: data.location || prev.location,
            designation: data.designation || prev.designation,
            avatar: data.avatar || prev.avatar,
            ...(data.basic || {}),
            email: prev.email || user?.email || '',
          }))
        }
        if (Array.isArray(data.experience) && data.experience.length) setExperience(data.experience)
        if (Array.isArray(data.education) && data.education.length) setEducation(data.education)
        if (data.personalDetails) setPersonalDetails(prev => ({ ...prev, ...data.personalDetails }))
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [user?.email])

  // Name-based username (LinkedIn-style). Upgrade placeholder user1234 once we have a real name.
  // New signups do NOT get a username at account creation — only here / API backfill.
  useEffect(() => {
    const hasName = Boolean(basic.firstName?.trim() || basic.lastName?.trim() || user?.displayName?.trim())
    const hasIdentity = hasName || Boolean(basic.email || user?.email)
    if (!hasIdentity) return
    const shouldReplace = !basic.username || isGenericUsername(basic.username)
    if (!shouldReplace) return
    // Prefer bare name; only attach digits when we still have nothing better than "user"
    const candidate = generateUsernameCandidate({
      firstName: basic.firstName,
      lastName: basic.lastName,
      email: basic.email || user?.email,
      name: user?.displayName,
    })
    if (!candidate || isGenericUsername(candidate)) return
    setBasic(prev => {
      if (prev.username && !isGenericUsername(prev.username)) return prev
      return { ...prev, username: candidate }
    })
  }, [basic.firstName, basic.lastName, basic.username, basic.email, user?.email, user?.displayName])

  // Seed email + name + username from auth session when extended profile is empty
  useEffect(() => {
    if (!user) return
    setBasic(prev => {
      const next = { ...prev }
      if (!next.email && user.email) next.email = user.email
      if (!next.firstName && user.displayName) {
        const parts = user.displayName.trim().split(/\s+/)
        next.firstName = parts[0] || ''
        next.lastName = parts.slice(1).join(' ') || next.lastName
      }
      return next
    })
  }, [user])

  const handleLiveLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}`);
          const data = await res.json();
          const city = data.address?.city || data.address?.town || data.address?.village || data.address?.state_district || '';
          const state = data.address?.state || '';
          const country = data.address?.country || '';
          setBasic(prev => ({ ...prev, location: [city, state, country].filter(Boolean).join(', ') }));
          addToast({ type: 'success', title: t('account.locationCapturedSuccessfully') });
        } catch (e) {
          addToast({ type: 'error', title: t('account.failedToReverseGeocodeLocation') });
        }
      }, () => {
        addToast({ type: 'error', title: t('account.locationAccessDeniedOrBlockedBy66c') });
      });
    } else {
      addToast({ type: 'error', title: t('account.geolocationNotSupportedByYourBrowser') });
    }
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setBasic(prev => ({ ...prev, avatar: reader.result as string }))
      }
      reader.readAsDataURL(file)
    }
  }

  // Calculate dynamic profile completion percentage
  const completionPercentage = useMemo(() => {
    let score = 0;
    // Basic Details (15%)
    if (basic.phone) score += 2;
    if (basic.location) score += 2;
    if (basic.designation) score += 2;
    if (basic.firstName) score += 2;
    if (basic.userType) score += 2;
    if (basic.purpose) score += 2;
    if (basic.workExperience) score += 1;
    if (basic.organisation) score += 1;
    if (basic.careerGoal) score += 1;
    // About (15%)
    if (about && about.trim().length > 10) score += 15;
    // Skills (15%)
    if (skills && skills.trim().length > 2) score += 15;
    // Experience (15%)
    if (experience.some(e => e.designation.trim() && e.organisation.trim())) score += 15;
    // Education (15%)
    if (education.some(e => e.college.trim() && e.qualification.trim())) score += 15;
    // Links (10%)
    if (links.linkedin || links.github || links.portfolio) score += 10;
    // Personal Details (15%)
    if (personalDetails.dob) score += 5;
    if (personalDetails.currentAddress.trim()) score += 5;
    if (personalDetails.hobbies.trim()) score += 5;
    return Math.min(100, score);
  }, [basic, about, skills, experience, education, links, personalDetails]);

  const nextStep = () => setStep(s => Math.min(s + 1, STEPS(t).length))
  const prevStep = () => setStep(s => Math.max(s - 1, 1))

  const addExp = () => setExperience([...experience, { id: Date.now().toString(), designation: '', organisation: '', employmentType: '', start: '', end: '', location: '', skills: '', description: '' }])
  const rmExp = (id: string) => setExperience(experience.filter(e => e.id !== id))
  const updateExp = (id: string, field: string, val: any) => setExperience(experience.map(e => e.id === id ? { ...e, [field]: val } : e))

  const addEdu = () => setEducation([...education, { id: Date.now().toString(), qualification: '', course: '', specialization: '', college: '', start: '', end: '', courseType: '', percentage: '', cgpa: '', rollNumber: '', lateralEntry: false, skills: '', description: '' }])
  const rmEdu = (id: string) => setEducation(education.filter(e => e.id !== id))
  const updateEdu = (id: string, field: string, val: any) => setEducation(education.map(e => e.id === id ? { ...e, [field]: val } : e))

  const addProj = () => setProjects([...projects, { id: Date.now().toString(), name: '', type: '', start: '', end: '', description: '', skills: '', link: '' }])
  const rmProj = (id: string) => setProjects(projects.filter(e => e.id !== id))
  const updateProj = (id: string, field: string, val: any) => setProjects(projects.map(e => e.id === id ? { ...e, [field]: val } : e))

  const addAchieve = () => setAchievements([...achievements, { id: Date.now().toString(), title: '', description: '', skills: '', link: '' }])
  const rmAchieve = (id: string) => setAchievements(achievements.filter(e => e.id !== id))
  const updateAchieve = (id: string, field: string, val: any) => setAchievements(achievements.map(e => e.id === id ? { ...e, [field]: val } : e))

  const addResp = () => setResponsibilities([...responsibilities, { id: Date.now().toString(), position: '', organisation: '', location: '', start: '', end: '', description: '', skills: '' }])
  const rmResp = (id: string) => setResponsibilities(responsibilities.filter(e => e.id !== id))
  const updateResp = (id: string, field: string, val: any) => setResponsibilities(responsibilities.map(e => e.id === id ? { ...e, [field]: val } : e))

  const addCert = () => setCertificates([...certificates, { id: Date.now().toString(), title: '', organisation: '', issued: '', expiry: '', description: '', skills: '', link: '' }])
  const rmCert = (id: string) => setCertificates(certificates.filter(e => e.id !== id))
  const updateCert = (id: string, field: string, val: any) => setCertificates(certificates.map(e => e.id === id ? { ...e, [field]: val } : e))

  const handleGenerateAI = () => {
    setIsGeneratingAI(true)
    setTimeout(() => {
      setAbout(`Passionate and driven professional with a background in ${basic.designation || 'tech'}. Experienced in ${skills || 'building modern applications'} and dedicated to continuous learning and delivering high-quality results. Proven track record of working collaboratively in fast-paced environments to solve complex problems.`)
      setIsGeneratingAI(false)
      addToast({ type: 'success', title: t('account.aiSummaryGenerated') })
    }, 1500)
  }

  // Real AI text generation via POST /api/ai/chat (SSE stream of {delta} chunks).
  async function generateDescription(key: string, label: string, context: string, apply: (text: string) => void) {
    if (aiDescBusy) return
    setAiDescBusy(key)
    try {
      const res = await csrfFetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: t('account.writeAConciseProfessionalResumeDescriptieb5', { label, value: (((context || '').trim() || 'general professional background')).slice(0, 500) }),
        }),
      })
      if (!res.ok) {
        let errMsg = `Request failed (${res.status})`
        try {
          const j = (await res.json()) as { error?: string }
          if (j?.error) errMsg = j.error
        } catch { /* non-JSON body — keep status message */ }
        throw new Error(errMsg)
      }
      const text = await parseAiChatStream(res)
      if (!text) throw new Error(t('account.aiReturnedAnEmptyResponse'))
      apply(text)
      addToast({ type: 'success', title: t('account.aiDescriptionGenerated') })
    } catch (e) {
      addToast({ type: 'error', title: t('account.aiGenerationFailed'), message: e instanceof Error ? e.message : t('account.failedToGenerate') })
    } finally {
      setAiDescBusy(null)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const extendedData = {
        basic: {
          firstName: basic.firstName,
          lastName: basic.lastName,
          username: basic.username,
          phone: basic.phone,
          location: basic.location,
          designation: basic.designation,
          organisation: basic.organisation,
          avatar: basic.avatar,
          gender: basic.gender,
          userType: basic.userType,
          purpose: basic.purpose,
          workExperience: basic.workExperience,
          careerGoal: basic.careerGoal,
          countryCode: basic.countryCode,
        },
        avatar: basic.avatar,
        phone: basic.phone,
        location: basic.location,
        designation: basic.designation,
        about,
        skills,
        experience,
        education,
        projects,
        achievements,
        responsibilities,
        certificates,
        links,
        personalDetails,
      }
      // Keep a local cache for snappy UI, but Mongo is source of truth.
      try { localStorage.setItem('codeSpectra_extendedProfile', JSON.stringify(extendedData)) } catch {}
      const res = await csrfFetch('/api/user/extended-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extendedData),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(json, t('account.saveFailed')))
      // Also update display name when possible
      if (basic.firstName || basic.lastName) {
        const name = `${basic.firstName} ${basic.lastName}`.trim()
        await csrfFetch('/api/user/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        }).catch(() => null)
      }
      addToast({ type: 'success', title: t('account.profileSaved') })
      router.push('/dashboard/profile')
    } catch (err: any) {
      addToast({ type: 'error', title: err?.message || t('account.failedToSaveProfile') })
    } finally {
      setLoading(false)
    }
  }

  if (!gate.ready) return null

  return (
    <div className="w-full py-8 px-4">
      {/* Header */}
      <Link href="/dashboard/profile" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />{' '}{t('account.backToProfile')}</Link>
      <PageHeader
        className="mb-8 border-b border-border pb-5"
        icon={<UserCircle aria-hidden />}
        title={t('account.editProfile')}
        description={t('account.keepYourDetailsUpToDate41b')}
        actions={
          <>
            <Button variant="outline" onClick={prevStep} disabled={step === 1}>{t('common.back')}</Button>
            <Button onClick={handleSave} disabled={loading || profileLoadFailed} title={profileLoadFailed ? t('account.reloadThePageBeforeSaving') : undefined}>
               {loading ? <Sparkles className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}{t('common.save')}</Button>
          </>
        }
      />

      {profileLoadFailed ? (
        <div role="alert" className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-foreground">{t('account.weCouldntLoadYourSavedProfilea44')}</p>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>{t('account.reload')}</Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-8">
        
        {/* Sidebar Steps */}
        <div className="space-y-4 hidden md:block">
          
          {/* Create Resume Promo */}
          <Link
            href="/dashboard/resumes/builder"
            className="group relative block overflow-hidden rounded-3xl border border-primary/30 bg-linear-to-br from-primary via-primary to-blue-800 p-4 text-white shadow-[0_18px_40px_-20px_rgba(47,91,231,0.55)] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 dark:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl transition group-hover:bg-white/20" />
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
                  <FileText className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold leading-tight">{t('account.createYourResume')}</p>
                  <p className="text-xs text-white/80">{t('account.buildAPortfolioReadyCvIn6c2')}</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 opacity-80 transition group-hover:translate-x-0.5" />
            </div>
          </Link>

           {/* Profile Completion Box */}
           <Card className="rounded-3xl p-5 border-border/70">
              <h3 className="text-base font-semibold text-foreground">{t('account.completeYourProfile')}</h3>
              <p className="text-xs text-muted-foreground mt-1 mb-3">{t('account.stayAheadOfTheCompetitionBy4f7')}</p>
              <div className="w-full bg-muted rounded-full h-1.5 mb-1">
                <div className="bg-primary h-1.5 rounded-full transition-all duration-500 motion-reduce:transition-none" style={{ width: `${completionPercentage}%` }}></div>
              </div>
              <div className="text-right text-xs font-medium tabular-nums text-primary">{completionPercentage}%</div>
           </Card>

          {/* Steps List */}
          <div className="space-y-1 mt-4">
            {STEPS(t).map((s, idx) => {
              const isActive = step === s.id
              const isCompleted = step > s.id
              return (
                <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }} aria-current={isActive ? "step" : undefined} 
                  key={s.id} 
                  onClick={() => setStep(s.id)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors duration-200 ${isActive ? 'bg-primary/10 border-l-4 border-primary' : 'hover:bg-muted border-l-4 border-transparent'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-5 h-5">
                      {isCompleted ? <div className="w-4 h-4 rounded-full border-2 border-primary bg-primary" /> : <div className={`w-4 h-4 rounded-full border-2 ${isActive ? 'border-primary bg-primary/20' : 'border-muted-foreground bg-transparent'}`} />}
                    </div>
                    <p className={`text-sm ${isActive ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{s.title}</p>
                  </div>
                  {s.required && (
                    <span className="text-[10px] font-medium bg-red-500/10 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded">{t('account.required')}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Main Form Area */}
        <Card className="rounded-3xl p-6 md:p-8 border-border/70 relative overflow-hidden h-fit">
          <div className="min-h-100">
            {/* Step 1: Basic Details */}
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center justify-between mb-6 border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold text-foreground">{t('account.basicDetails')}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button aria-label={t('account.viewProfile')} variant="ghost" size="icon" className="h-8 w-8 rounded-full" asChild>
                      <Link href="/dashboard/profile"><Eye className="h-4 w-4 text-muted-foreground" /></Link>
                    </Button>
                    <Button aria-label={t('account.showTips')} variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setShowTips(true)}>
                      <Lightbulb className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-6 mb-8 bg-muted/30 p-4 rounded-xl border border-border">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-border bg-muted flex items-center justify-center">
                      {basic.avatar ? (
                        <img src={basic.avatar} alt={t('account.profile')} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-10 h-10 text-muted-foreground opacity-50" />
                      )}
                    </div>
                    <label className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center cursor-pointer shadow-md hover:bg-primary/90 transition-colors">
                      <Plus className="w-4 h-4 text-primary-foreground" />
                      <input type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
                    </label>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{t('account.profilePhoto')}</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">{t('account.uploadAProfessionalPhotoWeRecommend27c')}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>{t('account.firstName')}{' '}<span className="text-destructive">*</span></Label>
                    <Input aria-label={t('account.firstName')} placeholder={t('account.enterFirstName')} value={basic.firstName} onChange={e => setBasic({...basic, firstName: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('account.lastName')}{' '}<span className="text-destructive">*</span></Label>
                    <Input aria-label={t('account.lastName')} placeholder={t('account.enterLastName')} value={basic.lastName} onChange={e => setBasic({...basic, lastName: e.target.value})} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>{t('account.username')}{' '}<span className="text-destructive">*</span></Label>
                    <Input aria-label={t('account.username')} placeholder={t('account.username2')} value={basic.username} readOnly className="bg-muted text-muted-foreground cursor-not-allowed" title={t('account.usernameIsAutoGenerated')} />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Email <span className="text-destructive">*</span></Label>
                    <div className="flex gap-2 relative">
                      <div className="relative flex-1">
                        <Input type="email" value={basic.email || user?.email || ''} readOnly className="bg-muted text-muted-foreground pr-8 w-full cursor-not-allowed" />
                        {(basic.email || user?.email) && <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 absolute right-3 top-1/2 -translate-y-1/2" aria-label={t('common.saved')} />}
                      </div>
                      <Button type="button" variant="outline" className="shrink-0 text-xs text-primary" onClick={() => { setShowEmailUpdate(true); setEmailOtpSent(false); setEmailOtp(''); setNewEmail(''); setEmailReauth('') }}>{t('account.update')}</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('account.mobile')}{' '}<span className="text-destructive">*</span></Label>
                    <div className="flex gap-2">
                      <select className="min-w-25 w-25 bg-background border border-input rounded-md text-sm p-1" value={basic.countryCode || '+91'} onChange={e => setBasic({...basic, countryCode: e.target.value})}>
                        <option value="+93">{t('account.n93Af')}</option>
                        <option value="+355">{t('account.n355Al')}</option>
                        <option value="+213">{t('account.n213Dz')}</option>
                        <option value="+54">{t('account.n54Ar')}</option>
                        <option value="+61">{t('account.n61Au')}</option>
                        <option value="+43">{t('account.n43At')}</option>
                        <option value="+880">{t('account.n880Bd')}</option>
                        <option value="+32">{t('account.n32Be')}</option>
                        <option value="+55">{t('account.n55Br')}</option>
                        <option value="+1">{t('account.n1CaUs')}</option>
                        <option value="+56">{t('account.n56Cl')}</option>
                        <option value="+86">+86 (CN)</option>
                        <option value="+57">{t('account.n57Co')}</option>
                        <option value="+20">{t('account.n20Eg')}</option>
                        <option value="+33">{t('account.n33Fr')}</option>
                        <option value="+49">{t('account.n49De')}</option>
                        <option value="+30">{t('account.n30Gr')}</option>
                        <option value="+91">{t('account.n91In')}</option>
                        <option value="+62">+62 (ID)</option>
                        <option value="+98">{t('account.n98Ir')}</option>
                        <option value="+964">{t('account.n964Iq')}</option>
                        <option value="+353">{t('account.n353Ie')}</option>
                        <option value="+972">{t('account.n972Il')}</option>
                        <option value="+39">{t('account.n39It')}</option>
                        <option value="+81">{t('account.n81Jp')}</option>
                        <option value="+254">{t('account.n254Ke')}</option>
                        <option value="+60">{t('account.n60My')}</option>
                        <option value="+52">{t('account.n52Mx')}</option>
                        <option value="+212">{t('account.n212Ma')}</option>
                        <option value="+95">{t('account.n95Mm')}</option>
                        <option value="+977">{t('account.n977Np')}</option>
                        <option value="+31">{t('account.n31Nl')}</option>
                        <option value="+64">{t('account.n64Nz')}</option>
                        <option value="+234">{t('account.n234Ng')}</option>
                        <option value="+92">{t('account.n92Pk')}</option>
                        <option value="+63">{t('account.n63Ph')}</option>
                        <option value="+48">{t('account.n48Pl')}</option>
                        <option value="+351">{t('account.n351Pt')}</option>
                        <option value="+7">{t('account.n7Ru')}</option>
                        <option value="+966">{t('account.n966Sa')}</option>
                        <option value="+65">{t('account.n65Sg')}</option>
                        <option value="+27">{t('account.n27Za')}</option>
                        <option value="+82">{t('account.n82Kr')}</option>
                        <option value="+34">{t('account.n34Es')}</option>
                        <option value="+94">{t('account.n94Lk')}</option>
                        <option value="+46">{t('account.n46Se')}</option>
                        <option value="+41">{t('account.n41Ch')}</option>
                        <option value="+886">{t('account.n886Tw')}</option>
                        <option value="+66">{t('account.n66Th')}</option>
                        <option value="+90">{t('account.n90Tr')}</option>
                        <option value="+380">{t('account.n380Ua')}</option>
                        <option value="+971">{t('account.n971Ae')}</option>
                        <option value="+44">{t('account.n44Uk')}</option>
                        <option value="+58">{t('account.n58Ve')}</option>
                        <option value="+84">{t('account.n84Vn')}</option>
                      </select>
                      <div className="flex flex-1 gap-2">
                        <div className="relative flex-1">
                          <Input placeholder={t('account.enterMobileNumber')} value={basic.phone} onChange={e => setBasic({...basic, phone: e.target.value})} className={isPhoneVerified ? "bg-muted text-muted-foreground pr-8 cursor-not-allowed" : "pr-8"} readOnly={isPhoneVerified} />
                          {isPhoneVerified && <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 absolute right-3 top-1/2 -translate-y-1/2" aria-label={t('common.saved')} />}
                        </div>
                        {!isPhoneVerified && basic.phone.length > 5 && (
                          <Button variant="outline" className="shrink-0 text-xs text-primary" onClick={async () => {
                            if (!basic.phone || basic.phone.length < 6) {
                              addToast({ type: 'error', title: t('account.enterAValidMobileNumberFirst') })
                              return
                            }
                            setPhoneVerifyBusy(true)
                            try {
                              const res = await csrfFetch('/api/user/phone-verify/request', {
                                method: 'POST',
                                body: JSON.stringify({ phone: basic.phone, countryCode: basic.countryCode || '+91' }),
                              })
                              const json = await res.json()
                              if (!res.ok) throw new Error(apiError(json, t('account.failedToSendCode')))
                              setPhoneOtpSent(true)
                              addToast({ type: 'success', title: json.message || t('account.verificationCodeSentToYourEmail') })
                            } catch (e: any) {
                              addToast({ type: 'error', title: e?.message || t('account.couldNotStartPhoneVerification') })
                            } finally {
                              setPhoneVerifyBusy(false)
                            }
                          }}>{t('account.verify')}</Button>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2 sm:col-span-2 mt-2">
                    <AnonAadhaarProfileCard />
                  </div>

                  <div className="space-y-2 sm:col-span-2 mt-4">
                    <Label>{t('account.gender')}{' '}<span className="text-destructive">*</span></Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {['Male', 'Female', 'Other'].map((g) => (
                        <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }} aria-pressed={basic.gender === g} 
                          key={g}
                          onClick={() => setBasic({...basic, gender: g})}
                          className={`px-5 py-2 rounded-full border text-sm cursor-pointer transition-colors ${basic.gender === g ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border hover:bg-muted text-muted-foreground'}`}
                        >
                          {g}
                        </div>
                      ))}
                    </div>
                    {basic.gender === 'Other' && (
                      <Input placeholder={t('account.pleaseSpecifyTheGender')} className="mt-3 text-sm h-10" />
                    )}
                  </div>

                  <div className="space-y-3 sm:col-span-2 mt-4">
                    <Label>{t('account.userType')}{' '}<span className="text-destructive">*</span></Label>
                    <div className="flex flex-wrap gap-3 mt-1">
                      {['College Students', 'Professional', 'School Student', 'Fresher'].map((type) => (
                        <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }} aria-pressed={basic.userType === type} 
                          key={type}
                          onClick={() => setBasic({...basic, userType: type})}
                          className={`px-5 py-2 rounded-full border border-dashed text-sm cursor-pointer transition-all ${basic.userType === type ? 'border-primary bg-primary/5 text-primary font-semibold border-solid' : 'border-border hover:border-primary/50 text-muted-foreground'}`}
                        >
                          {type}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 sm:col-span-2 mt-4">
                    <Label>{t('account.purpose')}{' '}<span className="text-destructive">*</span></Label>
                    <div className="flex flex-wrap gap-3 mt-1">
                      {['To find a Job', 'Compete & Upskill', 'To Host an Event', 'To be a Mentor'].map((p) => (
                        <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }} aria-pressed={basic.purpose === p} 
                          key={p}
                          onClick={() => setBasic({...basic, purpose: p})}
                          className={`px-5 py-2 flex items-center gap-2 rounded-full border text-sm cursor-pointer transition-all ${basic.purpose === p ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border hover:bg-muted text-muted-foreground'}`}
                        >
                          <Search className="w-3.5 h-3.5" />
                          {p}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 sm:col-span-2 mt-6">
                    <Label>{t('account.designation')}{' '}<span className="text-destructive">*</span></Label>
                    <select aria-label={t('account.designation')} 
                      value={basic.designation} 
                      onChange={e => setBasic({...basic, designation: e.target.value})}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="" disabled>{t('account.selectDesignation')}</option>
                      <optgroup label={t('account.engineering')}>
                        <option value="Software Engineer">{t('account.softwareEngineer')}</option>
                        <option value="Frontend Developer">{t('account.frontendDeveloper')}</option>
                        <option value="Backend Developer">{t('account.backendDeveloper')}</option>
                        <option value="Full Stack Developer">{t('account.fullStackDeveloper')}</option>
                        <option value="Mobile App Developer">{t('account.mobileAppDeveloper')}</option>
                        <option value="DevOps Engineer">{t('account.devopsEngineer')}</option>
                        <option value="Cloud Architect">{t('account.cloudArchitect')}</option>
                        <option value="Security Engineer">{t('account.securityEngineer')}</option>
                        <option value="QA Engineer">{t('account.qaEngineer')}</option>
                        <option value="Engineering Manager">{t('account.engineeringManager')}</option>
                      </optgroup>
                      <optgroup label={t('account.dataAi')}>
                        <option value="Data Scientist">{t('account.dataScientist')}</option>
                        <option value="Data Analyst">{t('account.dataAnalyst')}</option>
                        <option value="Data Engineer">{t('account.dataEngineer')}</option>
                        <option value="Machine Learning Engineer">{t('account.machineLearningEngineer')}</option>
                        <option value="AI Researcher">{t('account.aiResearcher')}</option>
                        <option value="Business Analyst">{t('account.businessAnalyst')}</option>
                      </optgroup>
                      <optgroup label={t('account.productDesign')}>
                        <option value="Product Manager">{t('account.productManager')}</option>
                        <option value="UI/UX Designer">{t('account.uiUxDesigner')}</option>
                        <option value="Product Designer">{t('account.productDesigner')}</option>
                        <option value="Graphic Designer">{t('account.graphicDesigner')}</option>
                        <option value="Scrum Master">{t('account.scrumMaster')}</option>
                        <option value="Technical Writer">{t('account.technicalWriter')}</option>
                      </optgroup>
                      <optgroup label={t('account.marketingSales')}>
                        <option value="Marketing Manager">{t('account.marketingManager')}</option>
                        <option value="Digital Marketer">{t('account.digitalMarketer')}</option>
                        <option value="Content Creator">{t('account.contentCreator')}</option>
                        <option value="Sales Executive">{t('account.salesExecutive')}</option>
                        <option value="Growth Hacker">{t('account.growthHacker')}</option>
                      </optgroup>
                      <optgroup label={t('account.academicOther')}>
                        <option value="Student">{t('account.student')}</option>
                        <option value="Researcher">{t('account.researcher')}</option>
                        <option value="Educator / Teacher">{t('account.educatorTeacher')}</option>
                        <option value="Freelancer">{t('account.freelancer')}</option>
                        <option value="Consultant">{t('account.consultant')}</option>
                        <option value="Founder / Entrepreneur">{t('account.founderEntrepreneur')}</option>
                        <option value="Other">{t('account.other2')}</option>
                      </optgroup>
                    </select>
                    {!basic.designation && <p className="text-[11px] text-destructive text-right mt-1 font-medium">{t('account.pleaseConsiderFillingDesignation')}</p>}
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label>{t('account.workExperience')}{' '}<span className="text-destructive">*</span></Label>
                    <select aria-label={t('account.workExperience')} 
                      value={basic.workExperience} 
                      onChange={e => setBasic({...basic, workExperience: e.target.value})}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="" disabled>{t('account.selectYears')}</option>
                      <option value="Fresher">{t('account.fresher')}</option>
                      <option value="1 year">{t('account.n1Year')}</option>
                      <option value="2 years">{t('account.n2Years')}</option>
                      <option value="3 years">{t('account.n3Years')}</option>
                      <option value="4 years">{t('account.n4Years')}</option>
                      <option value="5 years">{t('account.n5Years')}</option>
                      <option value="6 years">{t('account.n6Years')}</option>
                      <option value="7 years">{t('account.n7Years')}</option>
                      <option value="8 years">{t('account.n8Years')}</option>
                      <option value="9 years">{t('account.n9Years')}</option>
                      <option value="10 years">{t('account.n10Years')}</option>
                      <option value="11 years">{t('account.n11Years')}</option>
                      <option value="12 years">{t('account.n12Years')}</option>
                      <option value="13 years">{t('account.n13Years')}</option>
                      <option value="14 years">{t('account.n14Years')}</option>
                      <option value="15+ years">{t('account.n15Years')}</option>
                    </select>
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label>Organisation/college <span className="text-destructive">*</span></Label>
                    <Input aria-label="Organisation/college" className="h-11" placeholder={t('account.enterYourCurrentOrganisationOrCollege')} value={basic.organisation} onChange={e => setBasic({...basic, organisation: e.target.value})} />
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label>{t('account.careerGoalS')}</Label>
                    <p className="text-xs text-muted-foreground">{t('account.pickOneOrMoreRolesSearch10f')}</p>
                    {basic.careerGoal.split(',').filter(Boolean).length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {basic.careerGoal.split(',').filter(Boolean).map(g => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setBasic(prev => ({
                              ...prev,
                              careerGoal: prev.careerGoal.split(',').filter(Boolean).filter(x => x !== g).join(','),
                            }))}
                            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                          >
                            {g}
                            <X className="h-3 w-3" />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-9 h-10"
                        placeholder={t('account.searchRolesEGFrontendDataf19')}
                        value={careerSearch}
                        onChange={e => setCareerSearch(e.target.value)}
                      />
                    </div>
                    <div className="rounded-lg border border-border bg-muted/20 p-3 max-h-56 overflow-y-auto">
                      <p className="text-xs font-medium text-muted-foreground mb-2">{t('account.popular')}</p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {POPULAR_CAREER_GOALS.map(g => {
                          const selected = basic.careerGoal.split(',').filter(Boolean).includes(g)
                          return (
                            <button
                              key={g}
                              type="button"
                              onClick={() => {
                                const cur = basic.careerGoal.split(',').filter(Boolean)
                                const next = selected ? cur.filter(x => x !== g) : [...cur, g]
                                setBasic({ ...basic, careerGoal: next.join(',') })
                              }}
                              className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                                selected
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border bg-background hover:bg-muted text-foreground'
                              }`}
                            >
                              {g}
                            </button>
                          )
                        })}
                      </div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">{t('account.allRoles')}</p>
                      <div className="flex flex-wrap gap-2">
                        {CAREER_GOAL_OPTIONS
                          .filter(g => !careerSearch || g.toLowerCase().includes(careerSearch.toLowerCase()))
                          .slice(0, careerSearch ? 80 : 40)
                          .map(g => {
                            const selected = basic.careerGoal.split(',').filter(Boolean).includes(g)
                            return (
                              <button
                                key={g}
                                type="button"
                                onClick={() => {
                                  const cur = basic.careerGoal.split(',').filter(Boolean)
                                  const next = selected ? cur.filter(x => x !== g) : [...cur, g]
                                  setBasic({ ...basic, careerGoal: next.join(',') })
                                }}
                                className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                                  selected
                                    ? 'border-primary bg-primary/15 text-primary'
                                    : 'border-border bg-background hover:bg-muted text-muted-foreground'
                                }`}
                              >
                                {g}
                              </button>
                            )
                          })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label>{t('account.currentLocation')}{' '}<span className="text-destructive">*</span></Label>
                    <div className="relative">
                      <Input className="h-11 pr-12" placeholder={t('account.hyderabadTelanganaIndia')} value={basic.location} onChange={e => setBasic({...basic, location: e.target.value})} />
                      <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }} aria-label={t('account.useLiveLocation')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-accent rounded-md cursor-pointer transition-colors" title={t('account.useLiveLocation')} onClick={handleLiveLocation}>
                        <MapPinIcon className="w-4 h-4 text-primary" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Resume */}
            {step === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold text-foreground">{t('account.resume')}</h2>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                     <Label>{t('account.resume')}{' '}<span className="text-destructive">*</span></Label>
                     <span className="text-xs text-primary font-medium cursor-pointer hover:underline">{t('account.create')}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{t('account.rememberThatOnePagerThatHighlights3b5')}</p>
                  
                  <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer mt-4">
                    <UploadCloud className="w-10 h-10 text-primary mb-3" />
                    <h3 className="text-base font-medium text-primary">{t('account.updateResume')}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{t('account.supportedFileFormatsDocDocxPdf885')}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: About You */}
            {step === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
                  <Sparkles className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold text-foreground">{t('account.aboutYou')}</h2>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label>{t('account.professionalSummary')}</Label>
                    <Button variant="secondary" size="sm" onClick={handleGenerateAI} disabled={isGeneratingAI} className="bg-primary/10 text-primary hover:bg-primary/15">
                      <Sparkles className={`w-4 h-4 mr-2 ${isGeneratingAI ? 'animate-pulse' : ''}`} />
                      {isGeneratingAI ? t('account.generating') : t('account.generateWithAi')}
                    </Button>
                  </div>
                  <Textarea 
                    rows={6} 
                    placeholder={t('account.writeABriefSummaryOfYourde0')}
                    value={about}
                    onChange={e => setAbout(e.target.value)}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground text-right">{about.length} / 500 characters</p>
                </div>
              </div>
            )}

            {/* Step 4: Skills */}
            {step === 4 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
                  <Code2 className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold text-foreground">{t('account.skills')}</h2>
                </div>
                <div className="space-y-4">
                  <Label>{t('account.coreSkillsCommaSeparated')}</Label>
                  <Textarea aria-label={t('account.coreSkillsCommaSeparated')} 
                    rows={4} 
                    placeholder={t('account.eGJavascriptReactNodeJs2b9')}
                    value={skills}
                    onChange={e => setSkills(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2 mt-2">
                    {skills.split(',').filter(s => s.trim().length > 0).map((skill, i) => (
                      <span key={i} className="px-3 py-1 bg-secondary text-secondary-foreground text-xs rounded-full">
                        {skill.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Education */}
            {step === 5 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center justify-between mb-6 border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <GraduationCap className="w-5 h-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold text-foreground">{t('account.education')}</h2>
                  </div>
                  <Button variant="outline" size="sm" onClick={addEdu}><Plus className="w-4 h-4 mr-2" />{' '}{t('account.add')}</Button>
                </div>

                <div className="space-y-6">
                  {education.map((edu) => (
                    <div key={edu.id} className="p-4 border border-border/70 rounded-2xl bg-card relative group">
                      {education.length > 1 && (
                        <Button aria-label={t('account.removeEducation')} variant="ghost" size="icon" onClick={() => rmEdu(edu.id)} className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{t('account.qualification')}{' '}<span className="text-destructive">*</span></Label>
                          <select aria-label={t('account.qualification')} className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            value={edu.qualification} onChange={e => updateEdu(edu.id, 'qualification', e.target.value)}>
                            <option value="">{t('account.selectQualification')}</option>
                            <option value="Degree">{t('account.degree')}</option>
                            <option value="Diploma">{t('account.diploma')}</option>
                            <option value="High School">{t('account.highSchool')}</option>
                          </select>
                        </div>
                        <div className="space-y-2"><Label>{t('account.course')}{' '}<span className="text-destructive">*</span></Label><Input aria-label={t('account.course')} placeholder={t('account.eGBTech')} value={edu.course} onChange={e => updateEdu(edu.id, 'course', e.target.value)} /></div>
                        <div className="space-y-2"><Label>{t('account.specialization')}{' '}<span className="text-destructive">*</span></Label><Input aria-label={t('account.specialization')} placeholder={t('account.eGComputerScience')} value={edu.specialization} onChange={e => updateEdu(edu.id, 'specialization', e.target.value)} /></div>
                        <div className="space-y-2"><Label>College/university <span className="text-destructive">*</span></Label><Input aria-label="College/university" placeholder={t('account.eGIit')} value={edu.college} onChange={e => updateEdu(edu.id, 'college', e.target.value)} /></div>
                        
                        <div className="space-y-2"><Label>{t('account.startDate')}</Label><Input aria-label={t('account.startDate')} type="month" value={edu.start} onChange={e => updateEdu(edu.id, 'start', e.target.value)} /></div>
                        <div className="space-y-2"><Label>{t('account.endDate')}</Label><Input aria-label={t('account.endDate')} type="month" value={edu.end} onChange={e => updateEdu(edu.id, 'end', e.target.value)} /></div>
                        
                        <div className="space-y-2">
                          <Label>{t('account.courseType')}</Label>
                          <select aria-label={t('account.courseType')} className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            value={edu.courseType} onChange={e => updateEdu(edu.id, 'courseType', e.target.value)}>
                            <option value="">{t('account.selectType')}</option>
                            <option value="Full Time">{t('account.fullTime')}</option>
                            <option value="Part Time">{t('account.partTime')}</option>
                            <option value="Distance">{t('account.distance')}</option>
                          </select>
                        </div>
                        <div className="space-y-2"><Label>Percentage/CGPA</Label><Input aria-label="Percentage/CGPA" placeholder={t('account.eG85Or85')} value={edu.percentage} onChange={e => updateEdu(edu.id, 'percentage', e.target.value)} /></div>
                        <div className="space-y-2"><Label>{t('account.rollNumber')}</Label><Input aria-label={t('account.rollNumber')} value={edu.rollNumber} onChange={e => updateEdu(edu.id, 'rollNumber', e.target.value)} /></div>
                        
                        <div className="space-y-2 sm:col-span-2 flex items-center gap-2 mt-4">
                          <input type="checkbox" id={`lateral-${edu.id}`} className="w-4 h-4 rounded border-border accent-primary" checked={edu.lateralEntry} onChange={e => updateEdu(edu.id, 'lateralEntry', e.target.checked)} />
                          <Label htmlFor={`lateral-${edu.id}`} className="cursor-pointer">{t('account.lateralEntry')}</Label>
                        </div>

                        <div className="space-y-2 sm:col-span-2"><Label>{t('account.skills')}</Label><Input aria-label={t('account.skills')} placeholder={t('account.addSkillsCommaSeparated')} value={edu.skills} onChange={e => updateEdu(edu.id, 'skills', e.target.value)} /></div>
                        
                        <div className="space-y-2 sm:col-span-2">
                          <Label>{t('account.description2')}</Label>
                          <Textarea aria-label={t('account.description2')} rows={3} placeholder={t('account.describeYourEducation')} value={edu.description} onChange={e => updateEdu(edu.id, 'description', e.target.value)} />
                          <Button variant="outline" size="sm" className="mt-2 text-primary" disabled={aiDescBusy === `edu-${edu.id}`} onClick={() => generateDescription(`edu-${edu.id}`, 'education entry', `${edu.course || ''} ${edu.specialization || ''} at ${edu.college || ''}${edu.skills ? `, skills: ${edu.skills}` : ''}`, (text) => updateEdu(edu.id, 'description', text))}>
                            <Sparkles className="w-4 h-4 mr-2" /> {aiDescBusy === `edu-${edu.id}` ? 'Generating...' : t('account.generateWithAi')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 6: Experience */}
            {step === 6 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center justify-between mb-6 border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <Briefcase className="w-5 h-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold text-foreground">{t('account.workExperience')}</h2>
                  </div>
                  <Button variant="outline" size="sm" onClick={addExp}><Plus className="w-4 h-4 mr-2" />{' '}{t('account.add')}</Button>
                </div>

                <div className="space-y-6">
                  {experience.map((exp, index) => (
                    <div key={exp.id} className="p-4 border border-border/70 rounded-2xl bg-card relative group">
                      {experience.length > 1 && (
                        <Button aria-label={t('account.removeExperience')} variant="ghost" size="icon" onClick={() => rmExp(exp.id)} className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div className="space-y-2"><Label>{t('account.designation')}{' '}<span className="text-destructive">*</span></Label><Input aria-label={t('account.designation')} placeholder={t('account.eGSoftwareEngineer')} value={exp.designation} onChange={e => updateExp(exp.id, 'designation', e.target.value)} /></div>
                        <div className="space-y-2"><Label>{t('account.organisation')}{' '}<span className="text-destructive">*</span></Label><Input aria-label={t('account.organisation')} placeholder={t('account.eGGoogle')} value={exp.organisation} onChange={e => updateExp(exp.id, 'organisation', e.target.value)} /></div>
                        
                        <div className="space-y-2">
                          <Label>{t('account.employmentType')}{' '}<span className="text-destructive">*</span></Label>
                          <select aria-label={t('account.employmentType')} className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            value={exp.employmentType} onChange={e => updateExp(exp.id, 'employmentType', e.target.value)}>
                            <option value="">{t('account.selectType')}</option>
                            <option value="Full Time">{t('account.fullTime')}</option>
                            <option value="Part Time">{t('account.partTime')}</option>
                            <option value="Freelance">{t('account.freelance')}</option>
                            <option value="Internship">{t('account.internship')}</option>
                          </select>
                        </div>
                        
                        <div className="space-y-2"><Label>{t('account.location')}</Label><Input aria-label={t('account.location')} placeholder={t('account.eGRemoteIndia')} value={exp.location} onChange={e => updateExp(exp.id, 'location', e.target.value)} /></div>
                        
                        <div className="space-y-2"><Label>{t('account.startDate')}{' '}<span className="text-destructive">*</span></Label><Input aria-label={t('account.startDate')} type="month" value={exp.start} onChange={e => updateExp(exp.id, 'start', e.target.value)} /></div>
                        <div className="space-y-2"><Label>{t('account.endDate')}</Label><Input aria-label={t('account.endDate')} type="month" value={exp.end} onChange={e => updateExp(exp.id, 'end', e.target.value)} /></div>
                        
                        <div className="space-y-2 sm:col-span-2"><Label>{t('account.skills')}</Label><Input aria-label={t('account.skills')} placeholder={t('account.addSkillsCommaSeparated')} value={exp.skills} onChange={e => updateExp(exp.id, 'skills', e.target.value)} /></div>
                      </div>
                      <div className="space-y-2">
                        <Label>{t('account.description2')}</Label>
                        <Textarea aria-label={t('account.description2')} rows={4} placeholder={t('account.detailYourResponsibilitiesTheRoleYou911')} value={exp.description} onChange={e => updateExp(exp.id, 'description', e.target.value)} />
                        <Button variant="outline" size="sm" className="mt-2 text-primary" disabled={aiDescBusy === `exp-${exp.id}`} onClick={() => generateDescription(`exp-${exp.id}`, 'work experience entry', `${exp.designation || ''} at ${exp.organisation || ''}${exp.skills ? `, skills: ${exp.skills}` : ''}`, (text) => updateExp(exp.id, 'description', text))}>
                          <Sparkles className="w-4 h-4 mr-2" /> {aiDescBusy === `exp-${exp.id}` ? 'Generating...' : t('account.generateWithAi')}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {experience.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-xl">{t('account.noExperienceAddedYet')}</div>
                  )}
                </div>
              </div>
            )}

            {/* Step 7: Accomplishments & Initiatives */}
            {step === 7 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
                  <Trophy className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold text-foreground">{t('account.accomplishmentsAndInitiatives')}</h2>
                </div>
                
                <div className="space-y-8 mt-6">
                  {/* Projects */}
                  <div>
                    <div className="flex items-center justify-between mb-4 border-b border-border pb-2">
                      <h3 className="font-semibold text-lg flex items-center gap-2"><Code2 className="w-4 h-4 text-primary" aria-hidden />{' '}{t('account.projects')}</h3>
                      <Button variant="outline" size="sm" onClick={addProj}><Plus className="w-4 h-4 mr-2" />{' '}{t('account.addProject')}</Button>
                    </div>
                    <div className="space-y-4">
                      {projects.map(proj => (
                        <div key={proj.id} className="p-4 border border-border/70 rounded-2xl bg-card relative group">
                          <Button aria-label={t('account.removeProject')} variant="ghost" size="icon" onClick={() => rmProj(proj.id)} className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2"><Label>{t('account.projectName')}{' '}<span className="text-destructive">*</span></Label><Input aria-label={t('account.projectName')} value={proj.name} onChange={e => updateProj(proj.id, 'name', e.target.value)} /></div>
                            <div className="space-y-2"><Label>{t('account.projectType')}{' '}<span className="text-destructive">*</span></Label><Input aria-label={t('account.projectType')} value={proj.type} onChange={e => updateProj(proj.id, 'type', e.target.value)} /></div>
                            <div className="space-y-2"><Label>{t('account.startDate')}</Label><Input aria-label={t('account.startDate')} type="month" value={proj.start} onChange={e => updateProj(proj.id, 'start', e.target.value)} /></div>
                            <div className="space-y-2"><Label>{t('account.endDate')}</Label><Input aria-label={t('account.endDate')} type="month" value={proj.end} onChange={e => updateProj(proj.id, 'end', e.target.value)} /></div>
                            <div className="space-y-2 sm:col-span-2"><Label>{t('account.linkThisProject')}</Label><Input aria-label={t('account.linkThisProject')} placeholder="https://..." value={proj.link} onChange={e => updateProj(proj.id, 'link', e.target.value)} /></div>
                            <div className="space-y-2 sm:col-span-2"><Label>{t('account.skills')}</Label><Input aria-label={t('account.skills')} placeholder={t('account.addSkillsCommaSeparated')} value={proj.skills} onChange={e => updateProj(proj.id, 'skills', e.target.value)} /></div>
                            <div className="space-y-2 sm:col-span-2">
                              <Label>{t('account.description2')}</Label>
                              <Textarea aria-label={t('account.description2')} rows={3} placeholder={t('account.detailTheProjectYouWorkedOn')} value={proj.description} onChange={e => updateProj(proj.id, 'description', e.target.value)} />
                              <Button variant="outline" size="sm" className="mt-2 text-primary" disabled={aiDescBusy === `proj-${proj.id}`} onClick={() => generateDescription(`proj-${proj.id}`, 'project entry', `${proj.name || ''} (${proj.type || 'project'})${proj.skills ? `, skills: ${proj.skills}` : ''}`, (text) => updateProj(proj.id, 'description', text))}>
                                <Sparkles className="w-4 h-4 mr-2" /> {aiDescBusy === `proj-${proj.id}` ? 'Generating...' : t('account.generateWithAi')}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {projects.length === 0 && <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">{t('account.noProjectsAdded')}</p>}
                    </div>
                  </div>

                  {/* Achievements */}
                  <div>
                    <div className="flex items-center justify-between mb-4 border-b border-border pb-2">
                      <h3 className="font-semibold text-lg flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" />{' '}{t('account.achievements')}</h3>
                      <Button variant="outline" size="sm" onClick={addAchieve}><Plus className="w-4 h-4 mr-2" />{' '}{t('account.addAchievement')}</Button>
                    </div>
                    <div className="space-y-4">
                      {achievements.map(ach => (
                        <div key={ach.id} className="p-4 border border-border/70 rounded-2xl bg-card relative group">
                          <Button aria-label={t('account.removeAchievement')} variant="ghost" size="icon" onClick={() => rmAchieve(ach.id)} className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2"><Label>{t('account.title')}{' '}<span className="text-destructive">*</span></Label><Input aria-label={t('account.title')} value={ach.title} onChange={e => updateAchieve(ach.id, 'title', e.target.value)} /></div>
                            <div className="space-y-2"><Label>{t('account.linkThisAchievement')}</Label><Input aria-label={t('account.linkThisAchievement')} placeholder="https://..." value={ach.link} onChange={e => updateAchieve(ach.id, 'link', e.target.value)} /></div>
                            <div className="space-y-2"><Label>{t('account.skills')}</Label><Input aria-label={t('account.skills')} placeholder={t('account.addSkillsCommaSeparated')} value={ach.skills} onChange={e => updateAchieve(ach.id, 'skills', e.target.value)} /></div>
                            <div className="space-y-2">
                              <Label>{t('account.description2')}</Label>
                              <Textarea aria-label={t('account.description2')} rows={3} placeholder={t('account.describeYourAchievementHere')} value={ach.description} onChange={e => updateAchieve(ach.id, 'description', e.target.value)} />
                              <Button variant="outline" size="sm" className="mt-2 text-primary" disabled={aiDescBusy === `ach-${ach.id}`} onClick={() => generateDescription(`ach-${ach.id}`, 'achievement entry', `${ach.title || ''}${ach.skills ? `, skills: ${ach.skills}` : ''}`, (text) => updateAchieve(ach.id, 'description', text))}>
                                <Sparkles className="w-4 h-4 mr-2" /> {aiDescBusy === `ach-${ach.id}` ? 'Generating...' : t('account.generateWithAi')}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {achievements.length === 0 && <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">{t('account.noAchievementsAdded')}</p>}
                    </div>
                  </div>

                  {/* Responsibilities */}
                  <div>
                    <div className="flex items-center justify-between mb-4 border-b border-border pb-2">
                      <h3 className="font-semibold text-lg flex items-center gap-2"><Briefcase className="w-4 h-4 text-primary" aria-hidden />{' '}{t('account.responsibilities')}</h3>
                      <Button variant="outline" size="sm" onClick={addResp}><Plus className="w-4 h-4 mr-2" />{' '}{t('account.addResponsibility')}</Button>
                    </div>
                    <div className="space-y-4">
                      {responsibilities.map(resp => (
                        <div key={resp.id} className="p-4 border border-border/70 rounded-2xl bg-card relative group">
                          <Button aria-label={t('account.removeResponsibility')} variant="ghost" size="icon" onClick={() => rmResp(resp.id)} className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2"><Label>{t('account.positionOfResponsibility')}{' '}<span className="text-destructive">*</span></Label><Input aria-label={t('account.positionOfResponsibility')} value={resp.position} onChange={e => updateResp(resp.id, 'position', e.target.value)} /></div>
                            <div className="space-y-2"><Label>{t('account.organisation')}{' '}<span className="text-destructive">*</span></Label><Input aria-label={t('account.organisation')} value={resp.organisation} onChange={e => updateResp(resp.id, 'organisation', e.target.value)} /></div>
                            <div className="space-y-2"><Label>{t('account.location')}</Label><Input aria-label={t('account.location')} value={resp.location} onChange={e => updateResp(resp.id, 'location', e.target.value)} /></div>
                            <div className="space-y-2"><Label>{t('account.skills')}</Label><Input aria-label={t('account.skills')} placeholder={t('account.addSkillsCommaSeparated')} value={resp.skills} onChange={e => updateResp(resp.id, 'skills', e.target.value)} /></div>
                            <div className="space-y-2"><Label>{t('account.startDate')}{' '}<span className="text-destructive">*</span></Label><Input aria-label={t('account.startDate')} type="month" value={resp.start} onChange={e => updateResp(resp.id, 'start', e.target.value)} /></div>
                            <div className="space-y-2"><Label>{t('account.endDate')}</Label><Input aria-label={t('account.endDate')} type="month" value={resp.end} onChange={e => updateResp(resp.id, 'end', e.target.value)} /></div>
                            <div className="space-y-2 sm:col-span-2">
                              <Label>{t('account.description2')}</Label>
                              <Textarea aria-label={t('account.description2')} rows={3} placeholder={t('account.outlineTheSpecificDutiesAndInitiatives')} value={resp.description} onChange={e => updateResp(resp.id, 'description', e.target.value)} />
                              <Button variant="outline" size="sm" className="mt-2 text-primary" disabled={aiDescBusy === `resp-${resp.id}`} onClick={() => generateDescription(`resp-${resp.id}`, 'position of responsibility entry', `${resp.position || ''} at ${resp.organisation || ''}${resp.skills ? `, skills: ${resp.skills}` : ''}`, (text) => updateResp(resp.id, 'description', text))}>
                                <Sparkles className="w-4 h-4 mr-2" /> {aiDescBusy === `resp-${resp.id}` ? 'Generating...' : t('account.generateWithAi')}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {responsibilities.length === 0 && <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">{t('account.noResponsibilitiesAdded')}</p>}
                    </div>
                  </div>

                  {/* Certificates */}
                  <div>
                    <div className="flex items-center justify-between mb-4 border-b border-border pb-2">
                      <h3 className="font-semibold text-lg flex items-center gap-2"><FileBadge2 className="w-4 h-4 text-primary" aria-hidden />{' '}{t('account.certificates')}</h3>
                      <Button variant="outline" size="sm" onClick={addCert}><Plus className="w-4 h-4 mr-2" />{' '}{t('account.addCertificate')}</Button>
                    </div>
                    <div className="space-y-4">
                      {certificates.map(cert => (
                        <div key={cert.id} className="p-4 border border-border/70 rounded-2xl bg-card relative group">
                          <Button aria-label={t('account.removeCertificate')} variant="ghost" size="icon" onClick={() => rmCert(cert.id)} className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2"><Label>{t('account.certificateName')}{' '}<span className="text-destructive">*</span></Label><Input aria-label={t('account.certificateName')} value={cert.title} onChange={e => updateCert(cert.id, 'title', e.target.value)} /></div>
                            <div className="space-y-2"><Label>{t('account.issuingOrganisation')}{' '}<span className="text-destructive">*</span></Label><Input aria-label={t('account.issuingOrganisation')} value={cert.organisation} onChange={e => updateCert(cert.id, 'organisation', e.target.value)} /></div>
                            <div className="space-y-2"><Label>{t('account.issueDate')}{' '}<span className="text-destructive">*</span></Label><Input aria-label={t('account.issueDate')} type="month" value={cert.issued} onChange={e => updateCert(cert.id, 'issued', e.target.value)} /></div>
                            <div className="space-y-2"><Label>{t('account.expirationDate')}</Label><Input aria-label={t('account.expirationDate')} type="month" value={cert.expiry} onChange={e => updateCert(cert.id, 'expiry', e.target.value)} /></div>
                            <div className="space-y-2 sm:col-span-2"><Label>{t('account.linkThisCertificate')}</Label><Input aria-label={t('account.linkThisCertificate')} placeholder="https://..." value={cert.link} onChange={e => updateCert(cert.id, 'link', e.target.value)} /></div>
                            <div className="space-y-2 sm:col-span-2"><Label>{t('account.skills')}</Label><Input aria-label={t('account.skills')} placeholder={t('account.addSkillsCommaSeparated')} value={cert.skills} onChange={e => updateCert(cert.id, 'skills', e.target.value)} /></div>
                            <div className="space-y-2 sm:col-span-2">
                              <Label>{t('account.description2')}</Label>
                              <Textarea aria-label={t('account.description2')} rows={3} placeholder={t('account.provideDetailsAboutTheCertificate')} value={cert.description} onChange={e => updateCert(cert.id, 'description', e.target.value)} />
                              <Button variant="outline" size="sm" className="mt-2 text-primary" disabled={aiDescBusy === `cert-${cert.id}`} onClick={() => generateDescription(`cert-${cert.id}`, 'certificate entry', `${cert.title || ''} issued by ${cert.organisation || ''}${cert.skills ? `, skills: ${cert.skills}` : ''}`, (text) => updateCert(cert.id, 'description', text))}>
                                <Sparkles className="w-4 h-4 mr-2" /> {aiDescBusy === `cert-${cert.id}` ? 'Generating...' : t('account.generateWithAi')}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {certificates.length === 0 && <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">{t('account.noCertificatesAdded')}</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 8: Personal Details */}
            {step === 8 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
                  <UserCircle className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold text-foreground">{t('account.personalDetails')}</h2>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('account.pronouns')}</Label>
                    <div className="flex gap-3 mt-1">
                      {['He/Him/his', 'She/Her', 'Them/They'].map(pronoun => (
                        <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }} aria-pressed={personalDetails.pronouns === pronoun} 
                          key={pronoun}
                          onClick={() => setPersonalDetails({...personalDetails, pronouns: pronoun})}
                          className={`px-4 py-2 border rounded-full text-sm cursor-pointer transition-colors ${personalDetails.pronouns === pronoun ? 'border-primary bg-primary/10 text-primary' : 'border-border border-dashed hover:bg-muted'}`}
                        >
                          {pronoun}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2 mt-4">
                    <Label>{t('account.dob')}</Label>
                    <div className="relative">
                      <Input type="date" value={personalDetails.dob} onChange={e => setPersonalDetails({...personalDetails, dob: e.target.value})} className="pl-3 w-full" />
                    </div>
                  </div>

                  <div className="space-y-2 mt-4 p-4 border border-border rounded-xl bg-muted/20">
                    <Label>{t('account.currentAddress')}</Label>
                    <Input aria-label={t('account.currentAddress')} placeholder={t('account.selectLocation')} value={personalDetails.currentAddress} onChange={e => setPersonalDetails({...personalDetails, currentAddress: e.target.value})} />
                  </div>

                  <div className="space-y-2 mt-4 p-4 border border-border rounded-xl bg-muted/20">
                    <div className="flex justify-between items-center mb-2">
                       <Label>{t('account.permanentAddress')}</Label>
                       <label className="flex items-center gap-2 text-xs cursor-pointer">
                         <input 
                           type="checkbox" 
                           className="rounded border-border accent-primary" 
                           checked={personalDetails.sameAsCurrent}
                           onChange={e => {
                             const checked = e.target.checked
                             setPersonalDetails({
                               ...personalDetails, 
                               sameAsCurrent: checked,
                               permanentAddress: checked ? personalDetails.currentAddress : personalDetails.permanentAddress
                             })
                           }} 
                         />{t('account.copyCurrentAddress')}</label>
                    </div>
                    <Input 
                      placeholder={t('account.selectLocation')} 
                      value={personalDetails.permanentAddress} 
                      disabled={personalDetails.sameAsCurrent}
                      onChange={e => setPersonalDetails({...personalDetails, permanentAddress: e.target.value})} 
                    />
                  </div>

                  <div className="space-y-2 mt-4">
                    <Label>{t('account.hobbies')}</Label>
                    <Textarea aria-label={t('account.hobbies')} placeholder={t('account.listYourHobbies')} value={personalDetails.hobbies} onChange={e => setPersonalDetails({...personalDetails, hobbies: e.target.value})} rows={3} />
                  </div>
                </div>
              </div>
            )}

            {/* Step 9: Links */}
            {step === 9 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
                  <LinkIcon className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold text-foreground">{t('account.socialLinks')}</h2>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label>LinkedIn URL</Label>
                    <Input aria-label="LinkedIn URL" placeholder="https://linkedin.com/in/username" value={links.linkedin} onChange={e => setLinks({...links, linkedin: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>GitHub URL</Label>
                    <Input aria-label="GitHub URL" placeholder="https://github.com/username" value={links.github} onChange={e => setLinks({...links, github: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('account.personalPortfolio')}</Label>
                    <Input aria-label={t('account.personalPortfolio')} placeholder="https://yourwebsite.com" value={links.portfolio} onChange={e => setLinks({...links, portfolio: e.target.value})} />
                  </div>
                </div>
                
                <div className="p-4 bg-primary/5 border border-primary/15 rounded-2xl mt-8 flex items-start gap-4">
                  <Award className="w-8 h-8 text-primary shrink-0 mt-1" />
                  <div>
                    <h4 className="text-base font-semibold text-foreground">{t('account.readyToBuildYourResume')}</h4>
                    <p className="text-sm text-muted-foreground">{t('account.onceYouSaveYourProfileOpen248')}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {showTips && (() => {
        const STEP_TIPS: Record<number, { title: string; icon: string; tips: { heading: string; body: string }[] }> = {
          1: {
            title: t('account.basicDetailsTips'),
            icon: '👤',
            tips: [
              { heading: t('account.useYourRealName'), body: t('account.employersVerifyThisDuringBackgroundChecke9b') },
              { heading: t('account.profilePhotoMatters'), body: t('account.aProfessionalHeadshotIncreasesProfileViec33') },
              { heading: t('account.careerGoal'), body: t('account.selectingMultipleGoalsLetsOurAi15d') },
              { heading: t('account.currentLocation'), body: t('account.useTheGpsButtonToAutofab') },
              { heading: t('account.keepDetailsAccurate'), body: t('account.employersAndMentorsTrustCompleteTruthful52a') },
            ],
          },
          2: {
            title: t('account.resumeTips'),
            icon: '📄',
            tips: [
              { heading: t('account.useACleanFormat'), body: t('account.atsSystemsPreferSingleColumnResumese11') },
              { heading: t('account.keepItUnder2Pages'), body: t('account.recruitersSpend7SecondsPerResume854') },
              { heading: t('account.useActionVerbs'), body: t('account.startBulletPointsWithVerbsLikead5') },
              { heading: t('account.quantifyResults'), body: t('account.replaceVagueStatementsWithNumbersImprove7f9') },
            ],
          },
          3: {
            title: t('account.aboutBioTips'),
            icon: '✨',
            tips: [
              { heading: t('account.startWithYourValue'), body: t('account.openWithWhatYouBringTo88a') },
              { heading: t('account.keepItConcise'), body: t('account.n35SentencesIsIdealRecruiters9fa') },
              { heading: t('account.mentionYourPassions'), body: t('account.authenticEnthusiasmIsMemorableMentionWhac9c') },
              { heading: t('account.useAi'), body: t('account.clickGenerateWithAiToGet7ad') },
            ],
          },
          4: {
            title: t('account.skillsTips'),
            icon: '🛠️',
            tips: [
              { heading: t('account.matchJobDescriptions'), body: t('account.mirrorSkillsFromJobPostingsYoua4b') },
              { heading: t('account.includeSoftSkills'), body: t('account.leadershipCommunicationAndProblemSolving694') },
              { heading: t('account.orderByRelevance'), body: t('account.putYourStrongestMostRelevantSkills8ef') },
            ],
          },
          5: {
            title: t('account.educationTips'),
            icon: '🎓',
            tips: [
              { heading: t('account.includeAllDegrees'), body: t('account.addYourHighestQualificationFirstInclude145') },
              { heading: t('account.highlightRelevantCourses'), body: t('account.mentionCourseworkRelevantToYourTarget56e') },
              { heading: t('account.gpaMattersForFreshers'), body: t('account.ifYouAreARecentGraduatee9e') },
            ],
          },
          6: {
            title: t('account.workExperienceTips'),
            icon: '💼',
            tips: [
              { heading: t('account.quantifyAchievements'), body: t('account.useNumbersWhereverPossibleManagedAd97') },
              { heading: t('account.listInReverseOrder'), body: t('account.mostRecentExperienceShouldAppearFirst') },
              { heading: t('account.mentionTechnologiesUsed'), body: t('account.listTheTechStackYouWorkeda05') },
              { heading: t('account.gapsAreOk'), body: t('account.ifYouHaveGapsBrieflyAddresscef') },
            ],
          },
          7: {
            title: t('account.accomplishmentsTips'),
            icon: '🏆',
            tips: [
              { heading: t('account.projectsSpeakLouder'), body: t('account.evenPersonalProjectsDemonstrateInitiativf8e') },
              { heading: t('account.certificationsAddCredibility'), body: t('account.includeTheIssuerNameAndDateb5e') },
              { heading: t('account.useAiForDescriptions'), body: t('account.clickGenerateWithAiToDrafte69') },
              { heading: t('account.linkEverything'), body: t('account.urlsToLiveProjectsCertificatesOr15e') },
            ],
          },
          8: {
            title: t('account.linksSocialTips'),
            icon: '🔗',
            tips: [
              { heading: t('account.linkedinIsEssential'), body: t('account.recruitersAlwaysCheckLinkedinMakeSured9f') },
              { heading: t('account.githubForDevelopers'), body: t('account.anActiveGithubProfileWithPublic6d3') },
              { heading: t('account.portfolioWebsite'), body: t('account.aPersonalPortfolioWebsiteDramaticallySetf31') },
            ],
          },
          9: {
            title: t('account.personalDetailsTips'),
            icon: '📋',
            tips: [
              { heading: t('account.dateOfBirth'), body: t('account.requiredForSomeOpportunitiesAndComplianc903') },
              { heading: t('account.address'), body: t('account.yourLocationHelpsMatchYouTo527') },
              { heading: t('account.hobbiesInterests'), body: t('account.relatableHobbiesCreateTalkingPointsIn81d') },
            ],
          },
        }
        const tipData = STEP_TIPS[step] || STEP_TIPS[1]
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={() => setShowTips(false)}>
            <div ref={tipsRef} role="dialog" aria-modal="true" aria-labelledby="profile-tips-title" className="bg-card w-full max-w-md max-h-[90vh] overflow-y-auto p-6 rounded-2xl shadow-2xl border border-border animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-5">
                <div className="flex items-center gap-3">
                  <span className="text-2xl" aria-hidden>{tipData.icon}</span>
                  <h3 id="profile-tips-title" className="text-lg font-semibold">{tipData.title}</h3>
                </div>
                <Button aria-label={t('account.closeTips')} variant="ghost" size="icon" onClick={() => setShowTips(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="space-y-3">
                {tipData.tips.map((tip, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-muted/40 rounded-lg border border-border/50">
                    <div className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{i + 1}</div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{tip.heading}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{tip.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={() => setShowTips(false)}>{t('account.gotIt')}</Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Email update + verify */}
      {showEmailUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !emailBusy && setShowEmailUpdate(false)}>
          <div ref={emailRef} role="dialog" aria-modal="true" aria-labelledby="profile-email-title" className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 id="profile-email-title" className="text-base font-semibold">{t('account.updateEmail')}</h3>
              <button aria-label={t('common.close')} type="button" onClick={() => setShowEmailUpdate(false)}><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground">{t('account.weWillSendAVerificationCodefac')}</p>
            <div className="space-y-2">
              <Label>{t('account.newEmail')}</Label>
              <Input aria-label={t('account.newEmail')} type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="you@example.com" disabled={emailOtpSent} />
            </div>
            {!emailOtpSent && (
              <div className="space-y-2">
                <Label>{t('account.currentPasswordOrAuthenticatorCode')}</Label>
                <Input aria-label={t('account.currentPasswordOrAuthenticatorCode')} type="password" autoComplete="current-password" value={emailReauth} onChange={e => setEmailReauth(e.target.value)} placeholder={t('account.confirmItsYou')} />
                <p className="text-xs text-muted-foreground">{t('account.signedInWithGoogleOrGithub30d')}</p>
              </div>
            )}
            {emailOtpSent && (
              <div className="space-y-2">
                <Label>{t('account.verificationCode')}</Label>
                <Input aria-label={t('account.verificationCode')} value={emailOtp} onChange={e => setEmailOtp(e.target.value)} placeholder={t('account.n6DigitCode')} />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowEmailUpdate(false)} disabled={emailBusy}>{t('common.cancel')}</Button>
              {!emailOtpSent ? (
                <Button type="button" disabled={emailBusy || !newEmail.includes('@')} onClick={async () => {
                  setEmailBusy(true)
                  try {
                    const res = await csrfFetch('/api/user/email-change/request', { method: 'POST', body: JSON.stringify({ email: newEmail.trim(), password: emailReauth, code: emailReauth }) })
                    const json = await res.json()
                    if (!res.ok) throw new Error(apiError(json, t('account.failed')))
                    setEmailOtpSent(true)
                    setEmailReauth('')
                    addToast({ type: 'success', title: t('account.codeSentToNewEmail') })
                  } catch (e: any) {
                    addToast({ type: 'error', title: e?.message || t('account.couldNotSendCode') })
                  } finally { setEmailBusy(false) }
                }}>{t('account.sendCode')}</Button>
              ) : (
                <Button type="button" disabled={emailBusy || emailOtp.length < 4} onClick={async () => {
                  setEmailBusy(true)
                  try {
                    const res = await csrfFetch('/api/user/email-change/confirm', { method: 'POST', body: JSON.stringify({ email: newEmail.trim(), code: emailOtp.trim() }) })
                    const json = await res.json()
                    if (!res.ok) throw new Error(apiError(json, t('account.invalidCode')))
                    setBasic(prev => ({ ...prev, email: newEmail.trim() }))
                    setShowEmailUpdate(false)
                    addToast({ type: 'success', title: t('account.emailUpdated') })
                  } catch (e: any) {
                    addToast({ type: 'error', title: e?.message || t('account.verificationFailed') })
                  } finally { setEmailBusy(false) }
                }}>{t('account.verifyUpdate')}</Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Phone OTP (emailed — free; SMS provider later) */}
      {phoneOtpSent && !isPhoneVerified && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !phoneVerifyBusy && setPhoneOtpSent(false)}>
          <div ref={phoneRef} role="dialog" aria-modal="true" aria-labelledby="profile-phone-title" className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 id="profile-phone-title" className="text-base font-semibold">{t('account.saveMobileNumber')}</h3>
              <button aria-label={t('common.close')} type="button" onClick={() => setPhoneOtpSent(false)}><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground">{t('account.weEmailedACodeToYour5fd')}</p>
            <div className="space-y-2">
              <Label>{t('account.codeFromEmail')}</Label>
              <Input aria-label={t('account.codeFromEmail')} value={phoneOtp} onChange={e => setPhoneOtp(e.target.value)} placeholder={t('account.n6DigitCode')} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setPhoneOtpSent(false)}>{t('common.cancel')}</Button>
              <Button type="button" disabled={phoneVerifyBusy || phoneOtp.length < 4} onClick={async () => {
                setPhoneVerifyBusy(true)
                try {
                  const res = await csrfFetch('/api/user/phone-verify/confirm', {
                    method: 'POST',
                    body: JSON.stringify({ phone: basic.phone, countryCode: basic.countryCode || '+91', code: phoneOtp.trim() }),
                  })
                  const json = await res.json()
                  if (!res.ok) throw new Error(apiError(json, t('account.invalidCode')))
                  setIsPhoneVerified(true)
                  setPhoneOtpSent(false)
                  addToast({ type: 'success', title: t('account.mobileNumberSaved') })
                } catch (e: any) {
                  addToast({ type: 'error', title: e?.message || t('account.verificationFailed') })
                } finally { setPhoneVerifyBusy(false) }
              }}>{t('common.confirm')}</Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
