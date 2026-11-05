/**
 * Reusable mock fixtures for frontend tests (see docs/testing/02-coverage-audit.md §4).
 * Import from here instead of inlining literals so a schema change is a one-line fix.
 */

// ---------- 4.1 Admin System / Operations ----------
export const serverHealth = {
  cpu: 42.5,
  memory: 68.2,
  disk: 55.0,
  uptime: 1209600,
  docker: { running: 7, stopped: 1 },
}

export const redisStatus = {
  connected: true,
  hitRate: 0.91,
  keys: 14230,
  memory: '128MB',
  rateLimitCounters: { 'signin:ip': 12, 'signin:email': 3, 'ai-requests': 47 },
}

export const webVitals = {
  LCP: { p75: 2100, rating: 'good' },
  INP: { p75: 180, rating: 'good' },
  CLS: { p75: 0.05, rating: 'good' },
  TTFB: { p75: 410, rating: 'needs-improvement' },
}

// ---------- 4.2 Users / Roles ----------
export const users = [
  { _id: 'u_001', name: 'Priya Sharma', email: 'priya@axiss.com', role: 'superadmin', status: 'active' },
  { _id: 'u_002', name: 'Arjun Mehta', email: 'arjun@test.com', role: 'candidate', status: 'active' },
  { _id: 'u_003', name: 'Sunita Rao', email: 'sunita@acme.com', role: 'recruiter', status: 'suspended' },
]

export const roles = [
  { id: 'superadmin', permissions: ['*'] },
  { id: 'recruiter', permissions: ['ats:read', 'ats:write', 'hiring:read'] },
  { id: 'candidate', permissions: ['exam:take', 'profile:write'] },
]

// ---------- 4.3 Assessments / Exam ----------
export const assessment = {
  _id: 'asmnt_001',
  title: 'Senior SWE — DSA Round',
  durationMinutes: 90,
  sections: [
    { id: 'sec_mcq', type: 'mcq', questions: 20, marks: 20 },
    { id: 'sec_code', type: 'coding', questions: 2, marks: 30 },
  ],
  settings: { proctoring: true, cameraRequired: true, browserLockdown: false },
}

export const submission = {
  userId: 'u_002',
  assessmentId: 'asmnt_001',
  score: 42,
  maxScore: 50,
  answers: [
    { questionId: 'q_001', selected: 'B', correct: true },
    { questionId: 'q_002', code: 'def twoSum(nums, target): ...', language: 'python' },
  ],
}

// ---------- 4.4 Events / Hackathons / Contests ----------
export const hackathon = {
  _id: 'hack_001',
  title: 'HackWave 2026',
  theme: 'AI for Social Good',
  startDate: '2026-11-01T09:00:00Z',
  endDate: '2026-11-02T18:00:00Z',
  maxTeamSize: 4,
  registrations: 312,
  submissions: 89,
}

export const ctfContest = {
  _id: 'ctf_001',
  title: 'CyberQuest CTF',
  flags: [
    { challengeId: 'ch_001', flag: 'CS{xor_is_fun_0x42}', points: 100 },
    { challengeId: 'ch_002', flag: 'CS{sql_1nject10n}', points: 200 },
  ],
}

// ---------- 4.5 ATS / Hiring Pipeline ----------
export const job = {
  _id: 'job_001',
  title: 'Full Stack Engineer',
  department: 'Engineering',
  location: 'Hyderabad / Remote',
  pipeline: ['applied', 'screen', 'technical', 'hr', 'offer', 'hired'],
}

export const candidates = [
  { _id: 'c_001', name: 'Rahul Kumar', stage: 'technical', aiScore: 87.4 },
  { _id: 'c_002', name: 'Fatima Sheikh', stage: 'offer', aiScore: 92.1, offerAmount: 1800000 },
]

// ---------- 4.6 Billing / Plans ----------
export const subscription = {
  orgId: 'org_001',
  plan: 'pro',
  currency: 'INR',
  amount: 4999,
  interval: 'monthly',
  status: 'active',
  gateway: 'razorpay',
  nextBillingDate: '2026-11-27T00:00:00Z',
}

export const usage = { aiRequests: 4820, aiLimit: 5000, candidates: 128, candidateLimit: 200 }

// ---------- 4.7 Analytics / Insights ----------
export const userGrowth = [
  { month: '2026-05', newUsers: 340 },
  { month: '2026-06', newUsers: 412 },
  { month: '2026-07', newUsers: 389 },
  { month: '2026-08', newUsers: 501 },
  { month: '2026-09', newUsers: 620 },
  { month: '2026-10', newUsers: 714 },
]

export const usersByRole = { candidate: 8420, recruiter: 310, admin: 12 }

export const mrr = { INR: 248000, USD: 2980 }

export const insights = {
  integrityFlags: 14,
  aiUsageThisMonth: 38200,
}

// ---------- 4.8 Learn / Courses ----------
export const course = { _id: 'crs_001', title: 'DSA Masterclass', modules: 12, lessonsTotal: 84, enrollments: 2140 }

export const progress = {
  userId: 'u_002',
  courseId: 'crs_001',
  lessonsCompleted: 31,
  lastWatched: { lessonId: 'les_031', watchedSeconds: 720, totalSeconds: 900 },
  quizScores: { quiz_mod3: 85, quiz_mod4: 92 },
}

// ---------- 4.9 Proctoring ----------
export const proctorSession = {
  _id: 'proc_001',
  examId: 'asmnt_001',
  userId: 'u_002',
  flags: [
    { type: 'tab_switch', ts: '2025-06-01T09:14:22Z' },
    { type: 'face_not_detected', ts: '2025-06-01T09:28:05Z' },
  ],
  recording: { r2Key: 'proc/proc_001/video.webm', durationSeconds: 5400 },
  verdict: 'suspicious',
}

// ---------- 4.10 Crash Analytics ----------
export const crashes = [
  {
    message: "Cannot read properties of undefined (reading 'id')",
    severity: 'error',
    component: 'AtsEngine',
    userId: 'u_002',
    ts: '2026-10-27T04:12:00Z',
  },
  {
    message: 'Redis connection timeout',
    severity: 'fatal',
    component: 'RedisCacheHandler',
    userId: null,
    ts: '2026-10-27T04:15:33Z',
  },
]
