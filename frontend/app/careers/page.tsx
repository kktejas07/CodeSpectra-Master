import Link from 'next/link'
import { Building2, Mail, MapPin } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { BentoBody, BentoCard, BentoIcon, BentoShell, BentoTitle } from '@/components/landing/bento-grid'
import { HeroIllustration, PageHero, btnPrimary, btnSecondary } from '@/components/landing/page-hero'

/*
 * No open roles are listed. Do not add job openings here unless they are real
 * and approved — link them from the public jobs board instead.
 */
export default function CareersPage() {
  return (
    <PublicPageWrapper>
      <PageHero
        title="Careers at CodeSpectra"
        lead="We don't have any open roles listed right now. If you'd like to work on hiring and assessment tools with us, send us a note and tell us what you'd bring."
        actions={
          <>
            <Link href="/contact" className={btnPrimary}>
              Get in touch
            </Link>
            <Link href="/about" className={btnSecondary}>
              About us
            </Link>
          </>
        }
        art={<HeroIllustration spot="jobs" />}
      />

      <section className="border-b border-cs-grid">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <BentoShell className="auto-rows-auto lg:grid-cols-3">
            <BentoCard>
              <BentoIcon><Building2 className="h-5 w-5" aria-hidden /></BentoIcon>
              <BentoTitle>What we build</BentoTitle>
              <BentoBody className="text-sm">
                A skills-assessment and hackathon platform for hiring teams and colleges, with free practice for
                candidates.
              </BentoBody>
            </BentoCard>
            <BentoCard>
              <BentoIcon><MapPin className="h-5 w-5" aria-hidden /></BentoIcon>
              <BentoTitle>Where we are</BentoTitle>
              <BentoBody className="text-sm">Hyderabad, India and Princeton, New Jersey.</BentoBody>
            </BentoCard>
            <BentoCard href="/contact" label="Contact CodeSpectra about working with us">
              <BentoIcon><Mail className="h-5 w-5" aria-hidden /></BentoIcon>
              <BentoTitle>Say hello</BentoTitle>
              <BentoBody className="text-sm">
                Use the contact form for general enquiries, including interest in future roles.
              </BentoBody>
              <span className="mt-4 text-sm font-semibold text-cs-accent-text group-hover:underline">Open the contact form</span>
            </BentoCard>
          </BentoShell>
          <p className="mt-8 text-sm text-cs-ink-soft">
            Looking for a job rather than a job with us? Browse the{' '}
            <Link href="/jobs" className="font-medium text-cs-accent-text hover:underline">
              jobs board
            </Link>
            .
          </p>
        </div>
      </section>
    </PublicPageWrapper>
  )
}
