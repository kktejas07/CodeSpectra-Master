export interface FeatureLock {
  id: string
  label: string
  parentRoute: string
  description: string
}

const FEATURE_LOCKS: FeatureLock[] = [
  // Scanner sub-modes
  ...([
    ['manual', 'Manual Analysis', 'Paste and analyze code directly'],
    ['github', 'GitHub Integration', 'Connect repos and scan remotely'],
    ['trends', 'Quality Trends', 'Track code quality over time'],
    ['quality-gates', 'Quality Gates', 'Set quality thresholds'],
    ['review', 'Code Review', 'Collaborative code reviews'],
    ['config', 'Scanner Configuration', 'Customize scan rules'],
    ['reports', 'Reports', 'Export scan reports'],
    ['insights', 'Insights Dashboard', 'Aggregate analytics'],
    ['metrics', 'File Metrics', 'Per-file code metrics'],
    ['hotspots', 'Security Hotspots', 'Security-sensitive code'],
    ['ratings', 'Quality Ratings', 'Letter-grade ratings'],
    ['activity', 'Activity Timeline', 'Scan and review events'],
    ['architecture', 'Architecture View', 'Codebase structure'],
    ['pr', 'Pull Requests', 'PR quality analysis'],
    ['branches', 'Branch Analytics', 'Cross-branch metrics'],
    ['team', 'Team Leaderboard', 'Team quality ranking'],
    ['dependencies', 'Dependency Scan', 'OSV vulnerability check'],
    ['secrets', 'Secret Detection', 'Hardcoded secrets scan'],
    ['chat', 'Codebase Assistant', 'AI codebase chat'],
  ] as const).map(([mode, label, desc]) => ({
    id: `scanner:${mode}`,
    parentRoute: '/dashboard/scanner',
    label: `Scanner — ${label}`,
    description: desc,
  })),

  // Achievements tabs
  {
    id: 'achievements:badges',
    parentRoute: '/dashboard/achievements',
    label: 'Achievements — Badges Tab',
    description: 'Earned badge display',
  },

  // Interview Prep tabs
  {
    id: 'interview-prep:quiz',
    parentRoute: '/dashboard/interview-prep',
    label: 'Interview Prep — AI Quiz',
    description: 'AI-generated quiz mode',
  },

  // Problem page tabs
  {
    id: 'problems:results',
    parentRoute: '/dashboard/problems',
    label: 'Problems — Results Tab',
    description: 'Code run/submission results',
  },
  {
    id: 'problems:console',
    parentRoute: '/dashboard/problems',
    label: 'Problems — Console Tab',
    description: 'stderr/stdout output',
  },
  {
    id: 'problems:analysis',
    parentRoute: '/dashboard/problems',
    label: 'Problems — AI Analysis Tab',
    description: 'AI-powered code analysis',
  },

  // AI Inventory tabs
  {
    id: 'admin/ai-inventory:audit',
    parentRoute: '/dashboard/admin/ai-inventory',
    label: 'AI Inventory — Vulnerability Audit',
    description: 'AI vulnerability audit tab',
  },

  // Workflows tabs
  {
    id: 'admin/workflows:json',
    parentRoute: '/dashboard/admin/workflows',
    label: 'Workflows — JSON Editor',
    description: 'JSON workflow editor tab',
  },

  // Agent tabs
  {
    id: 'agent:log',
    parentRoute: '/dashboard/agent',
    label: 'Agent — Steps Log',
    description: 'Agent step-by-step log tab',
  },

  // Interview Feedback tabs
  {
    id: 'interviews/feedback:chat',
    parentRoute: '/dashboard/interviews/feedback',
    label: 'Interview Feedback — Chat Transcript',
    description: 'Chat transcript tab',
  },
  {
    id: 'interviews/feedback:analysis',
    parentRoute: '/dashboard/interviews/feedback',
    label: 'Interview Feedback — Analysis Tab',
    description: 'Interview analysis tab',
  },
]

export function getFeatureLock(id: string): FeatureLock | undefined {
  return FEATURE_LOCKS.find(f => f.id === id)
}

export function getFeatureLocksForRoute(route: string): FeatureLock[] {
  return FEATURE_LOCKS.filter(f => f.parentRoute === route)
}

export function getAllFeatureLocks(): FeatureLock[] {
  return [...FEATURE_LOCKS]
}
