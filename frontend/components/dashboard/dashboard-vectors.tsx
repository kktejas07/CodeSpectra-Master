'use client'

import React from 'react'
import { Sparkles, Zap, Shield, Flame, Terminal, Code2, ArrowUpRight } from 'lucide-react'

// 1. Isometric Scan Vector Icon for Stat Card
export function IsometricScanChip() {
  return (
    <div className="relative w-12 h-12 flex items-center justify-center">
      <svg className="w-12 h-12" viewBox="0 0 48 48" fill="none">
        {/* Isometric base diamond */}
        <path
          d="M24 6L42 16.5V31.5L24 42L6 31.5V16.5L24 6Z"
          fill="#061f16"
          stroke="#00c573"
          strokeWidth="1.5"
        />
        {/* Top facet */}
        <path
          d="M24 6L42 16.5L24 27L6 16.5L24 6Z"
          fill="#0a3224"
          stroke="#3ecf8e"
          strokeWidth="1"
          opacity="0.8"
        />
        {/* Center scanner laser line */}
        <line x1="12" y1="20" x2="36" y2="20" stroke="#00c573" strokeWidth="1.5" strokeLinecap="round" />
        {/* Pulse radar wave */}
        <path d="M18 24L22 28L26 22L30 26" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {/* Outer ambient glow */}
      <div className="absolute inset-0 rounded-full bg-[#00c573]/20 blur-md pointer-events-none -z-10" />
    </div>
  )
}

// 2. Isometric Problem Cube Vector Icon
export function IsometricProblemCube() {
  return (
    <div className="relative w-12 h-12 flex items-center justify-center">
      <svg className="w-12 h-12" viewBox="0 0 48 48" fill="none">
        {/* Isometric Cube */}
        <path d="M24 7L40 16.5L24 26L8 16.5L24 7Z" fill="#0d281e" stroke="#10b981" strokeWidth="1.5" />
        <path d="M8 16.5L24 26V41L8 31.5V16.5Z" fill="#061912" stroke="#10b981" strokeWidth="1.5" />
        <path d="M40 16.5L24 26V41L40 31.5V16.5Z" fill="#092218" stroke="#10b981" strokeWidth="1.5" />
        {/* Inner Code Braces */}
        <text x="24" y="24" textAnchor="middle" fontSize="11" fontFamily="monospace" fontWeight="bold" fill="#34d399">
          &lt;/&gt;
        </text>
      </svg>
      <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-md pointer-events-none -z-10" />
    </div>
  )
}

// 3. Isometric Fix Engine Vector Icon
export function IsometricFixEngine() {
  return (
    <div className="relative w-12 h-12 flex items-center justify-center">
      <svg className="w-12 h-12" viewBox="0 0 48 48" fill="none">
        {/* Isometric Hex Chip */}
        <path d="M24 6L42 16.5V31.5L24 42L6 31.5V16.5L24 6Z" fill="#082126" stroke="#06b6d4" strokeWidth="1.5" />
        {/* Circuit Traces */}
        <path d="M12 18L18 21V28L24 31" stroke="#22d3ee" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M36 18L30 21V28L24 31" stroke="#22d3ee" strokeWidth="1.2" strokeLinecap="round" />
        {/* Center Spark Core */}
        <circle cx="24" cy="21" r="4" fill="#06b6d4" />
        <circle cx="24" cy="21" r="2" fill="#ffffff" />
      </svg>
      <div className="absolute inset-0 rounded-full bg-cyan-500/20 blur-md pointer-events-none -z-10" />
    </div>
  )
}

// 4. Empty State Illustration: Holographic Workstation
export function EmptyActivityIllustration() {
  return (
    <div className="relative py-6 flex flex-col items-center justify-center select-none">
      <svg className="w-48 h-32" viewBox="0 0 240 140" fill="none">
        {/* Isometric Grid Floor */}
        <path d="M120 10L230 70L120 130L10 70L120 10Z" fill="#080e1a" stroke="#1e293b" strokeWidth="1" />
        <line x1="65" y1="40" x2="175" y2="100" stroke="#1e293b" strokeWidth="0.8" strokeDasharray="3 3" />
        <line x1="175" y1="40" x2="65" y2="100" stroke="#1e293b" strokeWidth="0.8" strokeDasharray="3 3" />

        {/* Floating Center Hologram Terminal */}
        <g transform="translate(70, 30)">
          {/* Back Glow */}
          <rect x="0" y="0" width="100" height="60" rx="8" fill="#061d15" stroke="#00c573" strokeWidth="1.5" />
          <rect x="6" y="6" width="88" height="48" rx="4" fill="#040d0a" />

          {/* Terminal Window Dots */}
          <circle cx="14" cy="14" r="2" fill="#ef4444" />
          <circle cx="21" cy="14" r="2" fill="#eab308" />
          <circle cx="28" cy="14" r="2" fill="#00c573" />

          {/* Code Lines */}
          <line x1="14" y1="24" x2="50" y2="24" stroke="#00c573" strokeWidth="2" strokeLinecap="round" />
          <line x1="14" y1="32" x2="75" y2="32" stroke="#3ecf8e" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
          <line x1="14" y1="40" x2="60" y2="40" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
          <line x1="14" y1="47" x2="35" y2="47" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        </g>

        {/* Upward Light Beam */}
        <polygon points="120,30 80,95 160,95" fill="url(#hologramGrad)" opacity="0.3" />

        {/* Gradients */}
        <defs>
          <linearGradient id="hologramGrad" x1="120" y1="30" x2="120" y2="95" gradientUnits="userSpaceOnUse">
            <stop stopColor="#00c573" stopOpacity="0.8" />
            <stop offset="1" stopColor="#00c573" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

// 5. Empty State Illustration: Timeline Node
export function EmptyTimelineIllustration() {
  return (
    <div className="relative py-4 flex flex-col items-center justify-center select-none">
      <svg className="w-32 h-24" viewBox="0 0 160 100" fill="none">
        {/* Timeline Path */}
        <path d="M30 50 Q 80 15, 130 50" stroke="#1e293b" strokeWidth="2" strokeDasharray="4 4" />
        
        {/* Nodes */}
        <circle cx="30" cy="50" r="6" fill="#0f172a" stroke="#334155" strokeWidth="2" />
        <circle cx="80" cy="32" r="9" fill="#062016" stroke="#00c573" strokeWidth="2" />
        <circle cx="80" cy="32" r="3" fill="#3ecf8e" />
        <circle cx="130" cy="50" r="6" fill="#0f172a" stroke="#334155" strokeWidth="2" />

        {/* Sparkles */}
        <path d="M80 12L82 17L87 19L82 21L80 26L78 21L73 19L78 17Z" fill="#06b6d4" />
      </svg>
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
