/**
 * Language Icons and Metadata
 * Maps programming languages to their icons, colors, and metadata
 * Use lucide-react icons for consistent styling
 */

export type LanguageType = 
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'java'
  | 'cpp'
  | 'csharp'
  | 'php'
  | 'ruby'
  | 'go'
  | 'rust'
  | 'kotlin'
  | 'swift'
  | 'react'
  | 'vue'
  | 'angular'
  | 'node'
  | 'sql'
  | 'html'
  | 'css'
  | 'scss'
  | 'less'
  | 'mongodb'
  | 'postgresql'
  | 'mysql'
  | 'redis'
  | 'docker'
  | 'kubernetes'
  | 'aws'
  | 'azure'
  | 'gcp'
  | 'git'
  | 'webpack'
  | 'vite'
  | 'nextjs'
  | 'gatsby'
  | 'graphql'
  | 'rest'
  | 'other'

interface LanguageConfig {
  icon: string // Lucide icon name
  label: string
  color: string // Tailwind color class
  bgColor: string // Tailwind background color
  description: string
}

export const LANGUAGE_ICONS: Record<LanguageType, LanguageConfig> = {
  javascript: {
    icon: 'Code2',
    label: 'JavaScript',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    description: 'JavaScript',
  },
  typescript: {
    icon: 'FileCode',
    label: 'TypeScript',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    description: 'TypeScript',
  },
  python: {
    icon: 'Code',
    label: 'Python',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    description: 'Python',
  },
  java: {
    icon: 'Coffee',
    label: 'Java',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    description: 'Java',
  },
  cpp: {
    icon: 'Plus',
    label: 'C++',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
    description: 'C++',
  },
  csharp: {
    icon: 'Crosshair',
    label: 'C#',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    description: 'C#',
  },
  php: {
    icon: 'Code2',
    label: 'PHP',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
    description: 'PHP',
  },
  ruby: {
    icon: 'Gem',
    label: 'Ruby',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    description: 'Ruby',
  },
  go: {
    icon: 'Zap',
    label: 'Go',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
    description: 'Go',
  },
  rust: {
    icon: 'Flame',
    label: 'Rust',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    description: 'Rust',
  },
  kotlin: {
    icon: 'Code2',
    label: 'Kotlin',
    color: 'text-violet-600',
    bgColor: 'bg-violet-100',
    description: 'Kotlin',
  },
  swift: {
    icon: 'Zap',
    label: 'Swift',
    color: 'text-orange-500',
    bgColor: 'bg-orange-100',
    description: 'Swift',
  },
  react: {
    icon: 'Zap',
    label: 'React',
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-100',
    description: 'React',
  },
  vue: {
    icon: 'Triangle',
    label: 'Vue',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    description: 'Vue',
  },
  angular: {
    icon: 'Hexagon',
    label: 'Angular',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    description: 'Angular',
  },
  node: {
    icon: 'Zap',
    label: 'Node.js',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    description: 'Node.js',
  },
  sql: {
    icon: 'Database',
    label: 'SQL',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    description: 'SQL',
  },
  html: {
    icon: 'Code',
    label: 'HTML',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    description: 'HTML',
  },
  css: {
    icon: 'Palette',
    label: 'CSS',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    description: 'CSS',
  },
  scss: {
    icon: 'Palette',
    label: 'SCSS',
    color: 'text-pink-600',
    bgColor: 'bg-pink-100',
    description: 'SCSS',
  },
  less: {
    icon: 'Palette',
    label: 'Less',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
    description: 'Less',
  },
  mongodb: {
    icon: 'Database',
    label: 'MongoDB',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    description: 'MongoDB',
  },
  postgresql: {
    icon: 'Database',
    label: 'PostgreSQL',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    description: 'PostgreSQL',
  },
  mysql: {
    icon: 'Database',
    label: 'MySQL',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    description: 'MySQL',
  },
  redis: {
    icon: 'Zap',
    label: 'Redis',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    description: 'Redis',
  },
  docker: {
    icon: 'Box',
    label: 'Docker',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
    description: 'Docker',
  },
  kubernetes: {
    icon: 'BarChart3',
    label: 'Kubernetes',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    description: 'Kubernetes',
  },
  aws: {
    icon: 'Cloud',
    label: 'AWS',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    description: 'AWS',
  },
  azure: {
    icon: 'Cloud',
    label: 'Azure',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    description: 'Azure',
  },
  gcp: {
    icon: 'Cloud',
    label: 'GCP',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    description: 'Google Cloud Platform',
  },
  git: {
    icon: 'GitBranch',
    label: 'Git',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    description: 'Git',
  },
  webpack: {
    icon: 'Package',
    label: 'Webpack',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    description: 'Webpack',
  },
  vite: {
    icon: 'Zap',
    label: 'Vite',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    description: 'Vite',
  },
  nextjs: {
    icon: 'Zap',
    label: 'Next.js',
    color: 'text-gray-900',
    bgColor: 'bg-gray-100',
    description: 'Next.js',
  },
  gatsby: {
    icon: 'Zap',
    label: 'Gatsby',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
    description: 'Gatsby',
  },
  graphql: {
    icon: 'Zap',
    label: 'GraphQL',
    color: 'text-pink-600',
    bgColor: 'bg-pink-100',
    description: 'GraphQL',
  },
  rest: {
    icon: 'Zap',
    label: 'REST',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    description: 'REST API',
  },
  other: {
    icon: 'Code',
    label: 'Other',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    description: 'Other',
  },
}

/**
 * Get language configuration by type
 */
export function getLanguageConfig(language: LanguageType | string): LanguageConfig {
  const key = language.toLowerCase().replace(/\s+/g, '').replace('#', 'sharp').replace('\+\+', 'pp') as LanguageType
  return LANGUAGE_ICONS[key] || LANGUAGE_ICONS.other
}

/**
 * Get all language types
 */
export function getAllLanguages(): LanguageType[] {
  return Object.keys(LANGUAGE_ICONS) as LanguageType[]
}

/**
 * Get language by label
 */
export function getLanguageByLabel(label: string): LanguageType | undefined {
  const entry = Object.entries(LANGUAGE_ICONS).find(
    ([, config]) => config.label.toLowerCase() === label.toLowerCase()
  )
  return entry ? (entry[0] as LanguageType) : undefined
}
