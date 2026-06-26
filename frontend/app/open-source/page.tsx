'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, GitBranch, Award, BookOpen, ShieldCheck, Code2 } from 'lucide-react'

/**
 * /open-source — public attribution page.
 *
 * Lists every open-source dependency, curriculum source, and tool used by
 * the certification + audit + mobile features. Linked from the footer of
 * every certification page so candidates and employers can audit the
 * supply chain in one click.
 */
interface Item {
  name: string
  license: string
  url: string
  use: string
}

const CURRICULA: Item[] = [
  { name: 'MDN Web Docs', license: 'CC-BY-SA 2.5', url: 'https://developer.mozilla.org/', use: 'JavaScript (Basic) — question bank' },
  { name: 'exercism Python track', license: 'MIT', url: 'https://github.com/exercism/python', use: 'Python (Basic) — question bank' },
  { name: 'FreeCodeCamp Relational DB', license: 'BSD-3-Clause', url: 'https://www.freecodecamp.org/learn/relational-database/', use: 'SQL (Basic) — question bank' },
  { name: 'React Docs (Meta)', license: 'CC-BY-4.0', url: 'https://react.dev/', use: 'React (Intermediate) — question bank' },
  { name: 'OSSU CS curriculum', license: 'MIT', url: 'https://github.com/ossu/computer-science', use: 'Data Structures & Algorithms — question bank' },
  { name: 'web.dev (Google)', license: 'CC-BY-4.0', url: 'https://web.dev/', use: 'Frontend Developer — question bank' },
]

const LIBRARIES: Item[] = [
  { name: 'Next.js', license: 'MIT', url: 'https://github.com/vercel/next.js', use: 'Application framework' },
  { name: 'React', license: 'MIT', url: 'https://github.com/facebook/react', use: 'UI library' },
  { name: 'Tailwind CSS', license: 'MIT', url: 'https://github.com/tailwindlabs/tailwindcss', use: 'Styling for every page incl. certificate templates' },
  { name: 'lucide-react', license: 'ISC', url: 'https://github.com/lucide-icons/lucide', use: 'Icons throughout the app' },
  { name: 'qrcode', license: 'MIT', url: 'https://github.com/soldair/node-qrcode', use: 'QR code generation in certificates' },
  { name: 'Better Auth', license: 'MIT', url: 'https://github.com/better-auth/better-auth', use: 'Authentication + session management' },
  { name: 'MongoDB Node driver', license: 'Apache-2.0', url: 'https://github.com/mongodb/node-mongodb-native', use: 'Database access' },
  { name: 'React Flow', license: 'MIT', url: 'https://github.com/xyflow/xyflow', use: 'Workflow visual builder' },
  { name: 'Monaco Editor', license: 'MIT', url: 'https://github.com/microsoft/monaco-editor', use: 'Code sandbox editor' },
]

const TOOLS: Item[] = [
  { name: 'pip-audit', license: 'Apache-2.0', url: 'https://github.com/pypa/pip-audit', use: 'Python dependency vulnerability scanning' },
  { name: 'npm audit', license: 'Artistic-2.0', url: 'https://docs.npmjs.com/cli/v10/commands/npm-audit', use: 'Node dependency vulnerability scanning' },
  { name: 'Piston', license: 'MIT', url: 'https://github.com/engineer-man/piston', use: 'Code sandbox execution engine' },
]

const MOBILE: Item[] = [
  { name: 'SwiftUI', license: 'Apple SDK (free)', url: 'https://developer.apple.com/xcode/swiftui/', use: 'iOS scaffold UI' },
  { name: 'Jetpack Compose', license: 'Apache-2.0', url: 'https://developer.android.com/jetpack/compose', use: 'Android scaffold UI' },
  { name: 'OkHttp', license: 'Apache-2.0', url: 'https://github.com/square/okhttp', use: 'Android HTTP client' },
  { name: 'kotlinx.serialization', license: 'Apache-2.0', url: 'https://github.com/Kotlin/kotlinx.serialization', use: 'Android JSON decoding' },
]

function Section({ icon: Icon, title, subtitle, items, testid }: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle: string
  items: Item[]
  testid: string
}) {
  return (
    <Card className="p-6 border-border/60" data-testid={testid}>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.name} className="flex items-start justify-between gap-3 py-2 border-b border-border/40 last:border-0">
            <div className="min-w-0 flex-1">
              <a
                href={it.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground hover:text-primary inline-flex items-center gap-1"
              >
                {it.name} <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
              <p className="text-xs text-muted-foreground mt-0.5">{it.use}</p>
            </div>
            <Badge variant="outline" className="text-[10px] shrink-0">{it.license}</Badge>
          </div>
        ))}
      </div>
    </Card>
  )
}

export default function OpenSourcePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 py-12 px-4" data-testid="open-source-page">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="text-center space-y-3 mb-8">
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">100% Open Source</Badge>
          <h1 className="text-4xl font-bold">Built on open source</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Every certification on CodeSpectra is backed by open-source curricula, rendered by
            open-source libraries, and audited with open-source tooling. No proprietary
            question banks, no closed-source illustrations, no licensed-only fonts. This page
            lists every source so candidates, employers and contributors can audit the supply
            chain in one click.
          </p>
        </header>

        <Section
          icon={BookOpen}
          title="Curriculum sources"
          subtitle="Every assessment question is paraphrased from one of these open knowledge bases."
          items={CURRICULA}
          testid="oss-curricula"
        />

        <Section
          icon={Code2}
          title="Application libraries"
          subtitle="The OSI-approved packages this Next.js + React app depends on."
          items={LIBRARIES}
          testid="oss-libraries"
        />

        <Section
          icon={ShieldCheck}
          title="Audit & execution tooling"
          subtitle="Vulnerability scanners and code sandbox engines."
          items={TOOLS}
          testid="oss-tools"
        />

        <Section
          icon={GitBranch}
          title="Mobile scaffolds"
          subtitle="Native iOS + Android starter projects bundled in /app/mobile."
          items={MOBILE}
          testid="oss-mobile"
        />

        <Card className="p-6 bg-emerald-500/5 border-emerald-500/20 text-center">
          <Award className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
          <p className="text-sm">
            Spotted a missing attribution?{' '}
            <Link href="/dashboard/admin/ai-inventory" className="text-primary underline">
              File it via the AI Inventory dashboard
            </Link>{' '}
            or open a PR.
          </p>
        </Card>
      </div>
    </main>
  )
}
