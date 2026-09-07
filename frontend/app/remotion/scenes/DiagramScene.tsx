import React, { useEffect, useSyncExternalStore } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'

export type DiagramKind = 'flow' | 'icons' | 'compare'

type Props = {
  title: string
  content: string[]
  kind?: DiagramKind
  mermaid?: string
}

// ── mermaid SVG cache ────────────────────────────────────────────────
const svgCache = new Map<string, string>()
let mermaidReady = false
let mermaidPromise: Promise<void> | null = null
const cacheListeners = new Set<() => void>()

function ensureMermaid() {
  if (mermaidReady || mermaidPromise) return mermaidPromise!
  mermaidPromise = import('mermaid').then(m => {
    m.default.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' })
    mermaidReady = true
  })
  return mermaidPromise
}

function subscribeCache(cb: () => void) {
  cacheListeners.add(cb)
  return () => { cacheListeners.delete(cb) }
}

function emitCacheChange() {
  cacheListeners.forEach(l => l())
}

/** Render mermaid code to SVG. Returns cached result on subsequent frames. */
function renderMermaid(code: string): string | null {
  const cached = svgCache.get(code)
  if (cached !== undefined) return cached || null

  // Kick off async render; component will re-render when cache populates
  ensureMermaid().then(async () => {
    if (svgCache.has(code)) return
    try {
      const id = `mermaid-${svgCache.size}-${Date.now()}`
      const { svg } = await import('mermaid').then(m => m.default.render(id, code))
      svgCache.set(code, svg)
    } catch {
      svgCache.set(code, '') // mark as failed so we don't retry
    }
    emitCacheChange()
  })

  return null
}

/** Unstop-style center diagram: boxes + arrows / icon cards — no external images.
 *  When `mermaid` prop is provided and parses to valid SVG, renders real
 *  Mermaid diagrams (flowcharts, sequences). Falls back to bullet boxes on
 *  failure or while the async SVG render is in progress. */
export const DiagramScene: React.FC<Props> = ({ title, content, kind = 'flow', mermaid }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const fade = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' })
  const items = (Array.isArray(content) ? content : []).map(c => String(c || '').trim()).filter(Boolean)
  const labels = items.length ? items.slice(0, 4) : [String(title || '').trim() || 'Overview']

  // useSyncExternalStore re-renders component when svgCache changes
  const svg = useSyncExternalStore(
    subscribeCache,
    () => (mermaid ? svgCache.get(mermaid) ?? null : null),
  )

  // Kick off async mermaid→SVG render (once per unique code; cached)
  useEffect(() => {
    if (mermaid) renderMermaid(mermaid)
  }, [mermaid])
  const svgReady = svg != null && svg.length > 0

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0b1b3a',
        fontFamily: 'system-ui, sans-serif',
        color: 'white',
        padding: '56px 72px',
        opacity: fade,
      }}
    >
      <h1 style={{ fontSize: 56, fontWeight: 800, color: '#facc15', margin: 0, maxWidth: '90%' }}>{title}</h1>
      <p style={{ fontSize: 28, color: '#cbd5e1', marginTop: 16, maxWidth: '85%' }}>
        {labels[0]}
      </p>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 24,
        }}
      >
        {mermaid && svgReady ? (
          <MermaidSvg svg={svg!} frame={frame} />
        ) : kind === 'compare' ? (
          <Compare labels={labels} frame={frame} fps={fps} />
        ) : kind === 'icons' ? (
          <IconGrid labels={labels} frame={frame} fps={fps} />
        ) : (
          <FlowRow labels={labels.slice(0, 3)} frame={frame} fps={fps} />
        )}
      </div>

      <div style={{ position: 'absolute', left: 48, bottom: 28, color: '#94a3b8', fontSize: 22 }}>
        CodeSpectra
      </div>
    </AbsoluteFill>
  )
}

function MermaidSvg({ svg, frame }: { svg: string; frame: number }) {
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <div
      style={{
        opacity,
        width: '100%',
        maxWidth: 1100,
        display: 'flex',
        justifyContent: 'center',
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

function FlowRow({ labels, frame, fps }: { labels: string[]; frame: number; fps: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
      {labels.map((label, i) => {
        const enter = interpolate(frame - i * 8, [0, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        return (
          <React.Fragment key={label + i}>
            <Box label={label} opacity={enter} accent={i === 1 ? '#38bdf8' : '#1e3a5f'} />
            {i < labels.length - 1 ? (
              <svg width="64" height="28" style={{ opacity: enter }}>
                <defs>
                  <marker id={`arrow-${i}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="#facc15" />
                  </marker>
                </defs>
                <line x1="0" y1="14" x2="52" y2="14" stroke="#facc15" strokeWidth="4" markerEnd={`url(#arrow-${i})`} />
              </svg>
            ) : null}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function IconGrid({ labels, frame, fps }: { labels: string[]; frame: number; fps: number }) {
  const icons = ['⚙', '🗄', '📡', '🛡']
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, width: 900 }}>
      {labels.slice(0, 4).map((label, i) => {
        const enter = interpolate(frame - i * 6, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        return (
          <div
            key={label + i}
            style={{
              opacity: enter,
              background: '#122447',
              border: '2px solid #334155',
              borderRadius: 20,
              padding: '28px 32px',
              display: 'flex',
              alignItems: 'center',
              gap: 20,
            }}
          >
            <div style={{ fontSize: 48, width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b1b3a', borderRadius: 16 }}>
              {icons[i % icons.length]}
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: '#e2e8f0' }}>{label}</div>
          </div>
        )
      })}
    </div>
  )
}

function Compare({ labels, frame, fps }: { labels: string[]; frame: number; fps: number }) {
  const left = labels[0] || 'Before'
  const right = labels[1] || 'After'
  const enter = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <div style={{ display: 'flex', gap: 40, opacity: enter, width: '100%', justifyContent: 'center' }}>
      <Box label={left} opacity={1} accent="#1e3a5f" wide />
      <div style={{ fontSize: 42, color: '#facc15', fontWeight: 800, alignSelf: 'center' }}>→</div>
      <Box label={right} opacity={1} accent="#0e7490" wide />
    </div>
  )
}

function Box({
  label,
  opacity,
  accent,
  wide,
}: {
  label: string
  opacity: number
  accent: string
  wide?: boolean
}) {
  return (
    <div
      style={{
        opacity,
        minWidth: wide ? 320 : 200,
        maxWidth: wide ? 420 : 260,
        background: accent,
        borderRadius: 18,
        border: '2px solid #475569',
        padding: '36px 28px',
        textAlign: 'center',
        fontSize: 28,
        fontWeight: 700,
        color: '#f8fafc',
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
      }}
    >
      {label}
    </div>
  )
}
