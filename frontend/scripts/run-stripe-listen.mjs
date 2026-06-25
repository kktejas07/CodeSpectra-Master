/**
 * Runs `stripe listen` for local webhooks. Prepends common Homebrew paths because
 * npm uses `sh` with a minimal PATH where `/opt/homebrew/bin` may be missing.
 */
import { spawnSync } from 'child_process'
import { existsSync } from 'fs'

const forwardTo = 'http://127.0.0.1:3000/api/webhooks/stripe'

const brewBins = ['/opt/homebrew/bin', '/usr/local/bin']
const extraPaths = brewBins.filter((p) => existsSync(`${p}/stripe`))
const pathEnv = [...extraPaths, process.env.PATH || ''].filter(Boolean).join(':')

const explicit = process.env.STRIPE_CLI_PATH?.trim()
const stripeBin = explicit || 'stripe'

const result = spawnSync(stripeBin, ['listen', '--forward-to', forwardTo], {
  stdio: 'inherit',
  env: { ...process.env, PATH: pathEnv },
  shell: false,
})

if (result.error?.code === 'ENOENT') {
  console.error(`
Stripe CLI is not installed (or not on PATH).

macOS (recommended):
  brew install stripe/stripe-cli/stripe
  stripe login

Then run again:
  npm run stripe:listen

Or set the binary explicitly:
  STRIPE_CLI_PATH=/path/to/stripe npm run stripe:listen

Download builds: https://github.com/stripe/stripe-cli/releases
`)
  process.exit(1)
}

process.exit(result.status ?? 1)
