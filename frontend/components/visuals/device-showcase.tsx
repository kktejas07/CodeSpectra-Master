import { Award, BarChart3, CheckCircle2, Clock, Code2, FileDown, Gavel, Layers, ScanFace, ShieldCheck, Trophy, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GradientStage } from './stage'
import { BrowserFrame, FloatCard, PhoneFrame } from './frames'
import { AnalyticsScreen, BuilderScreen, CertificateScreen, CodingScreen, HackathonScreen, ProctorScreen, ResultsScreen, SHOWCASE_EN, type ShowcaseT } from './screens'

export type ShowcaseVariant = 'candidate' | 'certificate' | 'results' | 'proctor' | 'hackathon' | 'builder' | 'analytics'

const CAPTIONS: Record<ShowcaseVariant, string> = {
  candidate: 'Illustration of the CodeSpectra candidate app on a phone: a timed coding question with sample tests passing.',
  certificate: 'Illustration of a CodeSpectra certificate on a phone, with a section breakdown and a share button.',
  results: 'Illustration of a CodeSpectra screening report: candidates ranked by points with integrity flags and a shortlist cutoff.',
  proctor: 'Illustration of CodeSpectra proctoring: a webcam face check and a timeline of logged events.',
  hackathon: 'Illustration of a CodeSpectra hackathon leaderboard with teams scored out of 100.',
  builder: 'Illustration of the CodeSpectra assessment builder with questions weighted by difficulty.',
  analytics: 'Illustration of CodeSpectra hiring analytics: invited, completed and shortlisted counts with a trend chart.',
}

/**
 * Device mockup on the royal-blue stage with floating UI cards — the
 * "phone/laptop UI mockup" visual used across public, auth and app pages.
 * Sample content only. Decorative except for the figcaption.
 */
export function DeviceShowcase({
  variant,
  className,
  compact,
  tr = SHOWCASE_EN,
}: {
  variant: ShowcaseVariant
  className?: string
  /** Smaller padding, fewer cards — for side panels and banners. */
  compact?: boolean
  /** SEO-060: translator for the mock-up's English copy (see ShowcaseT); default English. */
  tr?: ShowcaseT
}) {
  const phone = variant === 'candidate' || variant === 'certificate'
  return (
    <figure className={cn('relative mx-auto w-full', phone ? 'max-w-[520px]' : 'max-w-[640px]', className)}>
      <figcaption className="sr-only">{tr(CAPTIONS[variant])}</figcaption>
      <GradientStage>
        <div aria-hidden className={cn('relative', compact ? 'px-5 py-8 sm:px-8' : 'px-6 py-12 sm:px-12 sm:py-14')}>
          {phone ? (
            <PhoneFrame>{variant === 'candidate' ? <CodingScreen tr={tr} /> : <CertificateScreen tr={tr} />}</PhoneFrame>
          ) : (
            <BrowserFrame url={URLS[variant]}>
              {variant === 'results' && <ResultsScreen tr={tr} />}
              {variant === 'proctor' && <ProctorScreen tr={tr} />}
              {variant === 'hackathon' && <HackathonScreen tr={tr} />}
              {variant === 'builder' && <BuilderScreen tr={tr} />}
              {variant === 'analytics' && <AnalyticsScreen tr={tr} />}
            </BrowserFrame>
          )}
          <Cards variant={variant} compact={compact} tr={tr} />
        </div>
      </GradientStage>
    </figure>
  )
}

const URLS: Partial<Record<ShowcaseVariant, string>> = {
  results: 'codespectra.ai/results',
  proctor: 'codespectra.ai/proctor',
  hackathon: 'codespectra.ai/hackathons',
  builder: 'codespectra.ai/assessments/new',
  analytics: 'codespectra.ai/analytics',
}

function Cards({ variant, compact, tr }: { variant: ShowcaseVariant; compact?: boolean; tr: ShowcaseT }) {
  const pos = {
    tl: 'left-0 top-[14%] sm:-left-4',
    tr: 'right-0 top-[6%] sm:-right-4',
    br: 'bottom-[14%] right-0 sm:-right-6',
    bl: 'bottom-[6%] left-0 sm:-left-5',
  }
  const all: Record<ShowcaseVariant, React.ReactNode[]> = {
    candidate: [
      <FloatCard key="a" className={pos.tl} icon={<ScanFace />} title={tr('Face check')} sub={tr('Matches ID photo')} />,
      <FloatCard key="b" className={pos.tr} delay="1.4s" icon={<Code2 />} title={tr('2 of 2 samples')} sub={tr('Passing')} />,
      <FloatCard key="c" className={pos.br} delay="2.6s" strong icon={<Award />} title={tr('Certificate ready')} sub={tr('Anyone can verify it')} />,
      <FloatCard key="d" className={pos.bl} delay="3.8s" icon={<Clock />} title={tr('Timed attempt')} sub={tr('Auto-saves as you go')} />,
    ],
    certificate: [
      <FloatCard key="a" className={pos.tr} strong icon={<ShieldCheck />} title={tr('Verified online')} sub={tr('Public verify link')} />,
      <FloatCard key="b" className={pos.bl} delay="1.6s" icon={<Award />} title={tr('Share anywhere')} sub={tr('LinkedIn, résumé, email')} />,
    ],
    results: [
      <FloatCard key="a" className={pos.tr} strong icon={<Trophy />} title={tr('Top 20 shortlisted')} sub={tr('Ranked by points')} />,
      <FloatCard key="b" className={pos.bl} delay="1.6s" icon={<FileDown />} title={tr('CSV export')} sub={tr('For your ATS')} />,
    ],
    proctor: [
      <FloatCard key="a" className={pos.tr} icon={<ScanFace />} title={tr('Face check')} sub={tr('Against the ID photo')} />,
      <FloatCard key="b" className={pos.bl} delay="1.6s" strong icon={<ShieldCheck />} title={tr('Evidence, not verdicts')} sub={tr('A reviewer decides')} />,
    ],
    hackathon: [
      <FloatCard key="a" className={pos.tr} icon={<Users />} title={tr('Teams of up to 5')} sub={tr('Join with one link')} />,
      <FloatCard key="b" className={pos.bl} delay="1.6s" strong icon={<Gavel />} title={tr('Shared rubric')} sub={tr('Judges score out of 100')} />,
    ],
    builder: [
      <FloatCard key="a" className={pos.tr} icon={<Layers />} title={tr('Mixed question types')} sub={tr('Code, MCQ, written, CAD')} />,
      <FloatCard key="b" className={pos.bl} delay="1.6s" strong icon={<CheckCircle2 />} title={tr('Weighted by difficulty')} sub={tr('3, 4 or 5 points')} />,
    ],
    analytics: [
      <FloatCard key="a" className={pos.tr} strong icon={<BarChart3 />} title={tr('Funnel at a glance')} sub={tr('Invited to shortlisted')} />,
    ],
  }
  const cards = all[variant]
  // Compact panels are narrow: keep only the cards that sit clear of the device.
  const keep = variant === 'candidate' ? [1, 3] : cards.map((_, i) => i).slice(0, 2)
  return <>{compact ? cards.filter((_, i) => keep.includes(i)) : cards}</>
}
