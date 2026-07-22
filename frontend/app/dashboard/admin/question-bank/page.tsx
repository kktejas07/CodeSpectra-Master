'use client'

import { useState } from 'react'
import { usePageGuard } from '@/lib/use-page-guard'
import {
  FileText,
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  Edit,
  Trash2,
  Tag,
  Clock,
  Layers,
  Award,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'

interface QuestionItem {
  id: string
  title: string
  discipline: string
  competency: string
  experienceBand: '0-1 yr' | '2-3 yr' | '4-6 yr'
  difficulty: 'easy' | 'medium' | 'hard'
  difficultyPoints: number
  modality: 'cad' | 'qna' | 'written' | 'code' | 'english' | 'psychometric'
  expectedDurationMins: number
  prompt: string
  version: number
  isActive: boolean
}

const INITIAL_ITEMS: QuestionItem[] = [
  {
    id: 'q-101',
    title: 'Precision Shaft Tolerancing & GD&T Analysis',
    discipline: 'Mechanical Design',
    competency: 'GD&T',
    experienceBand: '2-3 yr',
    difficulty: 'medium',
    difficultyPoints: 4,
    modality: 'cad',
    expectedDurationMins: 30,
    prompt: 'Model a 2-stage shaft assembly adhering to ISO 2768-m tolerances and verify concentricity.',
    version: 2,
    isActive: true,
  },
  {
    id: 'q-102',
    title: 'Bracket Mass Reduction & Stress FEA Optimization',
    discipline: 'Mechanical Design',
    competency: 'FEA & Mass Properties',
    experienceBand: '4-6 yr',
    difficulty: 'hard',
    difficultyPoints: 5,
    modality: 'cad',
    expectedDurationMins: 45,
    prompt: 'Reduce component mass by 25% while maintaining minimum yield strength of 250 MPa under 5kN load.',
    version: 1,
    isActive: true,
  },
  {
    id: 'q-103',
    title: 'Injection Molding Tooling & Draft Angle Verification',
    discipline: 'Manufacturing',
    competency: 'Tooling & Moldability',
    experienceBand: '2-3 yr',
    difficulty: 'medium',
    difficultyPoints: 4,
    modality: 'qna',
    expectedDurationMins: 15,
    prompt: 'Evaluate parting line placement and calculate required draft angles for ABS plastic housing.',
    version: 1,
    isActive: true,
  },
  {
    id: 'q-104',
    title: 'CNC G-Code Optimization & Cycle Time Reduction',
    discipline: 'Manufacturing',
    competency: 'Machining & CAM',
    experienceBand: '0-1 yr',
    difficulty: 'easy',
    difficultyPoints: 3,
    modality: 'written',
    expectedDurationMins: 20,
    prompt: 'Review multi-axis toolpath and suggest feed-rate adjustments for aluminum 6061-T6 milling.',
    version: 3,
    isActive: true,
  },
]

export default function QuestionBankPage() {
  const gate = usePageGuard('superadmin')
  const [items, setItems] = useState<QuestionItem[]>(INITIAL_ITEMS)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>('All')
  const [selectedBand, setSelectedBand] = useState<string>('All')
  const [selectedModality, setSelectedModality] = useState<string>('All')
  const [showAddModal, setShowAddModal] = useState(false)

  // Null-safe filtering
  const filteredItems = items.filter((item) => {
    const titleMatch = (item.title || '').toLowerCase().includes((searchTerm || '').toLowerCase())
    const competencyMatch = (item.competency || '').toLowerCase().includes((searchTerm || '').toLowerCase())
    const discMatch = selectedDiscipline === 'All' || item.discipline === selectedDiscipline
    const bandMatch = selectedBand === 'All' || item.experienceBand === selectedBand
    const modMatch = selectedModality === 'All' || item.modality === selectedModality
    return (titleMatch || competencyMatch) && discMatch && bandMatch && modMatch
  })

  if (!gate.ready) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Engineering Question Bank</h1>
          <p className="text-sm text-muted-foreground">
            Manage assessment items, competency tags, experience bands, and difficulty weights (Easy: 3, Med: 4, Hard: 5).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(items, null, 2))
              const dlAnchor = document.createElement('a')
              dlAnchor.setAttribute('href', dataStr)
              dlAnchor.setAttribute('download', 'question-bank-export.json')
              dlAnchor.click()
            }}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <Download className="h-4 w-4" />
            Export Bank
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Create Item
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm md:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by title or competency..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <select
            value={selectedDiscipline}
            onChange={(e) => setSelectedDiscipline(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="All">All Disciplines</option>
            <option value="Mechanical Design">Mechanical Design</option>
            <option value="Manufacturing">Manufacturing</option>
            <option value="Software Engineering">Software Engineering</option>
          </select>
        </div>

        <div>
          <select
            value={selectedBand}
            onChange={(e) => setSelectedBand(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="All">All Experience Bands</option>
            <option value="0-1 yr">0-1 yr (Junior)</option>
            <option value="2-3 yr">2-3 yr (Mid-level)</option>
            <option value="4-6 yr">4-6 yr (Senior)</option>
          </select>
        </div>

        <div>
          <select
            value={selectedModality}
            onChange={(e) => setSelectedModality(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="All">All Modalities</option>
            <option value="cad">CAD Task</option>
            <option value="qna">Technical Q&A</option>
            <option value="written">Written Rubric</option>
            <option value="code">Coding Task</option>
          </select>
        </div>
      </div>

      {/* Items Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
            <tr>
              <th className="py-3 px-4">Title & Competency</th>
              <th className="py-3 px-4">Discipline</th>
              <th className="py-3 px-4">Band</th>
              <th className="py-3 px-4">Modality</th>
              <th className="py-3 px-4">Difficulty & Points</th>
              <th className="py-3 px-4">Duration</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 text-foreground">
            {filteredItems.map((item) => (
              <tr key={item.id} className="transition-colors hover:bg-muted/20">
                <td className="py-3 px-4">
                  <div className="font-semibold text-foreground">{item.title}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                    <Tag className="h-3 w-3 text-primary" />
                    <span>{item.competency}</span>
                    <span className="text-border">•</span>
                    <span>v{item.version}</span>
                  </div>
                </td>
                <td className="py-3 px-4 font-medium">{item.discipline}</td>
                <td className="py-3 px-4">
                  <span className="inline-flex items-center rounded-md bg-secondary/80 px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                    {item.experienceBand}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span className="uppercase tracking-wider font-mono text-[10px] px-2 py-0.5 rounded border border-border bg-background">
                    {item.modality}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-1 font-medium">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        item.difficulty === 'easy'
                          ? 'bg-emerald-500'
                          : item.difficulty === 'medium'
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                    />
                    <span className="capitalize">{item.difficulty}</span>
                    <span className="text-muted-foreground font-normal">({item.difficultyPoints} pts)</span>
                  </div>
                </td>
                <td className="py-3 px-4 font-mono text-muted-foreground">{item.expectedDurationMins}m</td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => alert(`Editing item ${item.id}`)}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setItems(items.filter((i) => i.id !== item.id))}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
