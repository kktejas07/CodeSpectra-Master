/**
 * Global Icon System
 * Centralizes all icon usage across the application
 * Uses Lucide React icons for consistency
 */

export const ICON_SYSTEM = {
  // Navigation & UI
  navigation: {
    menu: 'Menu',
    close: 'X',
    back: 'ChevronLeft',
    forward: 'ChevronRight',
    up: 'ChevronUp',
    down: 'ChevronDown',
    home: 'Home',
    settings: 'Settings',
    user: 'User',
    users: 'Users',
    logout: 'LogOut',
    login: 'LogIn',
    search: 'Search',
    filter: 'Filter',
    sort: 'ArrowUpDown',
  },

  // Actions
  actions: {
    add: 'Plus',
    create: 'Plus',
    edit: 'Edit2',
    delete: 'Trash2',
    remove: 'X',
    save: 'Save',
    cancel: 'X',
    confirm: 'Check',
    submit: 'Send',
    download: 'Download',
    upload: 'Upload',
    copy: 'Copy',
    share: 'Share2',
    refresh: 'RefreshCw',
    sync: 'Sync',
    more: 'MoreVertical',
  },

  // Status & States
  status: {
    success: 'CheckCircle',
    error: 'AlertCircle',
    warning: 'AlertTriangle',
    info: 'Info',
    loading: 'Loader',
    pending: 'Clock',
    completed: 'CheckCircle2',
    active: 'Circle',
    inactive: 'Circle',
    locked: 'Lock',
    unlocked: 'Unlock',
    private: 'Lock',
    public: 'Globe',
  },

  // Features
  features: {
    dashboard: 'LayoutGrid',
    challenges: 'Zap',
    learning: 'BookOpen',
    interviews: 'Mic',
    arena: 'Trophy',
    leaderboard: 'BarChart3',
    scanner: 'Code2',
    achievements: 'Star',
    profile: 'User',
    settings: 'Settings',
    notifications: 'Bell',
    messages: 'MessageCircle',
    code: 'Code',
    database: 'Database',
    analytics: 'LineChart',
    reports: 'FileText',
  },

  // File & Folder
  files: {
    file: 'File',
    fileCode: 'FileCode',
    fileText: 'FileText',
    image: 'Image',
    pdf: 'FileText',
    folder: 'Folder',
    folderOpen: 'FolderOpen',
    download: 'Download',
    upload: 'Upload',
  },

  // Social & External
  social: {
    github: 'Github',
    gitlab: 'GitlabIcon',
    bitbucket: 'GitBranch',
    twitter: 'Twitter',
    linkedin: 'Linkedin',
    facebook: 'Facebook',
    instagram: 'Instagram',
    discord: 'MessageCircle',
    slack: 'MessageSquare',
    mail: 'Mail',
    phone: 'Phone',
    link: 'Link',
  },

  // Development Tools
  devTools: {
    git: 'GitBranch',
    terminal: 'Terminal',
    console: 'Terminal',
    bug: 'Bug',
    wrench: 'Wrench',
    hammer: 'Hammer',
    cog: 'Cog',
    layers: 'Layers',
    package: 'Package',
    box: 'Box',
    cube: 'Box',
  },

  // Charts & Analytics
  charts: {
    lineChart: 'LineChart',
    barChart: 'BarChart3',
    pieChart: 'PieChart',
    areaChart: 'AreaChart',
    trend: 'TrendingUp',
    trendDown: 'TrendingDown',
    activity: 'Activity',
    clock: 'Clock',
  },

  // Resources & Content
  resources: {
    documentation: 'BookOpen',
    tutorial: 'Play',
    video: 'Video',
    article: 'FileText',
    resource: 'BookMarked',
    help: 'HelpCircle',
    question: 'HelpCircle',
    example: 'Code',
  },

  // System & Admin
  system: {
    admin: 'Shield',
    security: 'Lock',
    permissions: 'Key',
    roles: 'Users',
    team: 'Users',
    organization: 'Building2',
    server: 'Server',
    database: 'Database',
    api: 'Zap',
    integration: 'GitBranch',
    audit: 'Eye',
  },

  // Miscellaneous
  misc: {
    star: 'Star',
    heart: 'Heart',
    thumbsUp: 'ThumbsUp',
    thumbsDown: 'ThumbsDown',
    flag: 'Flag',
    bookmark: 'Bookmark',
    tag: 'Tag',
    tags: 'Tags',
    calendar: 'Calendar',
    clock: 'Clock',
    timer: 'Timer',
    bell: 'Bell',
    volume: 'Volume2',
    eye: 'Eye',
    eyeOff: 'EyeOff',
    check: 'Check',
    x: 'X',
    minus: 'Minus',
    plus: 'Plus',
  },
} as const

/**
 * Get icon name from category
 */
export function getIcon(category: keyof typeof ICON_SYSTEM, iconKey: string): string | undefined {
  const categoryIcons = ICON_SYSTEM[category] as Record<string, string> | undefined
  return categoryIcons ? categoryIcons[iconKey as keyof typeof categoryIcons] : undefined
}

/**
 * Get all icons from a category
 */
export function getIconsFromCategory(category: keyof typeof ICON_SYSTEM): Record<string, string> {
  return ICON_SYSTEM[category] as Record<string, string>
}

/**
 * Icon name lookup (case-insensitive)
 */
export function findIcon(searchTerm: string): { category: string; key: string; icon: string } | undefined {
  const term = searchTerm.toLowerCase()
  
  for (const [category, icons] of Object.entries(ICON_SYSTEM)) {
    for (const [key, icon] of Object.entries(icons)) {
      if (key.toLowerCase().includes(term) || icon.toLowerCase().includes(term)) {
        return { category, key, icon }
      }
    }
  }
  
  return undefined
}
