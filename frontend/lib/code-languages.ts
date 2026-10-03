/**
 * Candidate-selectable coding languages.
 *
 * `id` is the Piston runtime id — this is what the grader actually executes,
 * so it must match an installed runtime on the sandbox. `monaco` is only the
 * editor's syntax mode. Curated to runtimes the sandbox has (verified via
 * GET /api/v2/runtimes); offering a language the runner lacks would zero a
 * candidate for the wrong reason.
 */
export interface CodeLanguage {
  id: string
  label: string
  monaco: string
}

export const CODE_LANGUAGES: CodeLanguage[] = [
  { id: 'python', label: 'Python', monaco: 'python' },
  { id: 'java', label: 'Java', monaco: 'java' },
  { id: 'c++', label: 'C++', monaco: 'cpp' },
  { id: 'c', label: 'C', monaco: 'c' },
  { id: 'csharp', label: 'C# / .NET', monaco: 'csharp' },
  { id: 'javascript', label: 'JavaScript', monaco: 'javascript' },
  { id: 'typescript', label: 'TypeScript', monaco: 'typescript' },
  { id: 'go', label: 'Go', monaco: 'go' },
  { id: 'ruby', label: 'Ruby', monaco: 'ruby' },
  { id: 'rust', label: 'Rust', monaco: 'rust' },
  { id: 'kotlin', label: 'Kotlin', monaco: 'kotlin' },
  { id: 'swift', label: 'Swift', monaco: 'swift' },
]

const DEFAULT_LANGUAGE = 'python'

/** Monaco syntax mode for a Piston runtime id. */
export function monacoIdFor(pistonId: string | undefined): string {
  return CODE_LANGUAGES.find((l) => l.id === (pistonId || '').toLowerCase())?.monaco || DEFAULT_LANGUAGE
}

/**
 * Normalize a stored legacy language id to a Piston runtime id.
 * Maps editor-era ids (cpp, c#, node, python3) so answers saved before the
 * language picker existed still grade under the right runtime.
 */
export function normalizeCodeLang(lang: string | undefined): string {
  const v = (lang || DEFAULT_LANGUAGE).toLowerCase()
  const map: Record<string, string> = {
    cpp: 'c++',
    'c#': 'csharp',
    cs: 'csharp',
    'c++17': 'c++',
    node: 'javascript',
    nodejs: 'javascript',
    python3: 'python',
    py: 'python',
  }
  return map[v] || v
}
