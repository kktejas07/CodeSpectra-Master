/**
 * Generate the illustrated cover for every course that is currently falling
 * back to the typographic poster (no matching subject art).
 *
 *   npx tsx scripts/generate-course-covers.ts --dry-run
 *   npx tsx scripts/generate-course-covers.ts --apply [--limit 5] [--course-id c-beginner]
 *
 * Art is stored in `course_covers` and served by /api/courses/[id]/cover with an
 * immutable cache. Idempotent: a course that already has art is skipped unless
 * --force is passed. Paced (~5 s between generations) because the keyless
 * generator throttles bursts.
 */
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()

import { buildArtPrompt, generateArt, normaliseArt, saveCourseArt, seedFor, hasCourseArt, deleteCourseArt } from '../lib/courses/course-cover-art'
import { effectiveCourseCover } from '../lib/courses/course-images'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const has = (n: string) => process.argv.includes(`--${n}`)

async function main() {
  const { getMongoDb } = await import('../lib/mongodb')
  const db = await getMongoDb()
  const one = arg('course-id')
  const limit = Number(arg('limit') || 0)
  const force = has('force')
  const apply = has('apply')

  const courses = await db.collection('courses').find(one ? { id: one } : {}).toArray()
  const targets = courses.filter((c) => effectiveCourseCover(c as never).startsWith('/api/courses/'))
  console.log(`courses=${courses.length} needing art=${targets.length}${limit ? ` (limit ${limit})` : ''} apply=${apply}`)

  let done = 0
  for (const c of targets) {
    if (limit && done >= limit) break
    const id = String(c.id)
    if (!force && (await hasCourseArt(id))) {
      console.log(`  skip ${id} (has art)`)
      continue
    }
    const prompt = buildArtPrompt(c as never)
    const seed = seedFor(id)
    if (!apply) {
      console.log(`  would generate ${id}: ${prompt.slice(0, 90)}… seed=${seed}`)
      done++
      continue
    }
    if (force) await deleteCourseArt(id)
    try {
      const raw = await generateArt(prompt, seed)
      const art = await normaliseArt(raw)
      await saveCourseArt(id, art, { prompt, seed })
      console.log(`  ok ${id} ${c.title} -> ${art.length} bytes`)
      done++
    } catch (e) {
      console.log(`  FAILED ${id}: ${(e as Error).message}`)
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
  console.log(`done=${done}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
