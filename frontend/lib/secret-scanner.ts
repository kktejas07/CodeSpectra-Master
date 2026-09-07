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
  /**
   * strict = provider-prefixed / deterministic signature (e.g. `AKIA`, `ghp_`,
   * `sk-ant-`). These bypass the placeholder allowlist because the prefix
   * itself is proof of a real credential format — Gitleaks flags
   * `AKIAIOSFODNN7EXAMPLE` for the same reason.
   * Non-strict (generic) rules always pass through the allowlist + entropy gate.
   */
  strict?: boolean
  /** Minimum Shannon entropy (bits/char) required to report. Gates generic rules. */
  minEntropy?: number
  /** Match-group index the entropy check runs against (default: whole match). */
  entropyGroup?: number
}

/**
 * Shannon entropy in bits per character. Random base64-ish secrets sit
 * around 5-6; English prose around 3.5-4.2. Threshold 4.5 keeps real tokens
 * while dropping sentences / identifiers caught by broad generic regexes.
 */
export function shannonEntropy(s: string): number {
  if (!s) return 0
  const freq = new Map<string, number>()
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1)
  let h = 0
  for (const n of freq.values()) {
    const p = n / s.length
    h -= p * Math.log2(p)
  }
  return h
}

/**
 * Obvious placeholders / template stubs — never real secrets.
 * Applied ONLY to non-strict (generic) rules; provider-prefixed rules bypass it.
 */
const ALLOWLIST_RE =
  /EXAMPLE|SANDBOX|SAMPLE|PLACEHOLDER|DEMO|TESTING|XXXX+|YOUR[-_ ]?(KEY|TOKEN|SECRET|PASSWORD|API)|[-_](HERE|TODO|TODO)[-_]?|<[^<>\n]*>|\$\{[^}\n]*\}|^(abcd|1234|password|changeme|none|null|undefined)$/i

