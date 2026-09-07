import { describe, it, expect } from 'vitest'
import { scanSecrets, getSecretStats, shannonEntropy, isAllowlistedPlaceholder } from '@/lib/secret-scanner'

// ─── Provider-specific rules (positive + negative) ──────────────────────

describe('OpenAI API Key', () => {
  it('detects sk-proj- prefixed key', () => {
    const code = 'const key = "sk-proj-abcdefghijklmnopqrstuvwxyz123456"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'openai-api-key')).toBe(true)
  })

  it('detects sk- prefixed key (legacy)', () => {
    const code = 'OPENAI_KEY=sk-abcdefghijklmnopqrstuvwxyz123456'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'openai-api-key')).toBe(true)
  })

  it('rejects sk- with too few chars', () => {
    const code = 'const key = "sk-short"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'openai-api-key')).toBe(false)
  })
})

describe('Anthropic API Key', () => {
  it('detects sk-ant- prefixed key', () => {
    const code = 'ANTHROPIC_KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'anthropic-api-key')).toBe(true)
  })

  it('rejects sk-ant- with too few chars', () => {
    const code = 'const key = "sk-ant-short"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'anthropic-api-key')).toBe(false)
  })
})

describe('Hugging Face Token', () => {
  it('detects hf_ prefixed token', () => {
    const code = 'HF_TOKEN="hf_abcdefghijklmnopqrstuvwxyz123456"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'huggingface-token')).toBe(true)
  })

  it('rejects hf_ with too few chars', () => {
    const code = 'const t = "hf_abc"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'huggingface-token')).toBe(false)
  })
})

describe('PyPI Token', () => {
  it('detects pypi- prefixed token', () => {
    const code = 'PYPI_TOKEN = "pypi-AgEIcHlwaS5vcmcCJGY4N2E5MjYtYjc4NC00NDkyLWE5MzEtNTZhMzFm"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'pypi-token')).toBe(true)
  })

  it('rejects pypi- with too few chars', () => {
    const code = 'const t = "pypi-abc"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'pypi-token')).toBe(false)
  })
})

describe('GitLab PAT', () => {
  it('detects glpat- prefixed token', () => {
    const code = 'GITLAB_TOKEN="glpat-abcdefghijklmnopqrstuvwxyz123456"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'gitlab-pat')).toBe(true)
  })

  it('rejects glpat- with too few chars', () => {
    const code = 'const t = "glpat-short"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'gitlab-pat')).toBe(false)
  })
})

describe('Discord Bot Token', () => {
  it('detects discord bot token format', () => {
    const code = 'DISCORD_TOKEN="MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.Gabcde.abcdefghijklmnopqrstuvwx1234"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'discord-bot-token')).toBe(true)
  })

  it('rejects string that is not a discord token', () => {
    const code = 'const x = "aaaa.aa.aaa"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'discord-bot-token')).toBe(false)
  })
})

describe('SendGrid API Key', () => {
  it('detects SG. prefixed key', () => {
    const code = 'SENDGRID_KEY="SG.abcdefghijklmnopqrstuvwx.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqr"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'sendgrid-api-key')).toBe(true)
  })

  it('rejects SG. with too short segments', () => {
    const code = 'const k = "SG.abc.DEF"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'sendgrid-api-key')).toBe(false)
  })
})

describe('Mailchimp API Key', () => {
  it('detects mailchimp format key', () => {
    const code = 'MAILCHIMP_KEY="abc123def456abc123def456abc123def-us1"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'mailchimp-api-key')).toBe(true)
  })

  it('rejects non-mailchimp hex string', () => {
    const code = 'const x = "abc123def456abc123def456abc123def-us"'
    const results = scanSecrets(code)
    // us without digits should not match
    expect(results.some(r => r.secret_type === 'mailchimp-api-key')).toBe(false)
  })
})

describe('Razorpay Key', () => {
  it('detects rzp_live_ key', () => {
    const code = 'RAZORPAY_KEY="rzp_live_abcdefghijklmnopqrstuvwxyz12"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'razorpay-key')).toBe(true)
  })

  it('detects rzp_test_ key', () => {
    const code = 'RAZORPAY_KEY="rzp_test_abcdefghijklmnopqrstuvwxyz12"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'razorpay-key')).toBe(true)
  })

  it('rejects rzp_ with too few chars', () => {
    const code = 'const k = "rzp_live_short"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'razorpay-key')).toBe(false)
  })
})

describe('AWS Session Token', () => {
  it('detects ASIA prefixed token', () => {
    const code = 'session_token = "ASIA1234567890ABCDEF"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'aws-session-token')).toBe(true)
  })

  it('rejects ASIA with too few chars', () => {
    const code = 'const t = "ASIA123"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'aws-session-token')).toBe(false)
  })
})

describe('Private Key File References', () => {
  it('detects .pem file reference', () => {
    const code = 'keyPath = "/etc/ssl/private/server.pem"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'private-key-file-ref')).toBe(true)
  })

  it('detects .p12 file reference', () => {
    const code = 'keystore = "certs/identity.p12"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'private-key-file-ref')).toBe(true)
  })

  it('does not flag non-key files', () => {
    const code = 'readme = "docs/readme.md"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'private-key-file-ref')).toBe(false)
  })
})

// ─── Entropy ────────────────────────────────────────────────────────────

