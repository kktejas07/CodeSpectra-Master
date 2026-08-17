import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { invalidateServerSecretsCache } from '@/lib/server-secrets-cache'
import { flushRateLimitKeys } from '@/lib/upstash-rate-limit'
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

/**
 * True only when a Docker daemon is actually reachable. The frontend container
 * ships with the docker CLI but no socket by default — the daemon is only
 * reachable after the Docker socket is mounted (Dokploy → service → volumes →
 * `docker.sock` → `/var/run/docker.sock`).
 */
function hasDocker(): boolean {
  try {
    execSync('docker info --format "{{.ServerVersion}}"', { timeout: 5000, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function clearNextBuildCache(): void {
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
        clearNextBuildCache()
        invalidateServerSecretsCache()
        return NextResponse.json({ message: 'Next.js build cache + secrets cache cleared' })
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
        return NextResponse.json({
          error: 'Docker daemon is not reachable from this container, so Piston cannot be restarted here.',
        }, { status: 500 })
      }
      const { ok, output } = safeExec(
        'docker restart codespectra-piston 2>&1',
        30000
      )
      if (!ok) return NextResponse.json({ error: output }, { status: 500 })
      return NextResponse.json({ message: 'Piston restarted — packages re-indexing. Check piston-status in 15s.' })
    }

    case 'system': {
      // Real on-server cleanup: build cache + secrets cache + Redis rate-limit
      // counters, then docker prune when the daemon is reachable.
      const cleared: string[] = []
      try {
        clearNextBuildCache()
        cleared.push('Next.js build cache')
      } catch (e: any) {
        return NextResponse.json({ error: `Failed to clear build cache: ${e.message}` }, { status: 500 })
      }
      invalidateServerSecretsCache()
      cleared.push('server secrets cache')

      let flushed = 0
      try {
        const r = await flushRateLimitKeys()
        flushed = r.flushed
        cleared.push(`rate-limit counters (${flushed} reset)`)
      } catch (e: any) {
        cleared.push('rate-limit counters (skipped — Redis error)')
      }

      const dockerAvailable = hasDocker()
      let pruned = false
      if (dockerAvailable) {
        const { ok: prunedOk } = safeExec('docker system prune -a -f --filter "until=24h"', 60000)
        pruned = prunedOk
      }

      return NextResponse.json({
        message: `Cleared ${cleared.join(' + ')}${pruned ? ' + pruned orphaned Docker resources (24h)' : ''}.`,
        cleared,
        rateLimitFlushed: flushed,
        dockerAvailable,
        dockerPruned: pruned,
        dockerCommand: dockerAvailable ? '' : 'docker system prune -a -f --filter "until=24h"',
      })
    }

    case 'docker': {
      if (!hasDocker()) {
        return NextResponse.json(
          {
            error: 'Docker daemon is not reachable from this container. Mount the Docker socket (Dokploy → service → volumes → add /var/run/docker.sock) to run one-click pruning.',
            dockerCommand: 'docker system prune -a -f --filter "until=24h"',
          },
          { status: 500 },
        )
      }
      const { ok, output } = safeExec('docker system prune -a -f --filter "until=24h"', 60000)
      if (!ok) return NextResponse.json({ error: output }, { status: 500 })
      return NextResponse.json({ message: 'Docker system prune completed — unused images & build cache reclaimed. (Docker volumes are never touched.)' })
    }

    default:
      return NextResponse.json({ error: `Unknown cache type: ${type}` }, { status: 400 })
  }
}