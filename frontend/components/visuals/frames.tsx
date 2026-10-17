import { cn } from '@/lib/utils'

/** Phone frame (light screen). Children render inside the screen. */
export function PhoneFrame({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'relative mx-auto w-[248px] rounded-[2.6rem] bg-[#0b1020] p-[9px] shadow-[0_40px_80px_-30px_rgba(5,12,40,0.75),0_0_0_1px_rgba(255,255,255,0.08)_inset] sm:w-[268px]',
        className,
      )}
    >
      <div className="absolute left-1/2 top-[14px] z-10 h-[18px] w-[78px] -translate-x-1/2 rounded-full bg-[#0b1020]" />
      <div className="overflow-hidden rounded-[2.1rem] bg-white text-[#0f1729]">
        <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[10px] font-semibold">
          <span>9:41</span>
          <span className="flex gap-1">
            <span className="h-1.5 w-3 rounded-sm bg-[#0f1729]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[#0f1729]" />
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Desktop browser window (light content area) with a URL pill. */
export function BrowserFrame({
  url = 'codespectra.ai',
  className,
  children,
}: {
  url?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl bg-white text-[#0f1729] shadow-[0_40px_80px_-30px_rgba(5,12,40,0.7),0_0_0_1px_rgba(15,23,41,0.08)]',
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-[#e8ecf6] bg-[#f6f8fd] px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff6159]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c941]" />
        </span>
        <span className="mx-auto flex max-w-[60%] flex-1 items-center justify-center gap-1.5 truncate rounded-md bg-white px-3 py-1 text-[10px] text-[#5b6478] ring-1 ring-[#e3e8f4]">
          <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="currentColor" aria-hidden>
            <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5H6V4.5a2 2 0 1 1 4 0V6Z" />
          </svg>
          {url}
        </span>
      </div>
      {children}
    </div>
  )
}

/** Small floating UI card used around device mockups. Hidden on very narrow screens. */
export function FloatCard({
  icon,
  title,
  sub,
  className,
  delay = '0s',
  strong,
}: {
  icon: React.ReactNode
  title: string
  sub?: string
  className?: string
  delay?: string
  strong?: boolean
}) {
  return (
    <div
      className={cn(
        'cs-bob absolute z-10 hidden items-center gap-2.5 rounded-2xl bg-white/95 px-3 py-2.5 text-[#0f1729] shadow-[0_18px_40px_-18px_rgba(5,12,40,0.6)] ring-1 ring-white/60 backdrop-blur min-[420px]:flex',
        className,
      )}
      style={{ ['--d' as string]: delay }}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full [&_svg]:h-4 [&_svg]:w-4',
          strong ? 'bg-[#2f5be7] text-white' : 'bg-[#eef2ff] text-[#2f5be7]',
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="whitespace-nowrap text-[11px] font-bold">{title}</p>
        {sub && <p className="whitespace-nowrap text-[10px] text-[#5b6478]">{sub}</p>}
      </div>
    </div>
  )
}

/** Tiny brand header used inside mock screens. */
export function MockAppBar({ right }: { right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pb-3 pt-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#2f5be7]/40 bg-[#2f5be7]/10 font-mono text-[10px] font-bold text-[#2f5be7]">
          {'</>'}
        </span>
        <span className="text-[13px] font-bold">CodeSpectra</span>
      </div>
      {right}
    </div>
  )
}
