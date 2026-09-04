import React from 'react'
import { useCurrentFrame, useVideoConfig, interpolate, AbsoluteFill } from 'remotion'

interface CodeTypingSceneProps {
  language: string
  code: string
  title?: string
  explanation?: string
  spokenText?: string
}

export const CodeTypingScene: React.FC<CodeTypingSceneProps> = ({ language, code, title, explanation, spokenText }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Typing animation: reveal characters over time
  const typingSpeed = 1.5 // characters per frame
  const totalChars = code.length
  const typedChars = Math.min(Math.floor(frame * typingSpeed), totalChars)
  const visibleCode = code.slice(0, typedChars)

  // Cursor blink
  const cursorVisible = Math.floor(frame / 15) % 2 === 0 && typedChars < totalChars

  // Title fade in
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })

  // Spoken text appears after typing completes
  const typingDone = typedChars >= totalChars
  const spokenOpacity = typingDone
    ? interpolate(frame - (totalChars / typingSpeed), [0, 20], [0, 1], { extrapolateRight: 'clamp' })
    : 0

  // Syntax highlighting (simple keyword-based)
  const highlightCode = (text: string) => {
    const keywords = ['int', 'void', 'return', 'if', 'else', 'for', 'while', 'class', 'public', 'private', 'static', 'const', 'auto', 'bool', 'true', 'false']
    const types = ['string', 'vector', 'map', 'set', 'pair', 'array', 'list']
    
    const parts: Array<{ text: string; color: string }> = []
    let remaining = text
    
    // Simple tokenization
    const lines = remaining.split('\n')
    const highlighted: React.ReactNode[] = []
    
    lines.forEach((line, lineIdx) => {
      const tokens = line.split(/(\s+|[{}()\[\];,.<>=!+\-*/&|])/)
      tokens.forEach((token, tokenIdx) => {
        if (keywords.includes(token)) {
          highlighted.push(<span key={`${lineIdx}-${tokenIdx}`} style={{ color: '#c084fc' }}>{token}</span>)
        } else if (types.includes(token)) {
          highlighted.push(<span key={`${lineIdx}-${tokenIdx}`} style={{ color: '#22d3ee' }}>{token}</span>)
        } else if (/^\d+$/.test(token)) {
          highlighted.push(<span key={`${lineIdx}-${tokenIdx}`} style={{ color: '#fbbf24' }}>{token}</span>)
        } else if (token.startsWith('//')) {
          highlighted.push(<span key={`${lineIdx}-${tokenIdx}`} style={{ color: '#64748b' }}>{token}</span>)
        } else if (token === '==' || token === '<=' || token === '>=' || token === '!=' || token === '=' || token === '<' || token === '>') {
          highlighted.push(<span key={`${lineIdx}-${tokenIdx}`} style={{ color: '#f472b6' }}>{token}</span>)
        } else {
          highlighted.push(<span key={`${lineIdx}-${tokenIdx}`}>{token}</span>)
        }
      })
      if (lineIdx < lines.length - 1) {
        highlighted.push(<span key={`nl-${lineIdx}`}>{'\n'}</span>)
      }
    })
    
    return highlighted
  }

  return (
    <AbsoluteFill>
    <div style={{
      width: '100%', height: '100%',
      backgroundColor: '#0f172a',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 40px',
        borderBottom: '2px solid #1e293b',
        display: 'flex', alignItems: 'center', gap: 16,
        opacity: titleOpacity,
      }}>
        <div style={{
          display: 'flex', gap: 8,
        }}>
          <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#ef4444' }} />
          <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#eab308' }} />
          <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#22c55e' }} />
        </div>
        <div style={{ fontSize: 18, color: '#64748b' }}>
          {title || `${language.toUpperCase()} example`}
        </div>
      </div>

      {/* Code area */}
      <div style={{
        flex: 1,
        padding: '40px 60px',
        display: 'flex',
        gap: 40,
      }}>
        {/* Line numbers */}
        <div style={{
          fontSize: 22,
          color: '#475569',
          fontFamily: 'monospace',
          lineHeight: 1.8,
          userSelect: 'none',
          textAlign: 'right',
          minWidth: 40,
        }}>
          {visibleCode.split('\n').map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Code */}
        <div style={{
          flex: 1,
          fontSize: 22,
          fontFamily: 'monospace',
          lineHeight: 1.8,
          color: '#e2e8f0',
          whiteSpace: 'pre-wrap',
          position: 'relative',
        }}>
          {highlightCode(visibleCode)}
          {cursorVisible && (
            <span style={{
              display: 'inline-block',
              width: 2,
              height: 24,
              backgroundColor: '#38bdf8',
              marginLeft: 2,
              verticalAlign: 'middle',
            }} />
          )}
        </div>
      </div>

      {/* Spoken text / explanation */}
      <div style={{
        padding: '20px 40px 30px',
        borderTop: '2px solid #1e293b',
        opacity: spokenOpacity,
      }}>
        <div style={{
          fontSize: 24,
          color: '#94a3b8',
          maxWidth: '80%',
          lineHeight: 1.5,
        }}>
          {explanation || spokenText}
        </div>
      </div>

      {/* Language badge */}
      <div style={{
        position: 'absolute',
        top: 80, right: 40,
        backgroundColor: '#1e293b',
        border: '2px solid #334155',
        borderRadius: 8,
        padding: '8px 16px',
        fontSize: 16, color: '#94a3b8',
        opacity: titleOpacity,
      }}>
        {language.toUpperCase()}
      </div>
    </div>
    </AbsoluteFill>
  )
}
