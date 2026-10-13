'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/lib/toast-context'
import { usePageGuard } from '@/lib/use-page-guard'
import { ArrowLeft, Save, Download, Sparkles, Plus, Trash2, Briefcase, GraduationCap, Award as AwardIcon, User as UserIcon } from 'lucide-react'

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

// Mock Profile Data for "Fetch From Profile"
const profileData: ResumeData = {
  personal: { fullName: 'Abhiram R', email: 'abhiram@example.com', phone: '+1 234-567-8900', location: 'San Francisco, CA', linkedin: 'linkedin.com/in/abhiram', portfolio: 'abhiram.dev' },
  summary: 'Innovative and user-focused Product Designer with 5+ years of experience in designing intuitive and impactful digital products. Adept at user research, wireframing, prototyping, and collaborating with cross-functional teams to deliver high-quality user experiences.',
  experience: [
    { id: '1', company: 'TechNova', role: 'Product Designer', dates: 'Jan 2021 - Present', description: 'Led the redesign of the core SaaS platform, increasing user retention by 25%.\nConducted extensive user research and usability testing.\nCollaborated with PMs and engineers in agile sprints.' }
  ],
  education: [
    { id: '1', institution: 'University of Design', degree: 'B.S. Interaction Design', dates: '2016 - 2020' }
  ],
  skills: 'Figma, Sketch, Adobe Creative Suite, HTML/CSS, React, User Research, Prototyping, Wireframing'
}

