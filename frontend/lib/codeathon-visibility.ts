/** Draft / unpublished events are visible to their staff only (SEC-015 / A-044). */
export function codeathonPubliclyVisible(doc: Record<string, unknown> | null): boolean {
  if (!doc) return false
  const status = String(doc.status ?? '').toLowerCase()
  if (status === 'draft' || status === 'archived' || status === 'deleted') return false
  if (doc.published === false || doc.is_published === false) return false
  if (doc.visibility === 'private' || doc.deletedAt) return false
  return true
}
