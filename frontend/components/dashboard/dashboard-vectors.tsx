'use client'

import React from 'react'
import { Sparkles, Zap, Shield, Flame, Terminal, Code2, ScanLine, Wrench, BarChart2, Activity, Clock } from 'lucide-react'

// 1. Elite Code Scan Icon Badge for Stat Card
export function IsometricScanChip() {
  return (
    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shadow-sm shadow-emerald-950/30 group-hover:scale-105 group-hover:bg-emerald-500/15 group-hover:border-emerald-500/40 transition-all duration-300">
      <ScanLine className="h-5 w-5 text-emerald-400" />
      <div className="absolute inset-0 rounded-xl bg-emerald-500/10 blur-sm pointer-events-none -z-10" />
    </div>
  )
}

// 2. Elite Challenges Icon Badge for Stat Card
export function IsometricProblemCube() {
  return (
    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shadow-sm shadow-emerald-950/30 group-hover:scale-105 group-hover:bg-emerald-500/15 group-hover:border-emerald-500/40 transition-all duration-300">
      <Code2 className="h-5 w-5 text-emerald-400" />
      <div className="absolute inset-0 rounded-xl bg-emerald-500/10 blur-sm pointer-events-none -z-10" />
    </div>
  )
}

// 3. Elite Fixes Applied Icon Badge for Stat Card
export function IsometricFixEngine() {
  return (
    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 shadow-sm shadow-cyan-950/30 group-hover:scale-105 group-hover:bg-cyan-500/15 group-hover:border-cyan-500/40 transition-all duration-300">
      <Sparkles className="h-5 w-5 text-cyan-400" />
      <div className="absolute inset-0 rounded-xl bg-cyan-500/10 blur-sm pointer-events-none -z-10" />
    </div>
  )
}

// 4. Empty State Illustration: Clean Elite Activity Badge
export function EmptyActivityIllustration() {
  return (
    <div className="relative py-4 flex flex-col items-center justify-center select-none">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-card border border-border/80 shadow-inner">
        <Activity className="h-6 w-6 text-emerald-400/70" />
        <div className="absolute -inset-1 rounded-2xl border border-emerald-500/20 opacity-50" />
      </div>
    </div>
  )
}

// 5. Empty State Illustration: Clean Elite Timeline Badge
export function EmptyTimelineIllustration() {
  return (
    <div className="relative py-3 flex flex-col items-center justify-center select-none">
      <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-card border border-border/80 shadow-inner">
        <Clock className="h-5 w-5 text-muted-foreground/70" />
        <div className="absolute -inset-1 rounded-2xl border border-border/40 opacity-40" />
      </div>
    </div>
  )
}

// 6. Developer Level / XP Header Banner
export function DeveloperRankBanner({
  name,
  role,
  stats,
}: {
  name?: string
  role?: string
  stats?: { scans: number; challenges: number; fixes: number; streak: number }
}) {
  const totalXP = (stats?.scans || 0) * 150 + (stats?.challenges || 0) * 300 + (stats?.fixes || 0) * 200 + (stats?.streak || 0) * 100
  const level = Math.max(1, Math.floor(totalXP / 1000) + 1)
  const currentLevelXP = totalXP % 1000
  const progressPercent = Math.min(100, Math.round((currentLevelXP / 1000) * 100))

  return (
    <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#2f5be7] via-[#2448c9] to-[#17224d] p-6 text-white shadow-[0_18px_40px_-20px_rgba(47,91,231,0.55)] sm:p-7">
      {/* soft dot field + glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(70%_90%_at_85%_20%,#000_20%,transparent_75%)]"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
      />
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-[#38bdf8]/30 blur-3xl" />

      <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/30 bg-white/15 backdrop-blur">
            <Sparkles className="h-7 w-7 text-white" aria-hidden />
            <span className="absolute -bottom-1.5 -right-1.5 rounded-full bg-white px-1.5 py-0.5 text-[11px] font-bold text-[#2448c9] shadow-sm">
              L{level}
            </span>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{name ? `Welcome back, ${name}` : 'Welcome back'}</h2>
              {role && (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/10 px-2 py-0.5 text-xs font-semibold capitalize">
                  <Shield className="h-3 w-3" aria-hidden />
                  {role.replace(/_/g, ' ')}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-white/80">Your practice, assessments and certificates in one place.</p>
          </div>
        </div>

        <div className="flex min-w-[260px] flex-col gap-4 sm:flex-row sm:items-center lg:min-w-[340px] lg:gap-6">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/80">Level {level}</span>
              <span className="font-semibold tabular-nums">{currentLevelXP} / 1000 XP</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuemin={0} aria-valuemax={1000} aria-valuenow={currentLevelXP} aria-label={`Level ${level} progress`}>
              <div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${Math.max(4, progressPercent)}%` }} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 border-t border-white/20 pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
            <Flame className="h-4 w-4 text-amber-300" aria-hidden />
            <span className="text-sm font-semibold tabular-nums">{stats?.streak || 0}-day streak</span>
          </div>
        </div>
      </div>
    </div>
  )
}
