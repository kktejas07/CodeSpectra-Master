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
        title: 'My Events',
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
        title: 'Digital ID Card',
        text: 'A shareable snapshot of your identity, level, and verified signals.',
      },
      {
        title: 'AI Skill Recommendations',
        text: 'Skill suggestions generated from your actual activity and submissions.',
      },
      {
        title: 'Social Links',
        text: 'Link GitHub, LinkedIn, and portfolio sites so people can find your work.',
      },
      {
        title: 'Edit Profile',
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
    title: 'Notification Preferences',
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
    title: 'My Applications',
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
    title: 'AI-Powered Mock Tests',
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
    title: 'Configure Your Test',
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
    title: 'Course Details',
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
        title: 'Enroll / Continue',
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
    title: 'My Courses',
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
    title: 'AI Video Course Generator',
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
    title: 'Problem Solver',
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
    title: 'Practice Problems',
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
    title: 'Codeathon Details',
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
    title: 'Interview Session',
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
    title: 'Schedule Interview',
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
    title: 'Interview Setup',
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
    title: 'AI Mock Interview Setup',
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
    title: 'My Assessments',
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
    title: 'Assessment Runner',
    about: 'The timed test interface: questions, navigation, and submit.',
    features: [
      {
        title: 'Question card',
        text: 'One question at a time with options or code editor as applicable.',
      },
      {
        title: 'Prev / Next / Submit',
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
    title: 'Support Tickets',
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
    title: 'Judge Desk',
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
    title: 'My Sessions',
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
    title: 'Bookmarked Questions',
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
    title: 'Skill Analytics',
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
    title: 'Ebook Reader',
    about: 'Read any resource book cover to cover without leaving the app.',
    features: [
      {
        title: 'Reader view',
        text: 'Paginated reading with progress memory across sessions.',
      },
      {
        title: 'Back to Resources',
        text: 'Return to the library any time — your place is saved.',
      },
    ],
    tips: ['Finish one chapter per sitting to keep momentum.'],
  },
  'interview-prep': {
    title: 'Interview Prep',
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
    title: 'AI Agent Workspace',
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
    title: '100-Day Coding Sprint',
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
    title: 'Identity Verification',
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
    title: 'Challenge Solver',
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
    title: 'Coding Arena',
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
    title: 'AI Model Preferences',
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
    title: 'Recruiter Analytics',
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
    title: 'Plans & Pricing',
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
    title: 'Achievements & Badges',
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
    title: 'Recently Viewed',
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
    title: 'Code Scanner',
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
    title: 'Tech-Stack Tracks',
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
    title: 'Articles & Newsroom',
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
    title: 'Course Catalog',
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
    title: 'Operations Overview',
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
    title: 'CAD Editor',
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
    title: 'Challenge Solver',
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
    title: 'Admin Console',
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
    title: 'Feedback & Reports',
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
    title: 'Team Invitation',
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
}
