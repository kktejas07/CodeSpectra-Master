/**
 * Model Context Protocol (MCP) endpoint.
 *
 * Implements the subset of the JSON-RPC 2.0 MCP wire format needed by
 * Claude Desktop / Cursor / MCP-compatible IDEs to call CodeSpectra
 * tools at runtime.
 *
 *   POST /api/mcp   { jsonrpc, id, method, params }
 *
 * Supported methods:
 *   - initialize
 *   - tools/list
 *   - tools/call        ({ name, arguments })
 *   - resources/list
 *   - resources/read    ({ uri })
 *
 * Exposed tools:
 *   - list_problems       optional filter by difficulty / search query
 *   - get_problem         (slug) -> full statement + samples
 *   - run_code            (language, source, stdin) -> Piston result
 *   - get_user_xp         (slug) -> XP + level + recent solves
 *   - get_leaderboard     (scope) -> top N entries
 */
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { problems } from '@/lib/db/problems'
import { executeOnce } from '@/lib/piston'
import { getUserXp } from '@/lib/db/leaderboard'
import { xpEvents } from '@/lib/db/leaderboard'
import { getMongoDb } from '@/lib/mongodb'
import { requireAuth } from '@/lib/route-auth'
import { xpToLevel } from '@/lib/leaderboard-utils'

export const runtime = 'nodejs'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string | null
  method: string
  params?: Record<string, unknown>
}

const SERVER_INFO = {
  name: 'codespectra-mcp',
  version: '1.0.0',
}

const TOOLS = [
  {
    name: 'list_problems',
    description: 'List published CodeSpectra problems with optional difficulty / query filter.',
    inputSchema: {
      type: 'object',
      properties: {
        difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
        query: { type: 'string', description: 'Substring filter on title' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'get_problem',
    description: 'Fetch full problem statement, sample tests, starter code by slug.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
    },
  },
  {
    name: 'run_code',
    description: 'Execute code via Piston and return stdout/stderr.',
    inputSchema: {
      type: 'object',
      properties: {
        language: { type: 'string' },
        source: { type: 'string' },
        stdin: { type: 'string' },
      },
      required: ['language', 'source'],
    },
  },
  {
    name: 'get_user_xp',
    description: 'Get total XP, level, and solved-problem counts for a user (id or email-localpart).',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
    },
  },
  {
    name: 'get_leaderboard',
    description: 'Top N XP earners (scope: global | monthly).',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['global', 'monthly'] },
        limit: { type: 'number' },
      },
    },
  },
]

function rpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result })
}
function rpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } })
}

function textContent(text: string) {
  return { content: [{ type: 'text', text }] }
}
function jsonContent(obj: unknown) {
  return textContent(JSON.stringify(obj, null, 2))
}

