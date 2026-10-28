#!/usr/bin/env node
/**
 * Production HTTP entry (Dockerfile CMD). Same as `next start`, plus one thing
 * `next start` cannot do: record the real TCP peer of every request.
 *
 * `x-codespectra-peer` is ALWAYS overwritten with req.socket.remoteAddress, so
 * a client can never forge it, and CODESPECTRA_SOCKET_PEER=1 tells
 * lib/client-ip.ts (same process) that the header is ours. Forwarding headers
 * (X-Forwarded-For / X-Real-IP / CF-Connecting-IP) are then honoured only when
 * that peer is inside TRUSTED_PROXY_CIDRS (SEC-021).
 *
 * Env: PORT (default 80), HOST (default 0.0.0.0). CLI `-p <port>` / `-H <host>`
 * override them (package.json `start` uses `-p 3000`, W4-09).
 */
import http from 'node:http'
import next from 'next'

process.env.CODESPECTRA_SOCKET_PEER = '1'
process.env.NODE_ENV = process.env.NODE_ENV || 'production'

function argValue(...names) {
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (names.includes(argv[i]) && argv[i + 1]) return argv[i + 1]
  }
  return undefined
}

const port = Number(argValue('-p', '--port') || process.env.PORT || 80)
const hostname = argValue('-H', '--hostname') || process.env.HOST || '0.0.0.0'

const app = next({ dev: false, hostname, port })
const handle = app.getRequestHandler()
await app.prepare()

const server = http.createServer((req, res) => {
  req.headers['x-codespectra-peer'] = req.socket?.remoteAddress || ''
  handle(req, res).catch((err) => {
    console.error('[server] request failed:', err?.message || err)
    if (!res.headersSent) {
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  })
})
server.keepAliveTimeout = 65_000
server.headersTimeout = 66_000
server.listen(port, hostname, () => {
  console.log(`[server] ready on http://${hostname}:${port}`)
})

const shutdown = () => server.close(() => process.exit(0))
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
