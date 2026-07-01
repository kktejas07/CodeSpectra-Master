import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import os from 'os'
import { execSync } from 'child_process'

function safeExec(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 5000, encoding: 'utf-8' }).trim()
  } catch {
    return ''
  }
}

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  // CPU
  const cpus = os.cpus()
  const cpuModel = cpus[0]?.model || 'Unknown'
  const cpuCores = cpus.length
  const loadAvg = os.loadavg()

  // RAM
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem

  // Disk
  let diskTotal = 0, diskUsed = 0, diskFree = 0, diskPct = 0
  try {
    const df = safeExec("df -k / | tail -1")
    const parts = df.split(/\s+/)
    diskTotal = parseInt(parts[1]) * 1024
    diskUsed = parseInt(parts[2]) * 1024
    diskFree = parseInt(parts[3]) * 1024
    diskPct = parseInt(parts[4])
  } catch { /* ignore */ }

  // Uptime
  const uptime = os.uptime()

  // Docker stats
  let containerCount = 0
  let containers: Array<{ name: string; status: string; cpu: string; memory: string }> = []
  try {
    const ps = safeExec("docker ps --format '{{.Names}}\t{{.Status}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' --no-trunc")
    const lines = ps.split('\n').filter(Boolean)
    containerCount = lines.length
    containers = lines.slice(0, 30).map((line) => {
      const [name, status, cpu, memUsage, memPerc] = line.split('\t')
      return {
        name: name?.replace(/\.1\..*/, '') || 'unknown',
        status: status || '',
        cpu: cpu || '0%',
        memory: memUsage || '0MiB',
      }
    })
  } catch { /* ignore */ }

  // Piston status
  let pistonStatus = 'unknown'
  let pistonRuntimes = 0
  let pistonQueue = 0
  try {
    const pistonResp = await fetch('http://codespectra-piston:2000/api/v2/runtimes', {
      signal: AbortSignal.timeout(3000),
    })
    if (pistonResp.ok) {
      const data = await pistonResp.json()
      pistonStatus = 'connected'
      pistonRuntimes = Array.isArray(data) ? data.length : 0
    } else {
      pistonStatus = `error: HTTP ${pistonResp.status}`
    }
  } catch {
    pistonStatus = 'unreachable'
  }
  try {
    const out = safeExec("docker exec codespectra-piston cat /tmp/piston-queue 2>/dev/null || echo 0")
    pistonQueue = parseInt(out) || 0
  } catch { /* ignore */ }

  // Node.js process memory
  const nodeMem = process.memoryUsage()

  return NextResponse.json({
    cpu: {
      model: cpuModel,
      cores: cpuCores,
      loadAvg1: loadAvg[0],
      loadAvg5: loadAvg[1],
      loadAvg15: loadAvg[2],
      usagePct: Math.round((loadAvg[0] / cpuCores) * 100),
    },
    memory: {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      usagePct: Math.round((usedMem / totalMem) * 100),
    },
    disk: {
      total: diskTotal,
      used: diskUsed,
      free: diskFree,
      usagePct: diskPct,
    },
    uptime,
    containers: {
      count: containerCount,
      list: containers,
    },
    piston: {
      status: pistonStatus,
      runtimes: pistonRuntimes,
      queue: pistonQueue,
    },
    node: {
      heapUsed: nodeMem.heapUsed,
      heapTotal: nodeMem.heapTotal,
      rss: nodeMem.rss,
    },
  })
}
