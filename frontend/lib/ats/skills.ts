/**
 * Skill dictionary + synonyms shared by résumé parsing and screening. Pure.
 * ponytail: a curated list, not a taxonomy service — extend the arrays as
 * tenants ask; job criteria still match any free-text skill by keyword.
 */

/** canonical → aliases (all lowercase) */
const SYNONYMS: Record<string, string[]> = {
  javascript: ['js', 'ecmascript', 'es6', 'es2015'],
  typescript: ['ts'],
  'node.js': ['node', 'nodejs', 'node js'],
  react: ['react.js', 'reactjs', 'react js'],
  'react native': ['react-native', 'rn'],
  'next.js': ['nextjs', 'next js'],
  'vue.js': ['vue', 'vuejs'],
  angular: ['angularjs', 'angular.js'],
  python: ['py', 'python3'],
  java: ['core java', 'j2ee', 'java ee'],
  'c#': ['csharp', 'c sharp', '.net c#'],
  'c++': ['cpp', 'cplusplus'],
  '.net': ['dotnet', 'asp.net', '.net core'],
  go: ['golang'],
  kotlin: [],
  swift: [],
  php: [],
  ruby: ['ruby on rails', 'rails', 'ror'],
  rust: [],
  scala: [],
  sql: ['t-sql', 'pl/sql', 'plsql', 'tsql'],
  postgresql: ['postgres', 'psql'],
  mysql: [],
  mongodb: ['mongo'],
  redis: [],
  elasticsearch: ['elastic search', 'opensearch'],
  aws: ['amazon web services'],
  azure: ['microsoft azure'],
  gcp: ['google cloud', 'google cloud platform'],
  docker: ['containers'],
  kubernetes: ['k8s'],
  terraform: [],
  'ci/cd': ['cicd', 'continuous integration', 'jenkins', 'github actions'],
  linux: ['unix'],
  git: ['github', 'gitlab'],
  graphql: [],
  'rest api': ['rest', 'restful', 'rest apis'],
  microservices: ['micro services', 'microservice'],
  'spring boot': ['spring', 'springboot'],
  django: [],
  flask: [],
  fastapi: [],
  express: ['express.js', 'expressjs'],
  html: ['html5'],
  css: ['css3', 'scss', 'sass', 'tailwind'],
  'machine learning': ['ml'],
  'deep learning': ['dl'],
  'artificial intelligence': ['ai'],
  nlp: ['natural language processing'],
  'data science': [],
  pandas: [],
  tensorflow: ['tf'],
  pytorch: ['torch'],
  'power bi': ['powerbi'],
  tableau: [],
  excel: ['ms excel', 'microsoft excel'],
  android: ['android sdk'],
  ios: [],
  flutter: ['dart'],
  selenium: [],
  'manual testing': [],
  'automation testing': ['test automation'],
  jira: [],
  agile: ['scrum'],
  figma: [],
  autocad: ['auto cad'],
  solidworks: ['solid works'],
  catia: [],
  'ansys': [],
  matlab: [],
  sap: [],
  salesforce: ['sfdc'],
  'project management': ['pmp'],
  communication: ['communication skills'],
}

const ALIAS_TO_CANON = new Map<string, string>()
for (const [canon, aliases] of Object.entries(SYNONYMS)) {
  ALIAS_TO_CANON.set(canon, canon)
  for (const a of aliases) ALIAS_TO_CANON.set(a, canon)
}

/** Lowercase, trim, collapse spaces. */
export function normSkill(s: string): string {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Canonical form: "JS" → "javascript"; unknown skills stay as normalised text. */
export function canonicalSkill(s: string): string {
  const n = normSkill(s)
  return ALIAS_TO_CANON.get(n) ?? n
}

/** Every surface form for a skill (canonical + aliases), lowercase. */
export function skillForms(s: string): string[] {
  const canon = canonicalSkill(s)
  return [...new Set([canon, normSkill(s), ...(SYNONYMS[canon] ?? [])])].filter(Boolean)
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whole-word-ish match of `form` in lowercase `text` (handles c++, c#, .net, node.js). */
export function textHasTerm(textLower: string, form: string): boolean {
  if (!form) return false
  const re = new RegExp(`(^|[^a-z0-9+#.])${escapeRe(form)}(?=$|[^a-z0-9+#]|\\.(?![a-z0-9]))`, 'i')
  return re.test(textLower)
}

/** Does the text (or the parsed skills list) mention this skill in any form? */
export function hasSkill(skill: string, textLower: string, parsedSkills: string[] = []): boolean {
  const canon = canonicalSkill(skill)
  if (parsedSkills.some((p) => canonicalSkill(p) === canon)) return true
  // Very short aliases ("js", "ts", "ml", "ai", "rn", "go") are only trusted as
  // whole words; the regex above already enforces word boundaries.
  return skillForms(skill).some((f) => textHasTerm(textLower, f))
}

/** Dictionary skills present in the text, canonical names, in dictionary order. */
export function dictionarySkillsIn(text: string): string[] {
  const lower = ` ${String(text || '').toLowerCase()} `
  // Lines that list skills ("Skills: JS, TS, k8s") may use short aliases.
  const skillLines = lower.split('\n').filter((l) => /\b(skills?|technolog(?:y|ies)|tech stack|tools|languages)\b/.test(l)).join('\n')
  const out: string[] = []
  for (const canon of Object.keys(SYNONYMS)) {
    if (canon !== 'go' && skillLines && SYNONYMS[canon].some((a) => a.length <= 2 && textHasTerm(skillLines, a))) { out.push(canon); continue }
    // Skip 1–2 letter aliases for dictionary discovery (too noisy: "go", "ai", "ts").
    const forms = [canon, ...SYNONYMS[canon].filter((a) => a.length > 2)]
    // "go" is an English word: only count it as a language in a list ("Go, Rust") or as golang.
    if (canon === 'go') { if (/\bgolang\b|(^|[,|/•·])\s*go\s*([,|/•·]|$)/m.test(lower)) out.push(canon); continue }
    if (forms.some((f) => textHasTerm(lower, f))) out.push(canon)
  }
  return out
}
