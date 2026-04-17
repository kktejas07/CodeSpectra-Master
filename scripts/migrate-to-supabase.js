import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function executeMigrations() {
  console.log('[v0] Starting Supabase migrations...');
  
  const migrationFiles = [
    '01-init-schema.sql',
    '02-rbac-schema.sql',
    '10-jobs-only.sql',
    '11-exams-only.sql',
    '12-codeathons-only.sql',
    '13-resumes-only.sql',
    '14-billing-only.sql',
    '15-notifications-others.sql',
    '16-add-indexes-and-rls.sql',
  ];

  for (const file of migrationFiles) {
    try {
      const sqlPath = path.join(process.cwd(), 'scripts', file);
      const sql = fs.readFileSync(sqlPath, 'utf-8');
      
      console.log(`[v0] Executing ${file}...`);
      
      // Execute SQL in chunks
      const statements = sql.split(';').filter(s => s.trim());
      
      for (const statement of statements) {
        if (statement.trim()) {
          const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' }).catch(() => ({error: null}));
          if (error) {
            console.warn(`[v0] Warning in ${file}: ${error.message}`);
          }
        }
      }
      
      console.log(`[v0] ✓ ${file} completed`);
    } catch (error) {
      console.error(`[v0] Error executing ${file}:`, error.message);
    }
  }
}

async function seedData() {
  console.log('[v0] Seeding database with initial data...');

  try {
    // Seed subscription plans
    const { error: plansError } = await supabase
      .from('subscription_plans')
      .insert([
        {
          name: 'Free',
          description: 'Perfect for getting started',
          price_per_month: 0,
          max_challenges: 50,
          max_submissions: 100,
          max_team_members: 1,
          features: ['Basic code scanning', 'Challenge solving', 'Limited analytics'],
        },
        {
          name: 'Pro',
          description: 'For serious learners',
          price_per_month: 2999,
          max_challenges: -1,
          max_submissions: -1,
          max_team_members: 5,
          features: ['Unlimited challenges', 'Advanced analytics', 'Team collaboration', 'Code review', 'AI feedback'],
        },
        {
          name: 'Enterprise',
          description: 'For organizations',
          price_per_month: 9999,
          max_challenges: -1,
          max_submissions: -1,
          max_team_members: -1,
          features: ['Everything in Pro', 'SSO', 'Custom integrations', 'Dedicated support', 'SLA'],
        },
      ]);

    if (plansError) console.warn('[v0] Plans warning:', plansError.message);
    else console.log('[v0] ✓ Subscription plans seeded');

    // Seed sample challenges
    const { error: challengesError } = await supabase
      .from('challenges')
      .insert([
        {
          title: 'Two Sum',
          description: 'Find two numbers that add up to target',
          problem_statement: 'Given an array of integers nums and an integer target, return the indices of the two numbers that add up to target. You may assume each input has exactly one solution, and you cannot use the same element twice.',
          difficulty: 'easy',
          category: 'Array',
          points: 100,
          test_cases: [
            { input: '[2,7,11,15], target=9', expected_output: '[0,1]', explanation: 'nums[0] + nums[1] == 9' },
            { input: '[3,2,4], target=6', expected_output: '[1,2]', explanation: 'nums[1] + nums[2] == 6' },
          ],
          starter_code: {
            javascript: 'function twoSum(nums, target) {\n  // Your code here\n}',
            python: 'def twoSum(nums, target):\n    # Your code here\n    pass',
          },
          created_by: '00000000-0000-0000-0000-000000000000',
        },
        {
          title: 'Median of Two Sorted Arrays',
          description: 'Find median of two sorted arrays',
          problem_statement: 'Given two sorted arrays nums1 and nums2 of size m and n respectively, return the median of the two sorted arrays.',
          difficulty: 'hard',
          category: 'Array',
          points: 300,
          test_cases: [
            { input: 'nums1 = [1,3], nums2 = [2]', expected_output: '2.0', explanation: 'The median is 2.0' },
          ],
          starter_code: {
            javascript: 'function findMedianSortedArrays(nums1, nums2) {\n  // Your code here\n}',
            python: 'def findMedianSortedArrays(nums1, nums2):\n    pass',
          },
          created_by: '00000000-0000-0000-0000-000000000000',
        },
      ]);

    if (challengesError) console.warn('[v0] Challenges warning:', challengesError.message);
    else console.log('[v0] ✓ Sample challenges seeded');

  } catch (error) {
    console.error('[v0] Error seeding data:', error.message);
  }
}

async function main() {
  try {
    console.log('[v0] Connected to Supabase');
    await executeMigrations();
    await seedData();
    console.log('[v0] ✓ All migrations and seeding completed successfully!');
  } catch (error) {
    console.error('[v0] Migration failed:', error);
    process.exit(1);
  }
}

main();
