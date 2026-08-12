import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

async function runCode(code: string, language: string, input: string): Promise<{ output: string; error: string; exitCode: number }> {
  const tmpDir = `/tmp/codeathon-run-${Date.now()}`
  await execAsync(`mkdir -p ${tmpDir}`)

  let cmd = ''
  switch (language) {
    case 'javascript':
      await execAsync(`cat > ${tmpDir}/solution.js << 'EOF'\n${code}\nEOF`)
      cmd = `cd ${tmpDir} && echo '${input.replace(/'/g, "'\\''")}' | node solution.js 2>&1`
      break
    case 'python':
      await execAsync(`cat > ${tmpDir}/solution.py << 'EOF'\n${code}\nEOF`)
      cmd = `cd ${tmpDir} && echo '${input.replace(/'/g, "'\\''")}' | python3 solution.py 2>&1`
      break
    case 'java':
      await execAsync(`cat > ${tmpDir}/Solution.java << 'EOF'\n${code}\nEOF`)
      await execAsync(`cd ${tmpDir} && javac Solution.java 2>&1`)
      cmd = `cd ${tmpDir} && echo '${input.replace(/'/g, "'\\''")}' | java Solution 2>&1`
      break
    case 'cpp':
      await execAsync(`cat > ${tmpDir}/solution.cpp << 'EOF'\n${code}\nEOF`)
      await execAsync(`cd ${tmpDir} && g++ -o solution solution.cpp 2>&1`)
      cmd = `cd ${tmpDir} && echo '${input.replace(/'/g, "'\\''")}' | ./solution 2>&1`
      break
    default:
      return { output: '', error: 'Unsupported language', exitCode: 1 }
  }

  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 10000 })
    await execAsync(`rm -rf ${tmpDir}`)
    return { output: stdout.trim(), error: stderr.trim(), exitCode: 0 }
  } catch (e: any) {
    await execAsync(`rm -rf ${tmpDir}`).catch(() => {})
    return { output: e.stdout?.trim() || '', error: e.stderr?.trim() || e.message, exitCode: e.code || 1 }
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; problemId: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { code: string; language: string; input: string }

  const startTime = Date.now()
  const result = await runCode(body.code, body.language, body.input)
  const executionTime = Date.now() - startTime

  return NextResponse.json({
    output: result.output,
    error: result.error,
    exitCode: result.exitCode,
    executionTime,
  })
}
