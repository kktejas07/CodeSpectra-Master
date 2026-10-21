/** Icon for a Learn category (decorative; the label always sits next to it). */
import {
  Binary, Boxes, Briefcase, Cloud, Code2, Database, FlaskConical, GraduationCap, Layers, Network, Puzzle, Repeat, ShieldCheck, Sparkles, Trophy, type LucideIcon,
} from 'lucide-react'
import type { LearnCategoryId } from '@/lib/learn/types'

export const LEARN_CATEGORY_ICONS: Record<LearnCategoryId, LucideIcon> = {
  dsa: Binary,
  'system-design': Network,
  'design-patterns': Puzzle,
  architecture: Layers,
  methodologies: Repeat,
  testing: FlaskConical,
  security: ShieldCheck,
  databases: Database,
  cloud: Cloud,
  'ai-ml': Sparkles,
  'interview-prep': GraduationCap,
  career: Briefcase,
  languages: Code2,
  technologies: Boxes,
  'competitions-careers': Trophy,
}

export function LearnCategoryIcon({ id, className }: { id: string; className?: string }) {
  const Icon = LEARN_CATEGORY_ICONS[id as LearnCategoryId]
  return Icon ? <Icon className={className ?? 'h-3.5 w-3.5'} aria-hidden /> : null
}
