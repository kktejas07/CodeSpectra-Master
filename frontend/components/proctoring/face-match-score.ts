'use client'

/**
 * Advisory face match between the ID photo and the live selfie, computed in
 * the browser with the face model the app already ships (@vladmandic/face-api
 * 128-d descriptors; same model files as components/auth/face-camera.tsx).
 *
 * The result is stored for reviewers only — it never accepts or rejects a
 * candidate. Euclidean distance < 0.6 is face-api's usual "same person" line.
 */

export type FaceMatchReport =
  | { status: 'compared'; distance: number }
  | { status: 'no_face_in_id' | 'no_face_in_selfie' | 'unavailable' }

const MODEL_URLS = ['/models', 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model']

type FaceApi = typeof import('@vladmandic/face-api')
let modelsReady: Promise<FaceApi> | null = null

function loadModels(): Promise<FaceApi> {
  if (!modelsReady) {
    modelsReady = (async () => {
      const faceapi = await import('@vladmandic/face-api')
      await (faceapi.tf as { ready?: () => Promise<void> }).ready?.()
      const nets = [faceapi.nets.tinyFaceDetector, faceapi.nets.faceLandmark68TinyNet, faceapi.nets.faceRecognitionNet]
      if (nets.every((n) => n.isLoaded)) return faceapi
      let lastErr: unknown = null
      for (const base of MODEL_URLS) {
        try {
          await Promise.all(nets.map((n) => (n.isLoaded ? Promise.resolve() : n.loadFromUri(base))))
          return faceapi
        } catch (e) {
          lastErr = e
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error('Face model download failed')
    })().catch((e) => {
      modelsReady = null
      throw e
    })
  }
  return modelsReady
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image could not be read'))
    img.src = src
  })
}

async function descriptorOf(faceapi: FaceApi, src: string): Promise<Float32Array | null> {
  const img = await loadImage(src)
  const result = await faceapi
    .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.3, inputSize: 416 }))
    .withFaceLandmarks(true)
    .withFaceDescriptor()
  return result?.descriptor ?? null
}

/** Compare the two photos; resolves (never rejects) within `timeoutMs`. */
export async function faceMatchScore(idPhoto: string, facePhoto: string, timeoutMs = 20_000): Promise<FaceMatchReport> {
  const work = (async (): Promise<FaceMatchReport> => {
    try {
      const faceapi = await loadModels()
      const idDesc = await descriptorOf(faceapi, idPhoto)
      if (!idDesc) return { status: 'no_face_in_id' }
      const selfieDesc = await descriptorOf(faceapi, facePhoto)
      if (!selfieDesc) return { status: 'no_face_in_selfie' }
      return { status: 'compared', distance: faceapi.euclideanDistance(idDesc, selfieDesc) }
    } catch {
      return { status: 'unavailable' }
    }
  })()
  const timeout = new Promise<FaceMatchReport>((resolve) => setTimeout(() => resolve({ status: 'unavailable' }), timeoutMs))
  return Promise.race([work, timeout])
}
