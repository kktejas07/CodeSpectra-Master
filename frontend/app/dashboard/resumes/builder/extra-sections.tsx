'use client'

/**
 * Builder editor sections added for the skill-passport résumé: projects,
 * certificates and achievements (contests), plus their preview blocks and the
 * single-column ATS template.
 */
import { Plus, Sparkles, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/lib/i18n/client'
import type { ResumeBuilderData } from '@/lib/resume/builder'

type SetData = (fn: (prev: ResumeBuilderData) => ResumeBuilderData) => void
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const card = 'relative space-y-3 rounded-2xl border border-border bg-muted/20 p-4'

export function ExtraSections({ data, setData, onAiProject, aiBusy }: { data: ResumeBuilderData; setData: SetData; onAiProject: (id: string) => void; aiBusy: string | null }) {
  const { t } = useT()
  const upd = <K extends 'projects' | 'certificates' | 'achievements'>(k: K, id: string, field: string, v: string) =>
    setData((p) => ({ ...p, [k]: (p[k] as Array<{ id: string }>).map((x) => (x.id === id ? { ...x, [field]: v } : x)) }))
  const del = (k: 'projects' | 'certificates' | 'achievements', id: string) => setData((p) => ({ ...p, [k]: (p[k] as Array<{ id: string }>).filter((x) => x.id !== id) }))
  const field = (k: 'projects' | 'certificates' | 'achievements', id: string, name: string, label: string, value: string, extra: Record<string, unknown> = {}) => (
    <div className="space-y-1.5"><Label htmlFor={`${k}-${id}-${name}`}>{label}</Label><Input id={`${k}-${id}-${name}`} value={value} onChange={(e) => upd(k, id, name, e.target.value)} {...extra} /></div>
  )
  const remove = (k: 'projects' | 'certificates' | 'achievements', id: string, label: string) => (
    <Button variant="ghost" size="icon" className="absolute right-2 top-2 text-destructive hover:bg-destructive/10" onClick={() => del(k, id)} aria-label={label}><Trash2 className="h-4 w-4" /></Button>
  )
  return (
    <>
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">{t('career.rbProjects')}</h3>
        {data.projects.map((p) => (
          <div key={p.id} className={card}>
            {remove('projects', p.id, t('career.rbRemoveProject'))}
            <div className="grid grid-cols-1 gap-3 pr-8 sm:grid-cols-2">
              {field('projects', p.id, 'name', t('career.rbProjectName'), p.name)}
              {field('projects', p.id, 'dates', t('career.dates'), p.dates)}
              <div className="sm:col-span-2">{field('projects', p.id, 'link', t('career.rbLink'), p.link)}</div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`projects-${p.id}-description`}>{t('career.description')}</Label>
                <Button variant="ghost" size="sm" className="h-8 text-primary" disabled={aiBusy !== null || !p.name} onClick={() => onAiProject(p.id)} title={t('career.uses1AiCreditChargedOnly923')}>
                  {aiBusy === p.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
                  {aiBusy === p.id ? t('career.writing') : t('career.writeBulletsWithAi')}
                </Button>
              </div>
              <Textarea id={`projects-${p.id}-description`} rows={3} value={p.description} onChange={(e) => upd('projects', p.id, 'description', e.target.value)} />
            </div>
          </div>
        ))}
        <Button variant="outline" className="w-full border-dashed" onClick={() => setData((d) => ({ ...d, projects: [...d.projects, { id: newId(), name: '', link: '', dates: '', description: '' }] }))}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />{t('career.rbAddProject')}
        </Button>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">{t('career.rbCertificates')}</h3>
        {data.certificates.map((c) => (
          <div key={c.id} className={card}>
            {remove('certificates', c.id, t('career.rbRemoveCertificate'))}
            <div className="grid grid-cols-1 gap-3 pr-8 sm:grid-cols-2">
              {field('certificates', c.id, 'name', t('career.rbCertificateName'), c.name)}
              {field('certificates', c.id, 'issuer', t('career.rbIssuer'), c.issuer)}
              {field('certificates', c.id, 'date', t('career.rbDate'), c.date)}
              {field('certificates', c.id, 'link', t('career.rbLink'), c.link)}
            </div>
          </div>
        ))}
        <Button variant="outline" className="w-full border-dashed" onClick={() => setData((d) => ({ ...d, certificates: [...d.certificates, { id: newId(), name: '', issuer: '', date: '', link: '' }] }))}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />{t('career.rbAddCertificate')}
        </Button>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">{t('career.rbAchievements')}</h3>
        {data.achievements.map((a) => (
          <div key={a.id} className={card}>
            {remove('achievements', a.id, t('career.rbRemoveAchievement'))}
            <div className="grid grid-cols-1 gap-3 pr-8 sm:grid-cols-2">
              {field('achievements', a.id, 'title', t('career.rbAchievementTitle'), a.title)}
              {field('achievements', a.id, 'date', t('career.rbDate'), a.date)}
              <div className="sm:col-span-2">{field('achievements', a.id, 'detail', t('career.rbDetail'), a.detail)}</div>
            </div>
          </div>
        ))}
        <Button variant="outline" className="w-full border-dashed" onClick={() => setData((d) => ({ ...d, achievements: [...d.achievements, { id: newId(), title: '', detail: '', date: '' }] }))}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />{t('career.rbAddAchievement')}
        </Button>
      </section>
    </>
  )
}

/** Projects / certificates / achievements on the visual templates (appended under the template body). */
export function ExtrasPreview({ data }: { data: ResumeBuilderData }) {
  const { t } = useT()
  const has = data.projects.some((p) => p.name) || data.certificates.some((c) => c.name) || data.achievements.some((a) => a.title)
  if (!has) return null
  return (
    <div className="space-y-6 border-t border-slate-200 px-10 py-8 text-slate-800">
      <Blocks data={data} headingCls="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500" labels={{ projects: t('career.rbProjects'), certificates: t('career.rbCertificates'), achievements: t('career.rbAchievements') }} />
    </div>
  )
}

function Blocks({ data, headingCls, labels }: { data: ResumeBuilderData; headingCls: string; labels: { projects: string; certificates: string; achievements: string } }) {
  return (
    <>
      {data.projects.some((p) => p.name) ? (
        <section>
          <h2 className={headingCls}>{labels.projects}</h2>
          <div className="space-y-3">
            {data.projects.filter((p) => p.name).map((p) => (
              <div key={p.id}>
                <p className="text-sm font-bold">{[p.name, p.dates].filter(Boolean).join(' · ')}</p>
                {p.link ? <p className="break-all text-xs text-slate-500">{p.link}</p> : null}
                {p.description ? <p className="whitespace-pre-wrap text-sm text-slate-700">{p.description}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {data.certificates.some((c) => c.name) ? (
        <section>
          <h2 className={headingCls}>{labels.certificates}</h2>
          <ul className="space-y-1 text-sm text-slate-700">
            {data.certificates.filter((c) => c.name).map((c) => <li key={c.id}>{[c.name, c.issuer, c.date].filter(Boolean).join(' · ')}</li>)}
          </ul>
        </section>
      ) : null}
      {data.achievements.some((a) => a.title) ? (
        <section>
          <h2 className={headingCls}>{labels.achievements}</h2>
          <ul className="space-y-1 text-sm text-slate-700">
            {data.achievements.filter((a) => a.title).map((a) => <li key={a.id}>{[a.title, a.date].filter(Boolean).join(' · ')}{a.detail ? ` — ${a.detail}` : ''}</li>)}
          </ul>
        </section>
      ) : null}
    </>
  )
}

/** The ATS-friendly template: one column, plain headings, no graphics, reading order = parse order. */
export function AtsTemplate({ data }: { data: ResumeBuilderData }) {
  const { t } = useT()
  const h = 'mb-2 mt-5 border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-wide text-slate-900'
  const contact = [data.personal.email, data.personal.phone, data.personal.location].filter(Boolean).join(' | ')
  const links = [data.personal.linkedin, data.personal.portfolio].filter(Boolean).join(' | ')
  return (
    <div className="p-10 font-sans text-slate-900">
      <h1 className="text-2xl font-bold">{data.personal.fullName || t('career.yourName')}</h1>
      {data.targetRole ? <p className="text-base">{data.targetRole}</p> : null}
      {contact ? <p className="text-sm">{contact}</p> : null}
      {links ? <p className="break-all text-sm">{links}</p> : null}
      {data.summary ? <><h2 className={h}>{t('career.professionalSummary')}</h2><p className="whitespace-pre-wrap text-sm">{data.summary}</p></> : null}
      {data.experience.length ? (
        <>
          <h2 className={h}>{t('career.experience')}</h2>
          <div className="space-y-3">
            {data.experience.map((e) => (
              <div key={e.id}>
                <p className="text-sm font-bold">{[e.role, e.company, e.dates].filter(Boolean).join(' | ')}</p>
                <p className="whitespace-pre-wrap text-sm">{e.description}</p>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <Blocks data={{ ...data, certificates: [], achievements: [] }} headingCls={h} labels={{ projects: t('career.rbProjects'), certificates: '', achievements: '' }} />
      {data.education.length ? (
        <>
          <h2 className={h}>{t('career.education')}</h2>
          <ul className="space-y-1 text-sm">{data.education.map((e) => <li key={e.id}>{[e.degree, e.institution, e.dates].filter(Boolean).join(' | ')}</li>)}</ul>
        </>
      ) : null}
      {data.skills ? <><h2 className={h}>{t('career.skills')}</h2><p className="text-sm">{data.skills}</p></> : null}
      <Blocks data={{ ...data, projects: [] }} headingCls={h} labels={{ projects: '', certificates: t('career.rbCertificates'), achievements: t('career.rbAchievements') }} />
    </div>
  )
}
