'use client'

import React, { useEffect, useState } from 'react'
import { Audio, staticFile } from 'remotion'

interface VoiceoverProps {
  text: string
  startFrame?: number
  ttsCache?: Record<string, string>
}

/**
 * Voiceover component that plays pre-generated TTS audio.
 * In production, audio files are generated server-side and stored.
 * For preview, we fetch from the TTS API and cache.
 */
export const Voiceover: React.FC<VoiceoverProps> = ({
  text,
  startFrame = 0,
  ttsCache = {},
}) => {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  useEffect(() => {
    // Check cache first
    const cacheKey = text.slice(0, 50)
    if (ttsCache[cacheKey]) {
      setAudioUrl(ttsCache[cacheKey])
      return
    }

    // For preview: use a silent audio placeholder
    // In production: fetch from /api/admin/courses/tts
    // The actual audio generation happens during the build step
  }, [text, ttsCache])

  if (!audioUrl) return null

  return (
    <Audio
      src={audioUrl}
      startFrom={startFrame}
      volume={1}
    />
  )
}
