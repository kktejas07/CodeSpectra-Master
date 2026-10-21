'use client'

/**
 * Builder fields for the wave-6 question types, shown in the assessment
 * question dialog (app/dashboard/admin/assessments/[id]/edit). Also adds the
 * aptitude area (any type) and the psychometric trait key on Likert items.
 * Saved through PATCH /api/exams, which runs sanitizeExtendedQuestionFields.
 */
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { CODE_LANGUAGES } from '@/lib/code-languages'
import { canonicalType, metaFor } from '@/lib/question-types'
import {
  ANSWER_FILE_MAX_MB, APTITUDE_AREAS, BLACK_BOX_MAX_RUNS, CASE_SUB_TYPES, UPLOAD_FILE_KINDS, VIDEO_MAX_SECONDS,
  type AptitudeArea, type CaseSubQuestion, type CaseSubType, type ExtendedQuestionFields,
} from '@/lib/question-extensions'
import { useT } from '@/lib/i18n/client'

const selectCls = 'h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const hint = 'text-xs text-muted-foreground'

function int(v: string, fallback: number): number {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : fallback
}

export function ExtendedQuestionEditor({
  question,
  onChange,
}: {
  question: ExtendedQuestionFields & { id: string; type: string; score?: number }
  onChange: (patch: ExtendedQuestionFields & { score?: number }) => void
}) {
  const { t: tr } = useT()
  const t = canonicalType(question.type)
  const subs = question.sub_questions || []
  const setSubs = (next: CaseSubQuestion[]) => onChange({ sub_questions: next, score: next.reduce((a, s) => a + (Number(s.points) || 0), 0) })
  const patchSub = (i: number, p: Partial<CaseSubQuestion>) => setSubs(subs.map((s, j) => (j === i ? { ...s, ...p } : s)))

  return (
    <div className="grid gap-4">
      {/* Aptitude area: lets the sections editor build Quant / Logical / Verbal timed sections. */}
      {metaFor(t).scored && (
        <div className="grid gap-2">
          <Label htmlFor={`q-apt-${question.id}`}>{tr('exam.aptitudeArea')}{' '}<span className="font-normal text-muted-foreground">{tr('common.optionalParen')}</span></Label>
          <select
            id={`q-apt-${question.id}`}
            className={selectCls}
            value={question.aptitude_area || ''}
            onChange={(e) => onChange({ aptitude_area: (e.target.value || undefined) as AptitudeArea | undefined })}
          >
            <option value="">{tr('exam.none2')}</option>
            {APTITUDE_AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
      )}

      {t === 'likert' && (
        <div className="grid gap-2 rounded-2xl border border-border p-3">
          <Label htmlFor={`q-trait-${question.id}`}>{tr('exam.personalityTrait')}{' '}<span className="font-normal text-muted-foreground">{tr('exam.optionalForPsychometricScoring')}</span></Label>
          <Input id={`q-trait-${question.id}`} maxLength={60} value={question.trait || ''} onChange={(e) => onChange({ trait: e.target.value || undefined })} placeholder={tr('exam.eGConscientiousness')} />
          <div className="flex items-center gap-2">
            <Switch id={`q-rev-${question.id}`} checked={question.reverse_scored === true} onCheckedChange={(v) => onChange({ reverse_scored: v === true ? true : undefined })} />
            <Label htmlFor={`q-rev-${question.id}`} className="text-sm font-normal">{tr('exam.reverseScoredAgreeingCountsAgainstTheab7')}</Label>
          </div>
          <p className={hint}>{tr('exam.resultsShowAScorePerTraitfe8')}</p>
        </div>
      )}

      {t === 'theory_to_code' && (
        <p className={hint}>{tr('exam.writeTheConceptAlgorithmOrPapere92')}</p>
      )}

      {t === 'reverse_coding' && (
        <div className="grid gap-3 rounded-2xl border border-border p-3">
          <p className={hint}>{tr('exam.candidatesSeeOnlyTheVisibleTeste4d')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`q-ref-lang-${question.id}`}>{tr('exam.referenceLanguage')}</Label>
              <select id={`q-ref-lang-${question.id}`} className={selectCls} value={question.reference_solution?.language || 'python'} onChange={(e) => onChange({ reference_solution: { language: e.target.value, code: question.reference_solution?.code || '' } })}>
                {CODE_LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`q-bb-${question.id}`}>{tr('exam.blackBoxRunsPerHour')}</Label>
              <Input id={`q-bb-${question.id}`} type="number" min={0} max={BLACK_BOX_MAX_RUNS} value={question.black_box_runs ?? 0} onChange={(e) => onChange({ black_box_runs: Math.max(0, Math.min(BLACK_BOX_MAX_RUNS, int(e.target.value, 0))) || undefined })} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`q-ref-code-${question.id}`}>{tr('exam.hiddenReferenceSolution')}{' '}<span className="font-normal text-muted-foreground">{tr('exam.readsStdinPrintsStdoutNeverShown')}</span></Label>
            <Textarea id={`q-ref-code-${question.id}`} rows={6} className="font-mono text-xs" value={question.reference_solution?.code || ''} onChange={(e) => onChange({ reference_solution: { language: question.reference_solution?.language || 'python', code: e.target.value } })} />
          </div>
          <p className={hint}>{tr('exam.withRunsAbove0AndA0fb')}</p>
        </div>
      )}

      {t === 'system_design' && (
        <div className="grid gap-3 rounded-2xl border border-border p-3">
          <div className="grid gap-2">
            <Label htmlFor={`q-rubric-${question.id}`}>{tr('exam.markingRubric')}</Label>
            <Textarea id={`q-rubric-${question.id}`} rows={6} maxLength={8000} value={question.rubric || ''} onChange={(e) => onChange({ rubric: e.target.value })} placeholder={tr('exam.clarifiesRequirementsAndScale2Sensible323')} />
            <p className={hint}>{tr('exam.theAiSuggestsAMarkAgainst4bb')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch id={`q-diagram-${question.id}`} checked={question.allow_diagram === true} onCheckedChange={(v) => onChange({ allow_diagram: v === true ? true : undefined })} />
            <Label htmlFor={`q-diagram-${question.id}`} className="text-sm font-normal">{tr('exam.giveCandidatesADiagramBoxPlaind92')}</Label>
          </div>
        </div>
      )}

      {t === 'case_study' && (
        <div className="grid gap-3">
          <Label>{tr('exam.subQuestions')}{' '}<span className="font-normal text-muted-foreground">{tr('exam.thePromptAboveIsTheSharedfa3')}</span></Label>
          {subs.map((s, i) => {
            const choice = s.type === 'mcq' || s.type === 'multiple_response' || s.type === 'true_false' || s.type === 'yes_no'
            return (
              <div key={s.id} className="grid gap-2 rounded-2xl border border-border p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="grid min-w-[10rem] flex-1 gap-1">
                    <Label htmlFor={`sub-type-${s.id}`} className="text-xs">{tr('exam.partValueType', { value: String.fromCharCode(97 + i) })}</Label>
                    <select
                      id={`sub-type-${s.id}`}
                      className={selectCls}
                      value={s.type}
                      onChange={(e) => {
                        const type = e.target.value as CaseSubType
                        patchSub(i, { type, answer: '', options: type === 'true_false' ? ['True', 'False'] : type === 'yes_no' ? ['Yes', 'No'] : type === 'mcq' || type === 'multiple_response' ? (s.options?.length ? s.options : ['', '', '', '']) : undefined })
                      }}
                    >
                      {CASE_SUB_TYPES.map((ct) => <option key={ct} value={ct}>{metaFor(ct).label}</option>)}
                    </select>
                  </div>
                  <div className="grid w-24 gap-1">
                    <Label htmlFor={`sub-pts-${s.id}`} className="text-xs">{tr('exam.points')}</Label>
                    <Input id={`sub-pts-${s.id}`} type="number" min={1} max={100} value={s.points} onChange={(e) => patchSub(i, { points: Math.max(1, Math.min(100, int(e.target.value, 1))) })} />
                  </div>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-destructive" aria-label={tr('exam.removePartValue', { value: String.fromCharCode(97 + i) })} onClick={() => setSubs(subs.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                </div>
                <Label htmlFor={`sub-prompt-${s.id}`} className="text-xs">{tr('exam.question')}</Label>
                <Textarea id={`sub-prompt-${s.id}`} rows={2} value={s.prompt} onChange={(e) => patchSub(i, { prompt: e.target.value })} />
                {choice && (
                  <>
                    <Label htmlFor={`sub-opts-${s.id}`} className="text-xs">{tr('exam.optionsOnePerLine')}</Label>
                    <Textarea id={`sub-opts-${s.id}`} rows={3} value={(s.options || []).join('\n')} disabled={s.type === 'true_false' || s.type === 'yes_no'} onChange={(e) => patchSub(i, { options: e.target.value.split('\n') })} />
                  </>
                )}
                <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
                  <div className="grid gap-1">
                    <Label htmlFor={`sub-ans-${s.id}`} className="text-xs">{tr('exam.correctAnswerValue', { value: s.type === 'multiple_response' || s.type === 'fill_blanks' ? tr('exam.commaSeparated') : '' })}</Label>
                    <Input id={`sub-ans-${s.id}`} value={s.answer || ''} onChange={(e) => patchSub(i, { answer: e.target.value })} />
                  </div>
                  {s.type === 'numeric' && (
                    <div className="grid gap-1">
                      <Label htmlFor={`sub-tol-${s.id}`} className="text-xs">{tr('exam.tolerance')}</Label>
                      <Input id={`sub-tol-${s.id}`} type="number" min={0} step="any" value={s.tolerance ?? 0} onChange={(e) => patchSub(i, { tolerance: parseFloat(e.target.value) || undefined })} />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {subs.length < 10 && (
            <Button variant="outline" size="sm" className="w-fit gap-1" onClick={() => setSubs([...subs, { id: `s${Date.now().toString(36)}`, type: 'mcq', prompt: '', options: ['', '', '', ''], points: 5 }])}>
              <Plus className="h-3.5 w-3.5" />{' '}{tr('exam.addPart')}</Button>
          )}
          <p className={hint}>{tr('exam.eachPartIsMarkedAutomaticallyThe7c8')}<span className="tabular-nums">{subs.reduce((a, s) => a + (Number(s.points) || 0), 0)}</span> points).</p>
        </div>
      )}

      {t === 'file_upload' && (
        <div className="grid gap-3 rounded-2xl border border-border p-3">
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{tr('exam.allowedFileTypes')}</legend>
            {UPLOAD_FILE_KINDS.map((k) => {
              const allowed = question.upload?.allowed || ['pdf']
              return (
                <label key={k.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={allowed.includes(k.id)}
                    onChange={(e) => {
                      const next = e.target.checked ? [...new Set([...allowed, k.id])] : allowed.filter((x) => x !== k.id)
                      onChange({ upload: { allowed: next.length ? next : ['pdf'], max_mb: question.upload?.max_mb ?? 5 } })
                    }}
                  />
                  {k.label}
                </label>
              )
            })}
          </fieldset>
          <div className="grid w-40 gap-1">
            <Label htmlFor={`q-maxmb-${question.id}`}>{tr('exam.sizeLimitMb')}</Label>
            <Input id={`q-maxmb-${question.id}`} type="number" min={1} max={ANSWER_FILE_MAX_MB} value={question.upload?.max_mb ?? 5} onChange={(e) => onChange({ upload: { allowed: question.upload?.allowed || ['pdf'], max_mb: Math.max(1, Math.min(ANSWER_FILE_MAX_MB, int(e.target.value, 5))) } })} />
          </div>
          <p className={hint}>{tr('exam.filesAreCheckedByContentNot210')}</p>
        </div>
      )}

      {t === 'video_response' && (
        <div className="grid gap-3 rounded-2xl border border-border p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor={`q-vmax-${question.id}`}>{tr('exam.maxLengthSeconds')}</Label>
              <Input id={`q-vmax-${question.id}`} type="number" min={10} max={VIDEO_MAX_SECONDS} value={question.video?.max_seconds ?? 120} onChange={(e) => onChange({ video: { max_seconds: Math.max(10, Math.min(VIDEO_MAX_SECONDS, int(e.target.value, 120))), retakes: question.video?.retakes ?? 1, allow_text_alternative: question.video?.allow_text_alternative ?? true } })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`q-vre-${question.id}`}>{tr('exam.retakesAllowed')}</Label>
              <Input id={`q-vre-${question.id}`} type="number" min={0} max={5} value={question.video?.retakes ?? 1} onChange={(e) => onChange({ video: { max_seconds: question.video?.max_seconds ?? 120, retakes: Math.max(0, Math.min(5, int(e.target.value, 1))), allow_text_alternative: question.video?.allow_text_alternative ?? true } })} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id={`q-valt-${question.id}`} checked={question.video?.allow_text_alternative !== false} onCheckedChange={(v) => onChange({ video: { max_seconds: question.video?.max_seconds ?? 120, retakes: question.video?.retakes ?? 1, allow_text_alternative: v === true } })} />
            <Label htmlFor={`q-valt-${question.id}`} className="text-sm font-normal">{tr('exam.allowATypedAnswerInsteadAccessibility8b1')}</Label>
          </div>
          <p className={hint}>{tr('exam.recordedInTheBrowserAndUploaded473')}</p>
        </div>
      )}

      {t === 'typing_test' && (
        <div className="grid gap-3 rounded-2xl border border-border p-3">
          <div className="grid gap-2">
            <Label htmlFor={`q-passage-${question.id}`}>{tr('exam.passageToType')}</Label>
            <Textarea id={`q-passage-${question.id}`} rows={5} maxLength={5000} value={question.typing?.passage || ''} onChange={(e) => onChange({ typing: { ...(question.typing || { min_wpm: 35, min_accuracy: 92 }), passage: e.target.value } })} />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="grid gap-1">
              <Label htmlFor={`q-wpm-${question.id}`}>{tr('exam.targetWpm')}</Label>
              <Input id={`q-wpm-${question.id}`} type="number" min={1} max={250} value={question.typing?.min_wpm ?? 35} onChange={(e) => onChange({ typing: { ...(question.typing || { passage: '', min_accuracy: 92 }), min_wpm: Math.max(1, Math.min(250, int(e.target.value, 35))) } })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`q-acc-${question.id}`}>{tr('exam.targetAccuracy')}</Label>
              <Input id={`q-acc-${question.id}`} type="number" min={1} max={100} value={question.typing?.min_accuracy ?? 92} onChange={(e) => onChange({ typing: { ...(question.typing || { passage: '', min_wpm: 35 }), min_accuracy: Math.max(1, Math.min(100, int(e.target.value, 92))) } })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`q-tlim-${question.id}`}>{tr('exam.timeLimitSOptional')}</Label>
              <Input id={`q-tlim-${question.id}`} type="number" min={0} max={900} value={question.typing?.time_limit_seconds ?? ''} onChange={(e) => onChange({ typing: { ...(question.typing || { passage: '', min_wpm: 35, min_accuracy: 92 }), time_limit_seconds: int(e.target.value, 0) || undefined } })} />
            </div>
          </div>
          <p className={hint}>{tr('exam.fullMarksWhenBothTargetsAre985')}</p>
        </div>
      )}
    </div>
  )
}
