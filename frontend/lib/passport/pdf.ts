'use client'

/**
 * One-page passport PDF, built in the browser with jsPDF (dynamically
 * imported, like lib/pass-list-pdf.ts). QR code points at the verify page.
 */
import { LEVEL_LABELS, type PassportLevel } from './core'

export interface PassportPdfInput {
  name: string
  handle: string
  verifyUrl: string
  credentialId: string
  issuedAt: string
  skills: Array<{ skill: string; level: PassportLevel; score: number; evidenceCount: number; proctoredCount: number }>
  selfReported: string[] | null
}

export async function downloadPassportPdf(p: PassportPdfInput): Promise<void> {
  const [{ default: jsPDF }, QR] = await Promise.all([import('jspdf'), import('qrcode')])
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 16
  // Header band (royal blue brand).
  doc.setFillColor(47, 91, 231)
  doc.rect(0, 0, W, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Verified skill passport', M, 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Issued by CodeSpectra', M, 21)

  doc.setTextColor(15, 23, 41)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(p.name.slice(0, 60), M, 44)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90, 100, 120)
  const issued = new Date(p.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  doc.text(`Credential issued ${issued}`, M, 50)
  doc.text(doc.splitTextToSize(`Verify: ${p.verifyUrl}`, W - M * 2 - 40), M, 55)

  const qr = await QR.toDataURL(p.verifyUrl, { errorCorrectionLevel: 'M', margin: 1, width: 240 })
  doc.addImage(qr, 'PNG', W - M - 32, 36, 32, 32)

  let y = 76
  doc.setTextColor(15, 23, 41)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Verified skills', M, y)
  y += 6
  doc.setFontSize(9)
  doc.setTextColor(90, 100, 120)
  doc.text('Skill', M, y)
  doc.text('Level', M + 80, y)
  doc.text('Score', M + 115, y)
  doc.text('Results', M + 140, y)
  y += 2
  doc.setDrawColor(220, 225, 235)
  doc.line(M, y, W - M, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(15, 23, 41)
  doc.setFontSize(10)
  const rows = p.skills.slice(0, 26)
  if (!rows.length) {
    doc.text('No verified skills shared yet.', M, y)
    y += 6
  }
  for (const s of rows) {
    doc.text(s.skill.slice(0, 42), M, y)
    doc.text(LEVEL_LABELS[s.level], M + 80, y)
    doc.text(String(s.score), M + 115, y)
    doc.text(`${s.evidenceCount}${s.proctoredCount ? ` (${s.proctoredCount} proctored)` : ''}`, M + 140, y)
    y += 6.2
  }
  if (p.selfReported?.length && y < H - 40) {
    y += 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Self-reported (not verified)', M, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(doc.splitTextToSize(p.selfReported.join(', '), W - M * 2), M, y)
  }
  doc.setFontSize(8)
  doc.setTextColor(120, 130, 150)
  doc.text(doc.splitTextToSize('Levels are worked out from results recorded on CodeSpectra: proctored tests count most and older results count less over time. Scan the QR code or open the verify link to check this passport is authentic and current.', W - M * 2), M, H - 16)
  doc.text(`Credential id: ${p.credentialId}`.slice(0, 120), M, H - 8)
  doc.save(`skill-passport-${p.handle}.pdf`)
}
