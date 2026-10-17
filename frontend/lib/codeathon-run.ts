import { executeOnce } from '@/lib/piston'

/**
 * Run a codeathon solution in the shared execution backend (Piston, or the
 * dev-only local executor that lib/piston.ts gates off in production).
 *
 * Replaces the old `child_process.exec` heredoc runner, which executed
 * participant code directly on the app server and could be broken out of
 * with a line reading `EOF`.
 */
export async function runCodeathonCode(
  code: string,
  language: string,
  input: string,
): Promise<{ output: string; error: string; exitCode: number }> {
  const lang = language === 'cpp' ? 'c++' : language
  try {
    const r = await executeOnce({ language: lang, source: String(code ?? ''), stdin: String(input ?? ''), timeoutMs: 10000 })
    if (r.compile && r.compile.code) {
      return { output: '', error: (r.compile.output || r.compile.stderr || 'Compilation failed').trim(), exitCode: r.compile.code }
    }
    return { output: (r.run.stdout || '').trim(), error: (r.run.stderr || '').trim(), exitCode: r.run.code ?? 1 }
  } catch (e) {
    return { output: '', error: e instanceof Error ? e.message : 'Execution failed', exitCode: 1 }
  }
}
