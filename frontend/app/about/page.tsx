import { AboutView, aboutMetadata } from './about-view'

export const metadata = aboutMetadata('en')

export default function AboutPage() {
  return <AboutView locale="en" />
}
