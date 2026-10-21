import { FaqView, faqMetadata } from './faq-view'

export const metadata = faqMetadata('en')

export default function FAQPage() {
  return <FaqView locale="en" />
}
