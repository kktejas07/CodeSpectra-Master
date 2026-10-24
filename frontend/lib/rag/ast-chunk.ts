/**
 * Code-aware chunking for the knowledge index (pure, no I/O, zero deps).
 *
 * Splits source code by function/class/method boundaries instead of raw line
 * count. Each chunk carries the symbol name so the hit tells the user exactly
 * which function matched. Falls back to the markdown chunker for languages
 * it doesn't recognise.
 *
 * ponytail: regex + brace/indent counting covers JS/TS/Python/Java/C/C++/
 * Go/Rust/C#/Ruby/PHP — 90%+ of contest submissions. If we ever need full
 * syntax-tree accuracy, swap in web-tree-sitter with compatible WASM grammars
 * (the web-tree-sitter 0.27.x ↔ tree-sitter-wasms 0.1.x mismatch that
 * blocked us lives here). The interface stays the same.
 */
import { chunkHeader, CHARS_PER_TOKEN, DEFAULT_CHUNK_TOKENS, DEFAULT_OVERLAP_TOKENS, MAX_CHUNKS_PER_SOURCE, type ChunkOptions, type TextChunk } from './chunk'

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

export type CodeLang =
  | 'javascript' | 'typescript' | 'python' | 'java' | 'c' | 'cpp'
  | 'csharp' | 'go' | 'rust' | 'ruby' | 'php' | 'kotlin' | 'swift'

const EXT_MAP: Record<string, CodeLang> = {
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.py': 'python', '.pyw': 'python',
  '.java': 'java',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.hh': 'cpp',
  '.cs': 'csharp',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.swift': 'swift',
}

/** Detect language from a file path's extension. */
export function detectLang(filePath: string): CodeLang | null {
  const dot = filePath.lastIndexOf('.')
  if (dot < 0) return null
  return EXT_MAP[filePath.slice(dot).toLowerCase()] ?? null
}

/** Languages that use braces for blocks vs indentation (Python, Ruby). */
function usesBraces(lang: CodeLang): boolean {
  return lang !== 'python' && lang !== 'ruby'
}

// ---------------------------------------------------------------------------
// Symbol boundary detection
// ---------------------------------------------------------------------------

/** A top-level code symbol (function, class, method). */
export interface CodeSymbol {
  kind: 'function' | 'class' | 'method' | 'module' | 'block'
  name: string
  startLine: number
  endLine: number
  text: string
}

// Patterns that start a top-level symbol (line must be at indent 0 or class-level).
// Order: class before function so `class Foo` beats `Foo()`.

const BRACE_SYMBOL_RE = [
  // Classes
  /^(?:export\s+)?(?:abstract\s+)?(?:public\s+|private\s+|protected\s+)?(?:static\s+)?class\s+(\w+)/,
  /^(?:pub\s+)?(?:struct|enum|trait|impl)\s+(\w+)/,                 // Rust
  /^type\s+(\w+)\s+struct\b/,                                        // Go struct
  /^(?:interface|type)\s+(\w+)/,                                      // TS/Java interface
  // Functions / methods
  /^(?:export\s+)?(?:export\s+default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)/,
  /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/,                             // Rust
  /^func\s+(?:\([^)]*\)\s+)?(\w+)/,                                  // Go
  /^(?:public|private|protected|static|\s)*\s*(?:[\w<>\[\]]+)\s+(\w+)\s*\(/,  // Java/C#/C++ methods
  /^(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>/,  // arrow fn
]

const PYTHON_SYMBOL_RE = [
  /^class\s+(\w+)/,
  /^(?:async\s+)?def\s+(\w+)/,
]

/**
 * Extract top-level symbols from source code by tracking brace depth
 * (or indentation for Python).
 */
export function extractSymbols(code: string, lang: CodeLang): CodeSymbol[] {
  const lines = code.split('\n')
  const symbols: CodeSymbol[] = []

  if (usesBraces(lang)) {
    extractBraceSymbols(lines, lang, symbols)
  } else if (lang === 'python') {
    extractPythonSymbols(lines, symbols)
  } else {
    // Ruby: indent-based but uses `end` keywords
    extractEndKeywordSymbols(lines, symbols)
  }

  return symbols
}

function extractBraceSymbols(lines: string[], lang: CodeLang, out: CodeSymbol[]): void {
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trimStart()

    // Skip comments and blank lines
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      i++
      continue
    }

    // Check for symbol start (only at low indent — 0 or 1 level)
    const indent = line.length - trimmed.length
    if (indent <= 4) {
      let matched = false
      const patterns = BRACE_SYMBOL_RE
      for (const re of patterns) {
        const m = re.exec(trimmed)
        if (m) {
          const name = m[1] || 'anonymous'
          const kind = /class|struct|enum|trait|impl|interface|type/.test(trimmed) ? 'class' as const : 'function' as const
          const startLine = i

          // Find the matching closing brace
          let braceDepth = 0
          let foundOpen = false
          let endLine = i

          for (let j = i; j < lines.length; j++) {
            const l = lines[j]
            // Count braces outside of strings/comments (simplified)
            for (const ch of l) {
              if (ch === '{') { braceDepth++; foundOpen = true }
              else if (ch === '}') braceDepth--
            }
            if (foundOpen && braceDepth <= 0) {
              endLine = j
              break
            }
            // Fallback: if no opening brace found within 3 lines, it's a one-liner or declaration
            if (j - i > 2 && !foundOpen) {
              endLine = j
              break
            }
            endLine = j
          }

          const text = lines.slice(startLine, endLine + 1).join('\n')
          out.push({ kind, name, startLine, endLine, text })
          i = endLine + 1
          matched = true
          break
        }
      }
      if (matched) continue
    }

    i++
  }
}

