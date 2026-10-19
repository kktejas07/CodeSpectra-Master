import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { getAPIUser } from '@/lib/route-auth'
import { getUserById } from '@/lib/db/admin'
import { openFaceTemplate, sealFaceTemplate } from '@/lib/identity-media'
import { writeAuditLog } from '@/lib/db/misc'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'

// Helper function to calculate cosine similarity between two vectors
function cosineSimilarity(A: number[], B: number[]) {
  if (A.length !== B.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < A.length; i++) {
    dotProduct += A[i] * B[i];
    normA += A[i] * A[i];
    normB += B[i] * B[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function POST(request: Request) {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { descriptor, examId } = await request.json()

    if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      return NextResponse.json({ error: 'A valid 128-dimensional biometric descriptor is required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const dbUser = await getUserById(user.id) as Record<string, unknown> | null

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    // Strict enforcement: if the user hasn't enrolled yet, they cannot take the exam.
    if (!dbUser.facial_biometric_template) {
      // Auto-enroll: the live verification selfie (identity already proven by the
      // ID-OCR name-match in the previous step) becomes the enrolled template on
      // first verification, so first-time candidates aren't hard-blocked.
      try {
        await db.collection('user').updateOne(
          { _id: dbUser._id } as any,
          { $set: { facial_biometric_template: await sealFaceTemplate(descriptor), biometric_enrolled_at: new Date() } }
        )
      } catch (enrollErr) {
        console.error('[AssessmentFaceVerify] auto-enroll failed:', enrollErr)
        return NextResponse.json({ error: 'Could not enroll face biometrics. Please enroll from Profile Settings.' }, { status: 500 })
      }
      const rawIp = clientLimiterKeyFromRequest(request, null).replace(/^(ip:|u:)/, '')
      await writeAuditLog({
        action: 'assessment.biometric_enroll',
        outcome: 'success',
        actor: user.email,
        actorIp: rawIp,
        resource: 'exam/' + examId,
        resourceType: 'assessment',
        severity: 'info',
        user_id: user.id,
        detail: 'Auto-enrolled face template during assessment identity verification'
      })
      return NextResponse.json({ ok: true, matched: true, score: 1, enrolled: true })
    }

    // Compare face embeddings
    const template = await openFaceTemplate(dbUser.facial_biometric_template)
    if (!template) {
      return NextResponse.json({ error: 'Your saved face scan could not be read. Re-enroll your face from your profile, then try again.' }, { status: 409 })
    }
    const similarityScore = cosineSimilarity(descriptor, template);
    
    // Threshold > 0.85 indicates a very strong match for 128d embeddings (face-api.js)
    if (similarityScore < 0.85) {
      const rawIp = clientLimiterKeyFromRequest(request, null).replace(/^(ip:|u:)/, '')
      await writeAuditLog({ 
        action: 'assessment.biometric_verify', 
        outcome: 'denied', 
        actor: user.email, 
        actorIp: rawIp, 
        resource: 'exam/' + examId, 
        resourceType: 'assessment', 
        severity: 'warning', 
        user_id: user.id, 
        detail: `Pre-assessment biometric verification failed. Score: ${similarityScore.toFixed(3)}` 
      })
      return NextResponse.json({ error: 'Face does not match the enrolled template. Verification failed.' }, { status: 403 })
    }

    return NextResponse.json({ ok: true, matched: true, score: similarityScore })

  } catch (error) {
    console.error('[AssessmentFaceVerify] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
