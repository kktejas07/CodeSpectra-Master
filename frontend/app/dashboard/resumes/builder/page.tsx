'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/lib/toast-context'
import { usePageGuard } from '@/lib/use-page-guard'
import { ArrowLeft, Save, Download, FileText, Plus, Trash2, Briefcase, GraduationCap, Award as AwardIcon, User as UserIcon, Sparkles, Loader2 } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'

// Basic Resume Data Structure
interface ResumeData {
  personal: {
    fullName: string
    email: string
    phone: string
    location: string
    linkedin: string
    portfolio: string
  }
  summary: string
  experience: { id: string; company: string; role: string; dates: string; description: string }[]
  education: { id: string; institution: string; degree: string; dates: string }[]
  skills: string
}

const emptyData: ResumeData = {
  personal: { fullName: '', email: '', phone: '', location: '', linkedin: '', portfolio: '' },
  summary: '',
  experience: [],
  education: [],
  skills: ''
}

// Drafts are saved to the account (/api/resumes/drafts). This browser copy is
// only an offline fallback, used when the account copy can't be reached or is older.
const DRAFT_KEY = 'codeSpectra_resumeDraft'

type LocalDraft = { id?: string; name?: string; template?: TemplateKey; data?: ResumeData; saved_at?: string; synced?: boolean }

function readLocalDraft(): LocalDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as LocalDraft) : null
  } catch {
    return null
  }
}

function writeLocalDraft(d: LocalDraft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch { /* storage blocked */ }
}

type TemplateKey = 'modern' | 'minimal' | 'elegant' | 'professional' | 'creative'

/** Print just the resume sheet: copy it plus the page's styles into a hidden iframe. */
function printElement(el: HTMLElement, title: string) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) { iframe.remove(); return false }
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map(n => n.outerHTML).join('')
  doc.open()
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/[<>&]/g, '')}</title>${styles}<style>@page{size:A4;margin:0}html,body{margin:0;background:#fff}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${el.outerHTML}</body></html>`)
  doc.close()
  const done = () => setTimeout(() => iframe.remove(), 1000)
  setTimeout(() => {
    win.focus()
    win.print()
    done()
  }, 300)
  return true
}

