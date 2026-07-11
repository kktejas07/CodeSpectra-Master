import type {
  RawAnalysisResult,
  RawAnalyzerIssue,
  RawAnalyzerSuggestion,
} from '@/lib/scanner-analysis-mapper'

const LANG_SIGNATURES: [string, RegExp][] = [
  ['typescript', /\b(interface|type |enum |namespace|declare |as |readonly|keyof|import .* from|export |&\b)/],
  ['python', /\b(def |import |from |elif |self\.|__init__|lambda |yield |async def|@.*\))/],
  ['javascript', /\b(const |let |var |function |=>|require\(|module\.exports|import .* from)/],
  ['java', /\b(public |private |protected |void |static |class |extends |implements |new )/],
  ['go', /\b(func |package |import \(|defer |chan |:=\b|go (func|select))/],
  ['rust', /\b(fn |let mut|impl |struct |enum |match |-> |::|pub fn|unwrap\(\)|&'|!\b)/],
  ['cpp', /\b(#include |std::|cout|cin|template |<.*>|virtual |override |nullptr)/],
  ['c', /\b(#include |printf|scanf|main\(|malloc|struct |typedef|#define)/],
  ['ruby', /\b(def |end$|puts |require |attr_|#.*|\@@|@@)/],
  ['php', /<\?php|\$\w+\s*=|->|::/],
  ['swift', /\b(func |guard |let |var |struct |enum |import Foundation|@.*\b)/],
  ['kotlin', /\b(fun |val |var |data class|object |companion |sealed |::)/],
  ['csharp', /\b(public class|private |protected |void |async Task|namespace |using |=>|\?.|\?\:)/],
  ['sql', /\b(SELECT |FROM |WHERE |INSERT |UPDATE |DELETE |CREATE TABLE|DROP |JOIN |GROUP BY)/i],
]

export function detectLanguage(code: string, hint?: string): string {
  if (hint && hint !== 'plaintext') {
    const normalised = hint.toLowerCase().replace(/[^a-z]/g, '')
    const match = LANG_SIGNATURES.find(([k]) => k.toLowerCase().replace(/[^a-z]/g, '').startsWith(normalised.slice(0, 4)))
    if (match) return hint.toLowerCase().split(/[^a-z]/)[0]
  }
  let best = { lang: 'javascript', score: 0 }
  for (const [lang, re] of LANG_SIGNATURES) {
    const m = code.match(re)
    if (m && m.length > best.score) best = { lang, score: m.length }
  }
  return best.lang
}

function isLikelyCode(code: string): number {
  const lines = code.split('\n').filter(l => l.trim())
  if (lines.length === 0) return 0

  const words = code.match(/\b[a-zA-Z_]\w*\b/g) || []
  const wordCount = words.length
  if (wordCount === 0 && code.trim().length < 3) return 0

  const KEYWORDS = new Set([
    'function', 'def', 'fn', 'func', 'class', 'struct', 'interface', 'type', 'enum', 'package',
    'import', 'export', 'from', 'const', 'let', 'var', 'val', 'return', 'if', 'else', 'elif',
    'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally',
    'throw', 'async', 'await', 'yield', 'public', 'private', 'protected', 'static', 'readonly',
    'override', 'virtual', 'void', 'int', 'string', 'number', 'boolean', 'bool', 'float', 'double',
    'char', 'select', 'where', 'insert', 'update', 'delete', 'create', 'drop', 'table', 'require',
    'module', 'impl', 'pub', 'use', 'trait', 'match', 'goto', 'sizeof', 'new', 'this', 'self'
  ])

  const kwMatches = words.filter(w => KEYWORDS.has((w || '').toLowerCase()))
  const kwRatio = wordCount > 0 ? kwMatches.length / wordCount : 0
  const keywordScore = Math.min(3.5, kwMatches.length * 0.5 + kwRatio * 6.0)

  const blockPairs = (code.match(/\{[\s\S]*?\}/g) || []).length
  const parenCalls = (code.match(/\b\w+\s*\([^)]*\)/g) || []).length
  const semicolons = (code.match(/;/g) || []).length
  const arrows = (code.match(/=>|->/g) || []).length
  const blockColons = (code.match(/:\s*(?:\n|$)/g) || []).length

  const structureScore = Math.min(
    3.5,
    blockPairs * 1.0 + parenCalls * 0.6 + semicolons * 0.4 + arrows * 0.6 + blockColons * 0.6
  )

  const operators = (code.match(/[=<>!&|+\-*/%^~]/g) || []).length
  const dotAccess = (code.match(/\.\w+/g) || []).length
  const operatorScore = Math.min(2.0, operators * 0.2 + dotAccess * 0.3)

  const indentedLines = lines.filter(l => /^\s{2,}|\t/.test(l)).length
  const indentScore = Math.min(1.0, indentedLines * 0.25)

  let totalScore = keywordScore + structureScore + operatorScore + indentScore

  const cleanLines = lines.map(l => l.replace(/(["'`]).*?\1/g, '').trim())
  let proseLines = 0
  for (const line of cleanLines) {
    if (line.startsWith('//') || line.startsWith('#') || line.startsWith('/*')) continue
    if (/\b[a-zA-Z]{2,}\b(?:\s+\b[a-zA-Z]{2,}\b){3,}/.test(line) && !/[{}();=[\]<>!&|]/.test(line)) {
      proseLines++
    }
  }
  totalScore -= proseLines * 2.5

  const symbolCount = (code.match(/[{}();=[\]<>!&|+\-*/%.,:_]/g) || []).length
  const symbolRatio = wordCount > 0 ? symbolCount / wordCount : 0
  if (wordCount > 3 && symbolRatio < 0.25) {
    totalScore -= 3.0
  }

  if (structureScore + operatorScore < 0.8 && kwRatio < 0.15) {
    totalScore -= 3.5
  }

  return Math.max(0, Math.min(10, Number(totalScore.toFixed(1))))
}

function findSecurityIssues(code: string): RawAnalyzerIssue[] {
  const issues: RawAnalyzerIssue[] = []
  const lines = code.split('\n')

  const patterns: [RegExp, string, string, 'error' | 'warning'][] = [
    [/(?<!["'`]\w*)password\s*[=:]\s*['"`][^'"`]{2,}/i, 'hardcoded-credential', 'Hardcoded password/secret detected', 'error'],
    [/(?<!["'`]\w*)(api[_-]?key|apikey|api_key)\s*[=:]\s*['"`][^'"`]{8,}/i, 'hardcoded-secret', 'Hardcoded API key detected', 'error'],
    [/(?<!["'`]\w*)secret\s*[=:]\s*['"`][^'"`]{3,}/i, 'hardcoded-secret', 'Hardcoded secret detected', 'error'],
    [/(?<!["'`]\w*)token\s*[=:]\s*['"`][^'"`]{10,}/i, 'hardcoded-token', 'Hardcoded auth token detected', 'error'],
    [/\beval\s*\(/, 'no-eval', 'eval() is a code injection risk — avoid in production', 'error'],
    [/\.innerHTML\s*=/, 'xss-innerHTML', 'Direct innerHTML assignment — XSS vulnerability', 'error'],
    [/document\.write\s*\(/, 'xss-document-write', 'document.write can cause XSS attacks', 'error'],
    [/(?<!["'`\w])https?:\/\/[^\s'"`]+['"`]\s*[;,)]/, 'hardcoded-url', 'Hardcoded URL — verify this is intentionally public', 'warning'],
    [/\bexec\s*\(|system\s*\(.*\$|popen\s*\(/, 'shell-injection', 'Shell command injection vulnerability', 'error'],
    [/\bpassword\s*[=<>!]+|==\s*['"`][^'"`]+['"`].*(?:&&|\|\|).*\w/, 'weak-auth', 'Weak or custom password comparison — use a proven auth library', 'error'],
    [/\+\s*['"`][^'"`]+\+\s*(?:where|select|insert|update|delete)/i, 'sql-injection', 'String concatenation in SQL query — use parameterized queries', 'error'],
    [/\+\s*['"`][^'"`]+\+\s*(?:exec|shell|cmd)/i, 'command-injection', 'String concatenation in command execution', 'error'],
    [/\.\.\/|\.\.\\|%2e%2e/i, 'path-traversal', 'Path traversal — validate and sanitize user input paths', 'error'],
    [/Math\.random\(\).*(?:password|token|key|secret|captcha)/i, 'weak-random', 'Math.random() is not cryptographically secure for security-sensitive values', 'error'],
    [/(crypto\.createCipher|createDecipher)\b/, 'deprecated-crypto', 'Deprecated crypto API — use crypto.randomUUID or a modern library', 'warning'],
    [/\bprocess\.env\.\w+\s*\|\|\s*['"`][^'"`]{3,}/, 'env-secret-fallback', 'Environment variable has a hardcoded fallback — secrets should error if missing', 'warning'],
    [/\bdebugger\b/, 'debugger-statement', 'debugger; statement left in production code', 'warning'],
    [/console\.(log|debug|info)\s*\(/, 'debug-output', 'Console output in production code — remove or use a logging library', 'warning'],
    [/\balert\s*\(|\bprompt\s*\(|\bconfirm\s*\(/, 'browser-dialog', 'Browser dialog detected in production code', 'warning'],
    [/\bsetTimeout\s*\(\s*['"`]/, 'string-setTimeout', 'setTimeout with string argument — eval risk', 'error'],
    [/new\s+Function\s*\(/, 'new-function', 'new Function() is equivalent to eval()', 'error'],
    [/(aws_access_key|aws_secret_access_key|aws_session_token)\s*[=:]/i, 'aws-credentials', 'Hardcoded AWS credentials detected', 'error'],
    [/(ghp_|gho_|github_pat_)\w{30,}/i, 'github-token', 'Hardcoded GitHub token detected', 'error'],
    [/(sk-|pk_)[A-Za-z0-9]{20,}/, 'api-token-strip', 'Hardcoded API token detected', 'error'],
  ]

  for (const [re, rule, msg, severity] of patterns) {
    let match: RegExpExecArray | null
    const regex = new RegExp(re.source, re.flags.includes('i') ? re.flags : re.flags + 'i')
    while ((match = regex.exec(code)) !== null) {
      const lineNum = code.substring(0, match.index).split('\n').length
      issues.push({ line: lineNum, column: 1, message: msg, severity, rule, type: 'security' })
      if (!re.global) break
    }
  }

  const sensitiveFuncs = ['crypto', 'bcrypt', 'jwt', 'auth', 'password', 'hash', 'verify', 'sign']
  for (const [i, line] of lines.entries()) {
    if (/\bprocess\.env\b/.test(line) && sensitiveFuncs.some(s => line.toLowerCase().includes(s))) {
      issues.push({ line: i + 1, column: line.indexOf('process.env') + 1, message: 'process.env used near sensitive operation — ensure env vars are validated', severity: 'warning', rule: 'env-near-sensitive', type: 'security' })
    }
  }

  return issues
}

function findCodeSmells(code: string, lang: string): RawAnalyzerIssue[] {
  const issues: RawAnalyzerIssue[] = []
  const lines = code.split('\n')

  lines.forEach((line, i) => {
    const ln = i + 1

    if (/^\s*var\s+/.test(line)) {
      issues.push({ line: ln, column: line.indexOf('var') + 1, message: "Use 'const' or 'let' instead of 'var'", severity: 'warning', rule: 'no-var', type: 'code_smell' })
    }

    if (/catch\s*\(\s*\w*\s*\)\s*\{\s*\}/.test(line)) {
      issues.push({ line: ln, column: line.indexOf('catch') + 1, message: 'Empty catch block — errors are silently ignored', severity: 'error', rule: 'no-empty-catch', type: 'code_smell' })
    }

    if (line.includes('==') && !line.includes('===') && !line.includes('!==')) {
      issues.push({ line: ln, column: line.indexOf('==') + 1, message: "Use strict equality ('===') to avoid type coercion bugs", severity: 'warning', rule: 'eqeqeq', type: 'code_smell' })
    }

    if (line.length > 150) {
      issues.push({ line: ln, column: 151, message: `Line is ${line.length} chars — keep under 120 for readability`, severity: 'info', rule: 'max-len', type: 'style' })
    }

    const todoMatch = line.match(/\b(TODO|FIXME|HACK|XXX|NOTE):?\s*$/i)
    if (todoMatch) {
      issues.push({ line: ln, column: line.indexOf(todoMatch[0]) + 1, message: 'TODO/FIXME comment needs an assignee or description', severity: 'info', rule: 'no-todo', type: 'documentation' })
    }

    if (/\b\d{5,}\b/.test(line) && !line.includes('"') && !line.includes("'")) {
      issues.push({ line: ln, column: line.indexOf(/\d{5,}/.exec(line)![0]) + 1, message: 'Magic number — extract to a named constant for readability', severity: 'info', rule: 'no-magic-numbers', type: 'code_smell' })
    }

    if (/^\s*\}\s*$/.test(line) && i > 0 && /^\s*\{?\s*$/.test(lines[i - 1])) {
      issues.push({ line: ln, column: 1, message: 'Empty block — dead code or missing implementation', severity: 'info', rule: 'no-empty-blocks', type: 'code_smell' })
    }

    if (/\bany\b/.test(line) && (lang === 'typescript' || lang === 'javascript')) {
      issues.push({ line: ln, column: line.indexOf('any') + 1, message: "TypeScript: avoid 'any' — use a specific type or unknown", severity: 'warning', rule: 'no-explicit-any', type: 'code_smell' })
    }

    if (/try\s*\{[\s\S]*?\}\s*catch/.test(line)) {
      // ignore — multiline handled differently
    }
  })

  const nestedDepthRe = /\{[^{]*\{[^{]*\{[^{]*\{[^{]*\{/
  if (nestedDepthRe.test(code)) {
    issues.push({ line: 1, column: 1, message: 'Very deep nesting (6+ levels) — consider extracting functions or using early returns', severity: 'warning', rule: 'max-depth', type: 'code_smell' })
  }

  const longFuncRe = /function\s+\w+\s*\([^\)]*\)\s*\{.{200,}/g
  let mf: RegExpExecArray | null
  const lfRegex = new RegExp(longFuncRe.source, 'g')
  while ((mf = lfRegex.exec(code)) !== null) {
    const lineNum = code.substring(0, mf.index).split('\n').length
    issues.push({ line: lineNum, column: 1, message: 'Function exceeds 200 characters — split into smaller, focused functions', severity: 'info', rule: 'max-func-len', type: 'code_smell' })
  }

  return issues
}

function findSecurityHotspots(code: string): RawAnalyzerIssue[] {
  const issues: RawAnalyzerIssue[] = []
  const lines = code.split('\n')

  const hotspotPatterns: [RegExp, string, string][] = [
    [/\bcookie\s*\.?\s*(domain|path|secure|httponly|samesite)/i, 'cookie-security', 'Cookie configuration — ensure HttpOnly, Secure, SameSite flags are set'],
    [/\.innerHTML\s*=|insertAdjacentHTML\s*\(/, 'dom-xss', 'DOM XSS: validate and sanitize before inserting HTML'],
    [/localStorage\.|sessionStorage\./, 'client-storage', 'Client-side storage — do not store sensitive data without encryption'],
    [/\bpostMessage\s*\(/, 'postmessage-risk', 'postMessage — always validate origin of incoming messages'],
    [/\.addEventListener\s*\(\s*['"]click['"]\s*,\s*(?:function|\()\s*\(\s*\)\s*=>\s*\(/, 'inline-click-handler', 'Inline click handler — consider separating logic for clarity'],
    [/<iframe[^>]*src\s*=\s*['"][^'"]*['"]/, 'iframe-src', 'iframe src — verify the embedded content is trusted'],
    [/\beval\s*\(|new\s+Function\s*\(/, 'dynamic-code-execution', 'Dynamic code execution — audit for injection vectors'],
    [/\borigin\s*[=<>]|request\.origin|\.origin\s*===/i, 'origin-validation', 'Origin check — ensure it cannot be bypassed or spoofed'],
    [/\bcors\b|Access-Control/i, 'cors-config', 'CORS configuration — verify allowed origins are explicitly set'],
    [/base64\.encode|atob\(|btoa\(/, 'base64-sensitive', 'Base64 encoding — not encryption; do not encode sensitive data'],
  ]

  for (const [re, rule, msg] of hotspotPatterns) {
    let match: RegExpExecArray | null
    const regex = new RegExp(re.source, re.flags.includes('i') ? re.flags : re.flags + 'i')
    while ((match = regex.exec(code)) !== null) {
      const lineNum = code.substring(0, match.index).split('\n').length
      issues.push({ line: lineNum, column: 1, message: msg, severity: 'warning', rule, type: 'security_hotspot' })
      if (!re.global) break
    }
  }

  for (const [i, line] of lines.entries()) {
    if (/crypto|cipher|sign|verify|auth|permission|role|access/i.test(line) && /[^a-z](or|and)[^a-z]/.test(line)) {
      issues.push({ line: i + 1, column: 1, message: 'Complex auth/permission expression — simplify and extract to named function', severity: 'info', rule: 'complex-auth-expression', type: 'security_hotspot' })
    }
  }

  return issues
}

function findDuplicates(code: string): { percentage: number; issues: RawAnalyzerIssue[] } {
  const issues: RawAnalyzerIssue[] = []
  const lines = code.split('\n').filter(l => l.trim().length > 20)
  if (lines.length < 4) return { percentage: 0, issues }

  const n = lines.length
  let dup = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = lines[i].replace(/\s+/g, ' ').trim()
      const b = lines[j].replace(/\s+/g, ' ').trim()
      if (a === b && a.length > 30) {
        dup++
        break
      }
    }
  }

  const percentage = Math.round((dup / Math.max(n, 1)) * 100)
  if (percentage > 5) {
    issues.push({
      line: 1, column: 1,
      message: `${percentage}% of code lines appear duplicated — extract repeated logic into reusable functions`,
      severity: 'info', rule: 'duplicates', type: 'duplicate',
    })
  }

  return { percentage, issues }
}

function computeComplexity(code: string): { score: number; issues: RawAnalyzerIssue[] } {
  const issues: RawAnalyzerIssue[] = []
  const lines = code.split('\n')

  let score = 0

  const controlFlow = /\b(if|elif|else|for|while|switch|case|catch|&&|\|\||\?|:)\b/g
  let m: RegExpExecArray | null
  const cfRegex = new RegExp(controlFlow.source, 'g')
  while ((m = cfRegex.exec(code)) !== null) score++

  const nestingDepth = (line: string) => {
    let d = 0, max = 0
    for (const c of line) {
      if (c === '{') { d++; max = Math.max(max, d) }
      if (c === '}') d--
    }
    return max
  }

  let maxDepth = 0
  const deepLines: number[] = []
  lines.forEach((line, i) => {
    const d = nestingDepth(line)
    if (d > maxDepth) maxDepth = d
    if (d >= 5) deepLines.push(i + 1)
  })

  score += maxDepth * 2

  const funcCount = (code.match(/\b(function|def |fn |func |const \w+ =|let \w+ =|var \w+ =|=>)/g) || []).length
  score += Math.max(0, funcCount - 1)

  const paramsRe = /function\s*\w*\s*\([^)]*\)|def\s+\w+\s*\([^)]*\)|fn\s+\w+\s*\([^)]*\)/
  const paramsMatches = code.match(paramsRe) || []
  for (const pm of paramsMatches) {
    const pCount = (pm.match(/,/g) || []).length + 1
    if (pCount > 5) {
      const lineNum = code.indexOf(pm) >= 0 ? code.substring(0, code.indexOf(pm)).split('\n').length : 1
      issues.push({ line: lineNum, column: 1, message: `Function with ${pCount} parameters — consider grouping into an options object`, severity: 'info', rule: 'too-many-params', type: 'complexity' })
    }
    score += pCount > 3 ? 2 : 0
  }

  if (maxDepth >= 5) {
    issues.push({ line: deepLines[0] || 1, column: 1, message: `Cyclomatic complexity is high (depth ${maxDepth}) — simplify control flow or extract functions`, severity: 'info', rule: 'cyclomatic-complexity', type: 'complexity' })
  }

  return { score: Math.min(100, score), issues }
}

function estimateTestCoverage(code: string): number {
  const lines = code.split('\n').filter(l => l.trim().length > 0)
  const total = lines.length
  if (total === 0) return 0

  const hasTests = /\b(describe|it\(|test\(|expect\(|assert\.|should\.|Given|When|Then|scenario|feature)/i.test(code)
  const hasMocks = /\b(mock|stub|spy|fake|sandbox|double)/i.test(code)
  const hasAsserts = /\b(return|throw|===|!==|equal|ok |isOk|isNotNull)/.test(code)

  let score = 10
  if (hasTests) score += 35
  if (hasMocks) score += 15
  if (hasAsserts) score += 20

  const fnRe = /\b(function|def |fn |func )/g
  const fnMatches = code.match(fnRe)
  const fnCount = fnMatches ? fnMatches.length : 0
  if (fnCount === 0 && total > 5) score = Math.max(5, score - 20)

  const coverageLines = (code.match(/\b(return|throw|===|!==|assert)/g) || []).length
  const coverageRatio = fnCount > 0 ? coverageLines / fnCount : 0
  if (coverageRatio > 1.5) score += 15

  return Math.min(95, Math.max(0, Math.round(score)))
}

export function analyzeCodeLocally(code: string, language: string): RawAnalysisResult {
  const startTime = Date.now()
  const lang = detectLanguage(language)
  const issues: RawAnalyzerIssue[] = []
  const suggestions: RawAnalyzerSuggestion[] = []

  const plausibility = isLikelyCode(code)
  const isNotCode = plausibility < 3.0

  if (isNotCode) {
    return {
      quality: 0,
      issues: [
        {
          line: 1, column: 1,
          message: `Text does not appear to be valid source code (plausibility: ${plausibility.toFixed(1)}/10). This may be random text, a placeholder, or plain English. Please enter valid code to scan.`,
          severity: 'error', rule: 'not-code', type: 'structure',
        }
      ],
      suggestions: [
        {
          title: 'Provide valid source code',
          description: 'The input entered appears to be plain text, prose, or unsupported syntax rather than valid source code.',
          code: '',
          explanation: 'Code scanner requires syntactically valid source code (such as TypeScript, Python, Java, Go, etc.) to evaluate bugs, vulnerabilities, and quality metrics.',
          confidence: 1.0,
        }
      ],
      bugs: 0,
      vulnerabilities: 0,
      codeSmells: 1,
      complexityScore: 0,
      maintainabilityIndex: 0,
      testCoveragePercentage: 0,
      timeMs: Date.now() - startTime,
    }
  }

  issues.push(...findSecurityIssues(code))
  issues.push(...findCodeSmells(code, lang))
  issues.push(...findSecurityHotspots(code))

  const { percentage: dupPct, issues: dupIssues } = findDuplicates(code)
  issues.push(...dupIssues)

  const { score: complexity, issues: complexityIssues } = computeComplexity(code)
  issues.push(...complexityIssues)

  const errorCount = issues.filter(i => i.severity === 'error').length
  const warningCount = issues.filter(i => i.severity === 'warning').length
  const infoCount = issues.filter(i => i.severity === 'info').length
  const bugCount = issues.filter(i => i.type === 'bug').length
  const vulnerabilityCount = issues.filter(i => i.type === 'security' && i.severity === 'error').length

  let quality = Math.max(0, 100 - errorCount * 20 - warningCount * 8 - infoCount * 2)

  if (lang === 'unknown') quality = Math.max(0, quality - 15)

  quality = Math.max(0, Math.min(100, Math.round(quality)))

  const testCoverage = estimateTestCoverage(code)

  const maintainability = Math.max(0, Math.min(100, Math.round(
    quality * 0.5 + (100 - complexity) * 0.3 + testCoverage * 0.2
  )))

  for (const issue of issues.filter(i => i.severity === 'warning' && i.rule !== 'no-var')) {
    if (issue.rule === 'eqeqeq') {
      suggestions.push({ title: 'Use strict equality', description: "Replace '==' with '==='", code: '', explanation: 'Strict equality prevents type coercion bugs', confidence: 0.9 })
    }
  }

  return {
    quality,
    issues,
    suggestions: suggestions.slice(0, 3),
    bugs: bugCount,
    vulnerabilities: vulnerabilityCount,
    codeSmells: warningCount + infoCount,
    complexityScore: complexity,
    maintainabilityIndex: maintainability,
    testCoveragePercentage: testCoverage,
    timeMs: Date.now() - startTime,
  }
}