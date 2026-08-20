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
    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-r from-[#081512] via-[#09131c] to-[#070b14] p-6 shadow-xl shadow-black/40">
      {/* Background Matrix & Circuit Accents */}
      <div className="absolute top-0 right-0 w-96 h-full opacity-20 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-400 via-transparent to-transparent" />
      <div className="absolute -bottom-6 -right-6 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Left Side: Avatar / Level Badge & Greeting */}
        <div className="flex items-center gap-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#06241a] to-[#0a3525] border-2 border-emerald-500/40 shadow-lg shadow-emerald-950/40">
            <Sparkles className="h-7 w-7 text-emerald-400 animate-pulse" />
            <div className="absolute -bottom-1 -right-1 bg-gradient-to-r from-[#00c573] to-[#06b6d4] text-slate-950 text-[10px] font-black px-1.5 py-0.2 rounded-full shadow-xs">
              L{level}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                {name ? `Welcome, ${name}` : 'Developer Terminal'}
              </h2>
              <span className="inline-flex items-center gap-1 bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold">
                <Shield className="w-3 h-3 text-emerald-400" />
                {role ? role.toUpperCase() : 'BUILDER'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Prisma TypeScript Engine • Multi-tenant Workspace active
            </p>
          </div>
        </div>

        {/* Right Side: XP Progress Bar & Quick Stats */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-6 min-w-[280px] lg:min-w-[340px]">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Level {level} Progress</span>
              <span className="font-bold text-emerald-400">{currentLevelXP} / 1000 XP</span>
            </div>
            {/* Dual Gradient Progress Bar */}
            <div className="h-2 w-full rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#00c573] via-[#10b981] to-[#06b6d4] transition-all duration-700 shadow-sm shadow-emerald-500/50"
                style={{ width: `${Math.max(8, progressPercent)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 sm:border-l border-slate-800/80 sm:pl-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-xs font-mono font-bold text-orange-400">
                <Flame className="w-3.5 h-3.5" />
                <span>{stats?.streak || 0}d</span>
              </div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Streak</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
