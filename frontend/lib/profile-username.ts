/**
 * `profiles.username` is NOT NULL in many deployments — derive a stable handle from email + user id.
 */
export function profileUsernameFromEmail(email: string, userId: string): string {
  const local = (email.split('@')[0] || 'user')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24) || 'user'
  const idPart = userId.replace(/-/g, '').slice(0, 12)
  return `${local}_${idPart}`.toLowerCase().slice(0, 48)
}
