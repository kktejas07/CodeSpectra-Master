'use client'

import React from 'react'
import { Sequence, Audio, AbsoluteFill } from 'remotion'
import { CourseSlide } from './CourseSlide'
import { CodeTypingScene } from './scenes/CodeTypingScene'

export interface ScriptItem {
  id: string
  title: string
  content: string[] | string
  durationInFrames: number
  type?: string
  code?: string
  codeLanguage?: string
  audioUrl?: string | null
  spokenText?: string
}

export interface CourseVideoProps {
  script: ScriptItem[]
  audioUrl?: string | null
}

function bullets(content: ScriptItem['content']): string[] {
  if (Array.isArray(content)) return content.map(c => String(c || '')).filter(Boolean)
  if (typeof content === 'string' && content.trim()) return [content]
  return []
}

export const CourseVideoComposition: React.FC<CourseVideoProps> = ({ script, audioUrl }) => {
  let currentTime = 0
  const items = Array.isArray(script) ? script : []

  return (
    <AbsoluteFill style={{ backgroundColor: '#0f172a' }}>
      {audioUrl ? <Audio src={audioUrl} /> : null}

      {items.map((item) => {
        const frames = Math.max(30, item.durationInFrames || 0)
        const start = currentTime
        currentTime += frames
        const points = bullets(item.content)
        const isCode = item.type === 'code' && item.code
        const isTitle = item.type === 'title' || start === 0

        return (
          <Sequence key={item.id || start} from={start} durationInFrames={frames}>
            {!audioUrl && item.audioUrl ? <Audio src={item.audioUrl} /> : null}
            {isCode ? (
              <CodeTypingScene
                language={item.codeLanguage || 'javascript'}
                code={item.code || ''}
                title={item.title}
                explanation={points[0]}
              />
            ) : (
              <CourseSlide title={item.title} content={points} variant={isTitle ? 'title' : 'concept'} />
            )}
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
