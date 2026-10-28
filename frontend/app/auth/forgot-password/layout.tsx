import { privateMetadata } from '@/lib/seo/metadata'

// Own title so every auth / token page has a unique <title> (wave 5 crawl).
export const metadata = privateMetadata('Forgot password')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
