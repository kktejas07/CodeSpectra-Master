import { getMongoDb } from '@/lib/mongodb'
import bcrypt from 'bcryptjs'

async function seed() {
  const db = await getMongoDb()
  const dbName = db.databaseName
  console.log(`Seeding database: ${dbName}`)

  // ── Courses ──
  const coursesCol = db.collection('courses')
  if ((await coursesCol.countDocuments()) === 0) {
    await coursesCol.insertMany([
      { id: '1', title: 'React Fundamentals', description: 'Learn React from scratch with comprehensive video lectures and live examples', type: 'video', instructor: 'Sarah Chen', duration: '12 hours', level: 'beginner', enrolled: 2453, rating: 4.8, progress: 45, tags: ['React', 'JavaScript', 'Web Development'], created_at: now() },
      { id: '2', title: 'Advanced TypeScript Patterns', description: 'Audio course covering advanced TypeScript concepts and design patterns', type: 'audio', instructor: 'John Smith', duration: '8 hours', level: 'advanced', enrolled: 892, rating: 4.9, tags: ['TypeScript', 'Design Patterns'], created_at: now() },
      { id: '3', title: 'System Design Interview Guide', description: 'Comprehensive text guide for mastering system design interviews', type: 'text', instructor: 'Alex Kumar', duration: '20 lessons', level: 'advanced', enrolled: 3102, rating: 4.7, progress: 60, tags: ['System Design', 'Interviews'], created_at: now() },
      { id: '4', title: 'Data Structures & Algorithms', description: 'Video course on essential data structures and algorithms with visualizations', type: 'video', instructor: 'Emma Wilson', duration: '18 hours', level: 'intermediate', enrolled: 4521, rating: 4.9, progress: 30, tags: ['Algorithms', 'Data Structures'], created_at: now() },
      { id: '5', title: 'Web Performance Optimization', description: 'Audio guide to optimizing web applications and improving performance', type: 'audio', instructor: 'Michael Brown', duration: '6 hours', level: 'intermediate', enrolled: 1203, rating: 4.6, tags: ['Performance', 'Web Development'], created_at: now() },
      { id: '6', title: 'SQL Mastery Course', description: 'Complete text-based SQL tutorial with real-world examples and best practices', type: 'text', instructor: 'Lisa Anderson', duration: '15 lessons', level: 'beginner', enrolled: 2891, rating: 4.8, tags: ['SQL', 'Databases'], created_at: now() },
    ])
    console.log('✓ courses seeded')
  }

  // ── Challenges ──
  const challengesCol = db.collection('challenges')
  if ((await challengesCol.countDocuments()) === 0) {
    await challengesCol.insertMany([
      { id: '1', title: 'Technical Screen', description: 'Practice a recruiter screening to identify gaps in CS fundamentals, role fit, and interview readiness.', difficulty: 'Medium', type: 'technical-screen', duration: 30, successRate: 97.58, completed: false, locked: false, created_at: now() },
      { id: '2', title: 'Coding - Software Engineer', description: 'Strengthen problem-solving speed, coding accuracy, and confidence by solving real-world problems.', difficulty: 'Hard', type: 'coding', duration: 60, successRate: 94.87, completed: false, locked: false, created_at: now() },
      { id: '3', title: 'System Design', description: 'Improve your ability to design scalable systems and clearly justify architectural decisions.', difficulty: 'Hard', type: 'system-design', duration: 60, successRate: 92.15, completed: false, locked: true, prerequisites: ['Coding - Software Engineer'], created_at: now() },
      { id: '4', title: 'Behavioral Interview', description: 'Practice behavioral questions in a mock setting. Refine your storytelling and STAR method.', difficulty: 'Medium', type: 'behavioral', duration: 45, successRate: 88.45, completed: false, locked: false, created_at: now() },
      { id: '5', title: 'Coding - Frontend Developer', description: 'Master React, JavaScript, and CSS challenges to test your core frontend knowledge.', difficulty: 'Medium', type: 'coding', duration: 60, successRate: 91.2, completed: false, locked: true, prerequisites: ['Coding - Software Engineer'], created_at: now() },
      { id: '6', title: 'Coding - Backend Developer', description: 'Work on challenges covering Node.js, databases, and backend expertise.', difficulty: 'Hard', type: 'coding', duration: 60, successRate: 87.65, completed: false, locked: true, prerequisites: ['Coding - Software Engineer'], created_at: now() },
    ])
    console.log('✓ challenges seeded')
  }

  // ── Tracks ──
  const tracksCol = db.collection('tracks')
  if ((await tracksCol.countDocuments()) === 0) {
    await tracksCol.insertMany([
      { id: 'python', name: 'Python', description: 'Core syntax, data structures, OOP, decorators, async, pytest.', topics: ['Strings', 'Lists', 'Dicts', 'OOP', 'Iterators', 'Asyncio'], tone: 'border-emerald-500/30 bg-emerald-500/5', badge: 'Most popular', created_at: now() },
      { id: 'javascript', name: 'JavaScript / TypeScript', description: 'ES2024+, closures, async/await, Node.js patterns, types.', topics: ['Closures', 'Promises', 'Map/Set', 'TS generics', 'Event loop'], tone: 'border-amber-500/30 bg-amber-500/5', created_at: now() },
      { id: 'dsa', name: 'DSA — Data Structures & Algorithms', description: 'Arrays, Trees, Graphs, DP, Greedy, Two-pointer, Tries.', topics: ['Arrays', 'Trees', 'Graphs', 'DP', 'Greedy', 'Bit manipulation'], tone: 'border-primary/30 bg-primary/5', badge: 'Interview core', created_at: now() },
      { id: 'react', name: 'React', description: 'Hooks, Suspense, RSC, state management, performance.', topics: ['Hooks', 'Context', 'RSC', 'Forms', 'Performance'], tone: 'border-cyan-500/30 bg-cyan-500/5', created_at: now() },
      { id: 'node', name: 'Node.js & Backend', description: 'Express/Fastify, streams, auth, queues, observability.', topics: ['HTTP', 'Streams', 'Auth', 'Queues', 'Caching'], tone: 'border-green-500/30 bg-green-500/5', created_at: now() },
      { id: 'sql', name: 'SQL', description: 'Joins, window functions, query plans, optimization.', topics: ['SELECT', 'JOINs', 'Window fns', 'CTEs', 'Indexes'], tone: 'border-fuchsia-500/30 bg-fuchsia-500/5', created_at: now() },
      { id: 'java', name: 'Java', description: 'Collections, streams, concurrency, JVM tuning, Spring.', topics: ['Collections', 'Streams', 'Concurrency', 'JVM', 'Generics'], tone: 'border-orange-500/30 bg-orange-500/5', created_at: now() },
      { id: 'cpp', name: 'C++', description: 'STL, move semantics, templates, memory, performance.', topics: ['STL', 'Templates', 'Move semantics', 'Smart pointers', 'CRTP'], tone: 'border-rose-500/30 bg-rose-500/5', created_at: now() },
      { id: 'system_design', name: 'System Design', description: 'Scalability, caching, sharding, queues, consistency, design patterns.', topics: ['Sharding', 'Caching', 'Queues', 'Consistency', 'Rate limits'], tone: 'border-indigo-500/30 bg-indigo-500/5', badge: 'Senior+', created_at: now() },
    ])
    console.log('✓ tracks seeded')
  }

  // ── Exams ──
  const examsCol = db.collection('exams')
  if ((await examsCol.countDocuments()) === 0) {
    await examsCol.insertMany([
      { id: '1', title: 'JavaScript Fundamentals', subject: 'JavaScript', level: 'Beginner', duration: 60, questions: 50, passingScore: 70, description: 'Test your knowledge of JavaScript basics', status: 'available', created_at: now() },
      { id: '2', title: 'React Advanced Patterns', subject: 'React', level: 'Advanced', duration: 90, questions: 40, passingScore: 75, description: 'Master advanced React patterns and hooks', status: 'available', created_at: now() },
      { id: '3', title: 'Python Data Science', subject: 'Python', level: 'Intermediate', duration: 120, questions: 60, passingScore: 80, description: 'Data science with Python and popular libraries', status: 'available', created_at: now() },
    ])
    console.log('✓ exams seeded')
  }

  // ── Codeathons ──
  const codeathonsCol = db.collection('codeathons')
  if ((await codeathonsCol.countDocuments()) === 0) {
    await codeathonsCol.insertMany([
      { id: '1', title: 'Web Development Challenge', description: 'Build an innovative web application', startDate: '2026-07-15', endDate: '2026-08-15', totalPrize: '$5,000', participants: 342, difficulty: 'Intermediate', topics: ['React', 'Node.js', 'MongoDB'], status: 'upcoming', created_at: now() },
      { id: '2', title: 'AI/ML Hackathon', description: 'Create AI solutions for real-world problems', startDate: '2026-06-28', endDate: '2026-07-05', totalPrize: '$10,000', participants: 128, difficulty: 'Advanced', topics: ['Machine Learning', 'Python', 'TensorFlow'], status: 'ongoing', created_at: now() },
      { id: '3', title: 'Mobile App Sprint', description: 'Build cross-platform mobile applications', startDate: '2026-05-10', endDate: '2026-05-20', totalPrize: '$3,000', participants: 256, difficulty: 'Intermediate', topics: ['React Native', 'Flutter', 'Swift'], status: 'ended', created_at: now() },
    ])
    console.log('✓ codeathons seeded')
  }

  // ── Jobs ──
  const jobsCol = db.collection('jobs')
  if ((await jobsCol.countDocuments()) === 0) {
    await jobsCol.insertMany([
      { id: '1', title: 'Senior Full-Stack Developer', company: 'Tech Corp', location: 'San Francisco, CA', salary: { min: 150000, max: 200000, currency: 'USD' }, jobType: 'Full-time', experienceLevel: 'Senior', description: 'Looking for experienced full-stack developer to join our team', skills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL'], applicants: 24, postedAt: '2 days ago', created_at: now() },
      { id: '2', title: 'Frontend Engineer', company: 'StartUp Inc', location: 'Remote', salary: { min: 120000, max: 160000, currency: 'USD' }, jobType: 'Full-time', experienceLevel: 'Mid-level', description: 'Help build beautiful user interfaces for our platform', skills: ['React', 'TypeScript', 'Tailwind CSS', 'Next.js'], applicants: 18, postedAt: '5 days ago', created_at: now() },
      { id: '3', title: 'DevOps Engineer', company: 'Cloud Systems', location: 'New York, NY', salary: { min: 140000, max: 190000, currency: 'USD' }, jobType: 'Full-time', experienceLevel: 'Senior', description: 'Manage and optimize our cloud infrastructure', skills: ['Kubernetes', 'Docker', 'AWS', 'Python'], applicants: 12, postedAt: '1 week ago', created_at: now() },
      { id: '4', title: 'Backend Developer', company: 'DataFlow Inc', location: 'Austin, TX', salary: { min: 130000, max: 170000, currency: 'USD' }, jobType: 'Full-time', experienceLevel: 'Mid-level', description: 'Build scalable backend services and APIs', skills: ['Go', 'gRPC', 'PostgreSQL', 'Redis'], applicants: 8, postedAt: '3 days ago', created_at: now() },
    ])
    console.log('✓ jobs seeded')
  }

  // ── Interview Types ──
  const itCol = db.collection('interview_types')
  if ((await itCol.countDocuments()) === 0) {
    await itCol.insertMany([
      { id: 'coding', title: 'Coding Interview', description: 'Strengthen problem-solving speed, coding accuracy, and confidence by solving real-world problems.', duration: '60 mins', difficulty: 'Medium', available: true, roles: ['Software Engineer', 'Frontend Developer', 'Backend Developer'], created_at: now() },
      { id: 'system-design', title: 'System Design', description: 'Improve your ability to design scalable systems and clearly justify architectural decisions.', duration: '90 mins', difficulty: 'Hard', available: false, roles: ['Senior Engineer', 'Architect'], created_at: now() },
      { id: 'behavioral', title: 'Behavioral Interview', description: 'Practice behavioral questions in a mock setting. Refine your storytelling and STAR method.', duration: '45 mins', difficulty: 'Easy', available: true, roles: ['All Roles'], created_at: now() },
      { id: 'ai-fluency', title: 'AI Fluency Assessment', description: 'Demonstrate your ability to build with AI and use AI tools to solve problems and improve your workflow.', duration: '30 mins', difficulty: 'Medium', available: true, roles: ['All Roles'], created_at: now() },
    ])
    console.log('✓ interview_types seeded')
  }

  // ── Achievements ──
  const achCol = db.collection('achievements')
  if ((await achCol.countDocuments()) === 0) {
    await achCol.insertMany([
      { id: 1, name: 'First Victory', description: 'Solve your first challenge', icon: 'Trophy', earned: true, progress: 1, total: 1, created_at: now() },
      { id: 2, name: 'Speed Runner', description: 'Solve 10 challenges in one day', icon: 'Zap', earned: false, progress: 3, total: 10, created_at: now() },
      { id: 3, name: 'Scholar', description: 'Complete 5 courses', icon: 'BookOpen', earned: false, progress: 2, total: 5, created_at: now() },
      { id: 4, name: 'Perfectionist', description: 'Solve a hard challenge on first try', icon: 'Target', earned: false, progress: 0, total: 1, created_at: now() },
      { id: 5, name: 'On Fire', description: 'Maintain a 30-day streak', icon: 'Flame', earned: false, progress: 1, total: 30, created_at: now() },
      { id: 6, name: 'Code Master', description: 'Solve 100 challenges', icon: 'Code2', earned: false, progress: 0, total: 100, created_at: now() },
    ])
    console.log('✓ achievements seeded')
  }

  // ── Arena Challenges ──
  const arenaCol = db.collection('arena_challenges')
  if ((await arenaCol.countDocuments()) === 0) {
    const { ARENA_CHALLENGES } = await import('../lib/arena-challenges')
    await arenaCol.insertMany(ARENA_CHALLENGES.map(c => ({ ...c, created_at: now() })))
    console.log('✓ arena_challenges seeded')
  }

  // ── Teams ──
  const teamsCol = db.collection('teams')
  if ((await teamsCol.countDocuments()) === 0) {
    await teamsCol.insertMany([
      { id: 1, name: 'Backend Team', members: 5, admin: 'John Doe', status: 'active', created_at: now() },
      { id: 2, name: 'Frontend Team', members: 3, admin: 'Jane Smith', status: 'active', created_at: now() },
      { id: 3, name: 'DevOps Team', members: 2, admin: 'Mike Johnson', status: 'active', created_at: now() },
    ])
    console.log('✓ teams seeded')
  }

  // ── Team Members ──
  const tmCol = db.collection('team_members')
  if ((await tmCol.countDocuments()) === 0) {
    await tmCol.insertMany([
      { id: '1', name: 'Alice Johnson', email: 'alice@example.com', role: 'tenant_admin', joinedAt: 'Jan 15, 2026', status: 'active', created_at: now() },
      { id: '2', name: 'Bob Smith', email: 'bob@example.com', role: 'member', joinedAt: 'Feb 1, 2026', status: 'active', created_at: now() },
      { id: '3', name: 'Carol Davis', email: 'carol@example.com', role: 'member', joinedAt: 'Mar 10, 2026', status: 'inactive', created_at: now() },
    ])
    console.log('✓ team_members seeded')
  }

  // ── Security Settings ──
  const secCol = db.collection('security_settings')
  if ((await secCol.countDocuments()) === 0) {
    await secCol.insertMany([
      { name: 'Two-Factor Authentication', status: 'enabled', icon: 'Lock', created_at: now() },
      { name: 'IP Whitelist', status: 'disabled', icon: 'Shield', created_at: now() },
      { name: 'API Rate Limiting', status: 'enabled', icon: 'alert-triangle', created_at: now() },
    ])
    console.log('✓ security_settings seeded')
  }

  // ── Audit Logs ──
  const auditCol = db.collection('admin_audit_logs')
  if ((await auditCol.countDocuments()) === 0) {
    await auditCol.insertMany([
      { id: 'a1', ts: '2026-06-29T14:22:01Z', actor: 'superadmin@codespectra.com', actorIp: '203.0.113.10', action: 'platform_settings.update', resource: 'general', resourceType: 'settings', severity: 'info', outcome: 'success', detail: 'maintenance_mode toggled', user_id: 'system', created_at: now() },
      { id: 'a2', ts: '2026-06-29T13:05:44Z', actor: 'admin@codespectra.com', actorIp: '198.51.100.2', action: 'team.member.invite', resource: 'team/8f2a', resourceType: 'organization', severity: 'info', outcome: 'success', user_id: 'system', created_at: now() },
      { id: 'a3', ts: '2026-06-29T11:40:12Z', actor: 'demo@codespectra.com', actorIp: '192.0.2.45', action: 'github.oauth.start', resource: 'oauth/state', resourceType: 'integration', severity: 'info', outcome: 'success', user_id: 'system', created_at: now() },
      { id: 'a4', ts: '2026-06-28T22:18:33Z', actor: 'unknown', actorIp: '185.220.101.4', action: 'api.admin.users', resource: 'GET denied', resourceType: 'api', severity: 'warning', outcome: 'denied', detail: 'Missing superadmin role', user_id: 'system', created_at: now() },
      { id: 'a5', ts: '2026-06-28T09:02:00Z', actor: 'system', actorIp: '—', action: 'db.migration.applied', resource: '20260628_platform', resourceType: 'database', severity: 'info', outcome: 'success', user_id: 'system', created_at: now() },
      { id: 'a6', ts: '2026-06-27T16:55:21Z', actor: 'superadmin@codespectra.com', actorIp: '203.0.113.10', action: 'user.role.change', resource: 'user/u_9b3', resourceType: 'identity', severity: 'critical', outcome: 'success', detail: 'role → tenant_admin', user_id: 'system', created_at: now() },
    ])
    console.log('✓ admin_audit_logs seeded')
  }

  // ── Skill Analytics (demo for admin user) ──
  const saCol = db.collection('skill_analytics')
  if ((await saCol.countDocuments({ user_id: 'demo-user' })) === 0) {
    await saCol.insertMany([
      { user_id: 'demo-user', skill: 'Arrays', solved: 12, total: 15, percentage: 80, created_at: now() },
      { user_id: 'demo-user', skill: 'Strings', solved: 8, total: 12, percentage: 67, created_at: now() },
      { user_id: 'demo-user', skill: 'Trees', solved: 10, total: 14, percentage: 71, created_at: now() },
      { user_id: 'demo-user', skill: 'Graphs', solved: 6, total: 10, percentage: 60, created_at: now() },
      { user_id: 'demo-user', skill: 'Dynamic Programming', solved: 4, total: 8, percentage: 50, created_at: now() },
      { user_id: 'demo-user', skill: 'Sorting', solved: 11, total: 11, percentage: 100, created_at: now() },
    ])
    console.log('✓ skill_analytics seeded')
  }

  console.log('\nSeed complete! All collections populated.')
  process.exit(0)
}

function now() { return new Date().toISOString() }

seed().catch(err => { console.error('Seed failed:', err); process.exit(1) })