export default function ResumeBuilderPage() {
  const gate = usePageGuard('user')
  const router = useRouter()
  const searchParams = useSearchParams()
  const source = searchParams.get('source')
  const addToast = useToast()

  const [data, setData] = useState<ResumeData>(emptyData)
  const [template, setTemplate] = useState<'modern' | 'minimal' | 'elegant' | 'professional' | 'creative'>('modern')
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [userCredits, setUserCredits] = useState<number | null>(null)

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

  useEffect(() => {
    if (source === 'profile') {
      try {
        const saved = localStorage.getItem('codeSpectra_extendedProfile')
        if (saved) {
          const parsed = JSON.parse(saved)
          setData({
            personal: { 
              fullName: parsed.name || profileData.personal.fullName, 
              email: parsed.email || profileData.personal.email, 
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
      // fallback
      setData(profileData)
      addToast({ type: 'success', title: 'Mock data fetched from profile' })
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

  const generateWithAI = async () => {
    if (!data.personal.fullName || (!data.experience[0]?.role && !data.skills)) {
      addToast({ type: 'error', title: 'Provide at least a name and role/skills for AI generation' })
      return
    }

    if (userCredits === null || userCredits < 1) {
      addToast({ type: 'error', title: 'Insufficient AI Credits. Upgrade to PRO to get more.' })
      return
    }
    
    setIsGeneratingAI(true)
    
    try {
      const res = await csrfFetch('/api/user/ai-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 1 })
      })
      
      const resData = await res.json()
      if (!res.ok) {
        addToast({ type: 'error', title: resData.error || 'Failed to deduct AI Credits' })
        setIsGeneratingAI(false)
        return
      }
      
      setUserCredits(resData.balance)

      // Mock API Call for actual AI generation
      setTimeout(() => {
        const role = data.experience[0]?.role || 'Professional'
        setData(prev => ({
          ...prev,
          summary: `Highly motivated and results-driven ${role} with a proven track record of delivering innovative solutions. Skilled in ${prev.skills || 'various technologies'}, with a strong focus on collaboration, problem-solving, and driving continuous improvement to achieve organizational goals.`
        }))
        setIsGeneratingAI(false)
        addToast({ type: 'success', title: 'AI Summary Generated! (1 credit deducted)' })
      }, 1500)
    } catch (e) {
      console.error(e)
      addToast({ type: 'error', title: 'Something went wrong.' })
      setIsGeneratingAI(false)
    }
  }

  if (!gate.ready) return null

  return (
    <div className="flex flex-col h-screen max-h-screen bg-background overflow-hidden -m-4 sm:-m-6 md:-m-8">
      {/* Header */}
      <div className="h-16 border-b border-border bg-card flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/resumes')} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div className="w-px h-6 bg-border mx-2" />
          <Input defaultValue="Untitled Resume" className="border-transparent hover:border-border focus-visible:ring-0 shadow-none w-64 text-lg font-semibold px-2 h-9" />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm">
            <Save className="w-4 h-4 mr-2" /> Save Draft
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <Download className="w-4 h-4 mr-2" /> Download PDF
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor Pane */}
        <div className="w-[45%] lg:w-[40%] h-full overflow-y-auto border-r border-border bg-card p-6 custom-scrollbar">
          <div className="space-y-8 pb-20">
            
            {/* Personal Details */}
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">Personal Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Full Name</Label><Input value={data.personal.fullName} onChange={e => updatePersonal('fullName', e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={data.personal.email} onChange={e => updatePersonal('email', e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Phone</Label><Input value={data.personal.phone} onChange={e => updatePersonal('phone', e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Location</Label><Input value={data.personal.location} onChange={e => updatePersonal('location', e.target.value)} /></div>
                <div className="space-y-1.5"><Label>LinkedIn</Label><Input value={data.personal.linkedin} onChange={e => updatePersonal('linkedin', e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Portfolio</Label><Input value={data.personal.portfolio} onChange={e => updatePersonal('portfolio', e.target.value)} /></div>
              </div>
            </section>

            {/* Professional Summary */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-foreground">Professional Summary</h3>
                <Button variant="secondary" size="sm" onClick={generateWithAI} disabled={isGeneratingAI} className="bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50">
                  {isGeneratingAI ? <Sparkles className="w-4 h-4 mr-2 animate-pulse" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  {isGeneratingAI ? 'Generating...' : 'AI Magic'}
                </Button>
              </div>
              <Textarea 
                className="min-h-30" 
                placeholder="Write a brief summary of your professional background..." 
                value={data.summary} 
                onChange={e => setData(prev => ({ ...prev, summary: e.target.value }))}
              />
            </section>

            {/* Work Experience */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-foreground">Work Experience</h3>
              </div>
              <div className="space-y-6">
                {data.experience.map((exp, index) => (
                  <div key={exp.id} className="p-4 rounded-xl border border-border bg-muted/20 relative group">
                    <Button variant="ghost" size="icon" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10" onClick={() => removeExperience(exp.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <div className="grid grid-cols-2 gap-4 mb-4 pr-8">
                      <div className="space-y-1.5"><Label>Company</Label><Input value={exp.company} onChange={e => updateExperience(exp.id, 'company', e.target.value)} /></div>
                      <div className="space-y-1.5"><Label>Role</Label><Input value={exp.role} onChange={e => updateExperience(exp.id, 'role', e.target.value)} /></div>
                      <div className="space-y-1.5 col-span-2"><Label>Dates</Label><Input placeholder="e.g. Jan 2020 - Present" value={exp.dates} onChange={e => updateExperience(exp.id, 'dates', e.target.value)} /></div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Description</Label>
                      <Textarea value={exp.description} onChange={e => updateExperience(exp.id, 'description', e.target.value)} rows={3} placeholder="Describe your achievements..." />
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="w-full border-dashed" onClick={addExperience}>
                  <Plus className="w-4 h-4 mr-2" /> Add Experience
                </Button>
              </div>
            </section>

            {/* Education */}
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-foreground">Education</h3>
              <div className="space-y-4">
                {data.education.map((edu, index) => (
                  <div key={edu.id} className="p-4 rounded-xl border border-border bg-muted/20 relative group grid grid-cols-2 gap-4">
                    <Button variant="ghost" size="icon" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10" onClick={() => removeEducation(edu.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <div className="space-y-1.5"><Label>Institution</Label><Input value={edu.institution} onChange={e => updateEducation(edu.id, 'institution', e.target.value)} /></div>
                    <div className="space-y-1.5 pr-8"><Label>Degree</Label><Input value={edu.degree} onChange={e => updateEducation(edu.id, 'degree', e.target.value)} /></div>
                    <div className="space-y-1.5 col-span-2"><Label>Dates</Label><Input value={edu.dates} onChange={e => updateEducation(edu.id, 'dates', e.target.value)} /></div>
                  </div>
                ))}
                <Button variant="outline" className="w-full border-dashed" onClick={addEducation}>
                  <Plus className="w-4 h-4 mr-2" /> Add Education
                </Button>
              </div>
            </section>

            {/* Skills */}
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-foreground">Skills</h3>
              <Textarea 
                value={data.skills} 
                onChange={e => setData(prev => ({ ...prev, skills: e.target.value }))}
                placeholder="React, TypeScript, Node.js, Design..."
                rows={3}
              />
            </section>
          </div>
        </div>

        {/* Live Preview Pane */}
        <div className="flex-1 bg-muted/30 dark:bg-muted/10 p-6 flex flex-col relative h-full overflow-hidden">
          
          {/* Template Switcher */}
          <div className="bg-card border border-border rounded-full px-2 py-2 flex items-center justify-center gap-2 mb-6 shadow-sm w-max">
            {(['modern', 'minimal', 'elegant', 'professional', 'creative'] as const).map(t => (
              <Button
                key={t}
                variant={template === t ? 'default' : 'ghost'}
                className={`rounded-full px-6 h-8 text-sm capitalize ${template === t ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md' : 'text-muted-foreground'}`}
                onClick={() => setTemplate(t)}
              >
                {t}
              </Button>
            ))}
          </div>

          {/* Resume Canvas Wrapper */}
          <div className="flex-1 overflow-y-auto custom-scrollbar flex justify-center pb-20">
            {/* The Resume A4 Paper */}
            <div className="bg-white shadow-xl rounded-sm w-full min-h-282.75 text-slate-900 overflow-hidden shrink-0 transition-all duration-300">
              
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
                    <h1 className="text-4xl font-black text-slate-800 mb-2 uppercase tracking-tight">{data.personal.fullName || 'Your Name'}</h1>
                    <div className="text-lg text-blue-600 font-medium mb-6">{data.experience[0]?.role || 'Professional Title'}</div>
                    
                    <div className="text-sm text-slate-600 leading-relaxed mb-8">
                      {data.summary || 'Summary...'}
                    </div>

                    <h2 className="text-lg font-bold uppercase text-slate-800 mb-4 border-b-2 border-slate-200 pb-2 flex items-center gap-2">
                      <div className="w-8 h-8 rounded bg-blue-100 text-blue-600 flex items-center justify-center">
                        <Briefcase className="w-4 h-4" />
                      </div>
                      Work Experience
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
                    <h1 className="text-4xl font-light tracking-widest uppercase text-slate-900 mb-3">{data.personal.fullName || 'Your Name'}</h1>
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
                <div className="p-10 relative bg-snow">
                  <div className="absolute top-0 left-0 w-2 h-full bg-[#1e40af]" />
                  <div className="pl-6">
                    <h1 className="text-5xl font-serif text-[#1e40af] mb-2 tracking-wide">{data.personal.fullName || 'Your Name'}</h1>
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
                    <h1 className="text-4xl font-bold uppercase tracking-widest text-slate-900 mb-2">{data.personal.fullName || 'Your Name'}</h1>
                    <div className="text-lg text-slate-600 font-medium tracking-wide mb-4">{data.experience[0]?.role || 'Professional Title'}</div>
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
                        <h2 className="text-xl font-bold uppercase tracking-wider text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">Professional Summary</h2>
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
                        <h2 className="text-xl font-bold uppercase tracking-wider text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">Core Skills</h2>
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
                      <h1 className="text-4xl font-black leading-none mb-2">{data.personal.fullName || 'Your Name'}</h1>
                      <div className="text-lg font-medium text-white/90 mb-10">{data.experience[0]?.role || 'Professional'}</div>

                      <div className="space-y-6">
                        <div>
                          <h2 className="text-sm font-bold uppercase tracking-widest text-white/70 mb-2">Contact Info</h2>
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
