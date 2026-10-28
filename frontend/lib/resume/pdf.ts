'use client'

/**
 * ATS-friendly résumé PDF built in the browser with jsPDF (dynamically
 * imported, like lib/passport/pdf.ts): one column, standard font, real
 * selectable text in reading order, no images or tables — what applicant
 * tracking systems parse best.
 * ponytail: Helvetica only covers Latin text; Hindi / Telugu content needs an
 * embedded font (print-to-PDF from the preview still works for those).
 */
import { EN_HEADINGS, type ResumeBuilderData, type ResumeHeadings } from './builder'

export async function downloadAtsPdf(d: ResumeBuilderData, fileName: string, h: ResumeHeadings = EN_HEADINGS): Promise<void> {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 16
  let y = M

  const ensure = (need: number) => { if (y + need > H - M) { doc.addPage(); y = M } }
  const text = (s: string, size: number, style: 'normal' | 'bold' = 'normal', gap = 1.5) => {
    if (!s.trim()) return
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(s.trim(), W - M * 2) as string[]
    for (const line of lines) {
      ensure(size * 0.45)
      doc.text(line, M, y)
      y += size * 0.42
    }
    y += gap
  }
  const join = (...p: string[]) => p.map((x) => x.trim()).filter(Boolean).join(' | ')
  const heading = (s: string) => {
    ensure(12)
    y += 2
    text(s.toUpperCase(), 11, 'bold', 0.5)
    doc.setDrawColor(180, 185, 195)
    doc.line(M, y - 1, W - M, y - 1)
    y += 2
  }

  doc.setTextColor(15, 23, 41)
  text(d.personal.fullName || ' ', 18, 'bold', 1)
  text(d.targetRole, 11, 'normal', 1)
  text(join(d.personal.email, d.personal.phone, d.personal.location), 9.5, 'normal', 0.5)
  text(join(d.personal.linkedin, d.personal.portfolio), 9.5, 'normal', 2)

  if (d.summary.trim()) { heading(h.summary); text(d.summary, 10) }
  if (d.experience.some((e) => e.role || e.company)) {
    heading(h.experience)
    for (const e of d.experience) { text(join(e.role, e.company, e.dates), 10.5, 'bold', 0.5); text(e.description, 10, 'normal', 2) }
  }
  if (d.projects.some((p) => p.name)) {
    heading(h.projects)
    for (const p of d.projects) { text(join(p.name, p.dates, p.link), 10.5, 'bold', 0.5); text(p.description, 10, 'normal', 2) }
  }
  if (d.education.some((e) => e.degree || e.institution)) {
    heading(h.education)
    for (const e of d.education) text(join(e.degree, e.institution, e.dates), 10, 'normal', 1)
  }
  if (d.skills.trim()) { heading(h.skills); text(d.skills, 10) }
  if (d.certificates.some((c) => c.name)) {
    heading(h.certificates)
    for (const c of d.certificates) text(join(c.name, c.issuer, c.date, c.link), 10, 'normal', 1)
  }
  if (d.achievements.some((a) => a.title)) {
    heading(h.achievements)
    for (const a of d.achievements) text(join(a.title, a.date) + (a.detail.trim() ? ` — ${a.detail.trim()}` : ''), 10, 'normal', 1)
  }
  doc.setProperties({ title: fileName, subject: d.targetRole || 'Resume' })
  doc.save(`${fileName.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'resume'}.pdf`)
}
