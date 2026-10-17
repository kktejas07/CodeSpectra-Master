import { Award, CheckCircle2, Clock, Code2, ScanFace, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Phone-screen product mockup: a CodeSpectra candidate screen inside a phone
 * frame on a royal-blue gradient stage, with floating UI cards around it.
 * Pure markup (no images), so it stays sharp, themeable and light.
 * Content is a product illustration with sample text, not live data.
 */
export function PhoneMockup({ className }: { className?: string }) {
  return (
    <figure className={cn('relative isolate mx-auto w-full max-w-[520px]', className)}>
      <figcaption className="sr-only">
        Illustration of the CodeSpectra candidate app on a phone: a timed coding question with a proctoring check,
        a passed test case and a certificate ready to share.
      </figcaption>

      {/* Stage: gradient blob, grid and rings */}
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden rounded-[2.5rem] bg-linear-to-br from-[#2f5be7] via-[#3f6bff] to-[#1b2f8f]">
        <div
          className="absolute inset-0 opacity-30"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
        />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#8fb0ff]/40 blur-3xl" />
        <div className="absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-[#0d1b5c]/60 blur-3xl" />
        <svg className="absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2 text-white/15" viewBox="0 0 400 400" fill="none">
          <circle cx="200" cy="200" r="120" stroke="currentColor" />
          <circle cx="200" cy="200" r="170" stroke="currentColor" strokeDasharray="4 8" />
        </svg>
        <span className="absolute left-8 top-10 font-mono text-5xl font-bold text-white/10">{'</>'}</span>
      </div>

      <div aria-hidden className="relative px-6 py-12 sm:px-12 sm:py-14">
        {/* Phone */}
        <div className="relative mx-auto w-[248px] rounded-[2.6rem] bg-[#0b1020] p-[9px] shadow-[0_40px_80px_-30px_rgba(5,12,40,0.75),0_0_0_1px_rgba(255,255,255,0.08)_inset] sm:w-[268px]">
          <div className="absolute left-1/2 top-[14px] z-10 h-[18px] w-[78px] -translate-x-1/2 rounded-full bg-[#0b1020]" />
          <div className="overflow-hidden rounded-[2.1rem] bg-white text-[#0f1729]">
            {/* status bar */}
            <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[10px] font-semibold">
              <span>9:41</span>
              <span className="flex gap-1">
                <span className="h-1.5 w-3 rounded-sm bg-[#0f1729]" />
                <span className="h-1.5 w-1.5 rounded-full bg-[#0f1729]" />
              </span>
            </div>

            {/* app header */}
            <div className="flex items-center justify-between px-4 pb-3 pt-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#2f5be7]/40 bg-[#2f5be7]/10 font-mono text-[10px] font-bold text-[#2f5be7]">{'</>'}</span>
                <span className="text-[13px] font-bold">CodeSpectra</span>
              </div>
              <span className="flex items-center gap-1 rounded-full bg-[#eef2ff] px-2 py-1 text-[10px] font-semibold text-[#1e40af]">
                <Timer className="h-3 w-3" /> 24:10
              </span>
            </div>

            {/* progress */}
            <div className="px-4">
              <div className="flex justify-between text-[10px] font-medium text-[#5b6478]">
                <span>Question 3 of 8</span>
                <span>Medium · 4 pts</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-[#e8ecf6]">
                <div className="h-full w-[38%] origin-left rounded-full bg-[#2f5be7]" />
              </div>
            </div>

            {/* question card */}
            <div className="mx-4 mt-4 rounded-2xl border border-[#e3e8f4] bg-[#f8faff] p-3">
              <p className="text-[12px] font-bold">Merge overlapping intervals</p>
              <p className="mt-1 text-[10px] leading-relaxed text-[#5b6478]">Return the merged list, sorted by start time.</p>
              <div className="mt-2.5 rounded-xl bg-[#0f1729] p-2.5 font-mono text-[9px] leading-[1.55] text-[#c9d6ff]">
                <div><span className="text-[#8fb0ff]">def</span> merge(iv):</div>
                <div className="pl-3">iv.sort()</div>
                <div className="pl-3">out = [iv[0]]</div>
                <div className="pl-3"><span className="text-[#8fb0ff]">for</span> s, e <span className="text-[#8fb0ff]">in</span> iv[1:]:</div>
                <div className="pl-6">…<span className="ml-0.5 inline-block h-2.5 w-[5px] translate-y-0.5 animate-pulse bg-[#8fb0ff]" /></div>
              </div>
            </div>

            {/* test results */}
            <div className="mx-4 mt-3 space-y-1.5">
              {[
                ['Sample 1', true],
                ['Sample 2', true],
                ['Hidden tests', null],
              ].map(([label, ok]) => (
                <div key={label as string} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-[10px] ring-1 ring-[#e3e8f4]">
                  <span className="font-medium">{label as string}</span>
                  {ok ? (
                    <span className="flex items-center gap-1 font-semibold text-green-700"><CheckCircle2 className="h-3 w-3" /> Passed</span>
                  ) : (
                    <span className="text-[#5b6478]">Run on submit</span>
                  )}
                </div>
              ))}
            </div>

            {/* actions */}
            <div className="flex gap-2 px-4 pb-6 pt-4">
              <span className="flex-1 rounded-full border border-[#d6ddee] py-2 text-center text-[11px] font-semibold">Run</span>
              <span className="flex-1 rounded-full bg-[#2f5be7] py-2 text-center text-[11px] font-semibold text-white shadow-[0_8px_16px_-8px_rgba(47,91,231,0.8)]">Submit</span>
            </div>
          </div>
        </div>

        {/* Floating cards */}
        <FloatCard className="left-0 top-[18%] sm:-left-2" delay="0s">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[#eef2ff] text-[#2f5be7]">
            <span className="absolute inset-0 rounded-full bg-[#2f5be7]/30 cs-ping-soft" />
            <ScanFace className="relative h-4 w-4" />
          </span>
          <div>
            <p className="text-[11px] font-bold">Face check</p>
            <p className="text-[10px] text-[#5b6478]">Matches ID photo</p>
          </div>
        </FloatCard>

        <FloatCard className="right-0 top-[8%] sm:-right-3" delay="1.4s">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef2ff] text-[#2f5be7]">
            <Code2 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11px] font-bold">2 of 2 samples</p>
            <p className="text-[10px] text-[#5b6478]">Passing</p>
          </div>
        </FloatCard>

        <FloatCard className="bottom-[16%] right-0 sm:-right-6" delay="2.6s">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2f5be7] text-white">
            <Award className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11px] font-bold">Certificate ready</p>
            <p className="text-[10px] text-[#5b6478]">Anyone can verify it</p>
          </div>
        </FloatCard>

        <FloatCard className="bottom-[8%] left-0 sm:-left-4" delay="3.8s">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef2ff] text-[#2f5be7]">
            <Clock className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11px] font-bold">Timed attempt</p>
            <p className="text-[10px] text-[#5b6478]">Auto-saves as you go</p>
          </div>
        </FloatCard>
      </div>
    </figure>
  )
}

function FloatCard({ className, delay, children }: { className?: string; delay: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'cs-bob absolute z-10 hidden items-center gap-2.5 rounded-2xl bg-white/95 px-3 py-2.5 text-[#0f1729] shadow-[0_18px_40px_-18px_rgba(5,12,40,0.6)] ring-1 ring-white/60 backdrop-blur min-[420px]:flex',
        className,
      )}
      style={{ ['--d' as string]: delay }}
    >
      {children}
    </div>
  )
}
