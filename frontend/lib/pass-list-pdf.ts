'use client'
import { formatDate } from '@/lib/format-datetime'

export interface PassListEntry {
  name: string
  email: string
  score: number | null
}

/**
 * Client-side pass-list PDF (jsPDF, dynamically imported so the chunk only
 * loads on demand). One row per passed candidate + cutoff header.
 */
export async function downloadPassListPdf(
  examTitle: string,
  cutoff: number,
  passers: PassListEntry[]
): Promise<void> {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  let y = 20

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Assessment Pass List', pageWidth / 2, y, { align: 'center' })
  y += 8
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(examTitle, pageWidth / 2, y, { align: 'center' })
  y += 6
  doc.text(
    `Cutoff: ${cutoff}%  |  Passed: ${passers.length}  |  ${formatDate(new Date())}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  )
  y += 10

  const colX = [20, 30, 110, 150]
  const rowH = 8
  const drawHeader = () => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('#', colX[0], y)
    doc.text('Candidate', colX[1], y)
    doc.text('Email', colX[2], y)
    doc.text('Score', colX[3], y)
    y += 2
    doc.setDrawColor(200, 200, 200)
    doc.line(20, y, pageWidth - 20, y)
    y += rowH - 2
    doc.setFont('helvetica', 'normal')
  }
  drawHeader()

  const sorted = [...passers].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  sorted.forEach((p, i) => {
    if (y > pageHeight - 20) {
      doc.addPage()
      y = 20
      drawHeader()
    }
    doc.setFontSize(10)
    doc.text(String(i + 1), colX[0], y)
    doc.text(p.name.slice(0, 34), colX[1], y)
    doc.text(p.email.slice(0, 34), colX[2], y)
    doc.text(p.score != null ? `${p.score}%` : '—', colX[3], y)
    y += rowH
  })

  const safe = examTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)
  doc.save(`pass-list-${safe}-cutoff-${cutoff}.pdf`)
}
