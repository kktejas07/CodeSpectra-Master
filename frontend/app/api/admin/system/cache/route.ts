import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { invalidateServerSecretsCache } from '@/lib/server-secrets-cache'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

function safeExec(cmd: string, timeout = 15000): { ok: boolean; output: string } {
  try {
    const out = execSync(cmd, { timeout, encoding: 'utf-8' }).trim()
    return { ok: true, output: out || 'done' }
  } catch (e: any) {
    return { ok: false, output: e?.stderr?.toString() || e?.message || 'failed' }
  }
}

function hasDocker(): boolean {
  try {
    execSync('docker ps', { timeout: 3000, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  let body: { type?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { type } = body

  switch (type) {
    case 'next': {
      try {
        const cacheDir = path.join(process.cwd(), '.next', 'cache')
        if (fs.existsSync(cacheDir)) {
          fs.rmSync(cacheDir, { recursive: true, force: true })
        }
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
        invalidateServerSecretsCache()
        // Also try Docker system prune if available
        if (hasDocker()) {
          try { execSync('docker system prune -f --filter "until=24h" 2>/dev/null', { timeout: 30000, stdio: 'ignore' }) } catch { /* optional */ }
        }
        return NextResponse.json({ message: 'Next.js cache + secrets cache cleared' })
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
      }
    }

    case 'secrets': {
      invalidateServerSecretsCache()
      return NextResponse.json({ message: 'Server secrets cache invalidated' })
    }

    case 'piston': {
      if (!hasDocker()) {
        return NextResponse.json({ error: 'Docker not available in this container' }, { status: 500 })
      }
      const { ok, output } = safeExec(
        'docker restart codespectra-piston 2>&1',
        30000
      )
      if (!ok) return NextResponse.json({ error: output }, { status: 500 })
      return NextResponse.json({ message: 'Piston restarted — packages re-indexing. Check piston-status in 15s.' })
    }

    case 'system': {
      // Report current memory usage (can't drop host caches from container)
      const mem = process.memoryUsage()
      const { ok, output: dockerPrune } = safeExec('docker system prune -f 2>&1', 30000)
      return NextResponse.json({
        message: 'Docker prune triggered' + (ok ? '' : ' (Docker unavailable)'),
        nodeMemory: { heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB', rss: Math.round(mem.rss / 1024 / 1024) + 'MB' },
        dockerPrune: ok ? (dockerPrune || 'done') : 'Docker not available — run on host',
      })
    }

    case 'docker': {
      if (!hasDocker()) {
        return NextResponse.json({ error: 'Docker CLI not available in this container. Mount /var/run/docker.sock and install docker-cli in the Dockerfile.' }, { status: 500 })
      }
      const { ok, output } = safeExec('docker system prune -f --volumes 2>&1', 60000)
      if (!ok) return NextResponse.json({ error: output }, { status: 500 })
      return NextResponse.json({ message: output || 'Docker system pruned' })
    }

    default:
      return NextResponse.json({ error: `Unknown cache type: ${type}` }, { status: 400 })
  }
}
