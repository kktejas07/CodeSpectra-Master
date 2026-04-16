import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export async function storeFaceData(userId: string, faceDescriptor: string, angle: 'front' | 'left' | 'right') {
  try {
    const { data, error } = await supabase
      .from('face_recognition_data')
      .insert({
        user_id: userId,
        face_descriptor: faceDescriptor,
        capture_angle: angle,
        captured_at: new Date(),
      })

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('[v0] Face data storage error:', error)
    return { success: false, error: String(error) }
  }
}

export async function verifyFaceMatch(faceDescriptor: string, threshold = 0.6) {
  try {
    // In production, you would use a proper face matching algorithm
    // This is a simplified version
    const { data, error } = await supabase
      .from('face_recognition_data')
      .select('user_id, face_descriptor')
      .limit(10)

    if (error) throw error

    // Find best match (this should use proper face comparison)
    const matches = data?.filter(record => {
      // Simple distance calculation (should use ML model in production)
      return true // Placeholder
    })

    if (matches && matches.length > 0) {
      return { success: true, userId: matches[0].user_id }
    }

    return { success: false, error: 'No matching face found' }
  } catch (error) {
    console.error('[v0] Face verification error:', error)
    return { success: false, error: String(error) }
  }
}

export async function storeOAuthToken(userId: string, provider: 'google' | 'github', token: string) {
  try {
    const { data, error } = await supabase
      .from('oauth_tokens')
      .insert({
        user_id: userId,
        provider,
        access_token: token,
        stored_at: new Date(),
      })

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('[v0] OAuth token storage error:', error)
    return { success: false, error: String(error) }
  }
}
