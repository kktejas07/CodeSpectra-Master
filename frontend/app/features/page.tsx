import { FeaturesView, featuresMetadata } from './features-view'

export const metadata = featuresMetadata('en')

export default function FeaturesPage() {
  return <FeaturesView locale="en" />
}
