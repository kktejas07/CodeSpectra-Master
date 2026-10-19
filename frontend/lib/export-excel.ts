import { buildXlsx, downloadXlsx } from '@/lib/xlsx-lite'

export interface ExportUser {
  id: string
  name: string
  email: string
  role: string
  status: string
  joinedAt: string
  lastActive: string
  plan?: string
}

/**
 * Export array of users to an Excel spreadsheet (.xlsx/.xls format)
 */
export function exportUsersToXLS(users: ExportUser[], filename?: string) {
  if (!users || users.length === 0) return false

  const exportData = users.map((u) => ({
    'User ID': u.id,
    'Full Name': u.name || 'N/A',
    'Email Address': u.email || 'N/A',
    'Role': u.role || 'user',
    'Status': u.status || 'inactive',
    'Plan': u.plan || 'free',
    'Joined Date': u.joinedAt || 'N/A',
    'Last Active': u.lastActive || 'N/A',
  }))

  // Auto-fit column widths
  const keys = Object.keys(exportData[0] || {})
  const colWidths = keys.map((key) => {
    let maxLen = key.length
    for (const row of exportData) {
      const val = String((row as Record<string, unknown>)[key] ?? '')
      if (val.length > maxLen) maxLen = val.length
    }
    return Math.min(Math.max(maxLen + 4, 12), 50)
  })

  const exportFilename = filename || `user_management_${new Date().toISOString().split('T')[0]}.xlsx`
  downloadXlsx(buildXlsx(exportData, { sheetName: 'Users', columnWidths: colWidths }), exportFilename)
  return true
}
