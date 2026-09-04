'use client'

import React from 'react'
import { ArrowRight, Check } from 'lucide-react'

// 1. Isometric Schema to Client (Model) Vector Graphic
export function IsometricModelGraphic() {
  return (
    <div className="relative w-full h-48 overflow-hidden rounded-xl bg-[#050810] border border-slate-800/80 p-4 font-mono text-[11px] select-none group-hover:border-teal-500/40 transition-colors">
      <div className="absolute inset-0 bg-linear-to-br from-teal-500/5 via-transparent to-cyan-500/5 pointer-events-none" />
      {/* 3D Isometric Skewed Container */}
      <div className="transform -rotate-6 scale-95 origin-top-left space-y-1.5 transition-transform duration-500 group-hover:rotate-0 group-hover:scale-100">
        <div className="text-slate-500 text-[10px]">// datasource & generator</div>
        <div className="text-teal-400">datasource db &#123;</div>
        <div className="pl-3 text-slate-400">provider = <span className="text-amber-300">"postgresql"</span></div>
        <div className="pl-3 text-slate-400">url = env(<span className="text-amber-300">"DATABASE_URL"</span>)</div>
        <div className="text-teal-400">&#125;</div>
        <div className="text-teal-400 mt-2">generator client &#123;</div>
        <div className="pl-3 text-slate-400">provider = <span className="text-teal-300 font-bold">"prisma-client-js"</span></div>
        <div className="text-teal-400">&#125;</div>
        <div className="text-pink-400 mt-2">model <span className="text-teal-300 font-bold">User</span> &#123;</div>
        <div className="pl-3 text-slate-300">id <span className="text-purple-400">Int</span> @id @default(autoincrement())</div>
        <div className="pl-3 text-slate-300">email <span className="text-purple-400">String</span> @unique</div>
        <div className="pl-3 text-slate-300">posts <span className="text-purple-400">Post[]</span></div>
        <div className="text-pink-400">&#125;</div>
      </div>
      {/* Glowing Gradient Line Overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-linear-to-r from-teal-500 via-emerald-400 to-cyan-500 opacity-70" />
    </div>
  )
}

// 2. Isometric Postgres Multi-Region Cluster Vector Graphic
export function IsometricClusterGraphic() {
  return (
    <div className="relative w-full h-48 overflow-hidden rounded-xl bg-[#050810] border border-slate-800/80 p-4 select-none flex items-center justify-center group-hover:border-emerald-500/40 transition-colors">
      <div className="absolute inset-0 bg-linear-to-br from-emerald-500/5 via-transparent to-teal-500/5 pointer-events-none" />
      
      {/* SVG Cluster Topology */}
      <svg className="w-full h-full max-w-70" viewBox="0 0 280 160" fill="none">
        {/* Connection Lines */}
        <line x1="60" y1="40" x2="140" y2="80" stroke="#00c573" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
        <line x1="220" y1="40" x2="140" y2="80" stroke="#00c573" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
        <line x1="60" y1="120" x2="140" y2="80" stroke="#00c573" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
        <line x1="220" y1="120" x2="140" y2="80" stroke="#00c573" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />

        {/* Latency Badges */}
        <g fontSize="9" fontFamily="monospace" fill="#00c573">
          <rect x="85" y="52" width="30" height="14" rx="3" fill="#061f16" stroke="#00c573" strokeWidth="0.8" />
          <text x="100" y="62" textAnchor="middle">4ms</text>

          <rect x="165" y="52" width="34" height="14" rx="3" fill="#061f16" stroke="#00c573" strokeWidth="0.8" />
          <text x="182" y="62" textAnchor="middle">11ms</text>

          <rect x="85" y="98" width="34" height="14" rx="3" fill="#061f16" stroke="#00c573" strokeWidth="0.8" />
          <text x="102" y="108" textAnchor="middle">18ms</text>

          <rect x="165" y="98" width="34" height="14" rx="3" fill="#061f16" stroke="#00c573" strokeWidth="0.8" />
          <text x="182" y="108" textAnchor="middle">22ms</text>
        </g>

        {/* Outer Region Nodes */}
        {/* US-WEST-2 */}
        <g transform="translate(60, 40)">
          <ellipse cx="0" cy="0" rx="22" ry="12" fill="#0d241c" stroke="#00c573" strokeWidth="1.5" />
          <text x="0" y="18" textAnchor="middle" fontSize="8" fontFamily="sans-serif" fill="#94a3b8" fontWeight="bold">US-WEST-2</text>
        </g>
        {/* EU-WEST-1 */}
        <g transform="translate(220, 40)">
          <ellipse cx="0" cy="0" rx="22" ry="12" fill="#0d241c" stroke="#00c573" strokeWidth="1.5" />
          <text x="0" y="18" textAnchor="middle" fontSize="8" fontFamily="sans-serif" fill="#94a3b8" fontWeight="bold">EU-WEST-1</text>
        </g>
        {/* AP-SOUTH-2 */}
        <g transform="translate(60, 120)">
          <ellipse cx="0" cy="0" rx="22" ry="12" fill="#0d241c" stroke="#00c573" strokeWidth="1.5" />
          <text x="0" y="18" textAnchor="middle" fontSize="8" fontFamily="sans-serif" fill="#94a3b8" fontWeight="bold">AP-SOUTH-2</text>
        </g>
        {/* AP-NORTHEAST-1 */}
        <g transform="translate(220, 120)">
          <ellipse cx="0" cy="0" rx="22" ry="12" fill="#0d241c" stroke="#00c573" strokeWidth="1.5" />
          <text x="0" y="18" textAnchor="middle" fontSize="8" fontFamily="sans-serif" fill="#94a3b8" fontWeight="bold">AP-NORTHEAST-1</text>
        </g>

        {/* Central Database Stack Cylinder */}
        <g transform="translate(140, 80)">
          <ellipse cx="0" cy="12" rx="34" ry="16" fill="#043828" stroke="#3ecf8e" strokeWidth="1.5" />
          <ellipse cx="0" cy="4" rx="34" ry="16" fill="#0a4d38" stroke="#3ecf8e" strokeWidth="1.5" />
          <ellipse cx="0" cy="-4" rx="34" ry="16" fill="#00c573" stroke="#3ecf8e" strokeWidth="1.5" />
          <ellipse cx="0" cy="-12" rx="34" ry="16" fill="#3ecf8e" stroke="#ffffff" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  )
}

