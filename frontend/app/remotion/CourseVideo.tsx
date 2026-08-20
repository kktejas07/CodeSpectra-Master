'use client'

import React from 'react'
import { Composition, Sequence, Audio, Internals } from 'remotion'
import { CourseSlide } from './CourseSlide'

export interface ScriptItem {
  id: string
  title: string
  content: string[]
  durationInFrames: number
}

export interface CourseVideoProps {
  script: ScriptItem[]
  audioUrl?: string | null
}

const defaultPlaybackRate = {
  playbackRate: 1,
  setPlaybackRate: () => {},
}

// Internal composition that orchestrates multiple slides
export const CourseVideoComposition: React.FC<CourseVideoProps> = ({ script, audioUrl }) => {
  let currentTime = 0

  return (
    <div style={{ flex: 1, backgroundColor: '#0f172a' }}>
      {audioUrl && (
        <Internals.PlaybackRateContext.Provider value={defaultPlaybackRate}>
          <Internals.BufferingProvider>
            <Audio src={audioUrl} />
          </Internals.BufferingProvider>
        </Internals.PlaybackRateContext.Provider>
      )}
      
      {script.map((item) => {
        const start = currentTime
        currentTime += item.durationInFrames
        
        return (
          <Sequence key={item.id} from={start} durationInFrames={item.durationInFrames}>
            <CourseSlide title={item.title} content={item.content} />
          </Sequence>
        )
      })}
    </div>
  )
}
