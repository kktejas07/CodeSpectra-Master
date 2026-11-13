/**
 * CodeSpectra feature icons — one per product area, drawn for this app.
 * Same grid and stroke as the lucide icons used everywhere else (24×24,
 * 1.75 stroke, round caps, `currentColor`), so they can sit beside them and
 * take the same `className` sizing. Decorative by default (aria-hidden);
 * pass `title` when the icon is the only label.
 *
 * Generated from one path table — keep the shapes on the 24 grid.
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { title?: string }

function Base({ title, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

/** A test sheet with code and a tick — coding and question assessments. */
export function AssessmentIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="5" y="3" width="14" height="18" rx="2"/>
      <path d="m10.5 7.5-2 2 2 2"/>
      <path d="m13.5 7.5 2 2-2 2"/>
      <path d="m9.25 16.25 1.75 1.75 3.5-3.75"/>
    </Base>
  )
}

/** A shield with a watching eye — proctored tests. */
export function ProctoringIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
      <path d="M8 12s1.5-2.75 4-2.75S16 12 16 12s-1.5 2.75-4 2.75S8 12 8 12Z"/>
      <circle cx="12" cy="12" r=".9"/>
    </Base>
  )
}

/** A speech bubble with a voice waveform — AI mock interviews. */
export function InterviewIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20.5 11.5a8.25 8.25 0 0 1-12.1 7.3L4 20l1.25-4.1A8.25 8.25 0 1 1 20.5 11.5Z"/>
      <path d="M9 10.5v2"/>
      <path d="M11.25 9v5"/>
      <path d="M13.5 9.75v3.5"/>
      <path d="M15.75 10.75v1.5"/>
    </Base>
  )
}

/** An office building with a checklist — company test patterns. */
export function CompanyTestsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 21V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v15"/>
      <path d="M15 10h3a2 2 0 0 1 2 2v9"/>
      <path d="M3 21h18"/>
      <path d="M7.5 8.5h4"/>
      <path d="m7.5 12.25 1 1 2.25-2.5"/>
      <path d="M7.5 16.5h4"/>
    </Base>
  )
}

/** A trophy with a lightning bolt — live coding contests. */
export function ContestIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0Z"/>
      <path d="M8 6H5.5a1.5 1.5 0 0 0 0 3H8"/>
      <path d="M16 6h2.5a1.5 1.5 0 0 1 0 3H16"/>
      <path d="M12 13v4"/>
      <path d="M9.5 17h5"/>
      <path d="M8.5 20.5h7"/>
      <path d="m12.5 5.75-1.4 2h1.8l-1.4 2"/>
    </Base>
  )
}

/** A passport booklet with a verified seal — the Skill Passport. */
export function PassportIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="5" y="3" width="14" height="18" rx="2.5"/>
      <path d="M8.5 3v18"/>
      <circle cx="13.75" cy="10" r="2.75"/>
      <path d="m12.6 10 .85.85 1.5-1.6"/>
      <path d="M11.5 16.5H16"/>
    </Base>
  )
}

/** A graduation cap — campus hiring drives. */
export function CampusIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 4 2.5 9 12 14l9.5-5Z"/>
      <path d="M6.5 11.2V16c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3v-4.8"/>
      <path d="M21.5 9v5"/>
    </Base>
  )
}

/** A person with a speech bubble — mentor sessions. */
export function MentorIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="9" cy="9" r="3.25"/>
      <path d="M3 20.5a6 6 0 0 1 12 0"/>
      <path d="M15.5 3.5h5a1 1 0 0 1 1 1V8a1 1 0 0 1-1 1h-2.25L16.5 10.75V9h-1a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/>
      <path d="M18 15a4.5 4.5 0 0 1 3 5.5"/>
    </Base>
  )
}

/** A phone showing a question — practice over WhatsApp. */
export function PhonePracticeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/>
      <path d="M10 9a2 2 0 1 1 3.05 1.7c-.65.4-1.05.85-1.05 1.6"/>
      <path d="M12 15h.01"/>
      <path d="M10.75 18.5h2.5"/>
    </Base>
  )
}

/** A Latin letter beside a headline-script letter — English, Hindi and Telugu. */
export function LanguagesIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m3.5 14 3-8 3 8"/>
      <path d="M4.6 11.25h3.8"/>
      <path d="M13 9.5h8"/>
      <path d="M17.5 9.5V19"/>
      <path d="M17.5 14.25c-1.6-1.3-3.5-.6-3.5 1s1.9 2.3 3.5 1"/>
    </Base>
  )
}
