/**
 * Acquire the webcam stream for the proctoring session recorder.
 *
 * Asks for video + audio first. If the microphone is refused (user denied,
 * no mic, or a Permissions-Policy block) we fall back to video only instead of
 * recording nothing at all (audit A-004). `hasAudio` is sent with each chunk
 * so reviewers can see the recording has no sound.
 */
export interface RecordingStreamResult {
  stream: MediaStream
  hasAudio: boolean
  /** Why audio is missing (error name), when hasAudio is false. */
  audioError?: string
}

type GetUserMedia = (c: MediaStreamConstraints) => Promise<MediaStream>

export async function acquireRecordingStream(getUserMedia: GetUserMedia): Promise<RecordingStreamResult> {
  try {
    const stream = await getUserMedia({ video: true, audio: true })
    return { stream, hasAudio: stream.getAudioTracks().length > 0 }
  } catch (e) {
    const audioError = (e as { name?: string })?.name || 'Error'
    // Video-only retry. If the camera itself is refused this throws and the
    // caller records nothing (same as before).
    const stream = await getUserMedia({ video: true, audio: false })
    return { stream, hasAudio: false, audioError }
  }
}
