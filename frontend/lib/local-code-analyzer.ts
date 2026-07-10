import type {
  RawAnalysisResult,
  RawAnalyzerIssue,
  RawAnalyzerSuggestion,
} from '@/lib/scanner-analysis-mapper'

interface RawFeature {
  name: string
  score: number
  penalty: number
}

function detectLanguage(code: string, hintedLanguage: string): string {
  if (hintedLanguage && hintedLanguage !== 'plaintext') return hintedLanguage
  const patterns: [string, RegExp][] = [
    ['typescript', /\b(interface|type|enum|namespace|declare|as |readonly|keyof)\b/],
    ['python', /\b(def|import|from|elif|self|__init__|lambda|yield)\b/],
    ['java', /\b(public class|private|protected|void|static void|System\.out)\b/],
    ['go', /\b(func|package|import defer|chan|goroutine|:=)\b/],
    ['rust', /\b(fn|let mut|impl|struct|enum|match|->|::|pub fn|unwrap)\b/],
    ['cpp', /\b(#include|std::|cout|cin|template|virtual|override)\b/],
    ['c', /\b(#include|printf|scanf|main\(|malloc|struct|typedef)\b/],
    ['ruby', /\b(def|end|puts|require|attr_|@@|@@)\b/],
    ['php', /<\?php|\$\w+\s*=/],
    ['swift', /\b(func|guard|let|var|struct|enum|import Foundation)\b/],
    ['kotlin', /\b(fun|val|var|data class|object|companion|sealed)\b/],
  ]
  for (const [lang, re] of patterns) {
    if (re.test(code)) return lang
  }
  return 'javascript'
}

function scoreStructural(code: string, lang: string): RawFeature[] {
  const features: RawFeature[] = []
  const lines = code.split('\n')

  const longFunctions = lines.filter(l => l.length > 150).length
  const nestedDepth = Math.max(0, ...lines.map(l => {
    let d = 0; for (const c of l) { if (c === '{') d++; if (c === '}') d-- }
    return d
  }))
  const commentLines = lines.filter(l => /^\s*(\/\/|\/\*|#|<!--)/.test(l.trim())).length
  const blankLines = lines.filter(l => !l.trim()).length
  const codeLines = lines.filter(l => l.trim().length > 0).length
  const avgLineLen = codeLines > 0 ? lines.reduce((s, l) => s + l.length, 0) / codeLines : 0

  features.push({ name: 'function_length', score: Math.max(0, 100 - longFunctions * 15), penalty: longFunctions * 15 })
  features.push({ name: 'nesting_depth', score: Math.max(0, 100 - nestedDepth * 20), penalty: nestedDepth * 20 })
  features.push({ name: 'comment_ratio', score: commentLines / Math.max(1, codeLines) > 0.3 ? 100 : Math.max(0, 70 - (commentLines / Math.max(1, codeLines)) * 100), penalty: Math.max(0, 30 - (commentLines / Math.max(1, codeLines)) * 30) })

  const hasMain = /\bfunction\s+\w*[mM]ain|def\s+main|public\s+static\s+void\s+main|int\s+main\s*\(|fn\s+main|package\s+main/.test(code)
  const hasTests = /\bdescribe\(|it\(|test\(|expect\(|assert|def test_|func Test|test_/.test(code)
  features.push({ name: 'entry_point', score: hasMain ? 100 : 60, penalty: hasMain ? 0 : 40 })
  features.push({ name: 'has_tests', score: hasTests ? 100 : 0, penalty: hasTests ? 0 : 10 })

  const dangerousPatterns: [string, RegExp, string][] = [
    ['eval', /\beval\s*\(/, 'Use of eval() — code injection risk'],
    ['innerHTML', /\.innerHTML\s*=/, 'Direct innerHTML assignment — XSS risk'],
    ['password_in_code', /password\s*[=:]\s*['"`][^'"`]+['"`]/i, 'Hardcoded password found'],
    ['api_key_in_code', /api[_-]?key\s*[=:]\s*['"`][^'"`]{8,}['"`]/i, 'Hardcoded API key found'],
    ['secret_in_code', /secret\s*[=:]\s*['"`][^'"`]+['"`]/i, 'Hardcoded secret found'],
    ['token_in_code', /token\s*[=:]\s*['"`][^'"`]{10,}['"`]/i, 'Hardcoded token found'],
    ['hardcoded_url', /https?:\/\/[^\s'"`]+['"`]\s*[;,)]/, 'Hardcoded URL — may expose internal services'],
    ['shell_injection', /\bexec\s*\(|system\s*\(.*\$|popen\s*\(/, 'Shell command injection risk'],
    ['sql_primitive', /['"`]\s*\+.*\+|['"`].*\%.*\+|`\$\{/, 'Possible SQL injection — use parameterized queries'],
    ['path_traversal', /\.\.\/|\.\.\\|%2e%2e/i, 'Path traversal vulnerability risk'],
    ['unsafe_redirect', /window\.location\s*=\s*['"`][^'"`]+\+|<meta http-equiv|refresh/i, 'Unvalidated redirect'],
    ['debugger_statement', /\bdebugger\b/, 'debugger; statement left in production code'],
    ['console_strict', /console\.(log|debug|info|warn)\s*\(/, 'Console output in production code'],
    ['alert_strict', /\balert\s*\(|prompt\s*\(|confirm\s*\(/, 'Browser dialog in production code'],
    ['any_type', /:\s*any\b/, 'TypeScript: avoid `any` type — use specific types'],
    ['todo_fixme', /\b(TODO|FIXME|HACK|XXX)\b/i, 'TODO/FIXME comment needs resolution before production'],
    ['magic_number', /\b\d{4,}\b(?!\s*[.-])/.test(code) ? /\b\d{4,}\b(?!\s*[.-])/ : /(?<!["'`\d])\b\d{3,}\b(?!\s*[.-])(?![Ee][+-]?\d)/, 'Magic numbers reduce code readability'],
    ['empty_block', /\{\s*\}/, 'Empty code block — dead code or missing implementation'],
    ['deep_nesting', /\{[^{]*\{[^{]*\{[^{]*\{/, 'Very deep nesting — consider refactoring'],
    ['long_line', /\b.{140,}/, 'Excessively long line — split for readability'],
  ]
  for (const [rule, re, msg] of dangerousPatterns) {
    if (re.test(code)) {
      features.push({ name: rule, score: 0, penalty: 25 })
    }
  }

  return features
}

function analyzeSecurity(code: string): { issues: RawAnalyzerIssue[], score: number } {
  const issues: RawAnalyzerIssue[] = []
  let score = 100

  const sensitivePatterns: [RegExp, string, string][] = [
    [/password\s*[=:]\s*['"`][^'"`]{1,}/i, 'no-hardcoded-credentials', 'Hardcoded password detected'],
    [/api[_-]?key\s*[=:]\s*['"`][^'"`]{8,}['"`]/i, 'no-hardcoded-secrets', 'Hardcoded API key detected'],
    [/secret\s*[=:]\s*['"`][^'"`]{1,}/i, 'no-hardcoded-secrets', 'Hardcoded secret detected'],
    [/token\s*[=:]\s*['"`][^'"`]{10,}['"`]/i, 'no-hardcoded-tokens', 'Hardcoded token detected'],
    [/\beval\s*\(/, 'no-eval', 'eval() is a code injection risk'],
    [/\.innerHTML\s*=/, 'no-innerHTML', 'Direct innerHTML can cause XSS'],
    [/\bprocess\.env\.\w+\s*\|\|\s*['"`][^'"`]+['"`]/, 'env-default-secret', 'Environment variable fallback may expose secrets'],
    [/Math\.random\(\).*password|Math\.random\(\).*token|Math\.random\(\).*key/, 'weak-random', 'Math.random() is not cryptographically secure'],
  ]

  for (const [re, rule, msg] of sensitivePatterns) {
    const match = code.match(re)
    if (match) {
      issues.push({
        line: code.substring(0, match.index!).split('\n').length,
        column: 1,
        message: msg,
        severity: 'error',
        rule,
        type: 'security',
      })
      score -= 15
    }
  }

  return { issues, score: Math.max(0, score) }
}

export function analyzeCodeLocally(code: string, language: string): RawAnalysisResult {
  const startTime = Date.now()
  const lang = detectLanguage(code, language)
  const issues: RawAnalyzerIssue[] = []
  const suggestions: RawAnalyzerSuggestion[] = []

  const { issues: securityIssues, score: securityScore } = analyzeSecurity(code)
  issues.push(...securityIssues)

  const lines = code.split('\n')
  const codeLines = lines.filter(l => l.trim().length > 0)
  const totalLines = codeLines.length

  lines.forEach((line, index) => {
    const lineNum = index + 1

    if (line.includes('console.log') || line.includes('console.debug') || line.includes('console.info')) {
      issues.push({ line: lineNum, column: line.indexOf('console.') + 1, message: 'Remove debug console output before production', severity: 'warning', rule: 'no-console', type: 'debug-code' })
    }

    if (/^\s*var\s+/.test(line)) {
      issues.push({ line: lineNum, column: line.indexOf('var') + 1, message: "Use 'const' or 'let' instead of 'var'", severity: 'warning', rule: 'no-var', type: 'best-practice' })
      suggestions.push({ title: 'Replace var with const', description: 'Modern JavaScript recommends const or let', code: line.replace(/var\s+/, 'const '), explanation: 'Block-scoped variables prevent accidental hoisting', confidence: 0.95 })
    }

    if (line.includes('catch') && line.includes('{}')) {
      issues.push({ line: lineNum, column: line.indexOf('catch') + 1, message: 'Empty catch block — handle errors properly', severity: 'error', rule: 'no-empty-catch', type: 'error-handling' })
    }

    if (line.includes('==') && !line.includes('===') && !line.includes('!==') && !/regex.*==/.test(line)) {
      issues.push({ line: lineNum, column: line.indexOf('==') + 1, message: "Use '===' instead of '=='", severity: 'warning', rule: 'eqeqeq', type: 'best-practice' })
      suggestions.push({ title: 'Use strict equality', description: 'Replace == with ===', code: line.replace(/([^=!])={2}([^=])/g, '$1===$2'), explanation: 'Strict equality prevents type coercion bugs', confidence: 0.9 })
    }

    if (line.length > 120) {
      issues.push({ line: lineNum, column: 121, message: 'Line exceeds 120 characters', severity: 'info', rule: 'max-len', type: 'style' })
    }

    if (line.trim().startsWith('// TODO') || line.trim().startsWith('# TODO')) {
      issues.push({ line: lineNum, column: line.indexOf('TODO') + 1, message: 'TODO needs a description or assignee', severity: 'info', rule: 'no-todo', type: 'documentation' })
    }
  })

  const features = scoreStructural(code, lang)
  const structuralPenalty = features.reduce((sum, f) => sum + f.penalty, 0)

  const errorCount = issues.filter(i => i.severity === 'error').length
  const warningCount = issues.filter(i => i.severity === 'warning').length
  const infoCount = issues.filter(i => i.severity === 'info').length

  let qualityScore = Math.max(0, 100 - errorCount * 20 - warningCount * 8 - infoCount * 2)

  qualityScore -= structuralPenalty

  const sizePenalty = Math.min(40, Math.floor(totalLines * 0.3))
  qualityScore -= sizePenalty

  if (totalLines < 5 && !issues.length) {
    qualityScore = Math.max(0, qualityScore - 20)
  }

  qualityScore = Math.max(0, Math.min(100, Math.round(qualityScore)))

  const complexity = Math.min(100, Math.round(
    code.split('{').length * 2 +
    lines.filter(l => l.includes('if') || l.includes('for') || l.includes('while')).length +
    features.filter(f => f.name === 'nesting_depth' && f.penalty > 0).length * 5
  ))

  const maintainability = Math.max(0, Math.min(100, Math.round(qualityScore - (complexity / 4))))

  const issueDensity = totalLines > 0 ? issues.length / totalLines : 0
  const testCoverage = Math.min(95, Math.max(0, Math.round((1 - issueDensity) * 100 - sizePenalty / 2)))

  return {
    quality: qualityScore,
    issues,
    suggestions: suggestions.slice(0, 3),
    bugs: errorCount,
    vulnerabilities: Math.max(0, securityIssues.length),
    codeSmells: warningCount,
    complexityScore: complexity,
    maintainabilityIndex: maintainability,
    testCoveragePercentage: testCoverage,
    timeMs: Date.now() - startTime,
  }
}