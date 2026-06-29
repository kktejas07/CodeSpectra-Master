/**
 * Seed Data Management System (legacy — Supabase version removed).
 * Seed data is now handled by MongoDB seed scripts.
 */

/**
 * Seed data marker - added to all seed data for identification
 */
const SEED_DATA_MARKER = 'SEED_DATA_AUTO_GENERATED'
const DEVELOPMENT_ENVIRONMENTS = ['development', 'staging', 'test', 'local']

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  const env = process.env.NODE_ENV
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV
  return env === 'production' || appEnv === 'production'
}

/**
 * Get environment type
 */
export function getEnvironmentType(): string {
  return process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || 'unknown'
}

/**
 * Check if seed data operations are allowed
 */
export function isSeedDataAllowed(): boolean {
  if (isProduction()) {
    console.error('[CodeSpectra] Seed data operations are disabled in production')
    return false
  }
  return true
}

/**
 * Create a seed data record with marker
 */
export function createSeedDataRecord(data: any): any {
  return {
    ...data,
    _seed_data_marker: SEED_DATA_MARKER,
    _seed_created_at: new Date().toISOString(),
    _seed_environment: getEnvironmentType(),
  }
}

/**
 * Seed demo user accounts
 */
export async function seedDemoUsers() {
  if (!isSeedDataAllowed()) return

  try {
    console.log('[CodeSpectra] Seeding demo user accounts...')

    const demoUsers = [
      {
        email: 'demo.superadmin@codespectra.com',
        password: 'DemoPass123!',
        fullName: 'Demo Superadmin',
        role: 'superadmin',
      },
      {
        email: 'demo.admin@codespectra.com',
        password: 'DemoPass123!',
        fullName: 'Demo Admin',
        role: 'tenant_admin',
      },
      {
        email: 'demo.user@codespectra.com',
        password: 'DemoPass123!',
        fullName: 'Demo User',
        role: 'user',
      },
    ]

    for (const user of demoUsers) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        user_metadata: {
          full_name: user.fullName,
          role: user.role,
          ...createSeedDataRecord({}),
        },
        email_confirm: true,
      })

      if (error) {
        console.error(`Failed to seed user ${user.email}:`, error)
      } else {
        console.log(`Seeded user: ${user.email}`)
      }
    }
  } catch (error) {
    console.error('[CodeSpectra] Error seeding demo users:', error)
  }
}

/**
 * Seed sample projects/challenges
 */
export async function seedSampleProjects() {
  if (!isSeedDataAllowed()) return

  try {
    console.log('[CodeSpectra] Seeding sample projects...')

    const sampleProjects = [
      {
        title: 'Two Sum',
        difficulty: 'easy',
        description: 'Find two numbers that add up to a target',
        language: 'javascript',
      },
      {
        title: 'Binary Search Tree',
        difficulty: 'medium',
        description: 'Implement and traverse a binary search tree',
        language: 'python',
      },
      {
        title: 'Graph Algorithm',
        difficulty: 'hard',
        description: 'Solve complex graph traversal problems',
        language: 'cpp',
      },
    ]

    for (const project of sampleProjects) {
      const { error } = await supabase
        .from('challenges')
        .insert([
          createSeedDataRecord({
            title: project.title,
            difficulty: project.difficulty,
            description: project.description,
            language: project.language,
          }),
        ])

      if (error) {
        console.error(`Failed to seed project ${project.title}:`, error)
      } else {
        console.log(`Seeded project: ${project.title}`)
      }
    }
  } catch (error) {
    console.error('[CodeSpectra] Error seeding sample projects:', error)
  }
}

/**
 * Clean up all seed data before production deployment
 */
export async function cleanupSeedData() {
  if (isProduction()) {
    console.error('[CodeSpectra] Refusing to cleanup seed data in production')
    return { success: false, message: 'Cannot cleanup seed data in production' }
  }

  try {
    console.log('[CodeSpectra] Cleaning up seed data...')

    // Delete seed users from auth
    const { data: seedAuthUsers, error: fetchError } = await supabase
      .from('users')
      .select('id')
      .like('_seed_data_marker', `%${SEED_DATA_MARKER}%`)

    if (fetchError) {
      console.error('Error fetching seed users:', fetchError)
      return { success: false, error: fetchError.message }
    }

    // Delete seed challenges
    const { error: challengeError } = await supabase
      .from('challenges')
      .delete()
      .like('_seed_data_marker', `%${SEED_DATA_MARKER}%`)

    if (challengeError) {
      console.error('Error deleting seed challenges:', challengeError)
    }

    // Delete seed submissions
    const { error: submissionError } = await supabase
      .from('submissions')
      .delete()
      .like('_seed_data_marker', `%${SEED_DATA_MARKER}%`)

    if (submissionError) {
      console.error('Error deleting seed submissions:', submissionError)
    }

    console.log('[CodeSpectra] Seed data cleanup complete')
    return { success: true, message: 'Seed data cleaned up successfully' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[CodeSpectra] Error cleaning up seed data:', error)
    return { success: false, error: errorMessage }
  }
}

/**
 * Initialize seed data for development/staging
 */
export async function initializeSeedData() {
  if (!isSeedDataAllowed()) {
    console.log('[CodeSpectra] Seed data initialization skipped (production environment)')
    return
  }

  console.log(
    `[CodeSpectra] Initializing seed data for ${getEnvironmentType()} environment...`
  )

  try {
    await seedDemoUsers()
    await seedSampleProjects()
    console.log('[CodeSpectra] Seed data initialization complete')
  } catch (error) {
    console.error('[CodeSpectra] Error initializing seed data:', error)
  }
}

/**
 * Verify no seed data exists (for production safety)
 */
export async function verifySeedDataCleanup(): Promise<{
  clean: boolean
  seedRecordsFound: number
}> {
  try {
    const tables = ['users', 'challenges', 'submissions', 'face_enrollments']
    let totalSeedRecords = 0

    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('count', { count: 'exact' })
        .like('_seed_data_marker', `%${SEED_DATA_MARKER}%`)

      if (!error && data) {
        const count = data.length
        totalSeedRecords += count
        if (count > 0) {
          console.warn(`[CodeSpectra] Found ${count} seed records in ${table}`)
        }
      }
    }

    return {
      clean: totalSeedRecords === 0,
      seedRecordsFound: totalSeedRecords,
    }
  } catch (error) {
    console.error('[CodeSpectra] Error verifying seed data cleanup:', error)
    return { clean: false, seedRecordsFound: -1 }
  }
}
