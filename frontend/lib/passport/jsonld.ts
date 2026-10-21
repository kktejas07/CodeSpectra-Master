/**
 * JSON-LD for a PUBLIC passport (pure; tests/skill-passport.test.ts):
 * a Person with one EducationalOccupationalCredential per verified skill.
 * Never emitted for link-only passports (those are noindex).
 */
import { compact, orgId, type JsonLdObject } from '@/lib/seo/jsonld'
import { LEVEL_LABELS, type PublicSkill } from './core'

export function passportJsonLd(args: { site: string; handle: string; name: string; verifyUrl: string; issuedAt: string; skills: PublicSkill[] }): JsonLdObject {
  const url = `${args.site}/p/${args.handle}`
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${url}#person`,
    name: args.name,
    url,
    knowsAbout: args.skills.slice(0, 20).map((s) => s.skill),
    hasCredential: args.skills.slice(0, 20).map((s) => compact({
      '@type': 'EducationalOccupationalCredential',
      name: `${s.skill} — ${LEVEL_LABELS[s.level]}`,
      credentialCategory: 'Verified skill level',
      competencyRequired: s.skill,
      educationalLevel: LEVEL_LABELS[s.level],
      dateCreated: s.lastEvidenceAt,
      url: args.verifyUrl,
      recognizedBy: { '@id': orgId(args.site) },
    })),
  })
}
