/**
 * Secret scanner — detects hardcoded credentials, API keys, tokens, and secrets
 * using regex patterns. Identifies potential secrets in source code before they
 * are committed to version control.
 */

export interface SecretFinding {
  line: number
  column: number
  message: string
  severity: 'critical' | 'high' | 'medium'
  rule: string
  type: 'secret'
  secret_type: string
  context?: string
}

interface SecretPattern {
  name: string
  regex: RegExp
  severity: 'critical' | 'high' | 'medium'
  message: (match: string) => string
}

const PATTERNS: SecretPattern[] = [
  // AWS
  { name: 'aws-access-key', regex: /(?:^|[^A-Z0-9])(AKIA[0-9A-Z]{16})(?:$|[^A-Z0-9])/g, severity: 'critical', message: () => 'AWS Access Key ID detected — can be used to access AWS resources' },
  { name: 'aws-secret-key', regex: /(?:^|[^A-Za-z0-9+/=])((?![A-Za-z0-9+/=]{0,100}:[0-9A-Za-z!@#$%^&*()_\-+=])[A-Za-z0-9+/=]{40})(?:$|[^A-Za-z0-9+/=])/g, severity: 'critical', message: () => 'AWS Secret Access Key detected — full AWS account compromise risk' },

  // GitHub
  { name: 'github-token', regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g, severity: 'critical', message: () => 'GitHub access token detected — can access private repositories' },
  { name: 'github-old-token', regex: /(?:^|[^A-Za-z0-9])([A-Za-z0-9]{40})(?:$|[^A-Za-z0-9])/g, severity: 'high', message: (m) => `Possible GitHub token (40-char hex): ${m.slice(0, 8)}...` },

  // Slack
  { name: 'slack-token', regex: /xox[baprs]-[0-9A-Za-z-]{10,}/g, severity: 'critical', message: () => 'Slack API token detected — can read messages and access workspace' },
  { name: 'slack-webhook', regex: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+/g, severity: 'high', message: () => 'Slack webhook URL detected — can post messages to Slack workspace' },

  // Google
  { name: 'google-api-key', regex: /AIza[0-9A-Za-z_-]{35}/g, severity: 'high', message: () => 'Google API key detected — can access Google services' },
  { name: 'google-service-account', regex: /"private_key_id":\s*"[A-Za-z0-9_-]+"/g, severity: 'critical', message: () => 'Google service account private key detected — full GCP access' },
  { name: 'gcp-svc-account', regex: /"type":\s*"service_account"/g, severity: 'critical', message: () => 'Google service account JSON credential file detected' },

  // Generic tokens
  { name: 'jwt-token', regex: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, severity: 'high', message: () => 'JWT token detected — may contain sensitive claims or provide auth access' },
  { name: 'bearer-token', regex: /(?:^|[^A-Za-z])(Bearer\s+[A-Za-z0-9._\-+/=]{20,})(?:$|[^A-Za-z0-9])/gi, severity: 'high', message: () => 'Bearer token detected in source code' },

  // Private keys
  { name: 'rsa-private-key', regex: /-----BEGIN\s+RSA\s+PRIVATE\s+KEY-----/g, severity: 'critical', message: () => 'RSA private key detected — full cryptographic signing/decryption access' },
  { name: 'ec-private-key', regex: /-----BEGIN\s+EC\s+PRIVATE\s+KEY-----/g, severity: 'critical', message: () => 'EC private key detected' },
  { name: 'pgp-private-key', regex: /-----BEGIN\s+PGP\s+PRIVATE\s+KEY\s+BLOCK-----/g, severity: 'critical', message: () => 'PGP private key block detected' },
  { name: 'ssh-private-key', regex: /-----BEGIN\s+(OPENSSH|SSH2)\s+PRIVATE\s+KEY-----/g, severity: 'critical', message: () => 'SSH private key detected — server access compromise risk' },
  { name: 'pkcs8-private-key', regex: /-----BEGIN\s+PRIVATE\s+KEY-----/g, severity: 'critical', message: () => 'PKCS#8 private key detected' },

  // Database connection strings
  { name: 'mongodb-uri', regex: /mongodb(?:\+srv)?:\/\/[^@\s]+:[^@\s]+@[^\s]+/g, severity: 'critical', message: () => 'MongoDB connection string with credentials detected — full database access' },
  { name: 'mysql-uri', regex: /mysql:\/\/[^@\s]+:[^@\s]+@[^\s]+/g, severity: 'critical', message: () => 'MySQL connection string with credentials detected' },
  { name: 'postgres-uri', regex: /postgres(?:ql)?:\/\/[^@\s]+:[^@\s]+@[^\s]+/g, severity: 'critical', message: () => 'PostgreSQL connection string with credentials detected' },
  { name: 'redis-uri', regex: /redis:\/\/[^@\s]+:[^@\s]+@[^\s]+/g, severity: 'critical', message: () => 'Redis connection string with password detected' },
  { name: 'generic-conn-string', regex: /(?:server|host|addr(?:ess)?)\s*=\s*[^\s;]+\s*;.*(?:uid|user\s*id)\s*=\s*[^\s;]+\s*;.*(?:password|pwd)\s*=\s*[^\s;]+/gi, severity: 'high', message: () => 'Database connection string with embedded credentials detected' },

  // Cloud provider keys
  { name: 'azure-key', regex: /(?:AccountKey|SharedAccessKey)=[A-Za-z0-9+/=]{40,}/g, severity: 'critical', message: () => 'Azure storage/key vault access key detected' },
  { name: 'gcp-api-key', regex: /(?:api_key|apikey|api-key)\s*[:=]\s*["']?AIza[0-9A-Za-z_-]{35}["']?/gi, severity: 'high', message: () => 'Google Cloud API key detected' },

  // Stripe
  { name: 'stripe-live-key', regex: /sk_live_[0-9A-Za-z]{24,}/g, severity: 'critical', message: () => 'Stripe live secret key detected — real payment processing access' },
  { name: 'stripe-test-key', regex: /sk_test_[0-9A-Za-z]{24,}/g, severity: 'medium', message: () => 'Stripe test secret key detected — should not be in production code' },
  { name: 'stripe-publishable-key', regex: /pk_(?:live|test)_[0-9A-Za-z]{24,}/g, severity: 'medium', message: () => 'Stripe publishable key detected (this is ok for frontend but verify context)' },

  // Twilio
  { name: 'twilio-key', regex: /SK[A-Za-z0-9]{32}/g, severity: 'high', message: () => 'Twilio API key detected' },

  // Generic passwords
  { name: 'password-assignment', regex: /(?:password|passwd|pwd|secret)\s*[:=]\s*["'][^"']{6,}["']/gi, severity: 'high', message: () => 'Possible hardcoded password detected' },
  { name: 'api-key-assignment', regex: /(?:api[_-]?key|apikey)\s*[:=]\s*["'][A-Za-z0-9_\-+=/]{16,}["']/gi, severity: 'high', message: () => 'Possible API key hardcoded in source' },

  // npm tokens
  { name: 'npm-token', regex: /npm_[A-Za-z0-9]{36,}/g, severity: 'critical', message: () => 'npm access token detected — can publish packages' },

  // Heroku
  { name: 'heroku-api-key', regex: /heroku_api_key\s*[:=]\s*["']?[A-Za-z0-9-]{36}["']?/gi, severity: 'high', message: () => 'Heroku API key detected' },

  // Telegram
  { name: 'telegram-bot-token', regex: /[0-9]{8,10}:[A-Za-z0-9_-]{35}/g, severity: 'medium', message: () => 'Telegram bot token detected' },

  // Docker
  { name: 'docker-password', regex: /(?:"registry_password"|"password"\s*:\s*")[^"]{6,}"/g, severity: 'high', message: () => 'Docker registry password detected' },

  // Generic tokens with high entropy
  { name: 'high-entropy-string', regex: /["'`](?:[A-Za-z0-9+/=]{40,}|[A-Fa-f0-9]{32,}|[A-Za-z0-9_-]{45,})["'`]/g, severity: 'medium', message: (m) => `High-entropy string detected (potential secret): ${m.slice(0, 20)}...` },
]

export function scanSecrets(code: string, filename?: string): SecretFinding[] {
  const findings: SecretFinding[] = []
  const lines = code.split('\n')
  const isTestFile = filename ? /(test|spec|mock|fixture|\.test\.|\.spec\.)/i.test(filename) : false

  // Skip test/mock files for certain patterns to reduce noise
  const skipPatterns = isTestFile ? ['aws-access-key', 'github-token', 'password-assignment'] : []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNum = i + 1

    // Skip comment-only lines and obvious placeholders
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue
    if (trimmed.includes('example') || trimmed.includes('placeholder') || trimmed.includes('your-') || trimmed.includes('<your')) continue

    for (const pattern of PATTERNS) {
      if (skipPatterns.includes(pattern.name)) continue
      pattern.regex.lastIndex = 0
      const match = pattern.regex.exec(line)
      if (match) {
        const matchedText = match[1] || match[0]
        // Skip if it's in a comment context (after // or #)
        const beforeMatch = line.slice(0, match.index)
        if (beforeMatch.includes('//') || beforeMatch.includes('#')) continue

        findings.push({
          line: lineNum,
          column: match.index + 1,
          message: pattern.message(matchedText),
          severity: pattern.severity,
          rule: `secret-${pattern.name}`,
          type: 'secret',
          secret_type: pattern.name,
          context: line.trim().slice(0, 120),
        })
      }
    }
  }

  // Deduplicate adjacent findings from the same pattern on the same line
  return findings.filter((f, idx) => {
    if (idx === 0) return true
    const prev = findings[idx - 1]
    return !(prev.line === f.line && prev.rule === f.rule)
  })
}

export function getSecretStats(findings: SecretFinding[]): { critical: number; high: number; medium: number; total: number } {
  return {
    total: findings.length,
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
  }
}
