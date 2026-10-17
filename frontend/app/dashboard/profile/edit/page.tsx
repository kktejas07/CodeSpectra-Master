'use client'

import { useState, useMemo, useEffect } from 'react'
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
import { AnonAadhaarProfileCard } from '@/components/kyc/AnonAadhaarProfileCard'
import { usePageGuard } from '@/lib/use-page-guard'
import { PageHeader } from '@/components/app/page-kit'

// Wizard Steps Configuration
const STEPS = [
  { id: 1, title: 'Basic Details', icon: User, required: true },
  { id: 2, title: 'Resume', icon: FileText, required: false },
  { id: 3, title: 'About', icon: Sparkles, required: true },
  { id: 4, title: 'Skills', icon: Code2, required: true },
  { id: 5, title: 'Education', icon: GraduationCap, required: false },
  { id: 6, title: 'Work Experience', icon: Briefcase, required: true },
  { id: 7, title: 'Accomplishments & Initiatives', icon: Trophy, required: false },
  { id: 8, title: 'Personal Details', icon: UserCircle, required: false },
  { id: 9, title: 'Social Links', icon: LinkIcon, required: false },
]

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
  const [emailBusy, setEmailBusy] = useState(false)
  const [careerSearch, setCareerSearch] = useState('')
  const [aadhaarDeferredNote, setAadhaarDeferredNote] = useState(true)

  // Hydrate from Mongo (fallback: localStorage) so refresh shows real data.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/user/extended-profile', { credentials: 'include' })
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
      } catch { /* fall through */ }
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
          addToast({ type: 'success', title: 'Location captured successfully!' });
        } catch (e) {
          addToast({ type: 'error', title: 'Failed to reverse geocode location.' });
        }
      }, () => {
        addToast({ type: 'error', title: 'Location access denied or blocked by browser policy. You can type your city manually.' });
      });
    } else {
      addToast({ type: 'error', title: 'Geolocation not supported by your browser.' });
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

  const nextStep = () => setStep(s => Math.min(s + 1, STEPS.length))
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
      addToast({ type: 'success', title: 'AI Summary Generated!' })
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
          message: `Write a concise professional resume description (2-3 sentences, plain text only, no preamble or quotes) for this ${label}: ${(((context || '').trim() || 'general professional background')).slice(0, 500)}`,
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
      if (!text) throw new Error('AI returned an empty response')
      apply(text)
      addToast({ type: 'success', title: 'AI description generated!' })
    } catch (e) {
      addToast({ type: 'error', title: 'AI generation failed', message: e instanceof Error ? e.message : 'Failed to generate' })
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
      if (!res.ok) throw new Error(json.error || 'Save failed')
      // Also update display name when possible
      if (basic.firstName || basic.lastName) {
        const name = `${basic.firstName} ${basic.lastName}`.trim()
        await csrfFetch('/api/user/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        }).catch(() => null)
      }
      addToast({ type: 'success', title: 'Profile saved' })
      router.push('/dashboard/profile')
    } catch (err: any) {
      addToast({ type: 'error', title: err?.message || 'Failed to save profile' })
    } finally {
      setLoading(false)
    }
  }

  if (!gate.ready) return null

  return (
    <div className="w-full py-8 px-4">
      {/* Header */}
      <Link href="/dashboard/profile" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to profile
      </Link>
      <PageHeader
        className="mb-8 border-b border-border pb-5"
        icon={<UserCircle aria-hidden />}
        title="Edit profile"
        description="Keep your details up to date — they power your public profile and fill in your resumes."
        actions={
          <>
            <Button variant="outline" onClick={prevStep} disabled={step === 1}>Back</Button>
            <Button onClick={handleSave} disabled={loading}>
               {loading ? <Sparkles className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
               Save
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-8">
        
        {/* Sidebar Steps */}
        <div className="space-y-4 hidden md:block">
          
          {/* Create Resume Promo */}
          <Link
            href="/dashboard/resumes/builder"
            className="group relative block overflow-hidden rounded-3xl border border-primary/30 bg-linear-to-br from-primary via-primary to-indigo-700 p-4 text-white shadow-[0_18px_40px_-20px_rgba(47,91,231,0.55)] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 dark:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl transition group-hover:bg-white/20" />
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
                  <FileText className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold leading-tight">Create your resume</p>
                  <p className="text-xs text-white/80">Build a portfolio-ready CV in minutes</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 opacity-80 transition group-hover:translate-x-0.5" />
            </div>
          </Link>

           {/* Profile Completion Box */}
           <Card className="rounded-3xl p-5 border-border/70">
              <h3 className="font-semibold text-foreground">Complete your profile</h3>
              <p className="text-xs text-muted-foreground mt-1 mb-3">Stay ahead of the competition by regularly updating your profile.</p>
              <div className="w-full bg-muted rounded-full h-1.5 mb-1">
                <div className="bg-primary h-1.5 rounded-full transition-all duration-500 motion-reduce:transition-none" style={{ width: `${completionPercentage}%` }}></div>
              </div>
              <div className="text-right text-xs font-medium tabular-nums text-primary">{completionPercentage}%</div>
           </Card>

          {/* Steps List */}
          <div className="space-y-1 mt-4">
            {STEPS.map((s, idx) => {
              const isActive = step === s.id
              const isCompleted = step > s.id
              return (
                <div 
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
                    <span className="text-[10px] font-medium bg-red-500/10 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded">Required</span>
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
                    <h2 className="text-xl font-bold text-foreground">Basic details</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setShowTips(true)}>
                      <Lightbulb className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-6 mb-8 bg-muted/30 p-4 rounded-xl border border-border">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-border bg-muted flex items-center justify-center">
                      {basic.avatar ? (
                        <img src={basic.avatar} alt="Profile" className="w-full h-full object-cover" />
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
                    <h3 className="font-semibold text-lg">Profile Photo</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">Upload a professional photo. We recommend a square image at least 256x256px.</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>First Name <span className="text-destructive">*</span></Label>
                    <Input placeholder="Enter First Name" value={basic.firstName} onChange={e => setBasic({...basic, firstName: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name <span className="text-destructive">*</span></Label>
                    <Input placeholder="Enter Last Name" value={basic.lastName} onChange={e => setBasic({...basic, lastName: e.target.value})} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Username <span className="text-destructive">*</span></Label>
                    <Input placeholder="username" value={basic.username} readOnly className="bg-muted text-muted-foreground cursor-not-allowed" title="Username is auto-generated" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Email <span className="text-destructive">*</span></Label>
                    <div className="flex gap-2 relative">
                      <div className="relative flex-1">
                        <Input type="email" value={basic.email || user?.email || ''} readOnly className="bg-muted text-muted-foreground pr-8 w-full cursor-not-allowed" />
                        {(basic.email || user?.email) && <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 absolute right-3 top-1/2 -translate-y-1/2" aria-label="Verified" />}
                      </div>
                      <Button type="button" variant="outline" className="shrink-0 text-xs text-primary" onClick={() => { setShowEmailUpdate(true); setEmailOtpSent(false); setEmailOtp(''); setNewEmail('') }}>Update</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Mobile <span className="text-destructive">*</span></Label>
                    <div className="flex gap-2">
                      <select className="min-w-25 w-25 bg-background border border-input rounded-md text-sm p-1" value={basic.countryCode || '+91'} onChange={e => setBasic({...basic, countryCode: e.target.value})}>
                        <option value="+93">+93 (AF)</option>
                        <option value="+355">+355 (AL)</option>
                        <option value="+213">+213 (DZ)</option>
                        <option value="+54">+54 (AR)</option>
                        <option value="+61">+61 (AU)</option>
                        <option value="+43">+43 (AT)</option>
                        <option value="+880">+880 (BD)</option>
                        <option value="+32">+32 (BE)</option>
                        <option value="+55">+55 (BR)</option>
                        <option value="+1">+1 (CA/US)</option>
                        <option value="+56">+56 (CL)</option>
                        <option value="+86">+86 (CN)</option>
                        <option value="+57">+57 (CO)</option>
                        <option value="+20">+20 (EG)</option>
                        <option value="+33">+33 (FR)</option>
                        <option value="+49">+49 (DE)</option>
                        <option value="+30">+30 (GR)</option>
                        <option value="+91">+91 (IN)</option>
                        <option value="+62">+62 (ID)</option>
                        <option value="+98">+98 (IR)</option>
                        <option value="+964">+964 (IQ)</option>
                        <option value="+353">+353 (IE)</option>
                        <option value="+972">+972 (IL)</option>
                        <option value="+39">+39 (IT)</option>
                        <option value="+81">+81 (JP)</option>
                        <option value="+254">+254 (KE)</option>
                        <option value="+60">+60 (MY)</option>
                        <option value="+52">+52 (MX)</option>
                        <option value="+212">+212 (MA)</option>
                        <option value="+95">+95 (MM)</option>
                        <option value="+977">+977 (NP)</option>
                        <option value="+31">+31 (NL)</option>
                        <option value="+64">+64 (NZ)</option>
                        <option value="+234">+234 (NG)</option>
                        <option value="+92">+92 (PK)</option>
                        <option value="+63">+63 (PH)</option>
                        <option value="+48">+48 (PL)</option>
                        <option value="+351">+351 (PT)</option>
                        <option value="+7">+7 (RU)</option>
                        <option value="+966">+966 (SA)</option>
                        <option value="+65">+65 (SG)</option>
                        <option value="+27">+27 (ZA)</option>
                        <option value="+82">+82 (KR)</option>
                        <option value="+34">+34 (ES)</option>
                        <option value="+94">+94 (LK)</option>
                        <option value="+46">+46 (SE)</option>
                        <option value="+41">+41 (CH)</option>
                        <option value="+886">+886 (TW)</option>
                        <option value="+66">+66 (TH)</option>
                        <option value="+90">+90 (TR)</option>
                        <option value="+380">+380 (UA)</option>
                        <option value="+971">+971 (AE)</option>
                        <option value="+44">+44 (UK)</option>
                        <option value="+58">+58 (VE)</option>
                        <option value="+84">+84 (VN)</option>
                      </select>
                      <div className="flex flex-1 gap-2">
                        <div className="relative flex-1">
                          <Input placeholder="Enter mobile number" value={basic.phone} onChange={e => setBasic({...basic, phone: e.target.value})} className={isPhoneVerified ? "bg-muted text-muted-foreground pr-8 cursor-not-allowed" : "pr-8"} readOnly={isPhoneVerified} />
                          {isPhoneVerified && <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 absolute right-3 top-1/2 -translate-y-1/2" aria-label="Verified" />}
                        </div>
                        {!isPhoneVerified && basic.phone.length > 5 && (
                          <Button variant="outline" className="shrink-0 text-xs text-primary" onClick={async () => {
                            if (!basic.phone || basic.phone.length < 6) {
                              addToast({ type: 'error', title: 'Enter a valid mobile number first' })
                              return
                            }
                            setPhoneVerifyBusy(true)
                            try {
                              const res = await csrfFetch('/api/user/phone-verify/request', {
                                method: 'POST',
                                body: JSON.stringify({ phone: basic.phone, countryCode: basic.countryCode || '+91' }),
                              })
                              const json = await res.json()
                              if (!res.ok) throw new Error(json.error || 'Failed to send code')
                              setPhoneOtpSent(true)
                              addToast({ type: 'success', title: json.message || 'Verification code sent to your email' })
                            } catch (e: any) {
                              addToast({ type: 'error', title: e?.message || 'Could not start phone verification' })
                            } finally {
                              setPhoneVerifyBusy(false)
                            }
                          }}>Verify</Button>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2 sm:col-span-2 mt-2">
                    <AnonAadhaarProfileCard />
                  </div>

                  <div className="space-y-2 sm:col-span-2 mt-4">
                    <Label>Gender <span className="text-destructive">*</span></Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {['Male', 'Female', 'Other'].map((g) => (
                        <div 
                          key={g}
                          onClick={() => setBasic({...basic, gender: g})}
                          className={`px-5 py-2 rounded-full border text-sm cursor-pointer transition-colors ${basic.gender === g ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border hover:bg-muted text-muted-foreground'}`}
                        >
                          {g}
                        </div>
                      ))}
                    </div>
                    {basic.gender === 'Other' && (
                      <Input placeholder="*Please specify the gender" className="mt-3 text-sm h-10" />
                    )}
                  </div>

                  <div className="space-y-3 sm:col-span-2 mt-4">
                    <Label>User Type <span className="text-destructive">*</span></Label>
                    <div className="flex flex-wrap gap-3 mt-1">
                      {['College Students', 'Professional', 'School Student', 'Fresher'].map((type) => (
                        <div 
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
                    <Label>Purpose <span className="text-destructive">*</span></Label>
                    <div className="flex flex-wrap gap-3 mt-1">
                      {['To find a Job', 'Compete & Upskill', 'To Host an Event', 'To be a Mentor'].map((p) => (
                        <div 
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
                    <Label>Designation <span className="text-destructive">*</span></Label>
                    <select 
                      value={basic.designation} 
                      onChange={e => setBasic({...basic, designation: e.target.value})}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="" disabled>Select Designation</option>
                      <optgroup label="Engineering">
                        <option value="Software Engineer">Software Engineer</option>
                        <option value="Frontend Developer">Frontend Developer</option>
                        <option value="Backend Developer">Backend Developer</option>
                        <option value="Full Stack Developer">Full Stack Developer</option>
                        <option value="Mobile App Developer">Mobile App Developer</option>
                        <option value="DevOps Engineer">DevOps Engineer</option>
                        <option value="Cloud Architect">Cloud Architect</option>
                        <option value="Security Engineer">Security Engineer</option>
                        <option value="QA Engineer">QA Engineer</option>
                        <option value="Engineering Manager">Engineering Manager</option>
                      </optgroup>
                      <optgroup label="Data & AI">
                        <option value="Data Scientist">Data Scientist</option>
                        <option value="Data Analyst">Data Analyst</option>
                        <option value="Data Engineer">Data Engineer</option>
                        <option value="Machine Learning Engineer">Machine Learning Engineer</option>
                        <option value="AI Researcher">AI Researcher</option>
                        <option value="Business Analyst">Business Analyst</option>
                      </optgroup>
                      <optgroup label="Product & Design">
                        <option value="Product Manager">Product Manager</option>
                        <option value="UI/UX Designer">UI/UX Designer</option>
                        <option value="Product Designer">Product Designer</option>
                        <option value="Graphic Designer">Graphic Designer</option>
                        <option value="Scrum Master">Scrum Master</option>
                        <option value="Technical Writer">Technical Writer</option>
                      </optgroup>
                      <optgroup label="Marketing & Sales">
                        <option value="Marketing Manager">Marketing Manager</option>
                        <option value="Digital Marketer">Digital Marketer</option>
                        <option value="Content Creator">Content Creator</option>
                        <option value="Sales Executive">Sales Executive</option>
                        <option value="Growth Hacker">Growth Hacker</option>
                      </optgroup>
                      <optgroup label="Academic & Other">
                        <option value="Student">Student</option>
                        <option value="Researcher">Researcher</option>
                        <option value="Educator / Teacher">Educator / Teacher</option>
                        <option value="Freelancer">Freelancer</option>
                        <option value="Consultant">Consultant</option>
                        <option value="Founder / Entrepreneur">Founder / Entrepreneur</option>
                        <option value="Other">Other</option>
                      </optgroup>
                    </select>
                    {!basic.designation && <p className="text-[11px] text-destructive text-right mt-1 font-medium">Please consider filling designation</p>}
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label>Work Experience <span className="text-destructive">*</span></Label>
                    <select 
                      value={basic.workExperience} 
                      onChange={e => setBasic({...basic, workExperience: e.target.value})}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="" disabled>Select Years</option>
                      <option value="Fresher">Fresher</option>
                      <option value="1 year">1 year</option>
                      <option value="2 years">2 years</option>
                      <option value="3 years">3 years</option>
                      <option value="4 years">4 years</option>
                      <option value="5 years">5 years</option>
                      <option value="6 years">6 years</option>
                      <option value="7 years">7 years</option>
                      <option value="8 years">8 years</option>
                      <option value="9 years">9 years</option>
                      <option value="10 years">10 years</option>
                      <option value="11 years">11 years</option>
                      <option value="12 years">12 years</option>
                      <option value="13 years">13 years</option>
                      <option value="14 years">14 years</option>
                      <option value="15+ years">15+ years</option>
                    </select>
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label>Organisation/College <span className="text-destructive">*</span></Label>
                    <Input className="h-11" placeholder="Enter your current organisation or college" value={basic.organisation} onChange={e => setBasic({...basic, organisation: e.target.value})} />
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label>Career Goal(s)</Label>
                    <p className="text-xs text-muted-foreground">Pick one or more roles — search and tap to select.</p>
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
                        placeholder="Search roles (e.g. Frontend, Data Scientist)"
                        value={careerSearch}
                        onChange={e => setCareerSearch(e.target.value)}
                      />
                    </div>
                    <div className="rounded-lg border border-border bg-muted/20 p-3 max-h-56 overflow-y-auto">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Popular</p>
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
                      <p className="text-xs font-medium text-muted-foreground mb-2">All roles</p>
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
                    <Label>Current Location <span className="text-destructive">*</span></Label>
                    <div className="relative">
                      <Input className="h-11 pr-12" placeholder="Hyderabad, Telangana, India" value={basic.location} onChange={e => setBasic({...basic, location: e.target.value})} />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-accent rounded-md cursor-pointer transition-colors" title="Use Live Location" onClick={handleLiveLocation}>
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
                  <h2 className="text-xl font-bold text-foreground">Resume</h2>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                     <Label>Resume <span className="text-destructive">*</span></Label>
                     <span className="text-xs text-primary font-medium cursor-pointer hover:underline">Create</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Remember that one pager that highlights how amazing you are? Time to let employers notice your potential through it.</p>
                  
                  <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer mt-4">
                    <UploadCloud className="w-10 h-10 text-primary mb-3" />
                    <h3 className="font-medium text-primary">Update Resume</h3>
                    <p className="text-xs text-muted-foreground mt-1">Supported file formats DOC, DOCX, PDF. File size limit 10 MB.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: About You */}
            {step === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
                  <Sparkles className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-xl font-bold text-foreground">About you</h2>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label>Professional Summary</Label>
                    <Button variant="secondary" size="sm" onClick={handleGenerateAI} disabled={isGeneratingAI} className="bg-primary/10 text-primary hover:bg-primary/15">
                      <Sparkles className={`w-4 h-4 mr-2 ${isGeneratingAI ? 'animate-pulse' : ''}`} />
                      {isGeneratingAI ? 'Generating…' : 'Generate with AI'}
                    </Button>
                  </div>
                  <Textarea 
                    rows={6} 
                    placeholder="Write a brief summary of your professional background, goals, and what makes you unique..."
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
                  <h2 className="text-xl font-bold text-foreground">Skills</h2>
                </div>
                <div className="space-y-4">
                  <Label>Core Skills (Comma separated)</Label>
                  <Textarea 
                    rows={4} 
                    placeholder="e.g. JavaScript, React, Node.js, System Design, Agile Methodologies"
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
                    <h2 className="text-xl font-bold text-foreground">Education</h2>
                  </div>
                  <Button variant="outline" size="sm" onClick={addEdu}><Plus className="w-4 h-4 mr-2" /> Add</Button>
                </div>

                <div className="space-y-6">
                  {education.map((edu) => (
                    <div key={edu.id} className="p-4 border border-border/70 rounded-2xl bg-card relative group">
                      {education.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => rmEdu(edu.id)} className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Qualification <span className="text-destructive">*</span></Label>
                          <select className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            value={edu.qualification} onChange={e => updateEdu(edu.id, 'qualification', e.target.value)}>
                            <option value="">Select Qualification</option>
                            <option value="Degree">Degree</option>
                            <option value="Diploma">Diploma</option>
                            <option value="High School">High School</option>
                          </select>
                        </div>
                        <div className="space-y-2"><Label>Course <span className="text-destructive">*</span></Label><Input placeholder="e.g. B.Tech" value={edu.course} onChange={e => updateEdu(edu.id, 'course', e.target.value)} /></div>
                        <div className="space-y-2"><Label>Specialization <span className="text-destructive">*</span></Label><Input placeholder="e.g. Computer Science" value={edu.specialization} onChange={e => updateEdu(edu.id, 'specialization', e.target.value)} /></div>
                        <div className="space-y-2"><Label>College/University <span className="text-destructive">*</span></Label><Input placeholder="e.g. IIT" value={edu.college} onChange={e => updateEdu(edu.id, 'college', e.target.value)} /></div>
                        
                        <div className="space-y-2"><Label>Start Date</Label><Input type="month" value={edu.start} onChange={e => updateEdu(edu.id, 'start', e.target.value)} /></div>
                        <div className="space-y-2"><Label>End Date</Label><Input type="month" value={edu.end} onChange={e => updateEdu(edu.id, 'end', e.target.value)} /></div>
                        
                        <div className="space-y-2">
                          <Label>Course Type</Label>
                          <select className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            value={edu.courseType} onChange={e => updateEdu(edu.id, 'courseType', e.target.value)}>
                            <option value="">Select Type</option>
                            <option value="Full Time">Full Time</option>
                            <option value="Part Time">Part Time</option>
                            <option value="Distance">Distance</option>
                          </select>
                        </div>
                        <div className="space-y-2"><Label>Percentage/CGPA</Label><Input placeholder="e.g. 8.5 or 85%" value={edu.percentage} onChange={e => updateEdu(edu.id, 'percentage', e.target.value)} /></div>
                        <div className="space-y-2"><Label>Roll Number</Label><Input value={edu.rollNumber} onChange={e => updateEdu(edu.id, 'rollNumber', e.target.value)} /></div>
                        
                        <div className="space-y-2 sm:col-span-2 flex items-center gap-2 mt-4">
                          <input type="checkbox" id={`lateral-${edu.id}`} className="w-4 h-4 rounded border-border accent-primary" checked={edu.lateralEntry} onChange={e => updateEdu(edu.id, 'lateralEntry', e.target.checked)} />
                          <Label htmlFor={`lateral-${edu.id}`} className="cursor-pointer">Lateral Entry</Label>
                        </div>

                        <div className="space-y-2 sm:col-span-2"><Label>Skills</Label><Input placeholder="Add skills (comma separated)" value={edu.skills} onChange={e => updateEdu(edu.id, 'skills', e.target.value)} /></div>
                        
                        <div className="space-y-2 sm:col-span-2">
                          <Label>Description</Label>
                          <Textarea rows={3} placeholder="Describe your education..." value={edu.description} onChange={e => updateEdu(edu.id, 'description', e.target.value)} />
                          <Button variant="outline" size="sm" className="mt-2 text-primary" disabled={aiDescBusy === `edu-${edu.id}`} onClick={() => generateDescription(`edu-${edu.id}`, 'education entry', `${edu.course || ''} ${edu.specialization || ''} at ${edu.college || ''}${edu.skills ? `, skills: ${edu.skills}` : ''}`, (text) => updateEdu(edu.id, 'description', text))}>
                            <Sparkles className="w-4 h-4 mr-2" /> {aiDescBusy === `edu-${edu.id}` ? 'Generating...' : 'Generate with AI'}
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
                    <h2 className="text-xl font-bold text-foreground">Work experience</h2>
                  </div>
                  <Button variant="outline" size="sm" onClick={addExp}><Plus className="w-4 h-4 mr-2" /> Add</Button>
                </div>

                <div className="space-y-6">
                  {experience.map((exp, index) => (
                    <div key={exp.id} className="p-4 border border-border/70 rounded-2xl bg-card relative group">
                      {experience.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => rmExp(exp.id)} className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div className="space-y-2"><Label>Designation <span className="text-destructive">*</span></Label><Input placeholder="e.g. Software Engineer" value={exp.designation} onChange={e => updateExp(exp.id, 'designation', e.target.value)} /></div>
                        <div className="space-y-2"><Label>Organisation <span className="text-destructive">*</span></Label><Input placeholder="e.g. Google" value={exp.organisation} onChange={e => updateExp(exp.id, 'organisation', e.target.value)} /></div>
                        
                        <div className="space-y-2">
                          <Label>Employment Type <span className="text-destructive">*</span></Label>
                          <select className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            value={exp.employmentType} onChange={e => updateExp(exp.id, 'employmentType', e.target.value)}>
                            <option value="">Select Type</option>
                            <option value="Full Time">Full Time</option>
                            <option value="Part Time">Part Time</option>
                            <option value="Freelance">Freelance</option>
                            <option value="Internship">Internship</option>
                          </select>
                        </div>
                        
                        <div className="space-y-2"><Label>Location</Label><Input placeholder="e.g. Remote, India" value={exp.location} onChange={e => updateExp(exp.id, 'location', e.target.value)} /></div>
                        
                        <div className="space-y-2"><Label>Start Date <span className="text-destructive">*</span></Label><Input type="month" value={exp.start} onChange={e => updateExp(exp.id, 'start', e.target.value)} /></div>
                        <div className="space-y-2"><Label>End Date</Label><Input type="month" value={exp.end} onChange={e => updateExp(exp.id, 'end', e.target.value)} /></div>
                        
                        <div className="space-y-2 sm:col-span-2"><Label>Skills</Label><Input placeholder="Add skills (comma separated)" value={exp.skills} onChange={e => updateExp(exp.id, 'skills', e.target.value)} /></div>
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea rows={4} placeholder="Detail your responsibilities, the role you played, the skills you honed or acquired, and the key learnings or outcomes..." value={exp.description} onChange={e => updateExp(exp.id, 'description', e.target.value)} />
                        <Button variant="outline" size="sm" className="mt-2 text-primary" disabled={aiDescBusy === `exp-${exp.id}`} onClick={() => generateDescription(`exp-${exp.id}`, 'work experience entry', `${exp.designation || ''} at ${exp.organisation || ''}${exp.skills ? `, skills: ${exp.skills}` : ''}`, (text) => updateExp(exp.id, 'description', text))}>
                          <Sparkles className="w-4 h-4 mr-2" /> {aiDescBusy === `exp-${exp.id}` ? 'Generating...' : 'Generate with AI'}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {experience.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                      No experience added yet.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 7: Accomplishments & Initiatives */}
            {step === 7 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
                  <Trophy className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-xl font-bold text-foreground">Accomplishments and initiatives</h2>
                </div>
                
                <div className="space-y-8 mt-6">
                  {/* Projects */}
                  <div>
                    <div className="flex items-center justify-between mb-4 border-b border-border pb-2">
                      <h3 className="font-semibold text-lg flex items-center gap-2"><Code2 className="w-4 h-4 text-primary" aria-hidden /> Projects</h3>
                      <Button variant="outline" size="sm" onClick={addProj}><Plus className="w-4 h-4 mr-2" /> Add Project</Button>
                    </div>
                    <div className="space-y-4">
                      {projects.map(proj => (
                        <div key={proj.id} className="p-4 border border-border/70 rounded-2xl bg-card relative group">
                          <Button variant="ghost" size="icon" onClick={() => rmProj(proj.id)} className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2"><Label>Project Name <span className="text-destructive">*</span></Label><Input value={proj.name} onChange={e => updateProj(proj.id, 'name', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Project Type <span className="text-destructive">*</span></Label><Input value={proj.type} onChange={e => updateProj(proj.id, 'type', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Start Date</Label><Input type="month" value={proj.start} onChange={e => updateProj(proj.id, 'start', e.target.value)} /></div>
                            <div className="space-y-2"><Label>End Date</Label><Input type="month" value={proj.end} onChange={e => updateProj(proj.id, 'end', e.target.value)} /></div>
                            <div className="space-y-2 sm:col-span-2"><Label>Link this Project</Label><Input placeholder="https://..." value={proj.link} onChange={e => updateProj(proj.id, 'link', e.target.value)} /></div>
                            <div className="space-y-2 sm:col-span-2"><Label>Skills</Label><Input placeholder="Add skills (comma separated)" value={proj.skills} onChange={e => updateProj(proj.id, 'skills', e.target.value)} /></div>
                            <div className="space-y-2 sm:col-span-2">
                              <Label>Description</Label>
                              <Textarea rows={3} placeholder="Detail the project you worked on..." value={proj.description} onChange={e => updateProj(proj.id, 'description', e.target.value)} />
                              <Button variant="outline" size="sm" className="mt-2 text-primary" disabled={aiDescBusy === `proj-${proj.id}`} onClick={() => generateDescription(`proj-${proj.id}`, 'project entry', `${proj.name || ''} (${proj.type || 'project'})${proj.skills ? `, skills: ${proj.skills}` : ''}`, (text) => updateProj(proj.id, 'description', text))}>
                                <Sparkles className="w-4 h-4 mr-2" /> {aiDescBusy === `proj-${proj.id}` ? 'Generating...' : 'Generate with AI'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {projects.length === 0 && <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">No projects added.</p>}
                    </div>
                  </div>

                  {/* Achievements */}
                  <div>
                    <div className="flex items-center justify-between mb-4 border-b border-border pb-2">
                      <h3 className="font-semibold text-lg flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" /> Achievements</h3>
                      <Button variant="outline" size="sm" onClick={addAchieve}><Plus className="w-4 h-4 mr-2" /> Add Achievement</Button>
                    </div>
                    <div className="space-y-4">
                      {achievements.map(ach => (
                        <div key={ach.id} className="p-4 border border-border/70 rounded-2xl bg-card relative group">
                          <Button variant="ghost" size="icon" onClick={() => rmAchieve(ach.id)} className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2"><Label>Title <span className="text-destructive">*</span></Label><Input value={ach.title} onChange={e => updateAchieve(ach.id, 'title', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Link this Achievement</Label><Input placeholder="https://..." value={ach.link} onChange={e => updateAchieve(ach.id, 'link', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Skills</Label><Input placeholder="Add skills (comma separated)" value={ach.skills} onChange={e => updateAchieve(ach.id, 'skills', e.target.value)} /></div>
                            <div className="space-y-2">
                              <Label>Description</Label>
                              <Textarea rows={3} placeholder="Describe your achievement here..." value={ach.description} onChange={e => updateAchieve(ach.id, 'description', e.target.value)} />
                              <Button variant="outline" size="sm" className="mt-2 text-primary" disabled={aiDescBusy === `ach-${ach.id}`} onClick={() => generateDescription(`ach-${ach.id}`, 'achievement entry', `${ach.title || ''}${ach.skills ? `, skills: ${ach.skills}` : ''}`, (text) => updateAchieve(ach.id, 'description', text))}>
                                <Sparkles className="w-4 h-4 mr-2" /> {aiDescBusy === `ach-${ach.id}` ? 'Generating...' : 'Generate with AI'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {achievements.length === 0 && <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">No achievements added.</p>}
                    </div>
                  </div>

                  {/* Responsibilities */}
                  <div>
                    <div className="flex items-center justify-between mb-4 border-b border-border pb-2">
                      <h3 className="font-semibold text-lg flex items-center gap-2"><Briefcase className="w-4 h-4 text-primary" aria-hidden /> Responsibilities</h3>
                      <Button variant="outline" size="sm" onClick={addResp}><Plus className="w-4 h-4 mr-2" /> Add Responsibility</Button>
                    </div>
                    <div className="space-y-4">
                      {responsibilities.map(resp => (
                        <div key={resp.id} className="p-4 border border-border/70 rounded-2xl bg-card relative group">
                          <Button variant="ghost" size="icon" onClick={() => rmResp(resp.id)} className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2"><Label>Position of Responsibility <span className="text-destructive">*</span></Label><Input value={resp.position} onChange={e => updateResp(resp.id, 'position', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Organisation <span className="text-destructive">*</span></Label><Input value={resp.organisation} onChange={e => updateResp(resp.id, 'organisation', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Location</Label><Input value={resp.location} onChange={e => updateResp(resp.id, 'location', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Skills</Label><Input placeholder="Add skills (comma separated)" value={resp.skills} onChange={e => updateResp(resp.id, 'skills', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Start Date <span className="text-destructive">*</span></Label><Input type="month" value={resp.start} onChange={e => updateResp(resp.id, 'start', e.target.value)} /></div>
                            <div className="space-y-2"><Label>End Date</Label><Input type="month" value={resp.end} onChange={e => updateResp(resp.id, 'end', e.target.value)} /></div>
                            <div className="space-y-2 sm:col-span-2">
                              <Label>Description</Label>
                              <Textarea rows={3} placeholder="Outline the specific duties and initiatives..." value={resp.description} onChange={e => updateResp(resp.id, 'description', e.target.value)} />
                              <Button variant="outline" size="sm" className="mt-2 text-primary" disabled={aiDescBusy === `resp-${resp.id}`} onClick={() => generateDescription(`resp-${resp.id}`, 'position of responsibility entry', `${resp.position || ''} at ${resp.organisation || ''}${resp.skills ? `, skills: ${resp.skills}` : ''}`, (text) => updateResp(resp.id, 'description', text))}>
                                <Sparkles className="w-4 h-4 mr-2" /> {aiDescBusy === `resp-${resp.id}` ? 'Generating...' : 'Generate with AI'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {responsibilities.length === 0 && <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">No responsibilities added.</p>}
                    </div>
                  </div>

                  {/* Certificates */}
                  <div>
                    <div className="flex items-center justify-between mb-4 border-b border-border pb-2">
                      <h3 className="font-semibold text-lg flex items-center gap-2"><FileBadge2 className="w-4 h-4 text-primary" aria-hidden /> Certificates</h3>
                      <Button variant="outline" size="sm" onClick={addCert}><Plus className="w-4 h-4 mr-2" /> Add Certificate</Button>
                    </div>
                    <div className="space-y-4">
                      {certificates.map(cert => (
                        <div key={cert.id} className="p-4 border border-border/70 rounded-2xl bg-card relative group">
                          <Button variant="ghost" size="icon" onClick={() => rmCert(cert.id)} className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2"><Label>Certificate Name <span className="text-destructive">*</span></Label><Input value={cert.title} onChange={e => updateCert(cert.id, 'title', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Issuing Organisation <span className="text-destructive">*</span></Label><Input value={cert.organisation} onChange={e => updateCert(cert.id, 'organisation', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Issue Date <span className="text-destructive">*</span></Label><Input type="month" value={cert.issued} onChange={e => updateCert(cert.id, 'issued', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Expiration Date</Label><Input type="month" value={cert.expiry} onChange={e => updateCert(cert.id, 'expiry', e.target.value)} /></div>
                            <div className="space-y-2 sm:col-span-2"><Label>Link this Certificate</Label><Input placeholder="https://..." value={cert.link} onChange={e => updateCert(cert.id, 'link', e.target.value)} /></div>
                            <div className="space-y-2 sm:col-span-2"><Label>Skills</Label><Input placeholder="Add skills (comma separated)" value={cert.skills} onChange={e => updateCert(cert.id, 'skills', e.target.value)} /></div>
                            <div className="space-y-2 sm:col-span-2">
                              <Label>Description</Label>
                              <Textarea rows={3} placeholder="Provide details about the certificate..." value={cert.description} onChange={e => updateCert(cert.id, 'description', e.target.value)} />
                              <Button variant="outline" size="sm" className="mt-2 text-primary" disabled={aiDescBusy === `cert-${cert.id}`} onClick={() => generateDescription(`cert-${cert.id}`, 'certificate entry', `${cert.title || ''} issued by ${cert.organisation || ''}${cert.skills ? `, skills: ${cert.skills}` : ''}`, (text) => updateCert(cert.id, 'description', text))}>
                                <Sparkles className="w-4 h-4 mr-2" /> {aiDescBusy === `cert-${cert.id}` ? 'Generating...' : 'Generate with AI'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {certificates.length === 0 && <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">No certificates added.</p>}
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
                  <h2 className="text-xl font-bold text-foreground">Personal details</h2>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Pronouns</Label>
                    <div className="flex gap-3 mt-1">
                      {['He/Him/his', 'She/Her', 'Them/They'].map(pronoun => (
                        <div 
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
                    <Label>DOB</Label>
                    <div className="relative">
                      <Input type="date" value={personalDetails.dob} onChange={e => setPersonalDetails({...personalDetails, dob: e.target.value})} className="pl-3 w-full" />
                    </div>
                  </div>

                  <div className="space-y-2 mt-4 p-4 border border-border rounded-xl bg-muted/20">
                    <Label>Current Address</Label>
                    <Input placeholder="Select Location" value={personalDetails.currentAddress} onChange={e => setPersonalDetails({...personalDetails, currentAddress: e.target.value})} />
                  </div>

                  <div className="space-y-2 mt-4 p-4 border border-border rounded-xl bg-muted/20">
                    <div className="flex justify-between items-center mb-2">
                       <Label>Permanent Address</Label>
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
                         />
                         Copy Current Address
                       </label>
                    </div>
                    <Input 
                      placeholder="Select Location" 
                      value={personalDetails.permanentAddress} 
                      disabled={personalDetails.sameAsCurrent}
                      onChange={e => setPersonalDetails({...personalDetails, permanentAddress: e.target.value})} 
                    />
                  </div>

                  <div className="space-y-2 mt-4">
                    <Label>Hobbies</Label>
                    <Textarea placeholder="List your hobbies." value={personalDetails.hobbies} onChange={e => setPersonalDetails({...personalDetails, hobbies: e.target.value})} rows={3} />
                  </div>
                </div>
              </div>
            )}

            {/* Step 9: Links */}
            {step === 9 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
                  <LinkIcon className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-xl font-bold text-foreground">Social links</h2>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label>LinkedIn URL</Label>
                    <Input placeholder="https://linkedin.com/in/username" value={links.linkedin} onChange={e => setLinks({...links, linkedin: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>GitHub URL</Label>
                    <Input placeholder="https://github.com/username" value={links.github} onChange={e => setLinks({...links, github: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Personal Portfolio</Label>
                    <Input placeholder="https://yourwebsite.com" value={links.portfolio} onChange={e => setLinks({...links, portfolio: e.target.value})} />
                  </div>
                </div>
                
                <div className="p-4 bg-primary/5 border border-primary/15 rounded-2xl mt-8 flex items-start gap-4">
                  <Award className="w-8 h-8 text-primary shrink-0 mt-1" />
                  <div>
                    <h4 className="font-semibold text-foreground">Ready to build your resume</h4>
                    <p className="text-sm text-muted-foreground">Once you save your profile, open the resume builder to turn it into a tailored PDF.</p>
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
            title: 'Basic Details Tips',
            icon: '👤',
            tips: [
              { heading: 'Use your real name', body: 'Employers verify this during background checks. Avoid nicknames or abbreviations.' },
              { heading: 'Profile photo matters', body: 'A professional headshot increases profile views by 14x. Use a clear, front-facing photo.' },
              { heading: 'Career Goal', body: 'Selecting multiple goals lets our AI match you with a broader range of opportunities.' },
              { heading: 'Current Location', body: 'Use the GPS button to auto-detect your city and state for accurate job matching.' },
              { heading: 'Keep details accurate', body: 'Employers and mentors trust complete, truthful profiles. Optional ID verification will arrive later.' },
            ],
          },
          2: {
            title: 'Resume Tips',
            icon: '📄',
            tips: [
              { heading: 'Use a clean format', body: 'ATS systems prefer single-column resumes without tables or images. Use PDF format.' },
              { heading: 'Keep it under 2 pages', body: 'Recruiters spend ~7 seconds per resume. Be concise and impact-focused.' },
              { heading: 'Use action verbs', body: 'Start bullet points with verbs like "Built", "Led", "Optimized", "Reduced".' },
              { heading: 'Quantify results', body: 'Replace vague statements with numbers: "Improved load time by 40%" is far stronger.' },
            ],
          },
          3: {
            title: 'About / Bio Tips',
            icon: '✨',
            tips: [
              { heading: 'Start with your value', body: 'Open with what you bring to the table, not just your job title.' },
              { heading: 'Keep it concise', body: '3–5 sentences is ideal. Recruiters skim — make every word count.' },
              { heading: 'Mention your passions', body: 'Authentic enthusiasm is memorable. Mention what drives you professionally.' },
              { heading: 'Use AI', body: 'Click "Generate with AI" to get a tailored summary you can then edit and personalize.' },
            ],
          },
          4: {
            title: 'Skills Tips',
            icon: '🛠️',
            tips: [
              { heading: 'Match job descriptions', body: 'Mirror skills from job postings you want. ATS systems keyword-match your profile.' },
              { heading: 'Include soft skills', body: 'Leadership, communication, and problem-solving are valued by most employers.' },
              { heading: 'Order by relevance', body: 'Put your strongest/most relevant skills first for quick scanning.' },
            ],
          },
          5: {
            title: 'Education Tips',
            icon: '🎓',
            tips: [
              { heading: 'Include all degrees', body: 'Add your highest qualification first. Include diplomas and certifications too.' },
              { heading: 'Highlight relevant courses', body: 'Mention coursework relevant to your target job or industry.' },
              { heading: 'GPA matters for freshers', body: 'If you are a recent graduate, include your CGPA/percentage if it is above 7.0.' },
            ],
          },
          6: {
            title: 'Work Experience Tips',
            icon: '💼',
            tips: [
              { heading: 'Quantify achievements', body: 'Use numbers wherever possible: "Managed a team of 5", "Reduced bug count by 30%".' },
              { heading: 'List in reverse order', body: 'Most recent experience should appear first.' },
              { heading: 'Mention technologies used', body: 'List the tech stack you worked with in each role for better filtering.' },
              { heading: 'Gaps are OK', body: 'If you have gaps, briefly address them in your bio. Employers appreciate honesty.' },
            ],
          },
          7: {
            title: 'Accomplishments Tips',
            icon: '🏆',
            tips: [
              { heading: 'Projects speak louder', body: 'Even personal projects demonstrate initiative. Add GitHub links where possible.' },
              { heading: 'Certifications add credibility', body: 'Include the issuer name and date — recent certs carry more weight.' },
              { heading: 'Use AI for descriptions', body: 'Click "Generate with AI" to draft project or achievement descriptions quickly.' },
              { heading: 'Link everything', body: 'URLs to live projects, certificates, or published work increase credibility significantly.' },
            ],
          },
          8: {
            title: 'Links & Social Tips',
            icon: '🔗',
            tips: [
              { heading: 'LinkedIn is essential', body: 'Recruiters always check LinkedIn. Make sure it is up to date and matches your profile.' },
              { heading: 'GitHub for developers', body: 'An active GitHub profile with public projects is often more persuasive than a resume.' },
              { heading: 'Portfolio website', body: 'A personal portfolio website dramatically sets you apart from other candidates.' },
            ],
          },
          9: {
            title: 'Personal Details Tips',
            icon: '📋',
            tips: [
              { heading: 'Date of Birth', body: 'Required for some opportunities and compliance. This is kept private and secure.' },
              { heading: 'Address', body: 'Your location helps match you to local and remote opportunities in your region.' },
              { heading: 'Hobbies & Interests', body: 'Relatable hobbies create talking points in interviews and humanize your profile.' },
            ],
          },
        }
        const tipData = STEP_TIPS[step] || STEP_TIPS[1]
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setShowTips(false)}>
            <div className="bg-card w-full max-w-md p-6 rounded-2xl shadow-2xl border border-border animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-5">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{tipData.icon}</span>
                  <h3 className="text-lg font-bold">{tipData.title}</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowTips(false)}>
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
                <Button onClick={() => setShowTips(false)}>Got it</Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Email update + verify */}
      {showEmailUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !emailBusy && setShowEmailUpdate(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Update email</h3>
              <button type="button" onClick={() => setShowEmailUpdate(false)}><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground">We will send a verification code to the new address. Your login email updates only after you verify.</p>
            <div className="space-y-2">
              <Label>New email</Label>
              <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="you@example.com" disabled={emailOtpSent} />
            </div>
            {emailOtpSent && (
              <div className="space-y-2">
                <Label>Verification code</Label>
                <Input value={emailOtp} onChange={e => setEmailOtp(e.target.value)} placeholder="6-digit code" />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowEmailUpdate(false)} disabled={emailBusy}>Cancel</Button>
              {!emailOtpSent ? (
                <Button type="button" disabled={emailBusy || !newEmail.includes('@')} onClick={async () => {
                  setEmailBusy(true)
                  try {
                    const res = await csrfFetch('/api/user/email-change/request', { method: 'POST', body: JSON.stringify({ email: newEmail.trim() }) })
                    const json = await res.json()
                    if (!res.ok) throw new Error(json.error || 'Failed')
                    setEmailOtpSent(true)
                    addToast({ type: 'success', title: 'Code sent to new email' })
                  } catch (e: any) {
                    addToast({ type: 'error', title: e?.message || 'Could not send code' })
                  } finally { setEmailBusy(false) }
                }}>Send code</Button>
              ) : (
                <Button type="button" disabled={emailBusy || emailOtp.length < 4} onClick={async () => {
                  setEmailBusy(true)
                  try {
                    const res = await csrfFetch('/api/user/email-change/confirm', { method: 'POST', body: JSON.stringify({ email: newEmail.trim(), code: emailOtp.trim() }) })
                    const json = await res.json()
                    if (!res.ok) throw new Error(json.error || 'Invalid code')
                    setBasic(prev => ({ ...prev, email: newEmail.trim() }))
                    setShowEmailUpdate(false)
                    addToast({ type: 'success', title: 'Email updated' })
                  } catch (e: any) {
                    addToast({ type: 'error', title: e?.message || 'Verification failed' })
                  } finally { setEmailBusy(false) }
                }}>Verify & update</Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Phone OTP (emailed — free; SMS provider later) */}
      {phoneOtpSent && !isPhoneVerified && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !phoneVerifyBusy && setPhoneOtpSent(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Verify mobile</h3>
              <button type="button" onClick={() => setPhoneOtpSent(false)}><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground">
              SMS OTP needs a paid gateway. For now we email a code to your current login email to confirm this number. SMS can be added later.
            </p>
            <div className="space-y-2">
              <Label>Code from email</Label>
              <Input value={phoneOtp} onChange={e => setPhoneOtp(e.target.value)} placeholder="6-digit code" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setPhoneOtpSent(false)}>Cancel</Button>
              <Button type="button" disabled={phoneVerifyBusy || phoneOtp.length < 4} onClick={async () => {
                setPhoneVerifyBusy(true)
                try {
                  const res = await csrfFetch('/api/user/phone-verify/confirm', {
                    method: 'POST',
                    body: JSON.stringify({ phone: basic.phone, countryCode: basic.countryCode || '+91', code: phoneOtp.trim() }),
                  })
                  const json = await res.json()
                  if (!res.ok) throw new Error(json.error || 'Invalid code')
                  setIsPhoneVerified(true)
                  setPhoneOtpSent(false)
                  addToast({ type: 'success', title: 'Mobile verified' })
                } catch (e: any) {
                  addToast({ type: 'error', title: e?.message || 'Verification failed' })
                } finally { setPhoneVerifyBusy(false) }
              }}>Confirm</Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
