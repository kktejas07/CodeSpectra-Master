/**
 * Input sanitization utilities for safe MongoDB queries and general input handling.
 */

/**
 * Escapes all special regex characters in a string so it can be safely used
 * inside a MongoDB $regex operator (or a RegExp constructor) without allowing
 * the user to inject regex metacharacters.
 *
 * Without this, a user-supplied string like `.*` or `(?=.)` could alter the
 * regex behavior and match unintended documents.
 */
export function sanitizeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
