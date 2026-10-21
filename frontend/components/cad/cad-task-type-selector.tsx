'use client'

import { Layers, CheckCircle2, FileText, Cpu, Wrench, RefreshCw, Calculator, Activity, MessageSquare } from 'lucide-react'
import { useT } from '@/lib/i18n/client'

export interface TaskTypeOption {
  id: string
  code: string
  name: string
  duration: string
  automation: string
  description: string
  icon: any
}

export const CAD_TASK_TYPES: TaskTypeOption[] = [
  {
    id: 'T1',
    code: 'T1_PART_MODELLING',
    name: 'T1. Part Modelling Task',
    duration: '30-60 min',
    automation: 'HIGH',
    description: 'Feature-based modelling, design intent, parametric thinking.',
    icon: Layers,
  },
  {
    id: 'T2',
    code: 'T2_ASSEMBLY_AND_MATE',
    name: 'T2. Assembly & Mate Task',
    duration: '30-45 min',
    automation: 'HIGH',
    description: 'Constraint logic, degrees of freedom, interference awareness.',
    icon: Cpu,
  },
  {
    id: 'T3',
    code: 'T3_GDT_AND_DRAWING',
    name: 'T3. GD&T & Drawing Task',
    duration: '20-40 min',
    automation: 'HIGH',
    description: 'Manufacturing communication, tolerancing (ISO 1101 / ASME Y14.5).',
    icon: FileText,
  },
  {
    id: 'T4',
    code: 'T4_DFM_CRITIQUE',
    name: 'T4. DFM Critique',
    duration: '15-25 min',
    automation: 'HIGH',
    description: 'Manufacturing defect detection (undercuts, draft, wall thickness).',
    icon: Wrench,
  },
  {
    id: 'T5',
    code: 'T5_MODEL_REPAIR',
    name: 'T5. Model Repair & Edit',
    duration: '20-40 min',
    automation: 'HIGH',
    description: 'Fixing broken feature trees, rebuild errors, over-constrained sketches.',
    icon: RefreshCw,
  },
  {
    id: 'T6',
    code: 'T6_ENGINEERING_CHANGE_ORDER',
    name: 'T6. ECO Task',
    duration: '25-40 min',
    automation: 'MED-HIGH',
    description: 'Propagating engineering change requests across model & drawing.',
    icon: RefreshCw,
  },
  {
    id: 'T7',
    code: 'T7_CALCULATION_AND_SIZING',
    name: 'T7. Calculation & Sizing',
    duration: '20-30 min',
    automation: 'HIGH',
    description: 'First-principles engineering math (bearing selection, shaft sizing).',
    icon: Calculator,
  },
  {
    id: 'T8',
    code: 'T8_FEA_INTERPRETATION',
    name: 'T8. Simulation Interpretation',
    duration: '15-25 min',
    automation: 'HIGH',
    description: 'FEA/CFD stress plot interpretation & boundary condition analysis.',
    icon: Activity,
  },
  {
    id: 'T9',
    code: 'T9_DESIGN_RATIONALE_VIVA',
    name: 'T9. Design Rationale / Viva',
    duration: '10-15 min',
    automation: 'MED (AI+SME)',
    description: 'Mandatory anti-cheat anchor: viva rationale explaining design choices.',
    icon: MessageSquare,
  },
]

interface CADTaskTypeSelectorProps {
  selectedTaskCode: string
  onSelectTask: (taskCode: string) => void
}

export function CADTaskTypeSelector({ selectedTaskCode, onSelectTask }: CADTaskTypeSelectorProps) {
  const { td } = useT()
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:grid-cols-3">
      {CAD_TASK_TYPES.map((t) => {
        const Icon = t.icon
        const isSelected = selectedTaskCode === t.code
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelectTask(t.code)}
            className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
              isSelected
                ? 'border-primary bg-primary/10 text-foreground shadow-sm'
                : 'border-border bg-card/40 text-muted-foreground hover:bg-card hover:text-foreground'
            }`}
          >
            <div className="flex w-full items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 font-bold text-xs text-foreground">
                <Icon className="h-3.5 w-3.5 text-primary" />
                <span>{td(`exam.cadTask:${t.id}`, t.name)}</span>
              </div>
              <span className="font-mono text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                {t.duration}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{td(`exam.cadTaskDesc:${t.id}`, t.description)}</p>
          </button>
        )
      })}
    </div>
  )
}
