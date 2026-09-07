import React from 'react'
import { Sequence, Audio, AbsoluteFill } from 'remotion'
import { CourseSlide } from './CourseSlide'
import { CodeTypingScene } from './scenes/CodeTypingScene'
import { ArrayWalkScene } from './scenes/ArrayWalkScene'
import { BarSortScene } from './scenes/BarSortScene'
import { TreeBuildScene } from './scenes/TreeBuildScene'
import { DiagramScene, type DiagramKind } from './scenes/DiagramScene'

export type ScriptItem = {
  id: string
  title: string
  content: string[] | string
  durationInFrames: number
  type?: string
  visual?: string
  code?: string
  codeLanguage?: string
  mermaid?: string
  audioUrl?: string | null
  spokenText?: string
}

export type CourseVideoProps = {
  script: ScriptItem[]
  audioUrl?: string | null
} & Record<string, unknown>

export type ExtractedVisualData = {
  /** Slide-owned numbers for array/sort/tree scenes (max 10). Empty = no honest animation. */
  values: number[]
  /** Slide-owned labels: quoted identifiers from code, else short bullets (max 7). */
  labels: string[]
  /** Search target named by the slide's own narration, if any. */
  target?: number
}

// ponytail: regex extraction over slide-owned text only — never the course
// topic, never fabricated. Ceiling: only explicit numeric lists are caught;
// prose-described quantities ("five apples") are ignored → honest fallback.
const MAX_VISUAL_VALUES = 10

function parseNumberTokens(chunk: string, cap: number): number[] {
  const out: number[] = []
  for (const tok of String(chunk || '').split(/[\s,;|]+/)) {
    if (!/^-?\d+(\.\d+)?$/.test(tok)) continue
    const n = Number(tok)
    if (Number.isFinite(n) && Math.abs(n) < 1e6) out.push(n)
    if (out.length >= cap) break
  }
  return out
}

/** First explicit number list in text: a [5, 2, 9] bracket group, else a 3+ number line. */
function numbersFromText(text: string): number[] | null {
  const src = String(text || '')
  if (!src.trim()) return null
  const bracket = src.match(/\[([^\][\n]{1,300})\]/)
  if (bracket) {
    const vals = parseNumberTokens(bracket[1] || '', MAX_VISUAL_VALUES)
    if (vals.length >= 2) return vals
  }
  for (const line of src.split('\n')) {
    const vals = parseNumberTokens(line, MAX_VISUAL_VALUES)
    if (vals.length >= 3) return vals
  }
  return null
}

function identifiersFromCode(code: string): string[] {
  const src = String(code || '')
  const out: string[] = []
  const re = /['"]([A-Za-z_][A-Za-z0-9_ ]{0,24})['"]\s*:/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) && out.length < 7) {
    const label = (m[1] || '').trim()
    if (label && !out.includes(label)) out.push(label)
  }
  return out
}

function targetFromText(text: string): number | undefined {
  const m = String(text || '').match(/(?:target|search(?:ing|es)?(?: for)?|find(?:ing)?|look(?:ing)? for|index of)\D{0,30}?(-?\d+(?:\.\d+)?)/i)
  if (!m) return undefined
  const n = Number(m[1])
  return Number.isFinite(n) ? n : undefined
}

/** Data for sort/array/tree scenes, extracted ONLY from the slide's own
 * code/content/spokenText. Empty values = "no honest animation possible". */
export function extractVisualData(item: Pick<ScriptItem, 'title' | 'content' | 'code' | 'spokenText'>): ExtractedVisualData {
  const code = String(item?.code || '')
  const points = bullets(item?.content)
  const spoken = String(item?.spokenText || '')
  const values = numbersFromText(code) || numbersFromText(points.join('\n')) || numbersFromText(spoken) || []
  const quoted = identifiersFromCode(code)
  const shortBullets = points.map(p => String(p || '').trim()).filter(p => p && p.length <= 48).slice(0, 7)
  return {
    values,
    labels: quoted.length ? quoted : shortBullets,
    target: targetFromText(`${item?.title || ''}\n${spoken}\n${points.join('\n')}`),
  }
}

// ponytail: illustrative fallback ONLY when the LLM explicitly requested a
// data visual but the slide carries no numbers. Kept tiny (4 bars) so it
// reads as a generic demo, never as lesson data.
const GENERIC_DEMO = [5, 3, 8, 1]

function bullets(content: ScriptItem['content']): string[] {
  if (Array.isArray(content)) return content.map(c => String(c || '')).filter(Boolean)
  if (typeof content === 'string' && content.trim()) return [content]
  return []
}

