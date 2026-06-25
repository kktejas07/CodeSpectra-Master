/**
 * Phase 7 stub — Face MFA was removed during the MongoDB migration.
 * Components that still reference these helpers are orphaned UI code.
 */
const DEAD = 'Face authentication was removed in the MongoDB migration.'

export async function storeFaceData(
  _userId: string,
  _faceDescriptor: string,
  _angle: 'front' | 'left' | 'right',
) {
  throw new Error(DEAD)
}
export async function verifyFaceMatch(_faceDescriptor: string, _threshold = 0.6) {
  throw new Error(DEAD)
}
export async function storeOAuthToken(
  _userId: string,
  _provider: 'google' | 'github',
  _token: string,
) {
  throw new Error(DEAD)
}
