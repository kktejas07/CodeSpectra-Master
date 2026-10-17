'use client'

import { useId, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Hero "results sheet": a sample ranked report for one role, with the
 * shortlist cutoff drawn in. Switching roles shows the same screening logic
 * applied to non-developer roles (CAD, QA).
 *
 * Data is illustrative — names are invented and say so on the sheet.
 */

type Row = {
  rank: number
  name: string
  scores: number[]
  total: number
  flag?: string
}

type Role = {
  id: string
  label: string
  title: string
  sections: string[]
  max: number
  rows: Row[]
}

const ROLES: Role[] = [
  {
    id: 'java',
    label: 'Software',
    title: 'Java developer, 1–3 years',
    sections: ['Coding', 'MCQ', 'Written'],
    max: 120,
    rows: [
      { rank: 1, name: 'Ananya Rao', scores: [58, 28, 26], total: 112 },
      { rank: 2, name: 'Marcus Thompson', scores: [55, 27, 25], total: 107 },
      { rank: 3, name: 'Priya Sharma', scores: [54, 26, 24], total: 104, flag: '1 tab switch' },
      { rank: 4, name: 'Daniel Okafor', scores: [51, 27, 23], total: 101 },
      { rank: 20, name: 'Farah Khan', scores: [40, 22, 18], total: 80 },
      { rank: 21, name: 'Rohit Verma', scores: [39, 21, 18], total: 78 },
      { rank: 22, name: 'Sofia Martins', scores: [36, 23, 17], total: 76 },
    ],
  },
  {
    id: 'cad',
    label: 'Mechanical & CAD',
    title: 'Design engineer, pumps and valves',
    sections: ['Design task', 'Drawing review', 'Aptitude'],
    max: 120,
    rows: [
      { rank: 1, name: 'Kiran Patel', scores: [61, 25, 24], total: 110 },
      { rank: 2, name: 'Elena Novak', scores: [57, 26, 22], total: 105 },
      { rank: 3, name: 'Arjun Menon', scores: [56, 24, 23], total: 103 },
      { rank: 4, name: 'Grace Liu', scores: [52, 25, 22], total: 99, flag: 'Face not visible 40s' },
      { rank: 20, name: 'Vikram Iyer', scores: [41, 20, 18], total: 79 },
      { rank: 21, name: 'Hannah Brooks', scores: [38, 21, 19], total: 78 },
      { rank: 22, name: 'Suresh Babu', scores: [37, 20, 18], total: 75 },
    ],
  },
  {
    id: 'qa',
    label: 'QA automation',
    title: 'QA automation engineer',
    sections: ['Automation', 'Test design', 'MCQ'],
    max: 100,
    rows: [
      { rank: 1, name: 'Meera Joshi', scores: [46, 27, 22], total: 95 },
      { rank: 2, name: 'Tom Becker', scores: [44, 26, 21], total: 91 },
      { rank: 3, name: 'Nisha Reddy', scores: [43, 25, 22], total: 90 },
      { rank: 4, name: 'Omar Haddad', scores: [42, 24, 21], total: 87 },
      { rank: 20, name: 'Lakshmi N.', scores: [33, 19, 18], total: 70, flag: '2 paste attempts' },
      { rank: 21, name: 'Chris Walker', scores: [32, 19, 17], total: 68 },
      { rank: 22, name: 'Aditya Kulkarni', scores: [30, 20, 17], total: 67 },
    ],
  },
]

const CUTOFF = 20

export function ResultsSheet() {
  const [roleId, setRoleId] = useState(ROLES[0].id)
  const role = ROLES.find((r) => r.id === roleId) ?? ROLES[0]
  const baseId = useId()

  return (
    <figure className="relative rounded-md border border-cs-grid bg-cs-sheet shadow-[0_1px_0_var(--cs-grid),0_24px_48px_-28px_rgba(22,26,58,0.35)]">
      {/* Sheet header */}
      <div className="flex flex-col gap-4 border-b border-cs-grid px-5 pt-5 pb-4 sm:flex-row sm:items-end sm:justify-between sm:px-7">
        <div>
          <p className="text-sm text-cs-ink-soft">Screening results, sample report</p>
          <p className="cs-heading mt-1 text-2xl sm:text-[1.75rem]">{role.title}</p>
          <p className="mt-1 text-sm text-cs-ink-soft">
            100 applicants assessed. Top {CUTOFF} shortlisted for interview.
          </p>
        </div>

        <div role="tablist" aria-label="Role" className="flex flex-wrap gap-1.5">
          {ROLES.map((r) => {
            const selected = r.id === role.id
            return (
              <button
                key={r.id}
                id={`${baseId}-tab-${r.id}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                onClick={() => setRoleId(r.id)}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                  selected
                    ? 'border-cs-ink bg-cs-ink text-cs-paper'
                    : 'border-cs-grid text-cs-ink-soft hover:border-cs-ink hover:text-cs-ink',
                )}
              >
                {r.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${role.id}`}
        className="overflow-x-auto"
      >
        <table className="w-full border-collapse sm:min-w-[620px] text-left text-[15px]">
          <caption className="sr-only">
            Sample ranked results for {role.title}. Candidates ranked 1 to {CUTOFF} are shortlisted.
          </caption>
          <thead>
            <tr className="text-sm text-cs-ink-soft">
              <th scope="col" className="w-14 py-3 pl-5 font-medium sm:w-24 sm:pl-7">Rank</th>
              <th scope="col" className="py-3 font-medium">Candidate</th>
              {role.sections.map((s) => (
                <th key={s} scope="col" className="hidden py-3 pr-4 text-right font-medium tabular-nums sm:table-cell">
                  {s}
                </th>
              ))}
              <th scope="col" className="py-3 pr-4 text-right font-medium">
                Points <span className="hidden font-normal sm:inline">/ {role.max}</span>
              </th>
              <th scope="col" className="py-3 pr-5 font-medium sm:pr-7">Integrity</th>
            </tr>
          </thead>
          {/* key on role re-mounts rows so the highlighter sweep replays per role */}
          <tbody key={role.id}>
            {role.rows.map((row, i) => {
              const shortlisted = row.rank <= CUTOFF
              const prev = role.rows[i - 1]
              const gapBefore = prev && row.rank - prev.rank > 1
              return (
                <RowGroup key={row.rank} gapBefore={!!gapBefore} gapFrom={prev?.rank} gapTo={row.rank} cols={role.sections.length + 4}>
                  {row.rank === CUTOFF + 1 && (
                    <tr aria-hidden>
                      <td colSpan={role.sections.length + 4} className="px-5 sm:px-7">
                        <div className="flex items-center gap-3 py-1.5 text-sm font-semibold text-cs-accent-text">
                          <span className="h-0.5 flex-1 bg-cs-accent" />
                          Shortlist cutoff
                          <span className="h-0.5 w-8 bg-cs-accent" />
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr
                    className={cn(
                      'border-t border-cs-grid/70',
                      !shortlisted && 'text-cs-ink-soft',
                    )}
                  >
                    <td className="py-2.5 pl-5 tabular-nums sm:pl-7">{row.rank}</td>
                    <td className="py-2.5">
                      {shortlisted ? (
                        <span className="cs-mark-row relative inline-block px-1.5 -mx-1.5" style={{ ['--i' as string]: i }}>
                          <span className="relative z-10 font-semibold">{row.name}</span>
                        </span>
                      ) : (
                        row.name
                      )}
                    </td>
                    {row.scores.map((s, j) => (
                      <td key={j} className="hidden py-2.5 pr-4 text-right tabular-nums sm:table-cell">
                        {s}
                      </td>
                    ))}
                    <td className={cn('py-2.5 pr-4 text-right tabular-nums', shortlisted && 'font-semibold')}>
                      {row.total}
                    </td>
                    <td className="py-2.5 pr-5 text-sm sm:pr-7">
                      {row.flag ? (
                        <span className="inline-flex items-center gap-1.5 text-cs-flag">
                          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-cs-flag" />
                          {row.flag}
                        </span>
                      ) : (
                        <span className="text-cs-ink-soft">No flags</span>
                      )}
                    </td>
                  </tr>
                </RowGroup>
              )
            })}
          </tbody>
        </table>
      </div>

      <figcaption className="border-t border-cs-grid px-5 py-3 text-xs text-cs-ink-soft sm:px-7">
        Illustrative data. Names are invented. Points are difficulty-weighted: easy 3, medium 4, hard 5.
      </figcaption>
    </figure>
  )
}

function RowGroup({
  gapBefore,
  gapFrom,
  gapTo,
  cols,
  children,
}: {
  gapBefore: boolean
  gapFrom?: number
  gapTo: number
  cols: number
  children: React.ReactNode
}) {
  return (
    <>
      {gapBefore && gapFrom !== undefined && (
        <tr className="border-t border-cs-grid/70">
          <td colSpan={cols} className="py-1.5 pl-5 text-sm text-cs-ink-soft sm:pl-7">
            Ranks {gapFrom + 1}–{gapTo - 1} shortlisted
          </td>
        </tr>
      )}
      {children}
    </>
  )
}
