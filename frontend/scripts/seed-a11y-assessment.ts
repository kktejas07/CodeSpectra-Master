/**
 * SEO-039: upsert a published, open demo assessment with one question of every
 * type (scripts/fixtures/a11y-assessment.ts) for the accessibility e2e. ID and
 * face checks are off so the candidate lands on the consent → question screens.
 *
 *   MONGODB_URI=… NODE_ENV=development npx tsx scripts/seed-a11y-assessment.ts
 *
 * Refuses to run against production (same guard as seed-dev-users.ts).
 */
import { MongoClient } from 'mongodb'
import { sanitizeExamQuestionList } from '@/lib/grading'
import { A11Y_EXAM_ID, a11yQuestionList } from './fixtures/a11y-assessment'

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_PROD !== '1') {
    console.error('Refusing to seed: NODE_ENV=production without ALLOW_SEED_PROD=1')
    process.exit(1)
  }
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('MONGODB_URI environment variable is required')
    process.exit(1)
  }
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db(process.env.MONGODB_DB_NAME || 'codespectra')
  const questionList = sanitizeExamQuestionList(a11yQuestionList())
  const now = new Date().toISOString()
  await db.collection('exams').updateOne(
    { id: A11Y_EXAM_ID },
    {
      $set: {
        title: 'Accessibility check: every question type',
        subject: 'Demo', level: 'Beginner', screening_type: 'mixed', duration: 120,
        questions: questionList.length, questionList,
        access_type: 'open', published: true, require_token_links: false,
        require_id_verification: false, require_face_capture: false, no_camera_policy: 'allow_flag',
        proctoring_mode: 'standard', kind: 'standard', allow_retake: true, max_attempts: 50,
        tenant_id: null, updatedAt: now,
      },
      $setOnInsert: { id: A11Y_EXAM_ID, attempts: 0, avgScore: 0, createdAt: now, created_by: 'seed' },
    },
    { upsert: true },
  )
  console.log(`  ✓ /assessment/${A11Y_EXAM_ID} — ${questionList.length} questions`)
  await client.close()
}

main().catch((err) => {
  console.error('Seed failed:', (err as Error)?.message)
  process.exit(1)
})
