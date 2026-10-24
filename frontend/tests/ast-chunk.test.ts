import { describe, it, expect } from 'vitest'
import { detectLang, extractSymbols, chunkCode, type CodeLang } from '@/lib/rag/ast-chunk'

// ---------------------------------------------------------------------------
// detectLang
// ---------------------------------------------------------------------------

describe('detectLang', () => {
  it('maps common extensions', () => {
    expect(detectLang('src/auth.ts')).toBe('typescript')
    expect(detectLang('main.py')).toBe('python')
    expect(detectLang('App.java')).toBe('java')
    expect(detectLang('lib.rs')).toBe('rust')
    expect(detectLang('main.go')).toBe('go')
    expect(detectLang('index.jsx')).toBe('javascript')
    expect(detectLang('widget.cpp')).toBe('cpp')
    expect(detectLang('style.rb')).toBe('ruby')
  })

  it('returns null for unknown extensions', () => {
    expect(detectLang('README.md')).toBeNull()
    expect(detectLang('Makefile')).toBeNull()
    expect(detectLang('data.json')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(detectLang('file.PY')).toBe('python')
    expect(detectLang('file.TS')).toBe('typescript')
  })
})

// ---------------------------------------------------------------------------
// extractSymbols — brace languages
// ---------------------------------------------------------------------------

describe('extractSymbols (brace languages)', () => {
  it('finds JS/TS functions', () => {
    const code = `
function greet(name) {
  return 'hi ' + name
}

export async function fetchData(url) {
  const res = await fetch(url)
  return res.json()
}
`.trim()
    const syms = extractSymbols(code, 'typescript')
    expect(syms).toHaveLength(2)
    expect(syms[0].name).toBe('greet')
    expect(syms[0].kind).toBe('function')
    expect(syms[1].name).toBe('fetchData')
  })

  it('finds arrow functions', () => {
    const code = `const handler = async (req, res) => {
  res.send('ok')
}`
    const syms = extractSymbols(code, 'javascript')
    expect(syms).toHaveLength(1)
    expect(syms[0].name).toBe('handler')
    expect(syms[0].kind).toBe('function')
  })

  it('finds classes', () => {
    const code = `export class UserService {
  constructor(db) {
    this.db = db
  }

  async getUser(id) {
    return this.db.find(id)
  }
}`
    const syms = extractSymbols(code, 'typescript')
    expect(syms).toHaveLength(1)
    expect(syms[0].name).toBe('UserService')
    expect(syms[0].kind).toBe('class')
    expect(syms[0].text).toContain('getUser')
  })

  it('finds Rust fns and structs', () => {
    const code = `pub struct Config {
    host: String,
    port: u16,
}

pub async fn serve(cfg: Config) {
    let listener = TcpListener::bind(&cfg.host).await;
}`
    const syms = extractSymbols(code, 'rust')
    expect(syms).toHaveLength(2)
    expect(syms[0]).toMatchObject({ name: 'Config', kind: 'class' })
    expect(syms[1]).toMatchObject({ name: 'serve', kind: 'function' })
  })

  it('finds Go funcs and struct types', () => {
    const code = `type Server struct {
	addr string
	port int
}

func (s *Server) Start() error {
	return http.ListenAndServe(s.addr, nil)
}

func main() {
	s := &Server{addr: ":8080"}
	s.Start()
}`
    const syms = extractSymbols(code, 'go')
    expect(syms).toHaveLength(3)
    expect(syms[0]).toMatchObject({ name: 'Server', kind: 'class' })
    expect(syms[1]).toMatchObject({ name: 'Start', kind: 'function' })
    expect(syms[2]).toMatchObject({ name: 'main', kind: 'function' })
  })

  it('skips comments and blank lines', () => {
    const code = `// a comment
/* block comment */

function real() {
  return 1
}`
    const syms = extractSymbols(code, 'javascript')
    expect(syms).toHaveLength(1)
    expect(syms[0].name).toBe('real')
  })
})

// ---------------------------------------------------------------------------
// extractSymbols — Python
// ---------------------------------------------------------------------------

describe('extractSymbols (Python)', () => {
  it('finds top-level functions and classes', () => {
    const code = `import os

class Parser:
    def __init__(self, src):
        self.src = src

    def parse(self):
        return ast.parse(self.src)

def main():
    p = Parser("x = 1")
    print(p.parse())
`
    const syms = extractSymbols(code, 'python')
    expect(syms).toHaveLength(2)
    expect(syms[0]).toMatchObject({ name: 'Parser', kind: 'class' })
    expect(syms[1]).toMatchObject({ name: 'main', kind: 'function' })
    expect(syms[0].text).toContain('def parse')
  })

  it('handles async def', () => {
    const code = `async def fetch_data(url):
    async with aiohttp.ClientSession() as session:
        return await session.get(url)
`
    const syms = extractSymbols(code, 'python')
    expect(syms).toHaveLength(1)
    expect(syms[0].name).toBe('fetch_data')
  })
})

// ---------------------------------------------------------------------------
// extractSymbols — Ruby
// ---------------------------------------------------------------------------

describe('extractSymbols (Ruby)', () => {
  it('finds classes and methods via end keyword', () => {
    const code = `class Greeter
  def greet(name)
    puts "Hello, #{name}"
  end
end

def standalone
  puts "hi"
end`
    const syms = extractSymbols(code, 'ruby')
    expect(syms).toHaveLength(2)
    expect(syms[0]).toMatchObject({ name: 'Greeter', kind: 'class' })
    expect(syms[1]).toMatchObject({ name: 'standalone', kind: 'function' })
  })
})

// ---------------------------------------------------------------------------
// chunkCode
// ---------------------------------------------------------------------------

describe('chunkCode', () => {
  it('packs small functions into one chunk', () => {
    const code = `function a() { return 1 }
function b() { return 2 }
function c() { return 3 }`
    const chunks = chunkCode('test.js', code, 'javascript')
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    // All 3 small functions should fit in one chunk
    expect(chunks[0].body).toContain('function a')
    expect(chunks[0].body).toContain('function c')
  })

  it('splits a large function across chunks', () => {
    const bigBody = Array.from({ length: 200 }, (_, i) => `  const x${i} = ${i};`).join('\n')
    const code = `function huge() {\n${bigBody}\n}`
    const chunks = chunkCode('big.ts', code, 'typescript', { maxTokens: 200 })
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].section).toContain('huge')
  })

  it('falls back to line-based chunking when no symbols found', () => {
    const code = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')
    const chunks = chunkCode('data.txt', code, 'javascript', { maxTokens: 50 })
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('includes chunk headers with source title', () => {
    const code = `function hello() {\n  return "world"\n}`
    const chunks = chunkCode('repo:acme/src/hello.ts', code, 'typescript')
    expect(chunks[0].text).toContain('repo:acme/src/hello.ts')
  })

  it('captures inter-symbol code (imports)', () => {
    const code = `import fs from 'fs'
import path from 'path'

const BASE_DIR = '/tmp'

function readFile(name) {
  return fs.readFileSync(path.join(BASE_DIR, name))
}`
    const chunks = chunkCode('util.js', code, 'javascript')
    // The imports / constants should be captured as (module) content
    const allText = chunks.map((c) => c.body).join('\n')
    expect(allText).toContain('import fs')
    expect(allText).toContain('readFile')
  })

  it('respects MAX_CHUNKS_PER_SOURCE', () => {
    // Generate a LOT of functions
    const fns = Array.from({ length: 500 }, (_, i) =>
      `function fn${i}() {\n  return ${i}\n}`
    ).join('\n\n')
    const chunks = chunkCode('many.js', fns, 'javascript', { maxTokens: 20 })
    expect(chunks.length).toBeLessThanOrEqual(400)
  })
})
