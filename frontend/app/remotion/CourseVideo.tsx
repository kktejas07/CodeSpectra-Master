import React from 'react'
import { Sequence, Audio, AbsoluteFill } from 'remotion'
import { CourseSlide } from './CourseSlide'
import { CodeTypingScene } from './scenes/CodeTypingScene'
import { ArrayWalkScene } from './scenes/ArrayWalkScene'
import { BarSortScene } from './scenes/BarSortScene'
import { TreeBuildScene } from './scenes/TreeBuildScene'

export interface ScriptItem {
  id: string
  title: string
  content: string[] | string
  durationInFrames: number
  type?: string
  visual?: string
  code?: string
  codeLanguage?: string
  audioUrl?: string | null
  spokenText?: string
}

export interface CourseVideoProps {
  script: ScriptItem[]
  audioUrl?: string | null
}

const DEFAULT_ARRAY = [4, 8, 15, 16, 23, 42, 50, 61, 73, 89]
const DEFAULT_SORT = [8, 3, 7, 1, 5, 2, 9, 4]
const DEFAULT_TREE = [
  { id: 'a', value: 8, x: 960, y: 80 },
  { id: 'b', value: 4, x: 640, y: 220, parent: 'a' },
  { id: 'c', value: 12, x: 1280, y: 220, parent: 'a' },
  { id: 'd', value: 2, x: 500, y: 360, parent: 'b' },
  { id: 'e', value: 6, x: 780, y: 360, parent: 'b' },
  { id: 'f', value: 10, x: 1140, y: 360, parent: 'c' },
  { id: 'g', value: 14, x: 1420, y: 360, parent: 'c' },
]

function bullets(content: ScriptItem['content']): string[] {
  if (Array.isArray(content)) return content.map(c => String(c || '')).filter(Boolean)
  if (typeof content === 'string' && content.trim()) return [content]
  return []
}

export function visualKind(item: ScriptItem): 'array' | 'sort' | 'tree' | null {
  if (item.type !== 'visual' && item.type !== 'diagram') return null
  const explicit = String(item.visual || '').toLowerCase()
  if (explicit === 'array' || explicit === 'sort' || explicit === 'tree') return explicit
  const t = `${item.title || ''} ${item.id || ''}`.toLowerCase()
  if (/tree|bst|heap|graph/.test(t)) return 'tree'
  if (/sort|bubble|merge|quick/.test(t)) return 'sort'
  return 'array'
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
        const visual = visualKind(item)

        return (
          <Sequence key={item.id || start} from={start} durationInFrames={frames}>
            {!audioUrl && item.audioUrl ? <Audio src={item.audioUrl} /> : null}
            {visual === 'sort' ? (
              <BarSortScene title={item.title} initialArray={DEFAULT_SORT} algorithm="bubble" />
            ) : visual === 'tree' ? (
              <TreeBuildScene title={item.title} nodes={DEFAULT_TREE} highlightPath={['a', 'b', 'e']} />
            ) : visual === 'array' ? (
              <ArrayWalkScene title={item.title} array={DEFAULT_ARRAY} target={23} explanation={points[0]} />
            ) : isCode ? (
              <CodeTypingScene
                language={item.codeLanguage || 'javascript'}
                code={item.code || ''}
                title={item.title}
                explanation={points[0]}
              />
            ) : (
              <CourseSlide title={item.title} content={points} variant={isTitle ? 'title' : 'concept'} />
            )}
            <AbsoluteFill style={{ pointerEvents: 'none' }}>
              <div style={{
                position: 'absolute', left: 48, bottom: 28, color: '#94a3b8',
                fontSize: 22, fontFamily: 'system-ui, sans-serif', letterSpacing: 0.4,
              }}>
                CodeSpectra
              </div>
            </AbsoluteFill>
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
