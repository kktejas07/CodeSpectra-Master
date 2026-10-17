import Link from 'next/link'
import { Bug, KeyRound, ScanFace, ShieldCheck, Users } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { BentoBody, BentoCard, BentoIcon, BentoShell, BentoTitle } from '@/components/landing/bento-grid'
import { HeroIllustration, PageHero, btnPrimary, btnSecondary } from '@/components/landing/page-hero'

/*
 * Keep this page factual. It describes how the product works today; it is
 * not a certification or audit report. Do not add SOC 2 / ISO / pen-test
 * claims here unless they exist and can be shown.
 */
export default function SecurityPage() {
  return (
    <PublicPageWrapper>
      <PageHero
        title="Security"
        lead="How CodeSpectra protects accounts and assessment data, and how to report a problem you find."
        actions={
          <>
            <Link href="/support" className={btnPrimary}>
              Report a vulnerability
            </Link>
            <Link href="/privacy" className={btnSecondary}>
              Privacy policy
            </Link>
          </>
        }
        art={<HeroIllustration name="integrity-shield" />}
      />

      <section className="border-b border-cs-grid">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <BentoShell className="auto-rows-auto">
            <BentoCard className="sm:col-span-2">
              <BentoIcon><Users className="h-5 w-5" aria-hidden /></BentoIcon>
              <BentoTitle>Signed-in dashboards and roles</BentoTitle>
              <BentoBody>
                CodeSpectra is built around authenticated dashboards with role-based access. Candidates, organization
                admins and platform admins each see only the pages their role allows.
              </BentoBody>
            </BentoCard>
            <BentoCard className="sm:col-span-2">
              <BentoIcon><KeyRound className="h-5 w-5" aria-hidden /></BentoIcon>
              <BentoTitle>Third-party sign-in</BentoTitle>
              <BentoBody>
                When you connect another service, such as GitHub, CodeSpectra uses OAuth instead of asking for your
                password. Organizations can also sign in through their own identity provider.
              </BentoBody>
            </BentoCard>
            <BentoCard className="sm:col-span-2">
              <BentoIcon><ScanFace className="h-5 w-5" aria-hidden /></BentoIcon>
              <BentoTitle>Proctoring is evidence, not a verdict</BentoTitle>
              <BentoBody>
                Proctoring events are timestamped on a candidate&apos;s report. A reviewer decides what a flag means;
                nobody is rejected automatically.
              </BentoBody>
            </BentoCard>
            <BentoCard className="sm:col-span-2">
              <BentoIcon><ShieldCheck className="h-5 w-5" aria-hidden /></BentoIcon>
              <BentoTitle>Good practice on your side</BentoTitle>
              <BentoBody>
                Practice least privilege for API keys and rotate credentials used in deployment.
              </BentoBody>
            </BentoCard>
          </BentoShell>

          <div className="mt-12 max-w-[72ch] space-y-4 text-[15px] leading-7 text-cs-ink-soft">
            <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-cs-ink sm:text-2xl">
              <Bug className="h-5 w-5 text-cs-accent-text" aria-hidden /> Reporting a vulnerability
            </h2>
            <p>
              For vulnerability reports, use the contact channel on the{' '}
              <Link href="/support" className="font-medium text-cs-accent-text underline-offset-4 hover:underline">
                Support
              </Link>{' '}
              page. Do not post exploit details in public issues without coordination.
            </p>
            <p className="text-sm">
              This is informational copy for the marketing site, not a certification or audit report.
            </p>
          </div>
        </div>
      </section>
    </PublicPageWrapper>
  )
}
