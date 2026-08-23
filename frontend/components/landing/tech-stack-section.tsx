'use client'

import React from 'react'
import { Code2, Cpu, Database, Server, Terminal, Shield, Zap, Layers, Box } from 'lucide-react'

export function TechStackSection() {
  const techStack = [
    { name: 'TypeScript', category: 'Core Language', color: 'from-blue-500/20 to-indigo-500/20', stroke: '#3b82f6', desc: 'Type-safe client & server code' },
    { name: 'Next.js 16', category: 'Web Framework', color: 'from-slate-500/20 to-zinc-500/20', stroke: '#f8fafc', desc: 'App Router, RSC & Server Actions' },
    { name: 'React 19', category: 'UI Library', color: 'from-cyan-500/20 to-sky-500/20', stroke: '#06b6d4', desc: 'Concurrent UI & hooks' },
    { name: 'Python / FastAPI', category: 'AI Backend', color: 'from-emerald-500/20 to-teal-500/20', stroke: '#10b981', desc: 'Async AI microservices' },
    { name: 'PostgreSQL & Prisma', category: 'Data & ORM', color: 'from-teal-500/20 to-emerald-600/20', stroke: '#00c573', desc: 'Managed DB & type-safe queries' },
    { name: 'Redis', category: 'Cache & Rate Limit', color: 'from-red-500/20 to-rose-500/20', stroke: '#ef4444', desc: 'Sliding window throttling & queues' },
    { name: 'OpenAI & Gemini', category: 'GenAI Engines', color: 'from-purple-500/20 to-violet-500/20', stroke: '#a855f7', desc: 'Multi-modal LLMs & embeddings' },
    { name: 'Tailwind CSS v4', category: 'Design System', color: 'from-sky-500/20 to-cyan-500/20', stroke: '#38bdf8', desc: 'Utility CSS & token theme' },
    { name: 'Docker', category: 'Containers', color: 'from-blue-600/20 to-cyan-600/20', stroke: '#0284c7', desc: 'Containerized deployment' },
    { name: 'VS Code & Git', category: 'Tools & CI', color: 'from-amber-500/20 to-orange-500/20', stroke: '#f59e0b', desc: 'Extension & repository sync' },
  ]

  return (
    <section className="relative border-t border-slate-800/80 bg-[#060912] py-14 sm:py-16 lg:py-20 overflow-hidden">
      {/* Background Ambient Grid & Radial Glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 197, 115, 0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 197, 115, 0.12) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[700px] rounded-full bg-gradient-radial from-teal-500/10 via-emerald-500/5 to-transparent blur-3xl" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-3xl mx-auto text-center mb-10">
          <span className="text-xs font-mono font-bold text-teal-400 tracking-widest uppercase mb-2 block">
            ENGINEERED WITH MODERN STACK
          </span>
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-3">
            Powered by the modern TypeScript & AI stack.
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Every layer of CodeSpectra is built with type-safe primitives, high-throughput microservices, and AI synthesis engines.
          </p>
        </div>

        {/* Tech Stack 10-Grid Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
          {techStack.map((tech) => (
            <div
              key={tech.name}
              className="group relative rounded-xl border border-slate-800/90 bg-[#0b101c]/90 p-4 flex flex-col justify-between transition-all duration-300 hover:border-teal-500/50 hover:bg-[#0f1626] hover:-translate-y-0.5 shadow-lg min-h-[140px]"
            >
              <div className={`absolute top-0 right-0 w-20 h-20 rounded-full bg-linear-to-br ${tech.color} blur-2xl opacity-40 group-hover:opacity-80 transition-opacity`} />

              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center group-hover:border-teal-500/40 transition-colors shrink-0">
                    <Code2 className="w-4 h-4" style={{ color: tech.stroke }} />
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                    {tech.category}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white mb-1 group-hover:text-teal-300 transition-colors">
                  {tech.name}
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {tech.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
