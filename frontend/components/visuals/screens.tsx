import { AlertTriangle, CheckCircle2, Maximize, Timer, Users } from 'lucide-react'
import { MockAppBar } from './frames'

/*
 * Mini product screens for mockups. Sample content only (invented names,
 * illustrative numbers) — never live data. Light palette on purpose: they sit
 * inside device frames on the royal-blue stage in both themes.
 */

const muted = 'text-[#5b6478]'

/**
 * SEO-060: mock-up copy in the page language. Pages pass a translator for the
 * English text (public views: `(en) => t.dyn(\`landing.showcase:${en}\`, en)`);
 * code samples, names and numbers stay as they are.
 */
export type ShowcaseT = (english: string) => string
export const SHOWCASE_EN: ShowcaseT = (en) => en

export function CodingScreen({ tr = SHOWCASE_EN }: { tr?: ShowcaseT }) {
  return (
    <>
      <MockAppBar
        right={
          <span className="flex items-center gap-1 rounded-full bg-[#eef2ff] px-2 py-1 text-[10px] font-semibold text-[#1e40af]">
            <Timer className="h-3 w-3" /> 24:10
          </span>
        }
      />
      <div className="px-4">
        <div className={`flex justify-between text-[10px] font-medium ${muted}`}>
          <span>{tr('Question 3 of 8')}</span>
          <span>{tr('Medium · 4 pts')}</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-[#e8ecf6]">
          <div className="h-full w-[38%] rounded-full bg-[#2f5be7]" />
        </div>
      </div>
      <div className="mx-4 mt-4 rounded-2xl border border-[#e3e8f4] bg-[#f8faff] p-3">
        <p className="text-[12px] font-bold">{tr('Merge overlapping intervals')}</p>
        <p className={`mt-1 text-[10px] leading-relaxed ${muted}`}>{tr('Return the merged list, sorted by start time.')}</p>
        <div className="mt-2.5 rounded-xl bg-[#0f1729] p-2.5 font-mono text-[9px] leading-[1.55] text-[#c9d6ff]">
          <div><span className="text-[#8fb0ff]">def</span> merge(iv):</div>
          <div className="pl-3">iv.sort()</div>
          <div className="pl-3">out = [iv[0]]</div>
          <div className="pl-3"><span className="text-[#8fb0ff]">for</span> s, e <span className="text-[#8fb0ff]">in</span> iv[1:]:</div>
          <div className="pl-6">…<span className="ml-0.5 inline-block h-2.5 w-[5px] translate-y-0.5 animate-pulse bg-[#8fb0ff] motion-reduce:animate-none" /></div>
        </div>
      </div>
      <div className="mx-4 mt-3 space-y-1.5">
        {([['Sample 1', true], ['Sample 2', true], ['Hidden tests', false]] as const).map(([label, ok]) => (
          <div key={label} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-[10px] ring-1 ring-[#e3e8f4]">
            <span className="font-medium">{tr(label)}</span>
            {ok ? (
              <span className="flex items-center gap-1 font-semibold text-green-700"><CheckCircle2 className="h-3 w-3" /> {tr('Passed')}</span>
            ) : (
              <span className={muted}>{tr('Run on submit')}</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 px-4 pb-6 pt-4">
        <span className="flex-1 rounded-full border border-[#d6ddee] py-2 text-center text-[11px] font-semibold">{tr('Run')}</span>
        <span className="flex-1 rounded-full bg-[#2f5be7] py-2 text-center text-[11px] font-semibold text-white shadow-[0_8px_16px_-8px_rgba(47,91,231,0.8)]">{tr('Submit')}</span>
      </div>
    </>
  )
}

export function CertificateScreen({ tr = SHOWCASE_EN }: { tr?: ShowcaseT }) {
  return (
    <>
      <MockAppBar />
      <div className="mx-4 rounded-2xl bg-linear-to-br from-[#2f5be7] to-[#1b2f8f] p-4 text-white">
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/70">{tr('Certificate of achievement')}</p>
        <p className="mt-2 text-[15px] font-bold leading-tight">{tr('Java developer assessment')}</p>
        <p className="mt-1 text-[10px] text-white/75">{tr('Awarded to Ananya Rao')}</p>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-[9px] text-white/70">{tr('Score')}</p>
            <p className="text-[20px] font-bold tabular-nums">104<span className="text-[11px] font-medium text-white/70">/120</span></p>
          </div>
          <div aria-hidden className="grid h-12 w-12 grid-cols-5 gap-[2px] rounded-md bg-white p-1">
            {Array.from({ length: 25 }).map((_, i) => (
              <span key={i} className={[0, 1, 3, 4, 5, 9, 12, 15, 19, 20, 21, 23, 24, 7, 17].includes(i) ? 'bg-[#0f1729]' : ''} />
            ))}
          </div>
        </div>
      </div>
      <div className="mx-4 mt-3 space-y-1.5">
        {[['Coding', '54 / 60'], ['Multiple choice', '26 / 30'], ['Written', '24 / 30']].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-[10px] ring-1 ring-[#e3e8f4]">
            <span className="font-medium">{tr(k)}</span>
            <span className="font-semibold tabular-nums">{v}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 px-4 pb-6 pt-4">
        <span className="flex-1 rounded-full border border-[#d6ddee] py-2 text-center text-[11px] font-semibold">{tr('Copy link')}</span>
        <span className="flex-1 rounded-full bg-[#2f5be7] py-2 text-center text-[11px] font-semibold text-white">{tr('Share')}</span>
      </div>
    </>
  )
}

const ROWS = [
  ['1', 'Ananya Rao', '112', null],
  ['2', 'Marcus Thompson', '107', null],
  ['3', 'Priya Sharma', '104', '1 tab switch'],
  ['4', 'Daniel Okafor', '101', null],
  ['5', 'Farah Khan', '98', null],
] as const

export function ResultsScreen({ tr = SHOWCASE_EN }: { tr?: ShowcaseT }) {
  return (
    <div className="p-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className={`text-[10px] ${muted}`}>{tr('Screening results')}</p>
          <p className="text-[15px] font-bold">{tr('Java developer, 1–3 years')}</p>
        </div>
        <span className="rounded-full bg-[#2f5be7] px-3 py-1 text-[10px] font-semibold text-white">{tr('Export CSV')}</span>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-[#e3e8f4]">
        <div className={`grid grid-cols-[28px_1fr_56px_92px] bg-[#f6f8fd] px-3 py-2 text-[9px] font-semibold ${muted}`}>
          <span>{tr('Rank')}</span><span>{tr('Candidate')}</span><span className="text-right">{tr('Points')}</span><span className="pl-3">{tr('Integrity')}</span>
        </div>
        {ROWS.map(([r, n, p, flag]) => (
          <div key={r} className="grid grid-cols-[28px_1fr_56px_92px] items-center border-t border-[#eef1f8] px-3 py-2 text-[10px]">
            <span className={muted}>{r}</span>
            <span className="font-medium">{n}</span>
            <span className="text-right font-bold tabular-nums">{p}</span>
            <span className={`pl-3 ${flag ? 'font-medium text-red-600' : muted}`}>{tr(flag ?? 'No flags')}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 border-t border-[#eef1f8] px-3 py-2">
          <span className="h-px flex-1 bg-[#2f5be7]" />
          <span className="text-[9px] font-semibold text-[#2f5be7]">{tr('Shortlist cutoff')}</span>
          <span className="h-px w-6 bg-[#2f5be7]" />
        </div>
      </div>
    </div>
  )
}

export function ProctorScreen({ tr = SHOWCASE_EN }: { tr?: ShowcaseT }) {
  return (
    <div className="grid grid-cols-[1.1fr_1fr] gap-4 p-5">
      <div>
        <p className={`text-[10px] ${muted}`}>{tr('Live session')}</p>
        <p className="text-[14px] font-bold">Priya Sharma</p>
        <div className="relative mt-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-linear-to-br from-[#1b2f8f] to-[#0b1020]">
          <svg viewBox="0 0 100 80" className="h-[70%] text-[#8fb0ff]/70" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <circle cx="50" cy="32" r="14" />
            <path d="M24 76c4-16 14-24 26-24s22 8 26 24" />
          </svg>
          <span className="absolute inset-[18%] rounded-lg border-2 border-dashed border-[#8fb0ff]/80" />
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-semibold text-green-700">
            <CheckCircle2 className="h-2.5 w-2.5" /> {tr('Face matches ID')}
          </span>
        </div>
      </div>
      <div>
        <p className="text-[11px] font-bold">{tr('Events')}</p>
        <ul className="mt-2 space-y-1.5 text-[10px]">
          {[
            ['10:02', 'Fullscreen on', Maximize, false],
            ['10:14', 'Tab switched for 6s', AlertTriangle, true],
            ['10:15', 'Back in fullscreen', Maximize, false],
            ['10:31', 'Paste blocked', AlertTriangle, true],
          ].map(([t, label, Icon, warn]) => {
            const I = Icon as typeof Maximize
            return (
              <li key={t as string} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ring-1 ${warn ? 'bg-red-50 text-red-700 ring-red-100' : 'bg-white ring-[#e3e8f4]'}`}>
                <I className="h-3 w-3 shrink-0" />
                <span className="flex-1">{tr(label as string)}</span>
                <span className={`tabular-nums ${muted}`}>{t as string}</span>
              </li>
            )
          })}
        </ul>
        <p className={`mt-3 text-[9px] leading-relaxed ${muted}`}>{tr('Flags are logged for a reviewer. Nobody is rejected automatically.')}</p>
      </div>
    </div>
  )
}

export function HackathonScreen({ tr = SHOWCASE_EN }: { tr?: ShowcaseT }) {
  const teams = [
    ['Null Pointers', 94],
    ['Byte Club', 91],
    ['Stack Smash', 88],
    ['Team Lambda', 83],
  ] as const
  return (
    <div className="p-5">
      <div className="flex items-end justify-between">
        <div>
          <p className={`text-[10px] ${muted}`}>{tr('Hackathon results')}</p>
          <p className="text-[15px] font-bold">{tr('Campus build week')}</p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-[#eef2ff] px-2.5 py-1 text-[10px] font-semibold text-[#1e40af]">
          <Users className="h-3 w-3" /> {tr('24 teams')}
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {teams.map(([name, score], i) => (
          <div key={name} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-[#e3e8f4]">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${i === 0 ? 'bg-[#2f5be7] text-white' : 'bg-[#eef2ff] text-[#1e40af]'}`}>{i + 1}</span>
            <span className="flex-1 text-[11px] font-semibold">{name}</span>
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-[#e8ecf6]">
              <span className="block h-full rounded-full bg-[#2f5be7]" style={{ width: `${score}%` }} />
            </span>
            <span className="w-10 text-right text-[11px] font-bold tabular-nums">{score}<span className={`text-[9px] font-medium ${muted}`}>/100</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function BuilderScreen({ tr = SHOWCASE_EN }: { tr?: ShowcaseT }) {
  const qs = [
    ['Coding', 'Merge overlapping intervals', 'Medium', 4],
    ['Multiple choice', 'Java memory model', 'Easy', 3],
    ['Written', 'Design a rate limiter', 'Hard', 5],
    ['CAD', 'Bracket mass reduction', 'Hard', 5],
  ] as const
  return (
    <div className="p-5">
      <div className="flex items-end justify-between">
        <div>
          <p className={`text-[10px] ${muted}`}>{tr('New assessment')}</p>
          <p className="text-[15px] font-bold">{tr('Backend engineer, 2–4 years')}</p>
        </div>
        <span className="rounded-full bg-[#2f5be7] px-3 py-1 text-[10px] font-semibold text-white">{tr('Invite candidates')}</span>
      </div>
      <div className="mt-4 space-y-2">
        {qs.map(([type, title, diff, pts]) => (
          <div key={title} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-[#e3e8f4]">
            <span className="w-[84px] shrink-0 rounded-md bg-[#eef2ff] px-2 py-0.5 text-center text-[9px] font-semibold text-[#1e40af]">{tr(type)}</span>
            <span className="flex-1 truncate text-[11px] font-medium">{tr(title)}</span>
            <span className={`text-[10px] ${muted}`}>{tr(diff)}</span>
            <span className="w-10 text-right text-[11px] font-bold">{tr('{n} pts').replace('{n}', String(pts))}</span>
          </div>
        ))}
      </div>
      <p className={`mt-3 text-[9px] ${muted}`}>{tr('Easy 3 · Medium 4 · Hard 5 points')}</p>
    </div>
  )
}

export function AnalyticsScreen({ tr = SHOWCASE_EN }: { tr?: ShowcaseT }) {
  const bars = [38, 52, 46, 64, 58, 72, 81]
  return (
    <div className="p-5">
      <p className={`text-[10px] ${muted}`}>{tr('Hiring funnel')}</p>
      <p className="text-[15px] font-bold">{tr('This quarter')}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[['Invited', '420'], ['Completed', '312'], ['Shortlisted', '64']].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-[#f6f8fd] px-3 py-2">
            <p className={`text-[9px] ${muted}`}>{tr(k)}</p>
            <p className="text-[15px] font-bold tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex h-24 items-end gap-2 rounded-xl bg-[#f6f8fd] p-3">
        {bars.map((h, i) => (
          <span key={i} className="flex-1 rounded-t-md bg-linear-to-t from-[#2f5be7] to-[#8fb0ff]" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  )
}
