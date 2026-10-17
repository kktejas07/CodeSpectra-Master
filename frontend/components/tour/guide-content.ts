'use client'

/**
 * Hand-written guide content for the dashboard Guide drawer (the `?` button).
 * One entry per tour id in TOUR_ID_FOR_PATHS. Each entry explains, Unstop-style:
 * what the page is, which features it has, and how to use them (+ tips).
 * Verified against the actual JSX of each page — no invented features.
 */

export interface GuideFeature {
  title: string
  text: string
}

export interface GuideContent {
  /** Page title shown in the drawer header. */
  title: string
  /** What is this page — one or two lines. */
  about: string
  /** Features on this page with how-to-use text. */
  features: GuideFeature[]
  /** Practical tips. */
  tips: string[]
}

export const GUIDE_CONTENT: Record<string, GuideContent> = {
  welcome: {
    title: 'Dashboard',
    about:
      'Your command center. It tracks your XP, streaks, and activity, and jumps you into practice, scans, and events.',
    features: [
      {
        title: 'Quick actions',
        text: 'One-click shortcuts into the scanner, arena, interviews, and events — start from here instead of hunting the sidebar.',
      },
      {
        title: 'Learning progress',
        text: 'Your XP, streak, heatmap, and recent activity, all updating as you solve, scan, and complete lessons.',
      },
      {
        title: 'My events',
        text: 'Hackathons and codeathons you joined, with dates and entry points when your teams are involved.',
      },
    ],
    tips: [
      'Solve the daily challenge to keep your streak alive — consistency beats intensity.',
      'Your contribution graph fills from scans, solutions, and fixes alike.',
    ],
  },
  profile: {
    title: 'Profile',
    about:
      'Your public developer identity — level, XP, bio, links, and skill signals that recruiters and teammates see.',
    features: [
      {
        title: 'About',
        text: 'Write two lines on your skills and goals so recruiters understand you in seconds.',
      },
      {
        title: 'Digital ID card',
        text: 'A shareable snapshot of your identity, level, and verified signals.',
      },
      {
        title: 'AI skill recommendations',
        text: 'Skill suggestions generated from your actual activity and submissions.',
      },
      {
        title: 'Social links',
        text: 'Link GitHub, LinkedIn, and portfolio sites so people can find your work.',
      },
      {
        title: 'Edit profile',
        text: 'Update bio, links, and experience any time from the edit page.',
      },
    ],
    tips: [
      'Use keywords from your industry so recruiters find you in searches.',
      'Quantify achievements where possible (e.g. “solved 200+ DSA problems”).',
      'Keep it updated — a stale profile undersells you.',
    ],
  },
  notifications: {
    title: 'Notifications',
    about:
      'Every platform event in one inbox — results, invites, announcements, and billing updates.',
    features: [
      {
        title: 'Inbox list',
        text: 'All notifications newest-first. Unread items are highlighted with a count in the header.',
      },
      {
        title: 'Filters',
        text: 'Narrow by category to find results, invites, or announcements fast.',
      },
      {
        title: 'Mark read',
        text: 'Open an item or mark all read to clear the unread badge in the sidebar.',
      },
    ],
    tips: [
      'Turn on the channels you actually read under notification preferences.',
      'Assessment results also arrive here — check after every attempt.',
    ],
  },
  'notification-preferences': {
    title: 'Notification preferences',
    about: 'Fine-grained control over which channels (email, push, in-app) each notification type uses.',
    features: [
      {
        title: 'Channel toggles',
        text: 'Switch each category between inbox, email, and push independently.',
      },
      {
        title: 'Inbox link',
        text: 'Jump back to the full notification history from here.',
      },
    ],
    tips: ['Keep result notifications on every channel — you do not want to miss scores.'],
  },
  jobs: {
    title: 'My applications',
    about: 'Every job you applied to, with live status from submitted to accepted or rejected.',
    features: [
      {
        title: 'Browse roles',
        text: 'Open positions matched to your profile — apply to the ones that fit.',
      },
      {
        title: 'Application list',
        text: 'Each card shows the role, company, applied date, and current stage.',
      },
      {
        title: 'Status tracking',
        text: 'Watch applications move through review; accepted and rejected states are final.',
      },
    ],
    tips: [
      'Tailor your resume per role from the Resumes page before applying.',
      'Follow up on long-pending applications via the company link.',
    ],
  },
  quizzes: {
    title: 'Quizzes',
    about: 'Company-style mock quizzes for SDE, data, and analyst roles.',
    features: [
      {
        title: 'Search and filter',
        text: 'Find quizzes by company or role, or open All Filters by category and level.',
      },
      {
        title: 'Quiz cards',
        text: 'Each card shows questions, duration, and difficulty — pick one to start.',
      },
    ],
    tips: [
      'Attempt company quizzes before real interviews with those companies.',
      'Review wrong answers right after finishing while context is fresh.',
    ],
  },
  'mock-tests': {
    title: 'AI-powered mock tests',
    about: 'Full-length AI-generated role tests for top companies, built for interview practice.',
    features: [
      {
        title: 'Test library',
        text: 'Browse ready-made company and role tests with question counts and duration.',
      },
      {
        title: 'Custom test generator',
        text: 'Generate a tailored test for any company and role for one AI credit.',
      },
    ],
    tips: [
      'Start a sample card first to preview the format before spending a credit.',
      'Simulate real conditions: timer on, no tab-switching.',
    ],
  },
  'mock-test-detail': {
    title: 'Configure your test',
    about: 'Tune a mock test before you start — difficulty, count, and format.',
    features: [
      {
        title: 'Difficulty cards',
        text: 'Pick the level that matches the role you are targeting.',
      },
      {
        title: 'Continue to test',
        text: 'Locks the configuration and launches the timed session.',
      },
    ],
    tips: ['Match difficulty to the actual job level, not your comfort zone.'],
  },
  challenges: {
    title: 'Challenges',
    about: 'Short interview-style coding challenges with XP on the line.',
    features: [
      {
        title: 'Type filters',
        text: 'Switch between challenge types; difficulty filters narrow further.',
      },
      {
        title: 'Challenge grid',
        text: 'Each card shows points and status — open one to solve it.',
      },
      {
        title: 'Progress stats',
        text: 'Solved counts and XP feed the leaderboard and your streak.',
      },
    ],
    tips: ['Clear one challenge a day to protect your streak.'],
  },
  calendar: {
    title: 'Calendar',
    about: 'Your study schedule — interviews, sessions, and events in a month view.',
    features: [
      {
        title: 'Month grid',
        text: 'Browse events by month; days with items are highlighted.',
      },
      {
        title: 'Add event',
        text: 'Create personal study sessions so they appear alongside interviews.',
      },
      {
        title: 'Upcoming list',
        text: 'The next items in chronological order with join links where relevant.',
      },
    ],
    tips: ['Schedule mock interviews here a week ahead so prep time is protected.'],
  },
  'course-detail': {
    title: 'Course details',
    about: 'Everything about one course — syllabus, instructor signals, skills taught, and enrollment.',
    features: [
      {
        title: 'About the course',
        text: 'Read outcomes, duration, and level to decide if it fits your goal.',
      },
      {
        title: 'Skills you will learn',
        text: 'The exact skill tags this course feeds into your analytics.',
      },
      {
        title: 'Enroll / continue',
        text: 'One click enrolls you; returning learners resume at the last lesson.',
      },
      {
        title: 'Curriculum',
        text: 'Full lesson list with durations — lessons unlock in order.',
      },
    ],
    tips: ['Finish lessons in order; quizzes unlock as you complete videos.'],
  },
  'my-courses': {
    title: 'My courses',
    about: 'Every course you enrolled in, with resume points so learning continues fast.',
    features: [
      {
        title: 'Course list',
        text: 'Cards show progress bars — click any card to resume where you stopped.',
      },
      {
        title: 'Watchlist and catalog shortcuts',
        text: 'Jump to saved courses or browse the full catalog for the next one.',
      },
    ],
    tips: ['Resume from the card, not search — it drops you at your last lesson.'],
  },
  wishlist: {
    title: 'Watchlist',
    about: 'Courses you saved for later, in one place.',
    features: [
      {
        title: 'Saved list',
        text: 'Every course you bookmarked, with one-click enroll when ready.',
      },
      {
        title: 'Browse courses',
        text: 'Find more to save from the full catalog.',
      },
    ],
    tips: ['Enroll the moment you have study time — saved courses do not progress.'],
  },
  'course-generate': {
    title: 'AI video course generator',
    about: 'Describe any topic and AI builds a full video course — script, voiceover, and MP4 lessons.',
    features: [
      {
        title: 'Topic wizard',
        text: 'Enter a subject, set your level, and pick a goal to shape the syllabus.',
      },
      {
        title: 'Credit meter',
        text: 'Each generation costs 10 credits — the balance is shown before you confirm.',
      },
    ],
    tips: [
      'Be specific in the topic ("REST APIs with Node") for a tighter syllabus.',
      'Generation takes minutes — watch progress and do not requeue.',
    ],
  },
  'problem-detail': {
    title: 'Problem solver',
    about: 'One coding problem, full IDE: statement, samples, editor, and judging.',
    features: [
      {
        title: 'Statement pane',
        text: 'Read constraints and samples on the left while you code on the right.',
      },
      {
        title: 'Run then submit',
        text: 'Compile against sample tests first, then submit for full judging.',
      },
      {
        title: 'AI mentor and feedback',
        text: 'Stuck? Ask the mentor. After submitting, review AI feedback on your solution.',
      },
    ],
    tips: [
      'Always run samples before submitting — a failed submit costs streak momentum.',
      'Read constraints first; they usually hint the intended complexity.',
    ],
  },
  problems: {
    title: 'Practice problems',
    about: 'The coding library for placements and interviews — filterable by topic and difficulty.',
    features: [
      {
        title: 'Search',
        text: 'Find problems by title, topic, or difficulty in one box.',
      },
      {
        title: 'Your progress',
        text: 'Solved counts across Easy, Medium, and Hard update as you submit.',
      },
      {
        title: 'Problem list',
        text: 'Open any row to solve it in the full IDE.',
      },
    ],
    tips: [
      'Balance the triangle: easy for speed, medium for interviews, hard for depth.',
      'Re-solve mediums weekly — recall beats re-reading.',
    ],
  },
  'codeathon-detail': {
    title: 'Codeathon details',
    about: 'One competition: rules, timeline, prizes, teams, and problems.',
    features: [
      {
        title: 'Register',
        text: 'Join solo or create a team before the deadline shown on the page.',
      },
      {
        title: 'Invites',
        text: 'Accept or decline team invitations from this page.',
      },
      {
        title: 'Stats overview',
        text: 'Participants, submissions, and prize pool at a glance.',
      },
    ],
    tips: ['Register early — team formation closes before the contest starts.'],
  },
  codeathons: {
    title: 'Codeathons',
    about: 'Timed coding competitions with leaderboards and prizes.',
    features: [
      {
        title: 'Filters',
        text: 'Narrow by live, upcoming, or past competitions and difficulty.',
      },
      {
        title: 'Competition grid',
        text: 'Each card shows timing, format, and prizes — open one to register.',
      },
    ],
    tips: ['Enter live contests even unprepared — rated practice beats solo drills.'],
  },
  interviews: {
    title: 'Interviews',
    about: 'All your interviews — scheduled, in progress, and past — plus AI mock practice.',
    features: [
      {
        title: 'Interview list',
        text: 'Every session with role, type, and status. Open a card for details.',
      },
      {
        title: 'Schedule',
        text: 'Book a new AI-powered mock interview in one flow.',
      },
    ],
    tips: ['Schedule mocks for the exact role you are targeting.'],
  },
  'interview-detail': {
    title: 'Interview session',
    about: 'One interview end to end: questions, answers, AI feedback, and a shared editor.',
    features: [
      {
        title: 'Interview details',
        text: 'Title, role, type, schedule, and live status controls.',
      },
      {
        title: 'Current question',
        text: 'The active question with an answer box, submit, and skip.',
      },
      {
        title: 'Answered questions',
        text: 'Your submitted answers, reviewable any time.',
      },
      {
        title: 'AI feedback',
        text: 'Per-dimension scores with suggestions after each answer.',
      },
      {
        title: 'Collaborative editor',
        text: 'Shared code editor for live coding rounds.',
      },
    ],
    tips: [
      'Answer out loud in the box as you would to an interviewer.',
      'Read AI feedback before the next question — it compounds.',
    ],
  },
  'interview-schedule': {
    title: 'Schedule interview',
    about: 'Book a mock interview with role, type, and timing of your choice.',
    features: [
      {
        title: 'Booking form',
        text: 'Enter candidate details, role, and preferred slot accurately.',
      },
      {
        title: 'Schedule button',
        text: 'Confirms the booking and adds it to your interviews list and calendar.',
      },
    ],
    tips: ['Double-check the role — questions are generated for it.'],
  },
  'interview-setup': {
    title: 'Interview setup',
    about: 'Configure a practice session: pick a role, then tune resume and settings.',
    features: [
      {
        title: 'Role selection',
        text: 'Choose the target role first — everything downstream adapts to it.',
      },
      {
        title: 'Resume and settings',
        text: 'Attach a resume and adjust stages to personalize questions.',
      },
    ],
    tips: ['Upload your real resume for questions that mirror real interviews.'],
  },
  'ai-mock-setup': {
    title: 'AI mock interview setup',
    about: 'Configure an AI interviewer matched to your goal role.',
    features: [
      {
        title: 'Options',
        text: 'Set role, difficulty, and question count to match the real thing.',
      },
      {
        title: 'Start',
        text: 'Launches the live AI interview session.',
      },
    ],
    tips: ['Match settings to your target job description for best transfer.'],
  },
  assessments: {
    title: 'My assessments',
    about: 'Proctored tests assigned to you plus your full attempt history and certificates.',
    features: [
      {
        title: 'Ready to take',
        text: 'Assigned or open assessments with direct Start buttons.',
      },
      {
        title: 'Your stats',
        text: 'Attempts, pass rate, and average score across everything.',
      },
      {
        title: 'Attempt history',
        text: 'Every attempt with scores and earned certificates.',
      },
      {
        title: 'Browse',
        text: 'Open assessments you can self-start any time.',
      },
    ],
    tips: [
      'Complete identity verification before your slot — proctored tests require it.',
      'Use Chrome with the device-audit extension for monitored assessments.',
    ],
  },
  'assessment-detail': {
    title: 'Assessment runner',
    about: 'The timed test interface: questions, navigation, and submit.',
    features: [
      {
        title: 'Question card',
        text: 'One question at a time with options or code editor as applicable.',
      },
      {
        title: 'Prev / next / submit',
        text: 'Move freely between questions; submit ends the attempt.',
      },
      {
        title: 'Auto-save',
        text: 'Draft answers persist if the tab reloads mid-test.',
      },
    ],
    tips: ['Answer every question — there is no penalty for wrong attempts.'],
  },
  resumes: {
    title: 'Resumes',
    about: 'Build, tailor, and manage role-specific resumes with AI help.',
    features: [
      {
        title: 'Templates',
        text: 'Start from proven layouts instead of a blank page.',
      },
      {
        title: 'Create card',
        text: 'Spin up a new resume for each target role.',
      },
      {
        title: 'My resumes',
        text: 'Edit, duplicate, download, or delete existing resumes.',
      },
    ],
    tips: ['Keep one resume per target role — generic resumes convert worse.'],
  },
  billing: {
    title: 'Billing',
    about: 'Your plan, invoices, and payment controls.',
    features: [
      {
        title: 'Current plan',
        text: 'What you are on, what it includes, and when it renews.',
      },
      {
        title: 'Plan actions',
        text: 'Upgrade, switch cycles, or cancel while keeping access till period end.',
      },
      {
        title: 'Invoices',
        text: 'Full receipt history with per-invoice view and download.',
      },
    ],
    tips: ['Yearly billing saves two months versus monthly on most plans.'],
  },
  support: {
    title: 'Support tickets',
    about: 'Raise help requests and track team replies until resolution.',
    features: [
      {
        title: 'New ticket',
        text: 'Open a ticket with subject, category, and a detailed message.',
      },
      {
        title: 'Ticket list',
        text: 'Every ticket with status — open one to read replies.',
      },
    ],
    tips: ['Include steps to reproduce — it halves resolution time.'],
  },
  'judge-desk': {
    title: 'Judge desk',
    about: 'Hackathons assigned to you for submission review and scoring.',
    features: [
      {
        title: 'Assigned events',
        text: 'Only events where you are a judge appear here.',
      },
      {
        title: 'Review queue',
        text: 'Open an event to score submissions awaiting your review.',
      },
    ],
    tips: ['Score against the rubric, not personal taste — it keeps results fair.'],
  },
  sessions: {
    title: 'My sessions',
    about: 'Interview and mock sessions linked to your account.',
    features: [
      {
        title: 'Session list',
        text: 'Each entry shows type, role, time, and status.',
      },
      {
        title: 'Schedule / browse',
        text: 'Book new sessions or explore prep material.',
      },
    ],
    tips: ['Join live rooms 5 minutes early to test mic and camera.'],
  },
  bookmarks: {
    title: 'Bookmarked questions',
    about: 'Problems and lesson quiz questions you saved for revision.',
    features: [
      {
        title: 'Tabs',
        text: 'Switch between saved problems and module-quiz questions.',
      },
      {
        title: 'Saved list',
        text: 'Click any item to jump back to it; remove with one tap.',
      },
    ],
    tips: ['Re-solve bookmarks weekly — spaced repetition beats re-reading.'],
  },
  referrals: {
    title: 'Referrals',
    about: 'Invite friends with your code and track who joined.',
    features: [
      {
        title: 'Your code',
        text: 'Share it anywhere — new signups attach to you automatically.',
      },
      {
        title: 'Referred users',
        text: 'See who joined and which rewards unlocked.',
      },
    ],
    tips: ['Share in study groups — classmates convert best.'],
  },
  certifications: {
    title: 'Certifications',
    about: 'Real vendor certification tracks plus free credentials you can earn today.',
    features: [
      {
        title: 'Vendor prep tracks',
        text: 'Study paths for AWS, Azure, Google Cloud, CompTIA, and Oracle Java.',
      },
      {
        title: 'Free credentials',
        text: 'Earnable badges from freeCodeCamp, Microsoft Learn, and more.',
      },
    ],
    tips: ['Vendor exams are paid — the prep here is free, the exam is not.'],
  },
  'skill-analytics': {
    title: 'Skill analytics',
    about: 'Your problem-solving fingerprint, built from every submission.',
    features: [
      {
        title: 'Headline metrics',
        text: 'Submissions, accuracy, scores, and runtime at a glance.',
      },
      {
        title: 'AI growth plan',
        text: 'Weakest skills first, with suggested problems to fix them.',
      },
      {
        title: 'Recent submissions',
        text: 'Per-problem tests, scores, and timing for your latest work.',
      },
    ],
    tips: ['Train your lowest-accuracy topic first — it moves the average fastest.'],
  },
  resources: {
    title: 'Resources',
    about: 'Ebooks and learning resources, free and curated.',
    features: [
      {
        title: 'Ebook library',
        text: 'Browse covers and topics; open any book in the reader.',
      },
      {
        title: 'More resources',
        text: 'Cheatsheets, guides, and references beyond books.',
      },
    ],
    tips: ['Pair one book with one course for depth plus structure.'],
  },
  'resource-reader': {
    title: 'Ebook reader',
    about: 'Read any resource book cover to cover without leaving the app.',
    features: [
      {
        title: 'Reader view',
        text: 'Paginated reading with progress memory across sessions.',
      },
      {
        title: 'Back to resources',
        text: 'Return to the library any time — your place is saved.',
      },
    ],
    tips: ['Finish one chapter per sitting to keep momentum.'],
  },
  'interview-prep': {
    title: 'Interview prep',
    about: 'Role-based prep tracks: questions, quizzes, and company patterns.',
    features: [
      {
        title: 'Track switcher',
        text: 'Flip between browse and quiz modes for the same material.',
      },
      {
        title: 'Question list',
        text: 'Curated questions with answers and company tags.',
      },
    ],
    tips: ['Do the quiz mode the week before interviews, browse mode earlier.'],
  },
  agent: {
    title: 'AI agent workspace',
    about: 'Describe a coding goal and the agent plans, writes, and iterates on code with you.',
    features: [
      {
        title: 'Goal composer',
        text: 'Write what you want built — stack, constraints, and success criteria.',
      },
      {
        title: 'Workspace editor',
        text: 'Review, edit, and run the code the agent produces.',
      },
    ],
    tips: ['Be specific about constraints — vague goals produce vague code.'],
  },
  '100-days': {
    title: '100-day coding sprint',
    about: 'One hundred days of structured problems from Day 1 to Day 100.',
    features: [
      {
        title: 'Progress jar',
        text: 'Completed days fill the jar — resume where you stopped.',
      },
      {
        title: 'Days list',
        text: 'Expand any unlocked day to solve its problems and grow the streak.',
      },
    ],
    tips: ['Never miss twice — one rest day is fine, two breaks the habit.'],
  },
  'identity-verify': {
    title: 'Identity verification',
    about: 'Verify who you are so proctored assessments and certificates trust your account.',
    features: [
      {
        title: 'Verification flow',
        text: 'Follow the steps: document, selfie, and liveness checks.',
      },
      {
        title: 'Status card',
        text: 'Shows verified, pending, or what is missing, with next actions.',
      },
    ],
    tips: ['Verify once, well before your first proctored slot — reviews take time.'],
  },
  'arena-detail': {
    title: 'Challenge solver',
    about: 'One arena challenge with the full solving IDE.',
    features: [
      {
        title: 'Problem header',
        text: 'Title, difficulty, and points for this challenge.',
      },
      {
        title: 'Run and submit',
        text: 'Test against samples, then submit for scoring and XP.',
      },
      {
        title: 'Editor',
        text: 'Full Monaco editor with language switcher.',
      },
    ],
    tips: ['Run samples first — a failed submit costs streak momentum.'],
  },
  arena: {
    title: 'Coding arena',
    about: 'Head-to-head style coding challenges with points and rankings.',
    features: [
      {
        title: 'Stats panel',
        text: 'Your totals: attempted, solved, and points earned.',
      },
      {
        title: 'Filters',
        text: 'Narrow by difficulty and category.',
      },
      {
        title: 'Challenge grid',
        text: 'Open any challenge to start solving for points.',
      },
    ],
    tips: ['Enter rated arenas even unprepared — rated practice beats solo drills.'],
  },
  'ai-settings': {
    title: 'AI model preferences',
    about: 'Choose which AI models power chat, agents, and assistance across the app.',
    features: [
      {
        title: 'Chat and agent cards',
        text: 'Pick a default model per capability, or leave auto for best available.',
      },
      {
        title: 'Model list',
        text: 'Every available model with provider and capability notes.',
      },
    ],
    tips: ['Bigger models reason better; smaller ones answer faster — split by task.'],
  },
  'recruiter-analytics': {
    title: 'Recruiter analytics',
    about: 'Hiring insights across every role: volume, scores, and candidate ranking.',
    features: [
      {
        title: 'KPI cards',
        text: 'Totals, averages, counts, and flagged sessions update per interview.',
      },
      {
        title: 'Ranking table',
        text: 'Compare candidates side by side, then export the shortlist to CSV.',
      },
      {
        title: 'Charts',
        text: 'Volume and score distribution over the last 20 interviews.',
      },
    ],
    tips: ['Export the shortlist right after a hiring round while context is fresh.'],
  },
  pricing: {
    title: 'Plans & pricing',
    about: 'Free to start; upgrade only when you need more power.',
    features: [
      {
        title: 'Plan comparison',
        text: 'Each tier lists limits and features side by side.',
      },
      {
        title: 'One-click upgrade',
        text: 'Checkout handles coupons and payment in one flow.',
      },
    ],
    tips: ['Yearly billing saves roughly two months versus monthly.'],
  },
  leaderboard: {
    title: 'Leaderboard',
    about: 'Where you rank against other developers — live and historical.',
    features: [
      {
        title: 'Live vs previous',
        text: 'Toggle current rankings against past seasons.',
      },
      {
        title: 'Categories',
        text: 'Filter by Global, Female, Engineering, and more.',
      },
      {
        title: 'Podium',
        text: 'The top 3 right now — updated as points land.',
      },
      {
        title: 'Your rank',
        text: 'Your global position and points total.',
      },
      {
        title: 'Full rankings',
        text: 'Searchable table of every ranked developer.',
      },
    ],
    tips: ['Consistent daily XP climbs faster than occasional marathons.'],
  },
  achievements: {
    title: 'Achievements & badges',
    about: 'Your trophy shelf: levels, XP milestones, and skill badges earned on platform.',
    features: [
      {
        title: 'Progress stats',
        text: 'Level, total XP, badges earned, and problems solved.',
      },
      {
        title: 'Contribution graph',
        text: 'Your activity footprint across weeks and months.',
      },
      {
        title: 'Skill badges',
        text: 'Badges unlocked per skill as you prove proficiency.',
      },
      {
        title: 'Achievements list',
        text: 'Every achievement with progress bars toward the next tier.',
      },
    ],
    tips: ['Chase the next tier, not every badge — depth beats collection.'],
  },
  recent: {
    title: 'Recently viewed',
    about: 'Everything you opened — courses, lessons, problems — ready to resume.',
    features: [
      {
        title: 'Quick stats',
        text: 'Totals for today, this week, and your most-viewed content type.',
      },
      {
        title: 'Search and filters',
        text: 'Find any past item by title or content type in seconds.',
      },
      {
        title: 'Resume list',
        text: 'Grouped by recency; Continue jumps straight back in.',
      },
    ],
    tips: ['Resume from here instead of searching — it drops you at your last position.'],
  },
  scanner: {
    title: 'Code scanner',
    about: 'Paste code, get instant AI review: bugs, security issues, and fixes.',
    features: [
      {
        title: 'Code input',
        text: 'Paste or type code, pick the language, and run the scan.',
      },
      {
        title: 'Results panel',
        text: 'Findings with severity, explanations, and one-click suggested fixes.',
      },
      {
        title: 'Scan history',
        text: 'Reload or delete any previous scan.',
      },
    ],
    tips: ['Scan before every commit — it catches what tired eyes miss.'],
  },
  settings: {
    title: 'Settings',
    about: 'Your account preferences: appearance, notifications, security, and danger zone.',
    features: [
      {
        title: 'Appearance',
        text: 'Theme (light, dark, system) and language — saved on this device.',
      },
      {
        title: 'Notifications',
        text: 'Email and push toggles, plus a link to per-channel preferences.',
      },
      {
        title: 'Security',
        text: 'Two-factor status, face biometrics, and password change.',
      },
      {
        title: 'Danger zone',
        text: 'Export your data or delete your account (both confirmed).',
      },
    ],
    tips: ['Enable 2FA now if you take proctored assessments — it is required there.'],
  },
  tracks: {
    title: 'Tech-stack tracks',
    about: 'Curated problem paths per stack — pick one and grind in order.',
    features: [
      {
        title: 'Track grid',
        text: 'Each card shows topics, problem counts, and difficulty curve.',
      },
      {
        title: 'Track help',
        text: 'The helper explains how tracks feed interviews and streaks.',
      },
    ],
    tips: ['Finish one track before starting another — half-tracks compound nothing.'],
  },
  articles: {
    title: 'Articles & newsroom',
    about: 'Expert insights, product updates, and career signals from CodeSpectra.',
    features: [
      {
        title: 'Article grid',
        text: 'Latest pieces with read time — open any card to read.',
      },
      {
        title: 'Public newsroom',
        text: 'The same content, shareable outside the platform.',
      },
    ],
    tips: ['Reading one breakdown weekly beats skimming ten headlines.'],
  },
  events: {
    title: 'Events',
    about: 'Hackathons, codeathons, and community events — live, upcoming, and past.',
    features: [
      {
        title: 'Event tabs',
        text: 'Switch between live now, upcoming, and closed events.',
      },
      {
        title: 'Event cards',
        text: 'Dates, format, prizes, and one-click registration.',
      },
    ],
    tips: ['Register for the next live event even if unsure — deadlines pass fast.'],
  },
  hackathons: {
    title: 'Hackathons',
    about: 'Team hackathons with judging, prizes, and certificates.',
    features: [
      {
        title: 'Event grid',
        text: 'Live, upcoming, and closed hackathons with team sizes.',
      },
      {
        title: 'Register',
        text: 'Join solo or form a team before the deadline.',
      },
    ],
    tips: ['Form teams early — the best teammates commit weeks ahead.'],
  },
  courses: {
    title: 'Course catalog',
    about: 'The full learning library — video courses across stacks and levels.',
    features: [
      {
        title: 'Search',
        text: 'Find courses by title, topic, or technology.',
      },
      {
        title: 'Categories',
        text: 'Filter by language, skill level, or subject area.',
      },
      {
        title: 'Course cards',
        text: 'Ratings, durations, and levels — open any card for the syllabus.',
      },
    ],
    tips: ['Finish enrolled courses before collecting new ones.'],
  },
  'admin-system': {
    title: 'Operations overview',
    about: 'Live platform health for superadmins: servers, metrics, and audit access.',
    features: [
      {
        title: 'Server health',
        text: 'CPU, RAM, disk, containers, and Redis status in real time.',
      },
      {
        title: 'Quick links',
        text: 'Jump to Users, Insights, Settings, and Audit Logs.',
      },
      {
        title: 'Web vitals',
        text: 'Core Web Vitals and frontend performance trends.',
      },
      {
        title: 'Analytics',
        text: 'Platform-wide charts plus the security audit trail.',
      },
    ],
    tips: ['Check Redis latency first when the app feels slow — it is usually the queue.'],
  },
  cad: {
    title: 'CAD editor',
    about: 'A full-screen 2D drawing workspace for diagrams and CAD-style sketches.',
    features: [
      {
        title: 'Canvas workspace',
        text: 'The editor fills the viewport — pan, zoom, and draw with the toolbar tools.',
      },
      {
        title: 'Editor toolbar',
        text: 'Shape and drawing tools live in the editor chrome around the canvas.',
      },
    ],
    tips: ['Give the editor a moment to load — it initializes client-side.'],
  },
  'challenge-detail': {
    title: 'Challenge solver',
    about:
      'One challenge in a full-screen editor: statement, samples, constraints, and starter code.',
    features: [
      {
        title: 'Statement pane',
        text: 'Rendered problem text with samples, input/output formats, and constraints.',
      },
      {
        title: 'Code editor',
        text: 'Starter code is preloaded — edit and run against the sample cases.',
      },
    ],
    tips: ['Read the constraints before coding — they hint the intended approach.'],
  },
  admin: {
    title: 'Admin console',
    about:
      'Superadmin operations for this section: review rows, update status, and act in bulk.',
    features: [
      {
        title: 'Search and table',
        text: 'Filter rows instantly with search; sortable columns order by date or status.',
      },
      {
        title: 'Bulk select',
        text: 'Tick checkboxes to select many rows, then apply one action to all of them.',
      },
      {
        title: 'Row actions',
        text: 'Click a row or its action buttons to inspect details and change state.',
      },
    ],
    tips: ['Bulk actions beat row-by-row work once the list grows past a screen.'],
  },
  feedback: {
    title: 'Feedback & reports',
    about:
      'Every user report and complaint in one queue — read, reply, resolve, or delete.',
    features: [
      {
        title: 'Report table',
        text: 'Type, content, reporter, source, status, and date per row; search covers all of them.',
      },
      {
        title: 'Reporter column',
        text: 'Who wrote it — name, email, or Anonymous for guests and old entries.',
      },
      {
        title: 'View and reply',
        text: 'Expand a row for the full text plus reporter and source context, then send an admin response.',
      },
      {
        title: 'Status toggle',
        text: 'Click the status badge to flip between open and resolved.',
      },
      {
        title: 'Bulk actions',
        text: 'Select rows to mark many resolved or delete them at once.',
      },
    ],
    tips: ['Reply before resolving — the reporter gets notified of your response.'],
  },
  'team-invite': {
    title: 'Team invitation',
    about: 'You were invited to join an organization team — review and accept in one tap.',
    features: [
      {
        title: 'Invite details',
        text: 'Shows which organization and team invited you and who sent it.',
      },
      {
        title: 'Accept invitation',
        text: 'One tap joins the team and takes you to the dashboard.',
      },
    ],
    tips: ['Only accept invites you recognize — team membership grants data access.'],
  },
  'admin-ai-inventory': {
    title: 'AI inventory & control plane',
    about: 'Every AI dependency in one place, with vulnerability and audit findings.',
    features: [
      {
        title: 'Inventory list',
        text: 'Each AI integration, model, and key surface with ownership and status.',
      },
      {
        title: 'Vulnerability audit',
        text: 'Dependency and configuration findings ranked by severity.',
      },
    ],
    tips: ['Clear critical findings first — they gate security sign-off.'],
  },
  'admin-analytics': {
    title: 'Analytics',
    about: 'Platform traffic and usage: hourly activity, top pages, and traffic sources.',
    features: [
      {
        title: 'Hourly activity',
        text: 'Requests over the last 24 hours — spikes point at cron jobs or campaigns.',
      },
      {
        title: 'Top pages',
        text: 'Most-visited routes, so you know where users actually spend time.',
      },
      {
        title: 'Traffic sources',
        text: 'Where visits come from, plus flag management with delete actions.',
      },
    ],
    tips: ['Compare hourly spikes against the cron schedule before suspecting abuse.'],
  },
  'admin-announcements': {
    title: 'Announcements',
    about: 'Compose platform-wide announcements with channels and scheduling.',
    features: [
      {
        title: 'New announcement',
        text: 'Write the title and body of the broadcast.',
      },
      {
        title: 'Delivery channels',
        text: 'Choose where it appears: inbox, email, banner, or several at once.',
      },
      {
        title: 'Schedule',
        text: 'Publish now or set a future date and time.',
      },
    ],
    tips: ['Schedule maintenance notices at least a day ahead of the window.'],
  },
  'admin-assessments': {
    title: 'Assessment management',
    about: 'Create, publish, invite, and grade proctored assessments.',
    features: [
      {
        title: 'Assessment list',
        text: 'Every exam with status; open one for results or editing.',
      },
      {
        title: 'Create and invite',
        text: 'Build new assessments, then bulk-invite candidates by email.',
      },
      {
        title: 'Clear filters',
        text: 'Reset the list view when filters hide what you need.',
      },
    ],
    tips: ['Publish only after previewing every question — edits mid-window confuse candidates.'],
  },
  'admin-assessments-edit': {
    title: 'Edit assessment',
    about: 'Edit one assessment: metadata, questions, and bank imports.',
    features: [
      {
        title: 'Exam metadata',
        text: 'Title, description, timing, and proctoring toggles.',
      },
      {
        title: 'Question list',
        text: 'Reorder, edit, or remove questions; counts update live.',
      },
      {
        title: 'Bank import',
        text: 'Pull questions from the bank with paging, preview, and cancel.',
      },
    ],
    tips: ['Import from the bank instead of retyping — it preserves answer keys.'],
  },
  'admin-assessment-results': {
    title: 'Assessment results',
    about: 'Scores, proctor report, and per-candidate breakdown for one assessment.',
    features: [
      {
        title: 'Proctor report',
        text: 'Event-type summary: tab switches, faces, and flags per candidate.',
      },
      {
        title: 'Results table',
        text: 'Every attempt with score; filter all, flagged, or passed.',
      },
      {
        title: 'Candidate detail',
        text: 'Per-candidate answers with email fallback when names are missing.',
      },
    ],
    tips: ['Review flagged sessions before releasing scores to candidates.'],
  },
  'admin-assessments-bulk': {
    title: 'Bulk schedule assessments',
    about: 'Invite hundreds of candidates at once from a CSV upload.',
    features: [
      {
        title: 'Select assessment',
        text: 'Pick which published exam the batch will take.',
      },
      {
        title: 'Upload CSV',
        text: 'Candidate emails and names in the documented columns.',
      },
      {
        title: 'Preview candidates',
        text: 'Verify parsed rows before sending a single invite.',
      },
    ],
    tips: ['Preview catches malformed rows before invites go out — never skip it.'],
  },
  'admin-assessments-pipeline': {
    title: 'Candidate pipeline',
    about: 'Every candidate across assessments on a stage board: invited to hired.',
    features: [
      {
        title: 'Pipeline columns',
        text: 'Drag-free stage view from invite through screening to decision.',
      },
      {
        title: 'Candidate cards',
        text: 'Scores and status per candidate; open for full history.',
      },
    ],
    tips: ['Stale cards in early stages usually mean invites never arrived — check email logs.'],
  },
  'admin-billing': {
    title: 'Billing analytics',
    about: 'Revenue, orders, and subscription health for the last 30 days.',
    features: [
      {
        title: 'Revenue chart',
        text: 'Paid volume over the last 30 days with plan splits.',
      },
      {
        title: 'Orders by plan',
        text: 'Which tiers actually sell, per plan and cycle.',
      },
      {
        title: 'Subscription status',
        text: 'Active, trialing, past-due, and churned counts.',
      },
    ],
    tips: ['A rising past-due count means dunning emails need attention, not pricing.'],
  },
  'admin-blog': {
    title: 'Newsroom',
    about: 'Write and publish platform blog posts and announcements.',
    features: [
      {
        title: 'Post list',
        text: 'Drafts and published pieces with edit actions.',
      },
      {
        title: 'Editor',
        text: 'Compose with formatting, covers, and scheduled publishing.',
      },
    ],
    tips: ['Publish release notes alongside every deploy train.'],
  },
  'admin-cdn': {
    title: 'CDN & edge operations',
    about: 'Cache, edge performance, and delivery health for static assets.',
    features: [
      {
        title: 'Cache status',
        text: 'Hit ratios and purge controls when content goes stale.',
      },
      {
        title: 'Edge metrics',
        text: 'Latency and throughput per region over time.',
      },
    ],
    tips: ['Purge the cache after every frontend deploy, not before.'],
  },
  'admin-certificates': {
    title: 'Certificates',
    about: 'Issue, verify, and revoke completion certificates.',
    features: [
      {
        title: 'Certificate list',
        text: 'Every issued credential with recipient and status.',
      },
      {
        title: 'Issue and revoke',
        text: 'Mint new certificates or invalidate compromised ones.',
      },
    ],
    tips: ['Revoke rather than delete — the audit trail stays intact.'],
  },
  'admin-codeathons': {
    title: 'Codeathon & hackathon management',
    about: 'Create and operate coding competitions end to end.',
    features: [
      {
        title: 'Event list',
        text: 'All competitions with live, upcoming, and closed states.',
      },
      {
        title: 'Create flow',
        text: 'Multi-step wizard: details, problems, rules, then publish.',
      },
    ],
    tips: ['Lock problems before opening registration to avoid mid-event edits.'],
  },
  'admin-content-studio': {
    title: 'Content studio',
    about: 'Newsroom articles and automated Signals drafts in one pipeline.',
    features: [
      {
        title: 'Newsroom tab',
        text: 'Hand-written posts with edit actions.',
      },
      {
        title: 'Signals tab',
        text: 'Machine-drafted items awaiting human review and publish.',
      },
    ],
    tips: ['Never auto-publish Signals — a human pass catches tone and factual slips.'],
  },
  'admin-coupons': {
    title: 'Coupons',
    about: 'Discount codes for plans: create, limit, and track redemption.',
    features: [
      {
        title: 'Coupon list',
        text: 'Active and expired codes with usage counts.',
      },
      {
        title: 'Create coupon',
        text: 'Set percentage, plan scope, expiry, and redemption caps.',
      },
    ],
    tips: ['Cap redemptions on public codes — uncapped codes leak to deal sites.'],
  },
  'admin-courses': {
    title: 'Course management',
    about: 'Publish, edit, and retire learning courses and their lessons.',
    features: [
      {
        title: 'Course list',
        text: 'Every course with enrollment counts and publish state.',
      },
      {
        title: 'Editor',
        text: 'Open any course to manage modules, lessons, and media jobs.',
      },
    ],
    tips: ['Unpublish instead of deleting — enrolled learners keep access to history.'],
  },
  'admin-course-detail': {
    title: 'Edit course',
    about: 'Modules, lessons, and media generation for one course.',
    features: [
      {
        title: 'Modules and lessons',
        text: 'Reorder, edit, and add lessons within each module.',
      },
      {
        title: 'Media jobs',
        text: 'Trigger and monitor video/voiceover generation per lesson.',
      },
    ],
    tips: ['Regenerate single lessons instead of the whole course when fixing narration.'],
  },
  'admin-cron-jobs': {
    title: 'Cron jobs',
    about: 'Built-in loops, HTTP cron endpoints, and scheduled workflows.',
    features: [
      {
        title: 'Built-in loops',
        text: 'Always-on schedulers with last-run status and errors.',
      },
      {
        title: 'HTTP endpoints',
        text: 'External cron targets with URLs and secrets.',
      },
      {
        title: 'Scheduled workflows',
        text: 'Configured jobs with run counts and manual triggers.',
      },
    ],
    tips: ['Trigger manually once after any schedule change to catch config errors early.'],
  },
  'admin-hackathons': {
    title: 'Hackathon events',
    about: 'Create events, manage teams, assign judges, and publish results.',
    features: [
      {
        title: 'Event list',
        text: 'All hackathons with state; inline edit or open the detail page.',
      },
      {
        title: 'Creation wizard',
        text: 'Steps for details, problems, and rules before publishing.',
      },
    ],
    tips: ['Assign judges before teams submit — late assignments delay scoring.'],
  },
  'admin-hackathon-detail': {
    title: 'Hackathon detail',
    about: 'One event: teams, members, judges, and judging controls.',
    features: [
      {
        title: 'Teams',
        text: 'Roster per team with rename, member add, and save actions.',
      },
      {
        title: 'Judges',
        text: 'Assign and save judges who will score submissions.',
      },
      {
        title: 'Judging controls',
        text: 'Open, pause, and close scoring rounds for the event.',
      },
    ],
    tips: ['Freeze teams before judging starts to keep scores comparable.'],
  },
  'admin-hackathon-report': {
    title: 'Judge report',
    about: 'Final scoring breakdown: team totals and the proctor event log.',
    features: [
      {
        title: 'Team breakdown',
        text: 'Per-team scores across judges and criteria.',
      },
      {
        title: 'Proctor event log',
        text: 'Flagged session events attached to submissions.',
      },
    ],
    tips: ['Cross-check outliers against the proctor log before publishing winners.'],
  },
  'admin-hackathon-create': {
    title: 'New hackathon event',
    about: 'Step-by-step event builder: details, problems, rules.',
    features: [
      {
        title: 'Details step',
        text: 'Name, dates, format, and prize information.',
      },
      {
        title: 'Problems step',
        text: 'Attach the problem set teams will solve.',
      },
      {
        title: 'Rules step',
        text: 'Eligibility, team sizes, and judging criteria.',
      },
    ],
    tips: ['Complete all three steps — drafts do not accept registrations.'],
  },
  'admin-hackathon-edit': {
    title: 'Edit hackathon event',
    about: 'Modify a live or draft event across details, problems, and rules.',
    features: [
      {
        title: 'Details step',
        text: 'Dates, format, and prize edits with validation.',
      },
      {
        title: 'Problems step',
        text: 'Swap or reorder the attached problem set.',
      },
      {
        title: 'Rules step',
        text: 'Eligibility and judging criteria updates.',
      },
    ],
    tips: ['Announce rule changes to registered teams — silent edits erode trust.'],
  },
  'admin-help': {
    title: 'Admin help',
    about: 'Operator documentation for admin workflows, section by section.',
    features: [
      {
        title: 'Section browser',
        text: 'Pick a topic to read the exact steps for common admin tasks.',
      },
    ],
    tips: ['Check here before pinging engineering — most flows are documented.'],
  },
  'admin-hiring-report': {
    title: 'Hiring manager report',
    about: 'Candidate outcomes formatted for hiring managers and clients.',
    features: [
      {
        title: 'Report view',
        text: 'Scores, recommendations, and interview highlights per candidate.',
      },
      {
        title: 'Refresh',
        text: 'Recompute from the latest interview and assessment data.',
      },
    ],
    tips: ['Refresh right before sharing — stale reports mislead hiring calls.'],
  },
  'admin-integrations': {
    title: 'Integrations',
    about: 'Third-party connections: OAuth apps, webhooks, and API clients.',
    features: [
      {
        title: 'Integration list',
        text: 'Each connection with status and configuration entry points.',
      },
      {
        title: 'Connect flow',
        text: 'Authorize new integrations and store their credentials.',
      },
    ],
    tips: ['Rotate integration secrets on staff changes, not just on incidents.'],
  },
  'admin-jobs': {
    title: 'Job postings',
    about: 'Publish and edit the roles candidates apply to.',
    features: [
      {
        title: 'Posting list',
        text: 'Open and closed roles with applicant counts.',
      },
      {
        title: 'Post / edit form',
        text: 'Title, description, requirements, and visibility controls.',
      },
    ],
    tips: ['Close filled roles the day offers are signed — stale posts attract noise.'],
  },
  'admin-kyc': {
    title: 'KYC verification',
    about: 'Review identity verification submissions and clear or reject them.',
    features: [
      {
        title: 'Review queue',
        text: 'Pending records with documents and liveness evidence.',
      },
      {
        title: 'Record actions',
        text: 'Approve, reject, or close a record from its detail view.',
      },
    ],
    tips: ['Reject with a reason — applicants cannot fix what they cannot see.'],
  },
  'admin-newsletter': {
    title: 'Newsletter composer',
    about: 'Draft and send platform newsletters with templates and previews.',
    features: [
      {
        title: 'Template blocks',
        text: 'Headlines, highlights, and feature slots with placeholders.',
      },
      {
        title: 'Preview',
        text: 'See exactly what subscribers receive before sending.',
      },
    ],
    tips: ['Send a test to yourself first — placeholders render differently live.'],
  },
  'admin-organizations': {
    title: 'Organizations',
    about: 'Tenant companies: members, roles, and lifecycle.',
    features: [
      {
        title: 'Organization list',
        text: 'Every tenant with member counts and status.',
      },
      {
        title: 'Members dialog',
        text: 'View, add, and remove members per organization.',
      },
      {
        title: 'Create and edit',
        text: 'Provision new tenants or update their details.',
      },
    ],
    tips: ['Remove departed admins the day access should end.'],
  },
  'admin-permissions': {
    title: 'Role & permission manager',
    about: 'Which roles can see and do what across every dashboard page.',
    features: [
      {
        title: 'Role matrix',
        text: 'Pages down the side, roles across the top — toggle to grant or revoke.',
      },
      {
        title: 'Status and stats',
        text: 'Save state plus coverage counts per role.',
      },
    ],
    tips: ['Deny-by-default for new pages, then open up deliberately.'],
  },
  'admin-plans': {
    title: 'Plans & pricing management',
    about: 'Subscription tiers, feature lists, and current plan state.',
    features: [
      {
        title: 'Plan cards',
        text: 'Each tier with limits and feature bullets.',
      },
      {
        title: 'Current plan',
        text: 'What is live now, with change controls.',
      },
    ],
    tips: ['Mirror plan changes in the public pricing page the same day.'],
  },
  'admin-predictive': {
    title: 'Predictive validity & adverse impact',
    about: 'Statistical checks that assessments predict performance fairly.',
    features: [
      {
        title: 'Validity metrics',
        text: 'Correlations between scores and outcomes per assessment.',
      },
      {
        title: 'Impact analysis',
        text: 'Adverse-impact ratios across demographic slices.',
      },
      {
        title: 'Refresh',
        text: 'Recompute after new hiring data lands.',
      },
    ],
    tips: ['Re-run after every hiring round — drift hides in stale numbers.'],
  },
  'admin-proctor': {
    title: 'Proctor dashboard',
    about: 'Live and historical proctoring events across assessments.',
    features: [
      {
        title: 'Event stream',
        text: 'Flagged moments — tab switches, faces, devices — as they happen.',
      },
      {
        title: 'Session lookup',
        text: 'Drill into any candidate session for the full timeline.',
      },
    ],
    tips: ['One flag is noise; patterns across a session are signal.'],
  },
  'admin-question-bank': {
    title: 'Engineering question bank',
    about: 'The shared pool of vetted questions feeding assessments and interviews.',
    features: [
      {
        title: 'Question list',
        text: 'Filter by topic, difficulty, and type; preview any item.',
      },
      {
        title: 'View and edit',
        text: 'Inspect full content or fix wording, options, and answers.',
      },
      {
        title: 'AI generation',
        text: 'Draft new items to spec, then review before approving.',
      },
    ],
    tips: ['Approve AI drafts only after checking the answer key by hand.'],
  },
  'admin-question-generator': {
    title: 'AI question generator',
    about: 'Generate assessment questions from a topic and spec.',
    features: [
      {
        title: 'Spec form',
        text: 'Topic, difficulty, type, and count controls.',
      },
      {
        title: 'Generated output',
        text: 'Review drafts before pushing them into the bank.',
      },
    ],
    tips: ['Generate in small batches — review quality drops in bulk.'],
  },
  'admin-rag': {
    title: 'RAG & embeddings',
    about: 'The retrieval layer behind AI answers: index health and live search tests.',
    features: [
      {
        title: 'Index overview',
        text: 'Document counts, chunk stats, and embedding status.',
      },
      {
        title: 'Test search',
        text: 'Run a query to see exactly what the retriever returns.',
      },
    ],
    tips: ['Test-search after every reindex — empty results mean a broken pipeline.'],
  },
  'admin-resources': {
    title: 'Resources / ebooks',
    about: 'Publish learning ebooks and resource packs for the library.',
    features: [
      {
        title: 'Resource list',
        text: 'Ebooks with covers, topics, and publish state.',
      },
      {
        title: 'Generate ebook',
        text: 'AI-draft a full ebook, then edit before publishing.',
      },
    ],
    tips: ['Read generated ebooks end to end before publishing — AI filler is obvious.'],
  },
  'admin-resumes': {
    title: 'Resume analysis',
    about: 'AI review of candidate resumes: parsing, scoring, and red flags.',
    features: [
      {
        title: 'Resume queue',
        text: 'Submissions with parsed skills and match scores.',
      },
      {
        title: 'Analysis view',
        text: 'Strengths, gaps, and role-fit breakdown per resume.',
      },
    ],
    tips: ['Use scores to shortlist, never to auto-reject — humans decide.'],
  },
  'admin-roles': {
    title: 'Roles',
    about: 'Platform roles and who holds them.',
    features: [
      {
        title: 'Role list',
        text: 'Every role with member counts.',
      },
      {
        title: 'User table',
        text: 'Search members, change roles, and deactivate accounts.',
      },
    ],
    tips: ['Grant superadmin to as few people as possible — it bypasses everything.'],
  },
  'admin-security': {
    title: 'Security & audit',
    about: 'Sessions, audit trail, and security posture in one place.',
    features: [
      {
        title: 'Stat cards',
        text: 'Active sessions, recent failures, and anomaly counts.',
      },
      {
        title: 'Settings card',
        text: 'Session, password, and enforcement policies.',
      },
      {
        title: 'Sessions table',
        text: 'Who is logged in where, with revoke actions.',
      },
    ],
    tips: ['Revoke unknown sessions first, ask questions later.'],
  },
  'admin-email-monitoring': {
    title: 'Email monitoring',
    about: 'Outbound mail health: delivery, bounces, and skips.',
    features: [
      {
        title: 'Delivery stats',
        text: 'Sent, delivered, bounced, and skipped volumes.',
      },
      {
        title: 'Clear and paging',
        text: 'Reset the view or page through the event log.',
      },
    ],
    tips: ['A bounce spike usually means a stale mailing list, not a broken sender.'],
  },
  'admin-settings': {
    title: 'Platform settings',
    about: 'Every platform knob: branding, mail, billing, AI keys, KYC, and more.',
    features: [
      {
        title: 'Section sidebar',
        text: 'Branding, media, Cloudflare, mail, ops, product, certificates, integrations, payments, templates, LLM, gamification, KYC, Redis, WhatsApp.',
      },
      {
        title: 'Save per section',
        text: 'Each section saves independently with validation.',
      },
    ],
    tips: ['Change one section at a time so rollbacks stay obvious.'],
  },
  'admin-signals': {
    title: 'Signals',
    about: 'Automated content drafts from monitored sources, awaiting review.',
    features: [
      {
        title: 'Draft queue',
        text: 'Machine-written items with source links attached.',
      },
      {
        title: 'Review actions',
        text: 'Approve to publish, edit first, or discard.',
      },
    ],
    tips: ['Check the source link before approving — drafts inherit source errors.'],
  },
  'admin-sme-review': {
    title: 'SME review & grading',
    about: 'Subject-matter-expert grading queue for open-ended answers.',
    features: [
      {
        title: 'Review queue',
        text: 'Answers awaiting human grades with rubrics attached.',
      },
      {
        title: 'Refresh',
        text: 'Pull the latest ungraded submissions.',
      },
    ],
    tips: ['Grade against the rubric text, not gut feel — candidates appeal on rubrics.'],
  },
  'admin-speed-insights': {
    title: 'Speed insights',
    about: 'Real-user frontend performance: loads, paints, and slow routes.',
    features: [
      {
        title: 'Performance cards',
        text: 'Core Web Vitals from actual sessions, not lab tests.',
      },
    ],
    tips: ['Fix the slowest route first — averages hide the worst experience.'],
  },
  'admin-sso': {
    title: 'SSO / enterprise auth',
    about: 'Single sign-on providers for organization logins.',
    features: [
      {
        title: 'Provider cards',
        text: 'Configured identity providers with status.',
      },
      {
        title: 'New provider form',
        text: 'Register OIDC/SAML with client IDs and secrets.',
      },
    ],
    tips: ['Test login in an incognito window before announcing SSO to the org.'],
  },
  'admin-team': {
    title: 'Team',
    about: 'Your organization team: members, roles, and invites.',
    features: [
      {
        title: 'Member list',
        text: 'Everyone on the team with roles and status.',
      },
      {
        title: 'Add members',
        text: 'Invite by email with the right role from the start.',
      },
    ],
    tips: ['Assign the least privilege that still lets people do their jobs.'],
  },
  'admin-team-activity': {
    title: 'Team activity',
    about: 'What your team actually did: top contributors and recent events.',
    features: [
      {
        title: 'Top contributors',
        text: 'Ranked members by recent output.',
      },
      {
        title: 'Recent activity',
        text: 'Chronological feed of team events.',
      },
    ],
    tips: ['Praise in public from this feed — recognition compounds.'],
  },
  'admin-teams': {
    title: 'Tenant teams',
    about: 'All teams across tenants with stats and management.',
    features: [
      {
        title: 'Team cards',
        text: 'Per-team members, activity, and health at a glance.',
      },
      {
        title: 'Stat header',
        text: 'Totals across the tenant fleet.',
      },
    ],
    tips: ['Empty teams older than a quarter are usually abandoned — archive them.'],
  },
  'admin-users': {
    title: 'Users management',
    about: 'Every account: search, inspect, change roles, and deactivate.',
    features: [
      {
        title: 'User table',
        text: 'Searchable rows with role, plan, and status columns.',
      },
      {
        title: 'Row actions',
        text: 'Edit roles, reset access, or deactivate accounts.',
      },
    ],
    tips: ['Deactivate instead of deleting — history matters for audits.'],
  },
  'admin-workflows': {
    title: 'Workflow automation',
    about: 'Zapier-style automations: triggers, steps, and run history.',
    features: [
      {
        title: 'Workflow list',
        text: 'Sidebar of automations with enable toggles.',
      },
      {
        title: 'Editor',
        text: 'Build trigger → action chains for the selected workflow.',
      },
    ],
    tips: ['Test with a dry run before enabling — live workflows are hard to unwind.'],
  },
}