// 3. Isometric Compute Terminal Vector Graphic
export function IsometricComputeGraphic() {
  return (
    <div className="relative w-full h-48 overflow-hidden rounded-xl bg-[#050810] border border-slate-800/80 p-4 font-mono text-[11px] select-none group-hover:border-cyan-500/40 transition-colors">
      <div className="absolute inset-0 bg-linear-to-br from-cyan-500/5 via-transparent to-teal-500/5 pointer-events-none" />
      
      {/* 3D Skewed CLI Output */}
      <div className="transform rotate-3 scale-95 origin-top-right space-y-1.5 transition-transform duration-500 group-hover:rotate-0 group-hover:scale-100">
        <div className="text-slate-400">$ <span className="text-cyan-300 font-bold">prisma deploy</span></div>
        <div className="text-slate-500">◆ Deploying to Prisma Compute...</div>
        <div className="text-slate-500">→ Building TypeScript 1.2s</div>
        <div className="text-slate-500">→ Uploading bundle 0.4s</div>
        <div className="text-teal-400 font-bold">✔ Deployed in 1.6s</div>
        
        <div className="mt-3 pt-2 border-t border-slate-800/80 space-y-1 text-[10px]">
          <div className="text-slate-400"><span className="text-slate-500">URL</span>  https://api-x7k2.prisma.app</div>
          <div className="text-slate-400"><span className="text-slate-500">ENV</span>  production · us-east-1</div>
          <div className="text-slate-400"><span className="text-slate-500">RAM</span>  512 MB · no timeout</div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-linear-to-r from-cyan-500 via-teal-400 to-emerald-400 opacity-70" />
    </div>
  )
}

