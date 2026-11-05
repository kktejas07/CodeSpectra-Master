/**
 * React hooks must be called inside a component.
 *
 * On 2026-11-02 /dashboard/100-days crashed for users (React #321) because a
 * patch inserted `const [page, setPage] = useState(1)` at MODULE scope. The line
 * was indented exactly like component code, so it read fine in review, and
 * TypeScript accepts it — only React fails, at runtime, in production.
 *
 * Parses every page with @babel/parser (JSX-aware) and flags any `use*()` call
 * with no enclosing function. Helpers and arrow handlers are functions, so they
 * pass.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const parse = (createRequire(import.meta.url)('@babel/parser') as {
  parse: (src: string, opts: Record<string, unknown>) => { program: unknown }
}).parse

const ROOT = path.resolve(__dirname, '..')
const HOOK = /^use[A-Z]\w*$/
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
  'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod',
])

function walkPages(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      walkPages(full, out)
    } else if (entry.name === 'page.tsx' || entry.name === 'page.ts') {
      out.push(full)
    }
  }
  return out
}

/** Hook calls with no enclosing function → module scope. */
export function moduleScopeHooks(file: string): string[] {
  const ast = parse(fs.readFileSync(file, 'utf8'), {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
    errorRecovery: true,
  }) as { program: { body: unknown[] } }

  const bad: string[] = []
  const visit = (node: any, inFunction: boolean) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child, inFunction)
      return
    }
    if (typeof node.type !== 'string') return

    const nowInFunction = inFunction || FUNCTION_TYPES.has(node.type)

    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && HOOK.test(node.callee.name) && !nowInFunction) {
      bad.push(`${path.relative(ROOT, file)}:${node.loc?.start.line ?? '?'} ${node.callee.name}()`)
    }

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments' || key === 'trailingComments') continue
      const value = (node as Record<string, unknown>)[key]
      if (value && typeof value === 'object') visit(value, nowInFunction)
    }
  }

  visit(ast.program.body, false)
  return bad
}

describe('hooks are called inside a component', () => {
  const pages = walkPages(path.join(ROOT, 'app'))

  it('scans the app pages', () => {
    expect(pages.length).toBeGreaterThan(50)
  })

  it('no page calls a hook at module scope', () => {
    const violations = pages.flatMap(moduleScopeHooks)
    expect(violations, 'move the hook inside the component function').toEqual([])
  })

  it('catches the 100-days shape if it comes back', () => {
    const dir = fs.mkdtempSync(path.join(ROOT, '.tmp-hooks-'))
    const file = path.join(dir, 'sample.tsx')
    fs.writeFileSync(file, `import { useState } from 'react'\nconst [a, setA] = useState(1)\nexport default function Page() { return null }\n`)
    try {
      expect(moduleScopeHooks(file)).toHaveLength(1)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
