import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { getAPIUser } from '@/lib/route-auth'
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
    const dbUser = await db.collection('user').findOne({ id: user.id })

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    // Strict enforcement: if the user hasn't enrolled yet, they cannot take the exam.
    if (!dbUser.facial_biometric_template) {
      return NextResponse.json({ error: 'You must enroll your face biometrics before taking an assessment. Please go to your Profile Settings.' }, { status: 403 })
    }

    // Compare face embeddings
    const similarityScore = cosineSimilarity(descriptor, dbUser.facial_biometric_template);
    
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