/** True when `v` is an obvious dummy (placeholder text, template var, repeated char). */
export function isAllowlistedPlaceholder(v: string): boolean {
  const t = v.replace(/^["'`]|["'`]$/g, '')
  return ALLOWLIST_RE.test(t) || /^(.)\1{5,}$/.test(t)
}

const PATTERNS: SecretPattern[] = [
  // ── AWS ──────────────────────────────────────────────────────────────
  { name: 'aws-access-key', regex: /(?:^|[^A-Z0-9])(AKIA[0-9A-Z]{16})(?:$|[^A-Z0-9])/g, severity: 'critical', message: () => 'AWS Access Key ID detected — can be used to access AWS resources', strict: true },
  { name: 'aws-secret-key', regex: /(?:^|[^A-Za-z0-9+/=])((?![A-Za-z0-9+/=]{0,100}:[0-9A-Za-z!@#$%^&*()_\-+=])[A-Za-z0-9+/=]{40})(?:$|[^A-Za-z0-9+/=])/g, severity: 'critical', message: () => 'AWS Secret Access Key detected — full AWS account compromise risk' },
  { name: 'aws-session-token', regex: /ASIA[A-Z0-9]{16}/g, severity: 'critical', message: () => 'AWS Session Token detected — temporary credential with elevated access', strict: true },

  // ── GitHub ───────────────────────────────────────────────────────────
  { name: 'github-token', regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g, severity: 'critical', message: () => 'GitHub access token detected — can access private repositories', strict: true },
  { name: 'github-old-token', regex: /(?:^|[^A-Za-z0-9])([A-Za-z0-9]{40})(?:$|[^A-Za-z0-9])/g, severity: 'high', message: (m) => `Possible GitHub token (40-char hex): ${m.slice(0, 8)}...` },

  // ── Slack ────────────────────────────────────────────────────────────
  { name: 'slack-token', regex: /xox[baprs]-[0-9A-Za-z-]{10,}/g, severity: 'critical', message: () => 'Slack API token detected — can read messages and access workspace', strict: true },
  { name: 'slack-webhook', regex: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+/g, severity: 'high', message: () => 'Slack webhook URL detected — can post messages to Slack workspace' },

  // ── Google ───────────────────────────────────────────────────────────
  { name: 'google-api-key', regex: /AIza[0-9A-Za-z_-]{35}/g, severity: 'high', message: () => 'Google API key detected — can access Google services', strict: true },
  { name: 'google-service-account', regex: /"private_key_id":\s*"[A-Za-z0-9_-]+"/g, severity: 'critical', message: () => 'Google service account private key detected — full GCP access' },
  { name: 'gcp-svc-account', regex: /"type":\s*"service_account"/g, severity: 'critical', message: () => 'Google service account JSON credential file detected' },

  // ── OpenAI ───────────────────────────────────────────────────────────
  { name: 'openai-api-key', regex: /sk-proj-[A-Za-z0-9_\-]{20,}|sk-[A-Za-z0-9]{20,}/g, severity: 'critical', message: () => 'OpenAI API key detected — can access GPT models and billing', strict: true },

  // ── Anthropic ────────────────────────────────────────────────────────
  { name: 'anthropic-api-key', regex: /sk-ant-[A-Za-z0-9_\-]{20,}/g, severity: 'critical', message: () => 'Anthropic API key detected — can access Claude models', strict: true },

  // ── Hugging Face ─────────────────────────────────────────────────────
  { name: 'huggingface-token', regex: /hf_[A-Za-z0-9]{20,}/g, severity: 'critical', message: () => 'Hugging Face token detected — can access models and repos', strict: true },

  // ── npm ──────────────────────────────────────────────────────────────
  { name: 'npm-token', regex: /npm_[A-Za-z0-9]{20,}/g, severity: 'critical', message: () => 'npm access token detected — can publish packages', strict: true },

  // ── PyPI ─────────────────────────────────────────────────────────────
  { name: 'pypi-token', regex: /pypi-[A-Za-z0-9_\-]{20,}/g, severity: 'critical', message: () => 'PyPI API token detected — can publish Python packages', strict: true },

  // ── GitLab ───────────────────────────────────────────────────────────
  { name: 'gitlab-pat', regex: /glpat-[A-Za-z0-9_\-]{20,}/g, severity: 'critical', message: () => 'GitLab personal access token detected — can access repositories', strict: true },

  // ── Bitbucket ────────────────────────────────────────────────────────
  { name: 'bitbucket-app-password', regex: /(?:bitbucket)[\s\S]{0,30}(?:password|app_password|app-password)\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}["']?/gi, severity: 'high', message: () => 'Bitbucket app password detected' },

  // ── Discord ──────────────────────────────────────────────────────────
  { name: 'discord-bot-token', regex: /[MN][A-Za-z0-9_\-]{23,}\.[A-Za-z0-9_\-]{6}\.[A-Za-z0-9_\-]{27,}/g, severity: 'high', message: () => 'Discord bot token detected — can control bot and access server data', strict: true },

  // ── Telegram ─────────────────────────────────────────────────────────
  { name: 'telegram-bot-token', regex: /[0-9]{8,10}:[A-Za-z0-9_\-]{35}/g, severity: 'high', message: () => 'Telegram bot token detected — can send messages and access bot data', strict: true },

  // ── Cloudflare ───────────────────────────────────────────────────────
  { name: 'cloudflare-api-token', regex: /(?:cloudflare)[\s\S]{0,30}(?:api[_-]?token|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_\-]{40}["']?/gi, severity: 'high', message: () => 'Cloudflare API token detected — can manage DNS and firewall rules' },

  // ── Razorpay ─────────────────────────────────────────────────────────
  { name: 'razorpay-key', regex: /rzp_(?:live|test)_[A-Za-z0-9]{14,}/g, severity: 'high', message: () => 'Razorpay key detected — can access payment gateway', strict: true },

  // ── Algolia ──────────────────────────────────────────────────────────
  { name: 'algolia-api-key', regex: /(?:algolia)[\s\S]{0,30}(?:api[_-]?key|admin[_-]?key|search[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9]{32}["']?/gi, severity: 'high', message: () => 'Algolia API key detected — can search or manage indices' },

  // ── Mailchimp ────────────────────────────────────────────────────────
  { name: 'mailchimp-api-key', regex: /[a-f0-9]{32}-us[0-9]{1,2}/g, severity: 'high', message: () => 'Mailchimp/Mandrill API key detected — can access email lists and send campaigns', strict: true },

  // ── SendGrid ─────────────────────────────────────────────────────────
  { name: 'sendgrid-api-key', regex: /SG\.[A-Za-z0-9_\-]{22,}\.[A-Za-z0-9_\-]{43,}/g, severity: 'critical', message: () => 'SendGrid API key detected — can send emails and access contact lists', strict: true },

  // ── Heroku ───────────────────────────────────────────────────────────
  { name: 'heroku-api-key', regex: /(?:heroku)[\s\S]{0,30}(?:api[_-]?key)\s*[:=]\s*["']?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}["']?/gi, severity: 'high', message: () => 'Heroku API key detected — can manage apps and add-ons' },

  // ── Firebase ─────────────────────────────────────────────────────────
  { name: 'firebase-server-key', regex: /AAAA[A-Za-z0-9_\-]{7,}/g, severity: 'high', message: () => 'Firebase Cloud Messaging server key detected — can send push notifications', strict: true },

  // ── Azure ────────────────────────────────────────────────────────────
  { name: 'azure-key', regex: /(?:AccountKey|SharedAccessKey)=[A-Za-z0-9+/=]{40,}/g, severity: 'critical', message: () => 'Azure storage/key vault access key detected' },
  { name: 'azure-client-secret', regex: /(?:azure)[\s\S]{0,30}(?:client[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9_\-~.]{20,}["']?/gi, severity: 'critical', message: () => 'Azure client secret detected — can authenticate as application' },

  // ── GCP ──────────────────────────────────────────────────────────────
  { name: 'gcp-api-key', regex: /(?:api_key|apikey|api-key)\s*[:=]\s*["']?AIza[0-9A-Za-z_-]{35}["']?/gi, severity: 'high', message: () => 'Google Cloud API key detected' },

  // ── Stripe ───────────────────────────────────────────────────────────
  { name: 'stripe-live-key', regex: /sk_live_[0-9A-Za-z]{24,}/g, severity: 'critical', message: () => 'Stripe live secret key detected — real payment processing access', strict: true },
  { name: 'stripe-test-key', regex: /sk_test_[0-9A-Za-z]{24,}/g, severity: 'medium', message: () => 'Stripe test secret key detected — should not be in production code', strict: true },
  { name: 'stripe-publishable-key', regex: /pk_(?:live|test)_[0-9A-Za-z]{24,}/g, severity: 'medium', message: () => 'Stripe publishable key detected (this is ok for frontend but verify context)', strict: true },

  // ── Twilio ───────────────────────────────────────────────────────────
  { name: 'twilio-key', regex: /SK[A-Za-z0-9]{32}/g, severity: 'high', message: () => 'Twilio API key detected' },

  // ── Generic tokens ───────────────────────────────────────────────────
  { name: 'jwt-token', regex: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, severity: 'high', message: () => 'JWT token detected — may contain sensitive claims or provide auth access' },
  { name: 'bearer-token', regex: /(?:^|[^A-Za-z])(Bearer\s+[A-Za-z0-9._\-+/=]{20,})(?:$|[^A-Za-z0-9])/gi, severity: 'high', message: () => 'Bearer token detected in source code' },

  // ── Private keys ─────────────────────────────────────────────────────
  { name: 'rsa-private-key', regex: /-----BEGIN\s+RSA\s+PRIVATE\s+KEY-----/g, severity: 'critical', message: () => 'RSA private key detected — full cryptographic signing/decryption access', strict: true },
  { name: 'ec-private-key', regex: /-----BEGIN\s+EC\s+PRIVATE\s+KEY-----/g, severity: 'critical', message: () => 'EC private key detected', strict: true },
  { name: 'pgp-private-key', regex: /-----BEGIN\s+PGP\s+PRIVATE\s+KEY\s+BLOCK-----/g, severity: 'critical', message: () => 'PGP private key block detected', strict: true },
  { name: 'ssh-private-key', regex: /-----BEGIN\s+(OPENSSH|SSH2)\s+PRIVATE\s+KEY-----/g, severity: 'critical', message: () => 'SSH private key detected — server access compromise risk', strict: true },
  { name: 'pkcs8-private-key', regex: /-----BEGIN\s+PRIVATE\s+KEY-----/g, severity: 'critical', message: () => 'PKCS#8 private key detected', strict: true },
  { name: 'private-key-file-ref', regex: /["'][^"']*\.(?:pem|p12|pfx)["']/gi, severity: 'medium', message: (m) => `Private key file reference detected: ${m}` },

  // ── Database connection strings ──────────────────────────────────────
  { name: 'mongodb-uri', regex: /mongodb(?:\+srv)?:\/\/[^@\s]+:[^@\s]+@[^\s]+/g, severity: 'critical', message: () => 'MongoDB connection string with credentials detected — full database access', strict: true },
  { name: 'mysql-uri', regex: /mysql:\/\/[^@\s]+:[^@\s]+@[^\s]+/g, severity: 'critical', message: () => 'MySQL connection string with credentials detected', strict: true },
  { name: 'postgres-uri', regex: /postgres(?:ql)?:\/\/[^@\s]+:[^@\s]+@[^\s]+/g, severity: 'critical', message: () => 'PostgreSQL connection string with credentials detected', strict: true },
  { name: 'redis-uri', regex: /redis:\/\/[^@\s]+:[^@\s]+@[^\s]+/g, severity: 'critical', message: () => 'Redis connection string with password detected', strict: true },
  { name: 'generic-conn-string', regex: /(?:server|host|addr(?:ess)?)\s*=\s*[^\s;]+\s*;.*(?:uid|user\s*id)\s*=\s*[^\s;]+\s*;.*(?:password|pwd)\s*=\s*[^\s;]+/gi, severity: 'high', message: () => 'Database connection string with embedded credentials detected' },

  // ── Cloud provider keys ──────────────────────────────────────────────

  // ── Generic passwords ────────────────────────────────────────────────
  { name: 'password-assignment', regex: /(?:password|passwd|pwd|secret)\s*[:=]\s*["'][^"']{6,}["']/gi, severity: 'high', message: () => 'Possible hardcoded password detected' },
  { name: 'api-key-assignment', regex: /(?:api[_-]?key|apikey)\s*[:=]\s*["'][A-Za-z0-9_\-+=/]{16,}["']/gi, severity: 'high', message: () => 'Possible API key hardcoded in source' },

  // ── Docker ───────────────────────────────────────────────────────────
  { name: 'docker-password', regex: /(?:"registry_password"|"password"\s*:\s*")[^"]{6,}"/g, severity: 'high', message: () => 'Docker registry password detected' },

  // ── High-entropy assignment (generic catch-all with entropy gate) ────
  {
    name: 'high-entropy-assignment',
    regex: /[A-Za-z0-9_\-]{3,}\s*[:=]\s*["']([A-Za-z0-9_\-/+=]{32,})["']/g,
    severity: 'high',
    message: (m) => `High-entropy value assigned to variable (potential secret): ${m.slice(0, 30)}...`,
    minEntropy: 4.0,
    entropyGroup: 1,
  },

  // ── Generic high-entropy strings (quoted) ────────────────────────────
  {
    name: 'high-entropy-string',
    regex: /["'`](?:[A-Za-z0-9+/=]{40,}|[A-Fa-f0-9]{32,}|[A-Za-z0-9_-]{45,})["'`]/g,
    severity: 'medium',
    message: (m) => `High-entropy string detected (potential secret): ${m.slice(0, 20)}...`,
    minEntropy: 4.5,
  },
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
      let match: RegExpExecArray | null
      while ((match = pattern.regex.exec(line)) !== null) {
        const matchedText = match[1] || match[0]
        // Skip if it's in a comment context (after // or #)
        const beforeMatch = line.slice(0, match.index)
        if (beforeMatch.includes('//') || beforeMatch.includes('#')) continue

        // Allowlist check — only for non-strict rules
        if (!pattern.strict && isAllowlistedPlaceholder(matchedText)) continue

        // Shannon entropy gate — only for rules with minEntropy set
        if (pattern.minEntropy !== undefined) {
          const groupIdx = pattern.entropyGroup ?? 0
          const entropyStr = match[groupIdx] ?? matchedText
          if (shannonEntropy(entropyStr) < pattern.minEntropy) continue
        }

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
        // Non-global regexes would loop; global ones are reset above via lastIndex=0
        break
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