// 4. Managed Postgres Feature Stack Card Illustration (Row 1 Left in Screenshot 1)
export function PostgresStackIllustration() {
  return (
    <div className="relative w-full h-[320px] rounded-2xl border border-slate-800/90 bg-[#060a12] p-6 flex flex-col justify-between overflow-hidden shadow-2xl group">
      {/* Background Gradient Lines Grid */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(ellipse at center, rgba(0, 197, 115, 0.25) 0%, transparent 70%), linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px)`,
          backgroundSize: '100% 100%, 36px 36px, 36px 36px',
        }}
      />

      {/* 3D Cylinder Disk Towers SVG */}
      <div className="relative z-10 flex-1 flex items-center justify-center">
        <svg className="w-full h-44" viewBox="0 0 340 180" fill="none">
          {/* Concentric Circle Rings Background */}
          <ellipse cx="170" cy="110" rx="140" ry="50" stroke="#00c573" strokeWidth="1" strokeDasharray="4 4" opacity="0.25" />
          <ellipse cx="170" cy="110" rx="100" ry="36" stroke="#00c573" strokeWidth="1" strokeDasharray="4 4" opacity="0.35" />

          {/* Tower 1 (Small Left) */}
          <g transform="translate(80, 110)">
            <ellipse cx="0" cy="16" rx="26" ry="12" fill="#04261b" stroke="#00c573" strokeWidth="1.2" />
            <ellipse cx="0" cy="8" rx="26" ry="12" fill="#083828" stroke="#00c573" strokeWidth="1.2" />
            <ellipse cx="0" cy="0" rx="26" ry="12" fill="#0d4d38" stroke="#3ecf8e" strokeWidth="1.5" />
          </g>

          {/* Tower 2 (Medium Center) */}
          <g transform="translate(160, 100)">
            <ellipse cx="0" cy="24" rx="30" ry="14" fill="#04261b" stroke="#00c573" strokeWidth="1.2" />
            <ellipse cx="0" cy="16" rx="30" ry="14" fill="#073d2b" stroke="#00c573" strokeWidth="1.2" />
            <ellipse cx="0" cy="8" rx="30" ry="14" fill="#0c543b" stroke="#00c573" strokeWidth="1.2" />
            <ellipse cx="0" cy="0" rx="30" ry="14" fill="#126e4e" stroke="#3ecf8e" strokeWidth="1.5" />
          </g>

          {/* Tower 3 (Tall Right with Glowing Elephant Badge) */}
          <g transform="translate(250, 85)">
            <ellipse cx="0" cy="36" rx="32" ry="15" fill="#04261b" stroke="#00c573" strokeWidth="1.2" />
            <ellipse cx="0" cy="26" rx="32" ry="15" fill="#073d2b" stroke="#00c573" strokeWidth="1.2" />
            <ellipse cx="0" cy="16" rx="32" ry="15" fill="#0c543b" stroke="#00c573" strokeWidth="1.2" />
            <ellipse cx="0" cy="6" rx="32" ry="15" fill="#126e4e" stroke="#00c573" strokeWidth="1.5" />
            <ellipse cx="0" cy="-4" rx="32" ry="15" fill="#00c573" stroke="#3ecf8e" strokeWidth="1.5" />

            {/* Glowing PostgreSQL Badge */}
            <g transform="translate(0, -32)">
              <rect x="-16" y="-16" width="32" height="32" rx="8" fill="#061a12" stroke="#00c573" strokeWidth="1.5" />
              {/* Elephant Icon Vector */}
              <path d="M-6 -6 C-2 -10, 6 -10, 8 -4 C10 0, 8 6, 6 8 C4 10, -4 10, -6 6 Z" fill="none" stroke="#3ecf8e" strokeWidth="1.5" />
              <circle cx="2" cy="-3" r="1.5" fill="#3ecf8e" />
            </g>
          </g>
        </svg>
      </div>

      {/* Button */}
      <div className="relative z-10 pt-4">
        <button className="inline-flex items-center gap-1.5 rounded-full bg-mint-pulse hover:bg-[#3ecf8e] text-slate-950 font-bold px-5 py-2 text-xs transition-all shadow-lg shadow-mint-pulse/20">
          Explore Prisma Postgres <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// 5. Compute Processor Chip Illustration (Row 2 Right in Screenshot 1)
export function ComputeChipIllustration() {
  return (
    <div className="relative w-full h-[360px] rounded-2xl border border-slate-800/90 bg-[#060a12] p-6 flex flex-col justify-between overflow-hidden shadow-2xl group">
      {/* Background Radial Glow */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(ellipse at center, rgba(34, 211, 238, 0.25) 0%, transparent 70%), linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px)`,
          backgroundSize: '100% 100%, 36px 36px, 36px 36px',
        }}
      />

      <div className="relative z-10 flex items-center justify-between gap-2 mb-2">
        <span className="inline-flex items-center gap-1.5 bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 px-3 py-1 rounded-full text-xs font-mono font-semibold uppercase">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          LONG-LIVED COMPUTE
        </span>
      </div>

      {/* Bullet points & Isometric Microchip Graphic */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center my-auto">
        {/* Checkpoints */}
        <ul className="space-y-2.5 text-xs text-slate-300">
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>Container-based runtime for long-running apps</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>Long-running requests and streaming</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>Great for APIs and AI agents</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>Auto-wires Prisma Postgres and runs in the same environment</span>
          </li>
        </ul>

        {/* Isometric 3D Microchip SVG */}
        <div className="flex justify-center">
          <svg className="w-44 h-44" viewBox="0 0 200 200" fill="none">
            {/* PCB Traces */}
            <path d="M20 50 L70 50 L100 80" stroke="#0891b2" strokeWidth="1.5" opacity="0.6" />
            <path d="M20 150 L70 150 L100 120" stroke="#0891b2" strokeWidth="1.5" opacity="0.6" />
            <path d="M180 50 L130 50 L100 80" stroke="#0891b2" strokeWidth="1.5" opacity="0.6" />
            <path d="M180 150 L130 150 L100 120" stroke="#0891b2" strokeWidth="1.5" opacity="0.6" />

            {/* Microchip Body (Isometric Diamond) */}
            <polygon points="100,40 160,80 100,120 40,80" fill="#041a24" stroke="#22d3ee" strokeWidth="2" />
            <polygon points="100,48 150,80 100,112 50,80" fill="#082c3c" stroke="#22d3ee" strokeWidth="1.5" />

            {/* Inner Prism Logo Badge */}
            <polygon points="100,60 135,80 100,100 65,80" fill="#06b6d4" opacity="0.9" />
            <path d="M100 65 L125 80 L100 95 Z" fill="#ffffff" />
          </svg>
        </div>
      </div>

      {/* Button */}
      <div className="relative z-10 pt-2">
        <button className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold px-5 py-2 text-xs transition-all shadow-lg shadow-cyan-500/20">
          Explore Prisma Compute <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