export default function ResumeBuilderPage() {
  const gate = usePageGuard('user')
  const router = useRouter()
  const searchParams = useSearchParams()
  const source = searchParams.get('source')
  const addToast = useToast()

  const [data, setData] = useState<ResumeData>(emptyData)
  const [template, setTemplate] = useState<TemplateKey>('modern')
  const [resumeName, setResumeName] = useState('Untitled resume')
  const sheetRef = useRef<HTMLDivElement>(null)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState<string | null>(null)

  const applyDraft = (d: LocalDraft) => {
    if (d.data) setData({ ...emptyData, ...d.data, personal: { ...emptyData.personal, ...d.data.personal } })
    if (d.name) setResumeName(d.name)
    if (d.template) setTemplate(d.template)
  }

  // Load the latest draft from the account; fall back to this device's copy when offline
  // or when the device has newer unsynced changes. Skipped when loading from the profile.
  useEffect(() => {
    if (source === 'profile') return
    let cancelled = false
    const local = readLocalDraft()
    fetch('/api/resumes/drafts', { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<{ draft: (LocalDraft & { id: string; updated_at: string }) | null }>
      })
      .then(({ draft }) => {
        if (cancelled) return
        const localNewer = !!local?.data && local.synced === false &&
          (!draft || (local.saved_at || '') > (draft.updated_at || ''))
        if (localNewer && local) {
          applyDraft(local)
          if (local.id) setDraftId(local.id)
          addToast({ type: 'info', title: 'Loaded unsaved changes from this device', message: 'Press Save draft to store them in your account.' })
        } else if (draft) {
          applyDraft(draft)
          setDraftId(draft.id)
          setLastSavedAt(draft.updated_at)
        }
      })
      .catch(() => {
        if (cancelled || !local?.data) return
        applyDraft(local)
        if (local.id) setDraftId(local.id)
        addToast({ type: 'info', title: 'Showing the copy saved on this device', message: 'We could not reach your account just now.' })
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  const saveDraft = async () => {
    setSavingDraft(true)
    const savedAt = new Date().toISOString()
    try {
      const res = await csrfFetch('/api/resumes/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draftId || undefined, name: resumeName, template, data }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.draft?.id) throw new Error(j?.error || 'Could not save your draft')
      setDraftId(j.draft.id)
      setLastSavedAt(j.draft.updated_at)
      writeLocalDraft({ id: j.draft.id, name: resumeName, template, data, saved_at: j.draft.updated_at, synced: true })
      addToast({ type: 'success', title: 'Draft saved to your account' })
    } catch (e) {
      writeLocalDraft({ id: draftId || undefined, name: resumeName, template, data, saved_at: savedAt, synced: false })
      addToast({
        type: 'error',
        title: 'Saved on this device only',
        message: `${e instanceof Error ? e.message : 'Could not reach your account'}. Try Save draft again when you're back online.`,
      })
    } finally {
      setSavingDraft(false)
    }
  }

  const askAi = async (target: 'summary' | 'bullets', experienceId?: string) => {
    setAiBusy(target === 'summary' ? 'summary' : experienceId || 'bullets')
    try {
      const res = await csrfFetch('/api/resumes/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, experienceId, data }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) {
        addToast({ type: 'error', title: j?.error || 'AI writing is unavailable right now', ...(res.status === 402 ? { message: 'Top up credits from billing, or use Start from template.' } : {}) })
        return
      }
      if (target === 'summary' && typeof j?.summary === 'string') {
        setData(prev => ({ ...prev, summary: j.summary }))
      } else if (target === 'bullets' && Array.isArray(j?.bullets) && experienceId) {
        const text = (j.bullets as string[]).map(b => `• ${b}`).join('\n')
        setData(prev => ({
          ...prev,
          experience: prev.experience.map(exp => exp.id === experienceId ? { ...exp, description: text } : exp),
        }))
      } else {
        addToast({ type: 'error', title: 'AI writing is unavailable right now' })
        return
      }
      addToast({
        type: 'success',
        title: target === 'summary' ? 'Summary written' : 'Bullets written',
        message: `Check it matches your real experience. ${typeof j.balance === 'number' ? `${j.balance} credits left.` : ''}`.trim(),
      })
    } catch {
      addToast({ type: 'error', title: 'AI writing is unavailable right now', message: 'You were not charged.' })
    } finally {
      setAiBusy(null)
    }
  }

  const downloadPdf = () => {
    if (!sheetRef.current || !printElement(sheetRef.current, resumeName || 'Resume')) {
      window.print()
      return
    }
    addToast({ type: 'info', title: 'Choose "Save as PDF" in the print dialog' })
  }

  useEffect(() => {
    if (source === 'profile') {
      try {
        const saved = localStorage.getItem('codeSpectra_extendedProfile')
        if (saved) {
          const parsed = JSON.parse(saved)
          setData({
            personal: { 
              fullName: parsed.name || '',
              email: parsed.email || '',
              phone: parsed.phone || '', 
              location: parsed.location || '', 
              linkedin: parsed.links?.linkedin || '', 
              portfolio: parsed.links?.portfolio || '' 
            },
            summary: parsed.about || '',
            experience: parsed.experience || [],
            education: parsed.education || [],
            skills: parsed.skills || ''
          })
          addToast({ type: 'success', title: 'Data fetched from profile' })
          return
        }
      } catch (e) {
        console.error('Error parsing profile data', e)
      }
      addToast({ type: 'info', title: 'No saved profile found', message: 'Fill in your details below, or complete your profile first.' })
    }
  }, [source, addToast])

  const updatePersonal = (field: keyof ResumeData['personal'], value: string) => {
    setData(prev => ({ ...prev, personal: { ...prev.personal, [field]: value } }))
  }

  const addExperience = () => {
    setData(prev => ({
      ...prev,
      experience: [...prev.experience, { id: Date.now().toString(), company: '', role: '', dates: '', description: '' }]
    }))
  }

  const updateExperience = (id: string, field: string, value: string) => {
    setData(prev => ({
      ...prev,
      experience: prev.experience.map(exp => exp.id === id ? { ...exp, [field]: value } : exp)
    }))
  }

  const removeExperience = (id: string) => {
    setData(prev => ({ ...prev, experience: prev.experience.filter(exp => exp.id !== id) }))
  }

  const addEducation = () => {
    setData(prev => ({
      ...prev,
      education: [...prev.education, { id: Date.now().toString(), institution: '', degree: '', dates: '' }]
    }))
  }

  const updateEducation = (id: string, field: string, value: string) => {
    setData(prev => ({
      ...prev,
      education: prev.education.map(edu => edu.id === id ? { ...edu, [field]: value } : edu)
    }))
  }

  const removeEducation = (id: string) => {
    setData(prev => ({ ...prev, education: prev.education.filter(edu => edu.id !== id) }))
  }

  // Not AI: fills a starter summary from the role and skills you typed, so it
  // costs no credits. Edit it to make it yours.
  const startFromTemplate = () => {
    if (!data.experience[0]?.role && !data.skills) {
      addToast({ type: 'error', title: 'Add a role or some skills first' })
      return
    }
    const role = data.experience[0]?.role || 'professional'
    setData(prev => ({
      ...prev,
      summary: `Motivated ${role} with experience delivering reliable, well-built work. Skilled in ${prev.skills || 'a range of tools'}, with a focus on collaboration, problem-solving and continuous improvement.`
    }))
    addToast({ type: 'success', title: 'Starter summary added', message: 'Edit it to describe your own work.' })
  }

  if (!gate.ready) return null

  return (
    <div className="flex flex-col h-screen max-h-screen bg-background overflow-hidden -m-4 sm:-m-6 md:-m-8">
      {/* Header */}
      <div className="min-h-16 border-b border-border bg-card flex flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 shrink-0 z-10">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/resumes')} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div className="hidden sm:block w-px h-6 bg-border mx-2" />
          <Input value={resumeName} onChange={e => setResumeName(e.target.value)} aria-label="Resume name" className="border-transparent hover:border-border focus-visible:border-border shadow-none w-40 sm:w-64 text-base sm:text-lg font-semibold text-foreground px-2 h-9" />
        </div>
        <div className="flex items-center gap-3">
          {lastSavedAt && (
            <span className="hidden lg:inline text-xs text-muted-foreground tabular-nums">
              Saved {new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => void saveDraft()} disabled={savingDraft}>
            {savingDraft ? <Loader2 className="w-4 h-4 mr-2 animate-spin motion-reduce:animate-none" aria-hidden /> : <Save className="w-4 h-4 mr-2" aria-hidden />}
            {savingDraft ? 'Saving…' : 'Save draft'}
          </Button>
          <Button size="sm" onClick={downloadPdf}>
            <Download className="w-4 h-4 mr-2" /> Download PDF
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {/* Editor Pane */}
        <div className="w-full md:w-[45%] lg:w-[40%] h-1/2 md:h-full overflow-y-auto border-b md:border-b-0 md:border-r border-border bg-card p-4 sm:p-6 custom-scrollbar">
          <div className="space-y-8 pb-20">
            
            {/* Personal Details */}
            <section className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">Personal details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Full name</Label><Input aria-label="Full name" value={data.personal.fullName} onChange={e => updatePersonal('fullName', e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input aria-label="Email" type="email" value={data.personal.email} onChange={e => updatePersonal('email', e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Phone</Label><Input aria-label="Phone" value={data.personal.phone} onChange={e => updatePersonal('phone', e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Location</Label><Input aria-label="Location" value={data.personal.location} onChange={e => updatePersonal('location', e.target.value)} /></div>
                <div className="space-y-1.5"><Label>LinkedIn</Label><Input aria-label="LinkedIn" value={data.personal.linkedin} onChange={e => updatePersonal('linkedin', e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Portfolio</Label><Input aria-label="Portfolio" value={data.personal.portfolio} onChange={e => updatePersonal('portfolio', e.target.value)} /></div>
              </div>
            </section>

            {/* Professional Summary */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-foreground">Professional summary</h3>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={startFromTemplate}>
                    <FileText className="w-4 h-4 mr-2" aria-hidden /> Start from template
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void askAi('summary')}
                    disabled={aiBusy !== null}
                    className="bg-primary/10 text-primary hover:bg-primary/15"
                    title="Uses 1 AI credit, charged only if it works"
                  >
                    {aiBusy === 'summary' ? <Loader2 className="w-4 h-4 mr-2 animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles className="w-4 h-4 mr-2" aria-hidden />}
                    {aiBusy === 'summary' ? 'Writing…' : 'Write with AI'}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Write with AI uses 1 credit and only uses what you have entered. Template is free.</p>
              <Textarea 
                aria-label="Professional summary"
                className="min-h-30" 
                placeholder="Write a brief summary of your professional background…" 
                value={data.summary} 
                onChange={e => setData(prev => ({ ...prev, summary: e.target.value }))}
              />
            </section>

            {/* Work Experience */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Work experience</h3>
              </div>
              <div className="space-y-6">
                {data.experience.map((exp, index) => (
                  <div key={exp.id} className="p-4 rounded-2xl border border-border bg-muted/20 relative group">
                    <Button variant="ghost" size="icon" className="absolute top-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-destructive hover:bg-destructive/10" onClick={() => removeExperience(exp.id)} aria-label="Remove experience">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 pr-8">
                      <div className="space-y-1.5"><Label>Company</Label><Input aria-label="Company" value={exp.company} onChange={e => updateExperience(exp.id, 'company', e.target.value)} /></div>
                      <div className="space-y-1.5"><Label>Role</Label><Input aria-label="Role" value={exp.role} onChange={e => updateExperience(exp.id, 'role', e.target.value)} /></div>
                      <div className="space-y-1.5 sm:col-span-2"><Label>Dates</Label><Input aria-label="Dates" placeholder="e.g. Jan 2020 - Present" value={exp.dates} onChange={e => updateExperience(exp.id, 'dates', e.target.value)} /></div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label>Description</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-primary"
                          disabled={aiBusy !== null || !(exp.role || exp.company)}
                          onClick={() => void askAi('bullets', exp.id)}
                          title="Uses 1 AI credit, charged only if it works"
                        >
                          {aiBusy === exp.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" aria-hidden />}
                          {aiBusy === exp.id ? 'Writing…' : 'Write bullets with AI'}
                        </Button>
                      </div>
                      <Textarea aria-label="Description" value={exp.description} onChange={e => updateExperience(exp.id, 'description', e.target.value)} rows={3} placeholder="Describe your achievements…" />
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="w-full border-dashed" onClick={addExperience}>
                  <Plus className="w-4 h-4 mr-2" /> Add experience
                </Button>
              </div>
            </section>

            {/* Education */}
            <section className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Education</h3>
              <div className="space-y-4">
                {data.education.map((edu, index) => (
                  <div key={edu.id} className="p-4 rounded-2xl border border-border bg-muted/20 relative group grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Button variant="ghost" size="icon" className="absolute top-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-destructive hover:bg-destructive/10" onClick={() => removeEducation(edu.id)} aria-label="Remove education">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <div className="space-y-1.5"><Label>Institution</Label><Input aria-label="Institution" value={edu.institution} onChange={e => updateEducation(edu.id, 'institution', e.target.value)} /></div>
                    <div className="space-y-1.5 pr-8"><Label>Degree</Label><Input aria-label="Degree" value={edu.degree} onChange={e => updateEducation(edu.id, 'degree', e.target.value)} /></div>
                    <div className="space-y-1.5 sm:col-span-2"><Label>Dates</Label><Input aria-label="Dates" value={edu.dates} onChange={e => updateEducation(edu.id, 'dates', e.target.value)} /></div>
                  </div>
                ))}
                <Button variant="outline" className="w-full border-dashed" onClick={addEducation}>
                  <Plus className="w-4 h-4 mr-2" /> Add education
                </Button>
              </div>
            </section>

            {/* Skills */}
            <section className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Skills</h3>
              <Textarea 
                aria-label="Skills"
                value={data.skills} 
                onChange={e => setData(prev => ({ ...prev, skills: e.target.value }))}
                placeholder="React, TypeScript, Node.js, Design…"
                rows={3}
              />
            </section>
          </div>
        </div>

        {/* Live Preview Pane */}
        <div className="flex-1 bg-muted/30 dark:bg-muted/10 p-4 sm:p-6 flex flex-col relative min-h-0 md:h-full overflow-hidden">
          
          {/* Template Switcher */}
          <div className="bg-card border border-border rounded-full px-2 py-2 flex items-center gap-1 sm:gap-2 mb-6 shadow-sm max-w-full w-max overflow-x-auto">
            {(['modern', 'minimal', 'elegant', 'professional', 'creative'] as const).map(t => (
              <Button
                key={t}
                variant={template === t ? 'default' : 'ghost'}
                className={`rounded-full px-4 sm:px-6 h-8 text-sm capitalize ${template === t ? 'shadow-md' : 'text-muted-foreground'}`}
                aria-pressed={template === t}
                onClick={() => setTemplate(t)}
              >
                {t}
              </Button>
            ))}
          </div>

          {/* Resume Canvas Wrapper */}
          <div className="flex-1 overflow-y-auto custom-scrollbar flex justify-center pb-20">
            {/* The Resume A4 Paper */}
            <div ref={sheetRef} className="bg-white shadow-xl rounded-sm w-full max-w-200 min-h-282.75 text-slate-900 overflow-hidden shrink-0 transition-all duration-300">
              
              {/* --- Template: Modern --- */}
              {template === 'modern' && (
                <div className="flex min-h-282.75">
                  {/* Left Column */}
                  <div className="w-[35%] bg-[#2a3b4c] text-white p-8 wrap-break-word">
                    <div className="h-24 w-24 rounded-full bg-white/20 mb-6 flex items-center justify-center text-3xl font-bold border-2 border-white/30 overflow-hidden">
                      {((data.personal.fullName || '').charAt(0) || 'U')}
                    </div>
                    <h2 className="text-sm font-bold tracking-widest uppercase text-blue-300 mb-6 border-b border-white/20 pb-2">Contact</h2>
                    <div className="space-y-3 text-sm text-slate-300 mb-8 wrap-break-word">
                      {data.personal.email && <div className="break-all">{data.personal.email}</div>}
                      {data.personal.phone && <div>{data.personal.phone}</div>}
                      {data.personal.location && <div>{data.personal.location}</div>}
                      {data.personal.linkedin && <div className="break-all">{data.personal.linkedin}</div>}
                      {data.personal.portfolio && <div className="break-all">{data.personal.portfolio}</div>}
                    </div>
                    
                    <h2 className="text-sm font-bold tracking-widest uppercase text-blue-300 mb-6 border-b border-white/20 pb-2">Education</h2>
                    <div className="space-y-4 text-sm text-slate-300 mb-8">
                      {data.education.map(edu => (
                        <div key={edu.id}>
                          <div className="font-bold text-white">{edu.degree}</div>
                          <div className="text-blue-200 text-xs my-0.5">{edu.institution}</div>
                          <div className="text-xs opacity-70">{edu.dates}</div>
                        </div>
                      ))}
                    </div>

                    <h2 className="text-sm font-bold tracking-widest uppercase text-blue-300 mb-6 border-b border-white/20 pb-2">Skills</h2>
                    <div className="text-sm text-slate-300 leading-relaxed">
                      {data.skills}
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="w-[65%] p-8 bg-white wrap-break-word">
                    <h1 className="text-4xl font-black text-slate-800 mb-2 uppercase tracking-tight">{data.personal.fullName || 'Your name'}</h1>
                    <div className="text-lg text-blue-600 font-medium mb-6">{data.experience[0]?.role || 'Professional title'}</div>
                    
                    <div className="text-sm text-slate-600 leading-relaxed mb-8">
                      {data.summary || 'Summary...'}
                    </div>

                    <h2 className="text-lg font-bold uppercase text-slate-800 mb-4 border-b-2 border-slate-200 pb-2 flex items-center gap-2">
                      <div className="w-8 h-8 rounded bg-blue-100 text-blue-600 flex items-center justify-center">
                        <Briefcase className="w-4 h-4" />
                      </div>
                      Work experience
                    </h2>
                    
                    <div className="space-y-6">
                      {data.experience.map(exp => (
                        <div key={exp.id}>
                          <div className="flex justify-between items-baseline mb-1">
                            <h3 className="font-bold text-slate-800 text-base">{exp.role}</h3>
                            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{exp.dates}</span>
                          </div>
                          <div className="text-slate-500 font-medium text-sm mb-2">{exp.company}</div>
                          <div className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                            {exp.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* --- Template: Minimal --- */}
              {template === 'minimal' && (
                <div className="p-12">
                  <div className="text-center mb-10">
                    <h1 className="text-4xl font-light tracking-widest uppercase text-slate-900 mb-3">{data.personal.fullName || 'Your name'}</h1>
                    <div className="text-sm text-slate-500 flex items-center justify-center gap-3 flex-wrap">
                      {data.personal.email && <span>{data.personal.email}</span>}
                      {data.personal.phone && <span>• {data.personal.phone}</span>}
                      {data.personal.location && <span>• {data.personal.location}</span>}
                    </div>
                    {(data.personal.linkedin || data.personal.portfolio) && (
                      <div className="text-sm text-slate-500 mt-2 flex items-center justify-center gap-3">
                        {data.personal.linkedin && <span>{data.personal.linkedin}</span>}
                        {data.personal.portfolio && <span>• {data.personal.portfolio}</span>}
                      </div>
                    )}
                  </div>

                  {data.summary && (
                    <div className="mb-8 text-center text-sm text-slate-700 leading-relaxed">
                      {data.summary}
                    </div>
                  )}

                  <div className="space-y-8">
                    {/* Experience section */}
                    {data.experience.length > 0 && (
                      <div>
                        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4 border-b border-slate-200 pb-2">Experience</h2>
                        <div className="space-y-5">
                          {data.experience.map(exp => (
                            <div key={exp.id}>
                              <div className="flex justify-between items-baseline mb-1">
                                <h3 className="font-bold text-slate-800">{exp.role} <span className="font-normal text-slate-500">at {exp.company}</span></h3>
                                <span className="text-xs text-slate-400">{exp.dates}</span>
                              </div>
                              <div className="text-sm text-slate-600 whitespace-pre-wrap">
                                {exp.description}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-8">
                      {data.education.length > 0 && (
                        <div>
                          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4 border-b border-slate-200 pb-2">Education</h2>
                          <div className="space-y-4">
                            {data.education.map(edu => (
                              <div key={edu.id}>
                                <h3 className="font-bold text-slate-800">{edu.degree}</h3>
                                <div className="text-sm text-slate-500">{edu.institution}</div>
                                <div className="text-xs text-slate-400 mt-0.5">{edu.dates}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {data.skills && (
                        <div>
                          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4 border-b border-slate-200 pb-2">Skills</h2>
                          <div className="text-sm text-slate-600 leading-relaxed">
                            {data.skills}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* --- Template: Elegant --- */}
              {template === 'elegant' && (
                <div className="p-10 relative bg-slate-50">
                  <div className="absolute top-0 left-0 w-2 h-full bg-[#1e40af]" />
                  <div className="pl-6">
                    <h1 className="text-5xl font-serif text-[#1e40af] mb-2 tracking-wide">{data.personal.fullName || 'Your name'}</h1>
                    <div className="text-xl text-slate-600 font-serif italic mb-6">{data.experience[0]?.role || 'Professional'}</div>
                    
                    <div className="flex gap-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-8 bg-white p-4 rounded shadow-sm border border-slate-100">
                      {data.personal.email && <div>{data.personal.email}</div>}
                      {data.personal.phone && <div>{data.personal.phone}</div>}
                      {data.personal.location && <div>{data.personal.location}</div>}
                    </div>

                    <div className="mb-8 bg-white p-6 rounded shadow-sm border border-slate-100">
                      <h2 className="text-2xl font-serif text-[#1e40af] mb-3 flex items-center gap-2">
                        <UserIcon className="w-5 h-5" /> Profile
                      </h2>
                      <div className="text-sm text-slate-700 leading-relaxed">
                        {data.summary || 'Profile summary...'}
                      </div>
                    </div>

                    <div className="mb-8">
                      <h2 className="text-2xl font-serif text-[#1e40af] mb-6 flex items-center gap-2">
                        <Briefcase className="w-5 h-5" /> Experience
                      </h2>
                      <div className="space-y-6">
                        {data.experience.map(exp => (
                          <div key={exp.id} className="relative pl-6 border-l-2 border-slate-200 ml-2">
                            <div className="absolute -left-2.25 top-1.5 w-4 h-4 rounded-full bg-white border-2 border-[#1e40af]" />
                            <div className="bg-white p-5 rounded shadow-sm border border-slate-100">
                              <div className="flex justify-between items-baseline mb-1">
                                <h3 className="font-bold text-slate-800 text-lg">{exp.role}</h3>
                                <span className="text-sm font-bold text-[#1e40af] bg-blue-50 px-2 py-1 rounded">{exp.dates}</span>
                              </div>
                              <div className="text-slate-500 font-medium mb-3">{exp.company}</div>
                              <div className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                                {exp.description}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="bg-white p-6 rounded shadow-sm border border-slate-100">
                        <h2 className="text-2xl font-serif text-[#1e40af] mb-4 flex items-center gap-2">
                          <GraduationCap className="w-5 h-5" /> Education
                        </h2>
                        <div className="space-y-4">
                          {data.education.map(edu => (
                            <div key={edu.id}>
                              <h3 className="font-bold text-slate-800">{edu.degree}</h3>
                              <div className="text-sm text-slate-600">{edu.institution}</div>
                              <div className="text-sm text-[#1e40af] font-bold mt-1">{edu.dates}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="bg-white p-6 rounded shadow-sm border border-slate-100">
                        <h2 className="text-2xl font-serif text-[#1e40af] mb-4 flex items-center gap-2">
                          <AwardIcon className="w-5 h-5" /> Expertise
                        </h2>
                        <div className="text-sm text-slate-700 leading-relaxed">
                          {data.skills}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* --- Template: Professional --- */}
              {template === 'professional' && (
                <div className="p-10 font-sans text-slate-800">
                  <div className="border-b-4 border-slate-800 pb-6 mb-8 text-center">
                    <h1 className="text-4xl font-bold uppercase tracking-widest text-slate-900 mb-2">{data.personal.fullName || 'Your name'}</h1>
                    <div className="text-lg text-slate-600 font-medium tracking-wide mb-4">{data.experience[0]?.role || 'Professional title'}</div>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm font-medium text-slate-500">
                      {data.personal.email && <span>{data.personal.email}</span>}
                      {data.personal.phone && <span>| {data.personal.phone}</span>}
                      {data.personal.location && <span>| {data.personal.location}</span>}
                      {data.personal.linkedin && <span>| {data.personal.linkedin}</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-8">
                    <div className="col-span-8 space-y-8">
                      <section>
                        <h2 className="text-xl font-bold uppercase tracking-wider text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">Professional summary</h2>
                        <p className="text-sm leading-relaxed text-slate-700">{data.summary}</p>
                      </section>

                      <section>
                        <h2 className="text-xl font-bold uppercase tracking-wider text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">Experience</h2>
                        <div className="space-y-6">
                          {data.experience.map(exp => (
                            <div key={exp.id}>
                              <div className="flex justify-between items-baseline mb-1">
                                <h3 className="font-bold text-lg text-slate-800">{exp.role}</h3>
                                <span className="text-sm font-semibold text-slate-600">{exp.dates}</span>
                              </div>
                              <div className="text-slate-600 font-medium mb-2 uppercase text-sm tracking-wide">{exp.company}</div>
                              <div className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{exp.description}</div>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>

                    <div className="col-span-4 space-y-8 pl-8 border-l border-slate-200">
                      <section>
                        <h2 className="text-xl font-bold uppercase tracking-wider text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">Education</h2>
                        <div className="space-y-4">
                          {data.education.map(edu => (
                            <div key={edu.id}>
                              <h3 className="font-bold text-slate-800">{edu.degree}</h3>
                              <div className="text-sm text-slate-600 mb-1">{edu.institution}</div>
                              <div className="text-xs font-semibold text-slate-500">{edu.dates}</div>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section>
                        <h2 className="text-xl font-bold uppercase tracking-wider text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">Core skills</h2>
                        <p className="text-sm leading-relaxed text-slate-700">{data.skills}</p>
                      </section>
                    </div>
                  </div>
                </div>
              )}

              {/* --- Template: Creative --- */}
              {template === 'creative' && (
                <div className="flex min-h-282.75 bg-[#fdfbf7]">
                  <div className="w-[40%] bg-[#ff6b6b] text-white p-10 flex flex-col justify-between wrap-break-word">
                    <div>
                      <div className="w-32 h-32 bg-white rounded-full mb-8 border-4 border-white/30 flex items-center justify-center overflow-hidden shadow-xl">
                        <span className="text-5xl font-black text-[#ff6b6b]">{((data.personal.fullName || '').charAt(0) || 'U')}</span>
                      </div>
                      <h1 className="text-4xl font-black leading-none mb-2">{data.personal.fullName || 'Your name'}</h1>
                      <div className="text-lg font-medium text-white/90 mb-10">{data.experience[0]?.role || 'Professional'}</div>

                      <div className="space-y-6">
                        <div>
                          <h2 className="text-sm font-bold uppercase tracking-widest text-white/70 mb-2">Contact info</h2>
                          <div className="space-y-2 text-sm font-medium">
                            <div>{data.personal.email}</div>
                            <div>{data.personal.phone}</div>
                            <div>{data.personal.location}</div>
                            <div>{data.personal.linkedin}</div>
                          </div>
                        </div>

                        <div>
                          <h2 className="text-sm font-bold uppercase tracking-widest text-white/70 mb-2">Education</h2>
                          <div className="space-y-4 text-sm">
                            {data.education.map(edu => (
                              <div key={edu.id}>
                                <div className="font-bold">{edu.degree}</div>
                                <div className="text-white/80">{edu.institution}</div>
                                <div className="text-xs text-white/60 mt-1">{edu.dates}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="w-[60%] p-10 py-16 text-slate-800 wrap-break-word">
                    <div className="mb-12 relative">
                      <div className="absolute -left-10 top-2 w-8 h-1 bg-[#ff6b6b]" />
                      <h2 className="text-2xl font-black uppercase tracking-widest mb-4">Profile</h2>
                      <p className="text-sm leading-relaxed font-medium text-slate-600 whitespace-pre-wrap">{data.summary}</p>
                    </div>

                    <div className="mb-12 relative">
                      <div className="absolute -left-10 top-2 w-8 h-1 bg-[#ff6b6b]" />
                      <h2 className="text-2xl font-black uppercase tracking-widest mb-6">Experience</h2>
                      <div className="space-y-8">
                        {data.experience.map(exp => (
                          <div key={exp.id}>
                            <h3 className="font-bold text-xl mb-1">{exp.role}</h3>
                            <div className="flex items-center gap-3 mb-3">
                              <span className="font-bold text-[#ff6b6b]">{exp.company}</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                              <span className="text-sm font-bold text-slate-400">{exp.dates}</span>
                            </div>
                            <p className="text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">{exp.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="relative">
                      <div className="absolute -left-10 top-2 w-8 h-1 bg-[#ff6b6b]" />
                      <h2 className="text-2xl font-black uppercase tracking-widest mb-4">Expertise</h2>
                      <p className="text-sm leading-relaxed font-medium text-slate-600">{data.skills}</p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
