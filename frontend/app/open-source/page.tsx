'use client'

import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'
import { PageHero, btnPrimary, btnSecondary } from '@/components/landing/page-hero'
import { ExternalLink, Award, BookOpen, ShieldCheck, Code2 } from 'lucide-react'

/**
 * /open-source — public attribution page.
 *
 * Lists the main open-source dependencies, curriculum sources, and tools used by
 * the certification + audit features. Linked from the footer of
 * every certification page so candidates and employers can audit the
 * supply chain in one click.
 */
interface Item {
  name: string
  license: string
  url: string
  use: string
}

// Licences checked against each project's published licence. Only sources the
// certification docs (docs/user/07-certifications-guide.md) name are listed.
const CURRICULA: Item[] = [
  { name: 'MDN Web Docs', license: 'CC-BY-SA-2.5', url: 'https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Attrib_copyright_license', use: 'Reference for JavaScript, HTML, CSS and web platform questions (code samples are CC0)' },
  { name: 'Exercism problem specifications', license: 'MIT', url: 'https://github.com/exercism/problem-specifications', use: 'Reference for coding exercises' },
  { name: 'OSSU Computer Science', license: 'MIT', url: 'https://github.com/ossu/computer-science', use: 'Reference for computer science and algorithms topics' },
]

const LIBRARIES: Item[] = [
  { name: 'Next.js', license: 'MIT', url: 'https://github.com/vercel/next.js', use: 'Application framework' },
  { name: 'React', license: 'MIT', url: 'https://github.com/facebook/react', use: 'UI library' },
  { name: 'Tailwind CSS', license: 'MIT', url: 'https://github.com/tailwindlabs/tailwindcss', use: 'Styling for every page incl. certificate templates' },
  { name: 'lucide-react', license: 'ISC', url: 'https://github.com/lucide-icons/lucide', use: 'Icons throughout the app' },
  { name: 'qrcode', license: 'MIT', url: 'https://github.com/soldair/node-qrcode', use: 'QR code generation in certificates' },
  { name: 'Firebase JavaScript SDK', license: 'Apache-2.0', url: 'https://github.com/firebase/firebase-js-sdk', use: 'Authentication and session management' },
  { name: 'MongoDB Node driver', license: 'Apache-2.0', url: 'https://github.com/mongodb/node-mongodb-native', use: 'Database access' },
  { name: 'React Flow', license: 'MIT', url: 'https://github.com/xyflow/xyflow', use: 'Workflow visual builder' },
  { name: '@monaco-editor/react (Monaco Editor)', license: 'MIT', url: 'https://github.com/suren-atoyan/monaco-react', use: 'Code sandbox editor' },
]

const TOOLS: Item[] = [
  { name: 'pip-audit', license: 'Apache-2.0', url: 'https://github.com/pypa/pip-audit', use: 'Python dependency vulnerability scanning' },
  { name: 'npm audit', license: 'Artistic-2.0', url: 'https://docs.npmjs.com/cli/v10/commands/npm-audit', use: 'Node dependency vulnerability scanning' },
  { name: 'Piston', license: 'MIT', url: 'https://github.com/engineer-man/piston', use: 'Code sandbox execution engine' },
]

function Section({ icon: Icon, title, subtitle, items, testid }: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle: string
  items: Item[]
  testid: string
}) {
  return (
    <section className="rounded-3xl border border-cs-grid bg-cs-sheet p-6 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] sm:p-7 dark:shadow-none" data-testid={testid}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cs-accent/25 bg-cs-accent/10 text-cs-accent-text">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-cs-ink">{title}</h2>
          <p className="text-sm text-cs-ink-soft">{subtitle}</p>
        </div>
      </div>
      <ul className="divide-y divide-cs-grid">
        {items.map((it) => (
          <li key={it.name} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0 flex-1">
              <a
                href={it.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-cs-ink hover:text-cs-accent-text"
              >
                {it.name} <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <p className="mt-0.5 text-sm text-cs-ink-soft">{it.use}</p>
            </div>
            <span className="shrink-0 rounded-full border border-cs-grid px-2.5 py-0.5 font-mono text-[11px] text-cs-ink-soft">{it.license}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function OpenSourcePage() {
  return (
    <PublicPageWrapper>
      <div data-testid="open-source-page">
        <PageHero
          title="Built on open source"
          lead="CodeSpectra certifications draw on open curricula, are rendered with open-source libraries and checked with open-source tools. This page lists the main sources so candidates, employers and contributors can see where things come from."
          actions={
            <>
              <a href="#oss-curricula" className={btnPrimary}>See the sources</a>
              <Link href="/contact" className={btnSecondary}>Report a missing credit</Link>
            </>
          }
        />

        <div className="mx-auto max-w-4xl space-y-6 px-4 py-16 sm:px-6 lg:py-20">
          <div id="oss-curricula" className="scroll-mt-24">
            <Section
              icon={BookOpen}
              title="Curriculum sources"
              subtitle="Open references our question writers draw on."
              items={CURRICULA}
              testid="oss-curricula"
            />
          </div>

          <Section
            icon={Code2}
            title="Application libraries"
            subtitle="Key open-source packages this app is built on. Licences match each package's published licence."
            items={LIBRARIES}
            testid="oss-libraries"
          />

          <Section
            icon={ShieldCheck}
            title="Audit and execution tools"
            subtitle="Vulnerability scanners and the code sandbox engine."
            items={TOOLS}
            testid="oss-tools"
          />

          <div className="flex flex-col items-center gap-2 rounded-3xl border border-cs-accent/25 bg-cs-accent/5 p-6 text-center">
            <Award className="h-8 w-8 text-cs-accent-text" aria-hidden />
            <p className="text-sm text-cs-ink">
              Spotted a missing attribution?{' '}
              <Link href="/contact" className="font-medium text-cs-accent-text underline-offset-4 hover:underline">
                Tell us through the contact form
              </Link>{' '}
              or open a pull request.
            </p>
          </div>
        </div>
      </div>
    </PublicPageWrapper>
  )
}