describe('Shannon entropy', () => {
  it('returns ~0 for empty string', () => {
    expect(shannonEntropy('')).toBe(0)
  })

  it('returns ~0 for single repeated char', () => {
    expect(shannonEntropy('aaaaaaa')).toBeCloseTo(0, 1)
  })

  it('returns high entropy for random string', () => {
    const h = shannonEntropy('aB3xK9mZqW7pL2nR')
    expect(h).toBeGreaterThan(3.0)
  })

  it('returns low entropy for English-like string', () => {
    const h = shannonEntropy('the cat sat on the mat')
    expect(h).toBeLessThan(3.5)
  })
})

describe('Entropy gate on high-entropy-assignment rule', () => {
  it('reports high-entropy random assigned value', () => {
    const code = 'API_SECRET = "aB3xK9mZqW7pL2nR8vY4cJ6dF0hG1sA5"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'high-entropy-assignment')).toBe(true)
  })

  it('rejects low-entropy assigned value', () => {
    const code = 'label = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'high-entropy-assignment')).toBe(false)
  })
})

// ─── Placeholder / allowlist filtering ──────────────────────────────────

describe('Placeholder filtering', () => {
  it('isAllowlistedPlaceholder detects YOUR_KEY pattern', () => {
    expect(isAllowlistedPlaceholder('YOUR_API_KEY_HERE')).toBe(true)
  })

  it('isAllowlistedPlaceholder detects <...> template', () => {
    expect(isAllowlistedPlaceholder('${API_KEY}')).toBe(true)
    expect(isAllowlistedPlaceholder('<token>')).toBe(true)
  })

  it('isAllowlistedPlaceholder detects repeated chars', () => {
    expect(isAllowlistedPlaceholder('xxxxxxxxxxxxxxx')).toBe(true)
  })

  it('isAllowlistedPlaceholder does not flag real-looking strings', () => {
    expect(isAllowlistedPlaceholder('sk-proj-abc123def456ghi789jkl012')).toBe(false)
  })

  it('skips lines with placeholder-ish content for non-strict rules', () => {
    const code = 'const token = "YOUR_API_KEY_HERE"'
    const results = scanSecrets(code)
    // Should not find any high-entropy assignment because it's allowlisted
    expect(results.some(r => r.secret_type === 'high-entropy-assignment')).toBe(false)
  })

  it('strict rules bypass allowlist (provider-prefixed keys still flag)', () => {
    // OpenAI key is strict-ish by prefix — sk- with long enough content should still fire
    const code = 'const key = "sk-proj-abcdefghijklmnopqrstuvwxyz123456"'
    const results = scanSecrets(code)
    expect(results.some(r => r.secret_type === 'openai-api-key')).toBe(true)
  })
})

// ─── Existing rules still pass ──────────────────────────────────────────

describe('Existing rules still pass', () => {
  it('AWS access key', () => {
    const results = scanSecrets('const x = "AKIAIOSFODNN7EXAMPLE"')
    expect(results.some(r => r.secret_type === 'aws-access-key')).toBe(true)
  })

  it('MongoDB URI', () => {
    const results = scanSecrets('const db = "mongodb://admin:pass@cluster.mongodb.net:27017/app"')
    expect(results.some(r => r.secret_type === 'mongodb-uri')).toBe(true)
  })

  it('RSA private key', () => {
    const results = scanSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIE...')
    expect(results.some(r => r.secret_type === 'rsa-private-key')).toBe(true)
  })

  it('GitHub token', () => {
    const results = scanSecrets('const t = "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"')
    expect(results.some(r => r.secret_type === 'github-token')).toBe(true)
  })

  it('Stripe live key', () => {
    const results = scanSecrets('const k = "sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"')
    expect(results.some(r => r.secret_type === 'stripe-live-key')).toBe(true)
  })

  it('PostgreSQL URI', () => {
    const results = scanSecrets('postgresql://user:pass@localhost:5432/db')
    expect(results.some(r => r.secret_type === 'postgres-uri')).toBe(true)
  })

  it('JWT token', () => {
    const results = scanSecrets('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U')
    expect(results.some(r => r.secret_type === 'jwt-token')).toBe(true)
  })

  it('Slack token', () => {
    const results = scanSecrets('const s = "xoxb-1234567890-1234567890123-abcdefghijklmnopqrstuvwx"')
    expect(results.some(r => r.secret_type === 'slack-token')).toBe(true)
  })

  it('SSH private key', () => {
    const results = scanSecrets('-----BEGIN OPENSSH PRIVATE KEY-----\nb3Bl...')
    expect(results.some(r => r.secret_type === 'ssh-private-key')).toBe(true)
  })
})

// ─── getSecretStats ─────────────────────────────────────────────────────

describe('getSecretStats', () => {
  it('returns correct stats', () => {
    const code = `
      const aws = "AKIAIOSFODNN7EXAMPLE"
      const db = "mongodb://admin:pass@host/db"
      const stripe = "sk_test_xxxxxxxxxxxxxxxxxxxxxxxx"
    `
    const results = scanSecrets(code)
    const stats = getSecretStats(results)
    expect(stats.total).toBeGreaterThanOrEqual(3)
    expect(stats.critical).toBeGreaterThanOrEqual(2)
  })
})

// ─── Comment / skip line handling ───────────────────────────────────────

describe('Line skipping', () => {
  it('skips comment lines', () => {
    const code = '// AKIAIOSFODNN7EXAMPLE is a placeholder'
    const results = scanSecrets(code)
    expect(results.length).toBe(0)
  })

  it('skips lines with placeholder keywords', () => {
    const code = 'const key = "your-aws-key-here"'
    const results = scanSecrets(code)
    expect(results.length).toBe(0)
  })
})