async function toolCall(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'list_problems': {
      const limit = Math.min(50, Number(args.limit) || 20)
      const filter: Record<string, unknown> = { is_published: true }
      if (args.difficulty) filter.difficulty = args.difficulty
      if (args.query) filter.title = { $regex: String(args.query), $options: 'i' }
      const col = await problems()
      const rows = await col
        .find(filter, {
          projection: { _id: 0, id: 1, slug: 1, title: 1, difficulty: 1, topics: 1 },
        })
        .limit(limit)
        .toArray()
      return jsonContent({ problems: rows })
    }
    case 'get_problem': {
      const slug = String(args.slug || '').trim()
      if (!slug) throw new Error('slug required')
      const col = await problems()
      const p = await col.findOne({ slug })
      if (!p) throw new Error('not found')
      return jsonContent({
        slug: p.slug,
        title: p.title,
        difficulty: p.difficulty,
        statement: p.statement_md,
        constraints: p.constraints,
        examples: (p.test_cases || []).filter((t) => t.is_sample),
        starter_code: p.starter_code,
      })
    }
    case 'run_code': {
      const result = await executeOnce({
        language: String(args.language),
        source: String(args.source),
        stdin: String(args.stdin || ''),
      })
      return jsonContent({
        stdout: result.run.stdout,
        stderr: result.run.stderr,
        exit_code: result.run.code,
      })
    }
    case 'get_user_xp': {
      const slug = String(args.slug || '').trim()
      const db = await getMongoDb()
      const orClauses: Record<string, unknown>[] = [
        { email: { $regex: `^${slug}@`, $options: 'i' } },
      ]
      if (ObjectId.isValid(slug)) orClauses.unshift({ _id: new ObjectId(slug) })
      const u = (await db.collection('user').findOne({ $or: orClauses })) as
        | { _id: ObjectId | string; email?: string; name?: string; fullName?: string }
        | null
      if (!u) throw new Error('user not found')
      const userId = typeof u._id === 'string' ? u._id : u._id.toHexString()
      const xp = await getUserXp(userId)
      return jsonContent({
        user: { id: userId, email: u.email, name: u.name || u.fullName },
        xp,
        level: xpToLevel(xp),
      })
    }
    case 'get_leaderboard': {
      const scope = (args.scope as string) || 'global'
      const limit = Math.min(50, Number(args.limit) || 10)
      const match: Record<string, unknown> = {}
      if (scope === 'monthly') {
        const m = new Date()
        m.setUTCDate(1)
        m.setUTCHours(0, 0, 0, 0)
        match.created_at = { $gte: m.toISOString() }
      }
      const col = await xpEvents()
      const rows = await col
        .aggregate([
          { $match: match },
          { $group: { _id: '$user_id', total: { $sum: '$amount' } } },
          { $sort: { total: -1 } },
          { $limit: limit },
        ])
        .toArray()
      const db = await getMongoDb()
      const ids = rows.map((r) => r._id as string)
      const objectIds = ids
        .filter((id) => ObjectId.isValid(id))
        .map((id) => new ObjectId(id))
      const users = (await db
        .collection('user')
        .find({ _id: { $in: objectIds } })
        .toArray()) as Array<{
        _id: ObjectId | string
        name?: string
        fullName?: string
        email?: string
      }>
      const byId = new Map(
        users.map((u) => [
          typeof u._id === 'string' ? u._id : u._id.toHexString(),
          u,
        ]),
      )
      return jsonContent({
        scope,
        entries: rows.map((r, i) => {
          const u = byId.get(r._id as string)
          return {
            rank: i + 1,
            userId: r._id,
            name: u?.name || u?.fullName || u?.email || 'unknown',
            xp: r.total,
            level: xpToLevel(r.total as number),
          }
        }),
      })
    }
    default:
      throw new Error(`unknown tool: ${name}`)
  }
}

export async function POST(req: NextRequest) {
  const authGate = await requireAuth()
  if ('error' in authGate) return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Authentication required' } })

  let body: JsonRpcRequest
  try {
    body = (await req.json()) as JsonRpcRequest
  } catch {
    return rpcError(null, -32700, 'Parse error')
  }
  if (body.jsonrpc !== '2.0' || !body.method) {
    return rpcError(body.id ?? null, -32600, 'Invalid request')
  }

  try {
    switch (body.method) {
      case 'initialize':
        return rpcResult(body.id, {
          protocolVersion: '2025-03-26',
          serverInfo: SERVER_INFO,
          capabilities: { tools: {}, resources: {} },
        })

      case 'tools/list':
        return rpcResult(body.id, { tools: TOOLS })

      case 'tools/call': {
        const { name, arguments: args } = (body.params || {}) as {
          name?: string
          arguments?: Record<string, unknown>
        }
        if (!name) return rpcError(body.id, -32602, 'name required')
        const result = await toolCall(name, args || {})
        return rpcResult(body.id, result)
      }

      case 'resources/list':
        return rpcResult(body.id, {
          resources: [
            {
              uri: 'codespectra://problems',
              name: 'CodeSpectra problem catalog',
              mimeType: 'application/json',
            },
          ],
        })

      case 'resources/read': {
        const uri = String((body.params as { uri?: string })?.uri || '')
        if (uri === 'codespectra://problems') {
          const col = await problems()
          const rows = await col
            .find(
              { is_published: true },
              { projection: { _id: 0, slug: 1, title: 1, difficulty: 1, topics: 1 } },
            )
            .toArray()
          return rpcResult(body.id, {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(rows, null, 2),
              },
            ],
          })
        }
        return rpcError(body.id, -32602, 'Unknown resource')
      }

      default:
        return rpcError(body.id, -32601, `Method not found: ${body.method}`)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return rpcError(body.id, -32000, msg)
  }
}

/** Convenience GET (manifest/health check). */
export async function GET() {
  return NextResponse.json({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    tools: TOOLS.map((t) => t.name),
    endpoint: '/api/mcp',
    protocol: 'mcp-json-rpc-2.0',
  })
}
