/**
 * Résumé builder data: the one shape the builder page edits, validated at the
 * API boundary (drafts + AI). Unknown fields are dropped; strings are trimmed
 * to sane lengths so a draft can't grow without bound.
 */
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

import { type BuilderTemplate, type ResumeBuilderData } from '@/lib/resume/builder'

// Shape + sanitiser live in lib/resume/builder (pure, shared with the builder page and tests).
export {
  BUILDER_TEMPLATES, MAX_EDUCATION, MAX_EXPERIENCE, sanitizeBuilderData, sanitizeTemplate,
  type BuilderTemplate, type ResumeBuilderData,
} from '@/lib/resume/builder'

export interface ResumeDraftDoc {
  id: string
  user_id: string
  name: string
  template: BuilderTemplate
  data: ResumeBuilderData
  created_at: string
  updated_at: string
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
