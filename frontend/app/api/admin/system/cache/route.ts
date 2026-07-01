import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { invalidateServerSecretsCache } from '@/lib/server-secrets-cache'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

function safeExec(cmd: string, timeout = 10000): { ok: boolean; output: string } {
  try {
    const out = execSync(cmd, { timeout, encoding: 'utf-8' }).trim()
    return { ok: true, output: out || 'done' }
  } catch (e: any) {
    return { ok: false, output: e?.stderr?.toString() || e?.message || 'failed' }
  }
}

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  let body: { type?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { type } = body

  switch (type) {
    case 'next': {
      try {
        const nextDir = path.join(process.cwd(), '.next', 'cache')
        if (fs.existsSync(nextDir)) {
          fs.rmSync(nextDir, { recursive: true, force: true })
        }
        // Also remove prerender cache entries
        const serverDir = path.join(process.cwd(), '.next', 'server')
        const removeMeta = (dir: string) => {
          if (!fs.existsSync(dir)) return
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) removeMeta(full)
            else if (entry.name.endsWith('.meta') || entry.name.endsWith('.html')) {
              try { fs.unlinkSync(full) } catch { /* race */ }
            }
          }
        }
        removeMeta(serverDir)
        return NextResponse.json({ message: 'Next.js cache cleared' })
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
      }
    }

    case 'secrets': {
      invalidateServerSecretsCache()
      return NextResponse.json({ message: 'Server secrets cache invalidated' })
    }

    case 'piston': {
      const { ok, output } = safeExec(
        'docker exec codespectra-piston sh -c "rm -rf /piston/packages/*/.installed 2>/dev/null; echo done"',
        5000
      )
      if (!ok) return NextResponse.json({ error: output }, { status: 500 })
      return NextResponse.json({ message: 'Piston package cache cleared (reinstall needed)' })
    }

    case 'system': {
      const { ok, output } = safeExec('echo 3 > /proc/sys/vm/drop_caches', 5000)
      if (!ok) return NextResponse.json({ error: output }, { status: 500 })
      return NextResponse.json({ message: 'System page cache dropped' })
    }

    case 'docker': {
      const { ok, output } = safeExec('docker system prune -f --volumes 2>&1', 30000)
      if (!ok) return NextResponse.json({ error: output }, { status: 500 })
      return NextResponse.json({ message: output || 'Docker system pruned' })
    }

    default:
      return NextResponse.json({ error: `Unknown cache type: ${type}` }, { status: 400 })
  }
}
