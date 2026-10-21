/**
 * search_talent — recruiter-scope talent search for the copilot. Same service
 * as /api/ats/talent/search (lib/talent/db.ts): only learners who opted in to
 * discovery with consent, never anyone who blocked this organisation, passport
 * summary only (no email / phone), rate limited and audited per caller.
 */
import { readTool } from '../define'
import { argsObject, optEnum, optInt, optString, optStringArray, paging } from '../args'
import { atsActorFor } from '../ats-shared'
import { ToolInputError } from '@/lib/agent/contract'
import { PASSPORT_LEVELS } from '@/lib/passport/core'
import { AVAILABILITY, talentSearchSchema } from '@/lib/talent/core'

export const searchTalentTool = readTool({
  name: 'search_talent',
  description: 'Search learners who opted in to be discoverable, by verified skill + minimum level (beginner/intermediate/advanced/expert), country, city, graduation year and availability. Returns passport summaries only — no contact details; invite them from Hiring → Talent search.',
  parameters: {
    type: 'object',
    properties: {
      skills: { type: 'array', items: { type: 'string' }, maxItems: 5, description: 'Verified skills, e.g. ["python","sql"]. All must match.' },
      min_level: { type: 'string', enum: [...PASSPORT_LEVELS] },
      country: { type: 'string', description: 'ISO two-letter country code, e.g. IN.' },
      city: { type: 'string' },
      graduation_year_min: { type: 'integer', minimum: 1970, maximum: 2100 },
      graduation_year_max: { type: 'integer', minimum: 1970, maximum: 2100 },
      availability: { type: 'string', enum: [...AVAILABILITY] },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 20 },
    },
  },
  parse(raw) {
    const r = argsObject(raw, ['skills', 'min_level', 'country', 'city', 'graduation_year_min', 'graduation_year_max', 'availability', 'page', 'limit'])
    const availability = optEnum(r, 'availability', AVAILABILITY)
    const country = optString(r, 'country', { max: 2 })
    const parsed = talentSearchSchema.safeParse({
      skills: optStringArray(r, 'skills', { maxItems: 5, maxLen: 40 }) ?? [],
      min_level: optEnum(r, 'min_level', PASSPORT_LEVELS) ?? 'beginner',
      ...(country ? { country } : {}),
      ...(optString(r, 'city', { max: 80 }) ? { city: optString(r, 'city', { max: 80 }) } : {}),
      ...(optInt(r, 'graduation_year_min', 1970, 2100) ? { graduation_year_min: optInt(r, 'graduation_year_min', 1970, 2100) } : {}),
      ...(optInt(r, 'graduation_year_max', 1970, 2100) ? { graduation_year_max: optInt(r, 'graduation_year_max', 1970, 2100) } : {}),
      ...(availability ? { availability: [availability] } : {}),
      ...paging(r, 10, 20),
    })
    if (!parsed.success) throw new ToolInputError(parsed.error.issues[0]?.message || 'Invalid search')
    return parsed.data
  },
  async run(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const { searchTalent, TalentError } = await import('@/lib/talent/db')
    try {
      const res = await searchTalent(actor, a)
      return {
        data: {
          total: res.total,
          page: res.page,
          learners: res.results.map((r) => ({ handle: r.handle, name: r.name, location: [r.city, r.country].filter(Boolean).join(', ') || null, graduation_year: r.graduation_year, availability: r.availability, match: r.match, skills: r.skills })),
          invite_from: '/dashboard/hiring/talent',
        },
      }
    } catch (e) {
      if (e instanceof TalentError) throw new ToolInputError(e.message)
      throw e
    }
  },
})
