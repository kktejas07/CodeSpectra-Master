/**
 * Résumé builder data: the one shape the builder page edits, validated at the
 * API boundary (drafts + AI). Unknown fields are dropped; strings are trimmed
 * to sane lengths so a draft can't grow without bound.
 */
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export const BUILDER_TEMPLATES = ['modern', 'minimal', 'elegant', 'professional', 'creative'] as const
export type BuilderTemplate = (typeof BUILDER_TEMPLATES)[number]

export interface ResumeBuilderData {
  personal: { fullName: string; email: string; phone: string; location: string; linkedin: string; portfolio: string }
  summary: string
  experience: { id: string; company: string; role: string; dates: string; description: string }[]
  education: { id: string; institution: string; degree: string; dates: string }[]
  skills: string
}

export interface ResumeDraftDoc {
  id: string
  user_id: string
  name: string
  template: BuilderTemplate
  data: ResumeBuilderData
  created_at: string
  updated_at: string
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const id = (v: unknown, i: number) => {
  const s = typeof v === 'string' ? v.slice(0, 40) : ''
  return /^[A-Za-z0-9_-]+$/.test(s) ? s : `item-${i}`
}

export const MAX_EXPERIENCE = 20
export const MAX_EDUCATION = 10

/** Whitelist + clamp. Returns null when the input isn't an object. */
export function sanitizeBuilderData(raw: unknown): ResumeBuilderData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const p = (r.personal && typeof r.personal === 'object' ? r.personal : {}) as Record<string, unknown>
  const exp = Array.isArray(r.experience) ? r.experience.slice(0, MAX_EXPERIENCE) : []
  const edu = Array.isArray(r.education) ? r.education.slice(0, MAX_EDUCATION) : []
  return {
    personal: {
      fullName: str(p.fullName, 120),
      email: str(p.email, 200),
      phone: str(p.phone, 40),
      location: str(p.location, 120),
      linkedin: str(p.linkedin, 300),
      portfolio: str(p.portfolio, 300),
    },
    summary: str(r.summary, 3000),
    experience: exp.map((e, i) => {
      const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>
      return {
        id: id(x.id, i),
        company: str(x.company, 160),
        role: str(x.role, 160),
        dates: str(x.dates, 80),
        description: str(x.description, 4000),
      }
    }),
    education: edu.map((e, i) => {
      const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>
      return {
        id: id(x.id, i),
        institution: str(x.institution, 160),
        degree: str(x.degree, 160),
        dates: str(x.dates, 80),
      }
    }),
    skills: str(r.skills, 2000),
  }
}

export function sanitizeTemplate(v: unknown): BuilderTemplate {
  return (BUILDER_TEMPLATES as readonly string[]).includes(String(v)) ? (v as BuilderTemplate) : 'modern'
}

let indexed: Promise<unknown> | null = null
export async function resumeDrafts(): Promise<Collection<ResumeDraftDoc>> {
  const col = (await getMongoDb()).collection<ResumeDraftDoc>('resume_drafts')
  if (!indexed) {
    indexed = Promise.all([
      col.createIndex({ id: 1 }, { unique: true, name: 'resume_drafts_id' }),
      col.createIndex({ user_id: 1, updated_at: -1 }, { name: 'resume_drafts_user_recent' }),
    ]).catch((e) => {
      indexed = null
      console.error('[resume_drafts] index build failed', e)
    })
  }
  await indexed
  return col
}
