/**
 * Answer-first "TL;DR" block: a 1–2 sentence direct answer plus optional key
 * points. The `.speakable-summary` class is referenced by SpeakableSpecification
 * JSON-LD so voice assistants read exactly this text.
 */
export const SPEAKABLE_SELECTORS = ['.speakable-summary']

export function AnswerSummary({
  answer,
  points,
  label = 'In short',
  className = '',
}: {
  answer: React.ReactNode
  points?: React.ReactNode[]
  label?: string
  className?: string
}) {
  return (
    <aside aria-label={label} className={`speakable-summary rounded-3xl border border-cs-accent/25 bg-cs-accent/5 p-6 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-cs-accent-text">{label}</p>
      <p className="mt-2 max-w-[70ch] text-lg leading-relaxed text-cs-ink">{answer}</p>
      {points?.length ? (
        <ul className="mt-4 space-y-2 text-[15px] text-cs-ink-soft">
          {points.map((p, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cs-accent" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  )
}