/** Keyword guess over slide-owned text. Tree/sort/array risk a misleading
 * animation, so callers must still require extracted numbers (or an explicit
 * slide.visual) before rendering those scenes; flow/icons/compare render the
 * slide's own bullets and are always neutral. */
function kindFromText(t: string): 'array' | 'sort' | 'tree' | DiagramKind | null {
  if (/\btree\b|\btrees\b|\bbst\b|\bheap\b|\bgraph\b|nodes?|binary tree|\bdfs\b|\bbfs\b|travers/.test(t)) return 'tree'
  if (/\bsort(?:s|ed|ing)?\b|bubble|merge ?sort|merge-?sort|quick ?sort|quicksort|selection sort|insertion sort/.test(t)) return 'sort'
  if (/\bvs\b|versus|before|after|old way|new way|myth|reality|wrong|mistake|compare/.test(t)) return 'compare'
  if (/icons?|logos?|ecosystem|toolbox|features?|components?/.test(t)) return 'icons'
  if (/pipeline|workflow|architect|client|server|request|\bapi\b|data flow|\bflow\b|process|how it works|steps?/.test(t)) return 'flow'
  if (/array|lists?|linked list|binary search|linear search|\bindex\b|indices|travers|sliding window|two pointers?/.test(t)) return 'array'
  return null
}

export function visualKind(item: ScriptItem): 'array' | 'sort' | 'tree' | DiagramKind | null {
  // Explicit slide.visual from the LLM always wins.
  const explicit = String(item?.visual || '').toLowerCase()
  if (explicit === 'array' || explicit === 'sort' || explicit === 'tree') return explicit as 'array' | 'sort' | 'tree'
  if (explicit === 'flow' || explicit === 'icons' || explicit === 'compare') return explicit
  // Guess ONLY from this slide's own title+content+spokenText — never the course topic.
  const titleText = String(item?.title || '').toLowerCase()
  const hay = `${titleText}\n${bullets(item?.content).join('\n')}\n${String(item?.spokenText || '')}`.toLowerCase()
  if (item?.type === 'diagram') {
    const k = kindFromText(hay)
    if (k === 'icons' || k === 'compare' || k === 'flow') return k
    return 'flow' // diagram slides always get a neutral bullet diagram, never a data animation
  }
  if (item?.type !== 'visual') return null
  // Unknown → null (= concept fallback). A wrong animation is worse than a plain one.
  return kindFromText(titleText) || kindFromText(hay)
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
        const codeText = String(item.code || '')
        const isCode = item.type === 'code' && codeText.trim().length > 0
        const isTitle = item.type === 'title' || start === 0
        const visual = visualKind(item)
        const extracted = extractVisualData(item)
        const explicit = String(item.visual || '').toLowerCase()
        const hasExplicitDataVisual = explicit === 'array' || explicit === 'sort' || explicit === 'tree'
        // Slide-owned numbers drive the animation. Only an explicit LLM visual
        // may fall back to the tiny generic demo; guessed visuals with no data
        // fall through to the neutral diagram below — never a fake animation.
        const values = extracted.values.length >= 2
          ? extracted.values
          : hasExplicitDataVisual ? GENERIC_DEMO.slice() : []
        const canAnimate = visual === 'array' || visual === 'sort' || visual === 'tree'
          ? values.length >= 2
          : true

        return (
          <Sequence key={item.id || start} from={start} durationInFrames={frames}>
            {!audioUrl && item.audioUrl ? <Audio src={item.audioUrl} /> : null}
            {visual === 'sort' && canAnimate ? (
              <AbsoluteFill>
                <BarSortScene title={item.title} initialArray={values} algorithm="bubble" />
              </AbsoluteFill>
            ) : visual === 'tree' && canAnimate ? (
              <AbsoluteFill>
                <TreeBuildScene title={item.title} values={values} />
              </AbsoluteFill>
            ) : visual === 'array' && canAnimate ? (
              <AbsoluteFill>
                <ArrayWalkScene title={item.title} array={values} target={extracted.target ?? values[Math.floor(values.length / 2)] ?? 0} explanation={points[0]} />
              </AbsoluteFill>
            ) : visual === 'flow' || visual === 'icons' || visual === 'compare' ? (
              <DiagramScene title={item.title} content={points} kind={visual} mermaid={item.mermaid} />
            ) : visual && points.length >= 2 ? (
              <DiagramScene title={item.title} content={points} kind="flow" />
            ) : isCode ? (
              <CodeTypingScene
                language={item.codeLanguage || 'javascript'}
                code={codeText}
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