function extractPythonSymbols(lines: string[], out: CodeSymbol[]): void {
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trimStart()
    const indent = line.length - trimmed.length

    // Top-level Python symbols: indent 0
    if (indent === 0 && trimmed) {
      for (const re of PYTHON_SYMBOL_RE) {
        const m = re.exec(trimmed)
        if (m) {
          const name = m[1]
          const kind = trimmed.startsWith('class') ? 'class' as const : 'function' as const
          const startLine = i

          // Find end: next line at indent 0 that isn't blank or a decorator
          let endLine = i
          for (let j = i + 1; j < lines.length; j++) {
            const nextLine = lines[j]
            const nextTrimmed = nextLine.trimStart()
            const nextIndent = nextLine.length - nextTrimmed.length
            if (nextTrimmed && nextIndent === 0 && !nextTrimmed.startsWith('#') && !nextTrimmed.startsWith('@')) {
              endLine = j - 1
              break
            }
            endLine = j
          }
          // Trim trailing blank lines
          while (endLine > startLine && !lines[endLine].trim()) endLine--

          out.push({ kind, name, startLine, endLine, text: lines.slice(startLine, endLine + 1).join('\n') })
          i = endLine + 1
          break
        }
      }
      // If no regex matched, advance manually
      const lastSym = out.length > 0 ? out[out.length - 1] : null
      if (!lastSym || i <= lastSym.endLine) {
        i++
      }
    } else {
      i++
    }
  }
}

function extractEndKeywordSymbols(lines: string[], out: CodeSymbol[]): void {
  // Ruby: class/def at indent 0, end at indent 0
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trimStart()
    const indent = line.length - trimmed.length

    if (indent === 0) {
      const classMatch = /^class\s+(\w+)/.exec(trimmed)
      const defMatch = /^def\s+(\w+)/.exec(trimmed)
      const m = classMatch || defMatch
      if (m) {
        const name = m[1]
        const kind = classMatch ? 'class' as const : 'function' as const
        const startLine = i
        let depth = 1
        let endLine = i
        for (let j = i + 1; j < lines.length; j++) {
          const t = lines[j].trimStart()
          if (/^(class|def|module|if|unless|while|until|for|case|begin|do)\b/.test(t)) depth++
          if (/^end\b/.test(t)) {
            depth--
            if (depth <= 0) { endLine = j; break }
          }
          endLine = j
        }
        out.push({ kind, name, startLine, endLine, text: lines.slice(startLine, endLine + 1).join('\n') })
        i = endLine + 1
        continue
      }
    }
    i++
  }
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/**
 * Chunk source code by function/class boundaries.
 *
 * Small symbols are packed together (like the markdown chunker); large ones
 * are split at statement boundaries. Every chunk's header includes the symbol
 * name so the search hit tells the user exactly what matched.
 *
 * @param title   Source title (e.g. "repo:acme/widget/src/auth.ts")
 * @param code    Raw source code
 * @param lang    Detected language
 * @param opts    Standard chunk options
 */
