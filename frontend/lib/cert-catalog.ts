/**
 * Curated directory of real certification prep + free credentials.
 *
 * Two kinds of entries:
 *   - `prep`: Vendor certification tracks (AWS, Azure, Google, etc.). The
 *     official exams are PAID; we surface the free learning path + a free
 *     official practice exam, then link to where the user books the real
 *     exam. Passing the practice exam is NOT the real certification.
 *   - `free`: Free verifiable credentials the user can earn themselves by
 *     completing the linked provider course (freeCodeCamp, Microsoft Learn,
 *     etc.). We only curate + link out; the credential is issued by the
 *     provider, not by CodeSpectra.
 */

export type CertTrackKind = 'prep' | 'free'

export interface CertTrack {
  kind: CertTrackKind
  id: string
  vendor: string
  certName: string
  level: string
  description: string
  icon: string
  /** Hex accent for the card. */
  color: string
  freeStudyUrl: string
  freePracticeUrl?: string
  examBookingUrl?: string
  examCost?: string
  providerBadge: string
}

export const CERT_TRACKS: CertTrack[] = [
  // ── Vendor prep tracks (official exams are paid) ──────────────
  {
    kind: 'prep',
    id: 'aws-cloud-practitioner',
    vendor: 'AWS',
    certName: 'AWS Certified Cloud Practitioner',
    level: 'Foundational',
    description:
      'The entry-level AWS certification. Free official learning path + practice exam, then book the real exam (~$100) at Pearson VUE.',
    icon: 'A',
    color: '#FF9900',
    freeStudyUrl: 'https://aws.amazon.com/training/learn-about/cloud-practitioner/',
    freePracticeUrl: 'https://aws.amazon.com/certification/certified-cloud-practitioner/',
    examBookingUrl: 'https://www.aws.training/Certification',
    examCost: '~$100',
    providerBadge: 'Amazon Web Services',
  },
  {
    kind: 'prep',
    id: 'azure-fundamentals',
    vendor: 'Azure',
    certName: 'Microsoft Azure Fundamentals (AZ-900)',
    level: 'Fundamental',
    description:
      'Entry-level Azure certification. Free Microsoft Learn path + free practice assessment, then book the real exam (~$99).',
    icon: 'M',
    color: '#0078D4',
    freeStudyUrl: 'https://learn.microsoft.com/en-us/training/paths/microsoft-azure-fundamentals-describe-cloud-concepts/',
    freePracticeUrl: 'https://learn.microsoft.com/en-us/credentials/certifications/azure-fundamentals/practice/assessment?assessment-type=practice',
    examBookingUrl: 'https://learn.microsoft.com/en-us/credentials/certifications/azure-fundamentals/',
    examCost: '~$99',
    providerBadge: 'Microsoft Learn',
  },
  {
    kind: 'prep',
    id: 'azure-ai-fundamentals',
    vendor: 'Azure',
    certName: 'Microsoft Azure AI Fundamentals (AI-900)',
    level: 'Fundamental',
    description:
      'AI/ML fundamentals on Azure. Free Microsoft Learn path + practice assessment, then the real exam (~$99).',
    icon: 'A',
    color: '#0078D4',
    freeStudyUrl: 'https://learn.microsoft.com/en-us/training/paths/explore-artificial-intelligence/',
    freePracticeUrl: 'https://learn.microsoft.com/en-us/credentials/certifications/azure-ai-fundamentals/practice/assessment?assessment-type=practice',
    examBookingUrl: 'https://learn.microsoft.com/en-us/credentials/certifications/azure-ai-fundamentals/',
    examCost: '~$99',
    providerBadge: 'Microsoft Learn',
  },
  {
    kind: 'prep',
    id: 'google-cloud-digital-leader',
    vendor: 'Google Cloud',
    certName: 'Google Cloud Digital Leader',
    level: 'Foundational',
    description:
      'Entry-level Google Cloud certification. Free Google Cloud Skills Boost course, then the real exam (~$99).',
    icon: 'G',
    color: '#4285F4',
    freeStudyUrl: 'https://www.cloudskillsboost.google/paths/9',
    freePracticeUrl: 'https://cloud.google.com/learn/certification/digital-leader',
    examBookingUrl: 'https://cloud.google.com/learn/certification/digital-leader',
    examCost: '~$99',
    providerBadge: 'Google Cloud',
  },
  {
    kind: 'prep',
    id: 'comptia-security-plus',
    vendor: 'CompTIA',
    certName: 'CompTIA Security+',
    level: 'Professional',
    description:
      'Core cybersecurity certification. Free Professor Messer study series + practice questions, then the real exam (~$404).',
    icon: 'S',
    color: '#C8202F',
    freeStudyUrl: 'https://www.professormesser.com/security-plus/sy0-701/sy0-701-video/sy0-701-comptia-security-plus-course/',
    freePracticeUrl: 'https://www.professormesser.com/practice-exams/',
    examBookingUrl: 'https://www.comptia.org/certifications/security',
    examCost: '~$404',
    providerBadge: 'CompTIA',
  },
  {
    kind: 'prep',
    id: 'oracle-java',
    vendor: 'Oracle',
    certName: 'Oracle Certified Foundations Associate (Java)',
    level: 'Foundational',
    description:
      'Entry-level Java certification. Free Oracle University course, then the real exam (~$95).',
    icon: 'J',
    color: '#F80000',
    freeStudyUrl: 'https://education.oracle.com/java/java-17/pexam_1Z0-811',
    freePracticeUrl: 'https://education.oracle.com/java/java-17/pexam_1Z0-811',
    examBookingUrl: 'https://education.oracle.com/java/java-17/pexam_1Z0-811',
    examCost: '~$95',
    providerBadge: 'Oracle University',
  },

  // ── Free verifiable credentials (earn directly) ───────────────
  {
    kind: 'free',
    id: 'fcc-responsive-web-design',
    vendor: 'freeCodeCamp',
    certName: 'Responsive Web Design',
    level: 'Free credential',
    description:
      '300 hours, fully free, no expiry. Complete the curriculum and freeCodeCamp issues a verifiable certificate automatically.',
    icon: 'R',
    color: '#0A0A23',
    freeStudyUrl: 'https://www.freecodecamp.org/learn/2022/responsive-web-design/',
    providerBadge: 'freeCodeCamp',
  },
  {
    kind: 'free',
    id: 'fcc-javascript',
    vendor: 'freeCodeCamp',
    certName: 'JavaScript Algorithms & Data Structures',
    level: 'Free credential',
    description:
      'Fully free, no expiry. Complete the interactive curriculum to earn a verifiable freeCodeCamp certificate.',
    icon: 'J',
    color: '#0A0A23',
    freeStudyUrl: 'https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures-v8/',
    providerBadge: 'freeCodeCamp',
  },
  {
    kind: 'free',
    id: 'fcc-backend',
    vendor: 'freeCodeCamp',
    certName: 'Back End Development and APIs',
    level: 'Free credential',
    description:
      'Node.js, Express, MongoDB, and REST APIs. Fully free with a verifiable certificate.',
    icon: 'B',
    color: '#0A0A23',
    freeStudyUrl: 'https://www.freecodecamp.org/learn/back-end-development-and-apis/',
    providerBadge: 'freeCodeCamp',
  },
  {
    kind: 'free',
    id: 'ms-learn-ai-badge',
    vendor: 'Microsoft',
    certName: 'Microsoft Learn Achievements',
    level: 'Free credential',
    description:
      'Complete free Microsoft Learn modules (GitHub, Azure AI, Copilot, etc.) to earn shareable achievement badges.',
    icon: 'L',
    color: '#0078D4',
    freeStudyUrl: 'https://learn.microsoft.com/en-us/training/browse/?levels=beginner',
    providerBadge: 'Microsoft Learn',
  },
  {
    kind: 'free',
    id: 'aws-skill-builder',
    vendor: 'AWS',
    certName: 'AWS Skill Builder (free tier)',
    level: 'Free credential',
    description:
      'Free AWS digital courses + Cloud Quest learning games. Earn completion badges, no payment required.',
    icon: 'W',
    color: '#FF9900',
    freeStudyUrl: 'https://skillbuilder.aws/',
    providerBadge: 'AWS Skill Builder',
  },
  {
    kind: 'free',
    id: 'great-learning-free',
    vendor: 'Great Learning',
    certName: 'Free Courses with Certificates',
    level: 'Free credential',
    description:
      '100+ free courses across tech & business. Complete and pass to download a free shareable certificate.',
    icon: 'G',
    color: '#00C2A8',
    freeStudyUrl: 'https://www.mygreatlearning.com/academy/free-courses',
    providerBadge: 'Great Learning Academy',
  },
  {
    kind: 'free',
    id: 'google-cloud-skills-boost',
    vendor: 'Google',
    certName: 'Google Cloud Skills Boost (free labs)',
    level: 'Free credential',
    description:
      'Hands-on Google Cloud labs and learning paths. Complete free courses to earn badges.',
    icon: 'C',
    color: '#4285F4',
    freeStudyUrl: 'https://www.cloudskillsboost.google/',
    providerBadge: 'Google Cloud Skills Boost',
  },
]

export function prepTracks(): CertTrack[] {
  return CERT_TRACKS.filter((t) => t.kind === 'prep')
}

export function freeCredentials(): CertTrack[] {
  return CERT_TRACKS.filter((t) => t.kind === 'free')
}
