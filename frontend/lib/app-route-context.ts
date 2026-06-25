/**
 * Next.js 15+ App Router: route handler `context.params` for a single `[id]` segment is a Promise.
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/route
 */
export type IdRouteContext = { params: Promise<{ id: string }> }
