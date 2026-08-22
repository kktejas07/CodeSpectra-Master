/** Client-safe blog category constants (no Mongo imports). */
export const BLOG_CATEGORIES = [
  { id: 'signals', label: 'Signals', description: 'Industry news, rewritten for builders' },
  { id: 'product', label: 'Product', description: 'CodeSpectra releases and launches' },
  { id: 'engineering', label: 'Engineering', description: 'How we build' },
  { id: 'careers', label: 'Careers', description: 'Skills, roles, roadmaps' },
  { id: 'campus', label: 'Campus', description: 'Hackathons, colleges, community' },
  { id: 'playbook', label: 'Playbook', description: 'Guides and deep dives' },
] as const

export type BlogCategoryId = (typeof BLOG_CATEGORIES)[number]['id']

export function isBlogCategory(v: string): v is BlogCategoryId {
  return BLOG_CATEGORIES.some((c) => c.id === v)
}

export function categoryLabel(id: string): string {
  return BLOG_CATEGORIES.find((c) => c.id === id)?.label || id
}