export function chunkCode(
  title: string,
  code: string,
  lang: CodeLang,
  opts: ChunkOptions = {},
): TextChunk[] {
  const maxChars = Math.max(200, (opts.maxTokens ?? DEFAULT_CHUNK_TOKENS) * CHARS_PER_TOKEN)
  const overlapChars = Math.max(0, Math.min(maxChars / 2, (opts.overlapTokens ?? DEFAULT_OVERLAP_TOKENS) * CHARS_PER_TOKEN))
  const symbols = extractSymbols(code, lang)

  // If no symbols found, fall back to line-based splitting
  if (symbols.length === 0) {
    return fallbackLineChunk(title, code, maxChars, overlapChars)
  }

  const chunks: TextChunk[] = []
  let buf: { name: string; text: string }[] = []
  let bufLen = 0

  const emit = (sectionName: string) => {
    if (!buf.length) return
    const body = buf.map((b) => b.text).join('\n\n')
    const names = [...new Set(buf.map((b) => b.name))]
    const section = names.length === 1 ? [names[0]] : names
    const header = chunkHeader(title, section)
    chunks.push({ index: chunks.length, text: `${header}\n\n${body}`, body, section })
    buf = []
    bufLen = 0
  }

  // Also capture inter-symbol code (imports, constants, etc.)
  const lines = code.split('\n')
  let lastEnd = -1

  for (const sym of symbols) {
    if (chunks.length >= MAX_CHUNKS_PER_SOURCE) break

    // Capture any code between symbols (imports, constants)
    if (sym.startLine > lastEnd + 1) {
      const gap = lines.slice(lastEnd + 1, sym.startLine).join('\n').trim()
      if (gap && gap.length > 20) {
        if (bufLen + gap.length > maxChars) emit('preamble')
        buf.push({ name: '(module)', text: gap })
        bufLen += gap.length
      }
    }
    lastEnd = sym.endLine

    // If this symbol is too large, split it
    if (sym.text.length > maxChars) {
      emit(sym.name) // flush current buffer
      const subChunks = splitLargeSymbol(sym, maxChars - overlapChars)
      for (const sub of subChunks) {
        if (chunks.length >= MAX_CHUNKS_PER_SOURCE) break
        const header = chunkHeader(title, [sym.name])
        chunks.push({ index: chunks.length, text: `${header}\n\n${sub}`, body: sub, section: [sym.name] })
      }
      continue
    }

    // Pack small symbols together
    if (bufLen + sym.text.length + 2 > maxChars) {
      emit(sym.name)
    }
    buf.push({ name: sym.name, text: sym.text })
    bufLen += sym.text.length + 2
  }

  // Trailing code after last symbol
  if (lastEnd < lines.length - 1) {
    const trailing = lines.slice(lastEnd + 1).join('\n').trim()
    if (trailing && trailing.length > 20) {
      if (bufLen + trailing.length > maxChars) emit('trailing')
      buf.push({ name: '(module)', text: trailing })
      bufLen += trailing.length
    }
  }

  if (chunks.length < MAX_CHUNKS_PER_SOURCE) emit('final')
  return chunks
}

/** Split a large symbol at blank lines or statement boundaries. */
function splitLargeSymbol(sym: CodeSymbol, maxChars: number): string[] {
  const lines = sym.text.split('\n')
  const parts: string[] = []
  let buf: string[] = []
  let bufLen = 0

  for (const line of lines) {
    if (bufLen + line.length + 1 > maxChars && buf.length > 0) {
      parts.push(buf.join('\n'))
      buf = []
      bufLen = 0
    }
    buf.push(line)
    bufLen += line.length + 1
  }
  if (buf.length) parts.push(buf.join('\n'))
  return parts
}

/** Fallback: split code into even-sized line chunks when no symbols are detected. */
function fallbackLineChunk(title: string, code: string, maxChars: number, _overlapChars: number): TextChunk[] {
  const lines = code.split('\n')
  const chunks: TextChunk[] = []
  let buf: string[] = []
  let bufLen = 0

  for (const line of lines) {
    if (bufLen + line.length + 1 > maxChars && buf.length > 0) {
      const body = buf.join('\n')
      const header = chunkHeader(title, [])
      chunks.push({ index: chunks.length, text: `${header}\n\n${body}`, body, section: [] })
      buf = []
      bufLen = 0
      if (chunks.length >= MAX_CHUNKS_PER_SOURCE) break
    }
    buf.push(line)
    bufLen += line.length + 1
  }
  if (buf.length && chunks.length < MAX_CHUNKS_PER_SOURCE) {
    const body = buf.join('\n')
    const header = chunkHeader(title, [])
    chunks.push({ index: chunks.length, text: `${header}\n\n${body}`, body, section: [] })
  }
  return chunks
}
