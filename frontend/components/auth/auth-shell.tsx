'use client'

import Link from 'next/link'
import { copyrightLine } from '@/lib/copyright'
import { forwardRef, useId, useState } from 'react'
import { ChevronDown, Eye, EyeOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandLogo } from '@/app/public-layout'
import { NavThemeSwitch } from '@/components/nav-theme-switch'

/**
 * Shared frame for /auth/login and /auth/signup in the CodeSpectra brand.
 * Form column on the left (where the eye starts), a quiet graph-paper panel
 * on the right with context that actually helps someone signing in.
 */
export function AuthShell({ aside, children }: { aside: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="cs-brand grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-cs-sheet focus:px-4 focus:py-2">
        Skip to content
      </a>
      <div className="flex flex-col px-5 py-6 sm:px-10 lg:px-16">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5" aria-label="CodeSpectra home">
            <BrandLogo />
          </Link>
          <NavThemeSwitch compact />
        </header>

        <main id="main" className="flex flex-1 items-center py-10">
          <div className="w-full max-w-[26rem]">{children}</div>
        </main>

        <footer className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-cs-ink-soft">
          <span suppressHydrationWarning>{copyrightLine()}</span>
          <Link href="/privacy" className="hover:text-cs-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-cs-ink">Terms</Link>
          <Link href="/support" className="hover:text-cs-ink">Help</Link>
        </footer>
      </div>

      <aside className="cs-graph relative hidden border-l border-cs-grid lg:block">
        <div aria-hidden className="absolute inset-0 bg-linear-to-br from-cs-paper/30 via-cs-paper/70 to-cs-paper" />
        <div className="relative flex h-full flex-col justify-center px-14 py-16 xl:px-20">{aside}</div>
      </aside>
    </div>
  )
}

export function AuthHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="cs-heading text-[2.6rem] sm:text-5xl">{title}</h1>
      {children && <p className="mt-3 text-cs-ink-soft">{children}</p>}
    </div>
  )
}

const inputBase =
  'h-12 w-full rounded-md border border-cs-grid bg-cs-sheet px-3.5 text-base text-cs-ink placeholder:text-cs-ink-soft/70 transition-colors hover:border-cs-ink-soft focus:border-cs-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-cs-accent-text aria-invalid:border-cs-flag'

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: React.ReactNode
  /** Right-aligned element on the label row, e.g. "Forgot password?" */
  labelAction?: React.ReactNode
  optional?: boolean
  /** Element placed inside the input on the right, e.g. a show-password toggle */
  trailing?: React.ReactNode
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, labelAction, optional, trailing, id, className, ...props },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = hint ? `${inputId}-hint` : undefined
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-[15px] font-medium">
          {label}
          {optional && <span className="ml-1.5 font-normal text-cs-ink-soft">(optional)</span>}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <input ref={ref} id={inputId} aria-describedby={hintId} className={cn(inputBase, trailing && 'pr-12', className)} {...props} />
        {trailing && <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>}
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-sm text-cs-ink-soft">
          {hint}
        </p>
      )}
    </div>
  )
})

export function PasswordField(props: Omit<FieldProps, 'type' | 'trailing'>) {
  const [visible, setVisible] = useState(false)
  return (
    <Field
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="flex h-9 w-9 items-center justify-center rounded text-cs-ink-soft hover:text-cs-ink"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
    />
  )
}

const selectBase = cn(inputBase, 'appearance-none pr-10')

/** Native select with a theme-aware chevron. */
export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={cn(selectBase, className)}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-cs-ink-soft" />
    </div>
  )
}

export function PrimaryButton({
  loading,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-cs-accent px-5 text-base font-semibold text-cs-accent-ink transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function SecondaryButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'relative inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-md border border-cs-grid bg-cs-sheet px-4 text-[15px] font-semibold text-cs-ink transition-colors hover:border-cs-ink-soft disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-7 flex items-center gap-4 text-sm text-cs-ink-soft">
      <span className="h-px flex-1 bg-cs-grid" />
      {children}
      <span className="h-px flex-1 bg-cs-grid" />
    </div>
  )
}

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="mb-6 border-l-4 border-cs-flag bg-cs-flag/10 px-4 py-3 text-[15px] text-cs-ink">
      {children}
    </div>
  )
}

export function LastUsedBadge() {
  return (
    <span className="absolute -top-2.5 right-3 rounded-full bg-cs-mark px-2 py-0.5 text-xs font-semibold text-cs-accent-ink">
      Last used
    </span>
  )
}

export function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

/** Right-panel note: a short titled paragraph. */
export function AsideNote({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-cs-ink pt-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-[44ch] leading-relaxed text-cs-ink-soft">{children}</p>
    </div>
  )
}
