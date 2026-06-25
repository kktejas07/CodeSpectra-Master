/**
 * Arena challenges: static catalog (same source as list page).
 * Today these are curated mock problems — not AI-generated per session.
 * A future phase can load from DB / generate via LLM from user tech stack.
 */

export type ArenaDifficulty = 'easy' | 'medium' | 'hard'

export type ArenaChallenge = {
  id: string
  title: string
  shortDescription: string
  difficulty: ArenaDifficulty
  category: string
  points: number
  solved: number
  attempts: number
  statement: string[]
  examples: { input: string; output: string; explanation?: string }[]
  constraints: string[]
  defaultCode: Record<string, string>
}

export const ARENA_CHALLENGE_ORDER = ['1', '2', '3', '4', '5', '6'] as const

export const ARENA_CHALLENGES: ArenaChallenge[] = [
  {
    id: '1',
    title: 'Two Sum',
    shortDescription: 'Find two numbers that add up to a target',
    difficulty: 'easy',
    category: 'Arrays',
    points: 100,
    solved: 1245,
    attempts: 3,
    statement: [
      'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
      'You may assume each input has exactly one solution and you may not use the same element twice. Return the answer in any order.',
    ],
    examples: [
      {
        input: 'nums = [2,7,11,15], target = 9',
        output: '[0,1]',
        explanation: 'Because nums[0] + nums[1] == 9, we return [0, 1].',
      },
      { input: 'nums = [3,2,4], target = 6', output: '[1,2]' },
      { input: 'nums = [3,3], target = 6', output: '[0,1]' },
    ],
    constraints: ['2 <= nums.length <= 10⁴', '-10⁹ <= nums[i] <= 10⁹', '-10⁹ <= target <= 10⁹', 'Exactly one valid answer exists.'],
    defaultCode: {
      javascript: `function twoSum(nums, target) {\n  // Your code here\n  return [];\n}`,
      typescript: `function twoSum(nums: number[], target: number): number[] {\n  // Your code here\n  return [];\n}`,
      python: `def two_sum(nums, target):\n    # Your code here\n    pass`,
      java: `class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        // Your code here\n        return new int[0];\n    }\n}`,
      cpp: `class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        // Your code here\n        return {};\n    }\n};`,
    },
  },
  {
    id: '2',
    title: 'Longest Substring Without Repeating Characters',
    shortDescription: 'Find the longest substring without repeating characters',
    difficulty: 'medium',
    category: 'Strings',
    points: 200,
    solved: 876,
    attempts: 0,
    statement: [
      'Given a string s, find the length of the longest substring without repeating characters.',
    ],
    examples: [
      { input: 's = "abcabcbb"', output: '3', explanation: 'The answer is "abc", length 3.' },
      { input: 's = "bbbbb"', output: '1' },
      { input: 's = "pwwkew"', output: '3', explanation: 'The answer is "wke", length 3.' },
    ],
    constraints: ['0 <= s.length <= 5 * 10⁴', 's consists of English letters, digits, symbols and spaces.'],
    defaultCode: {
      javascript: `function lengthOfLongestSubstring(s) {\n  // Your code here\n  return 0;\n}`,
      typescript: `function lengthOfLongestSubstring(s: string): number {\n  // Your code here\n  return 0;\n}`,
      python: `def length_of_longest_substring(s: str) -> int:\n    # Your code here\n    return 0`,
      java: `class Solution {\n    public int lengthOfLongestSubstring(String s) {\n        return 0;\n    }\n}`,
      cpp: `class Solution {\npublic:\n    int lengthOfLongestSubstring(string s) {\n        return 0;\n    }\n};`,
    },
  },
  {
    id: '3',
    title: 'Median of Two Sorted Arrays',
    shortDescription: 'Find the median of two sorted arrays in O(log(m+n))',
    difficulty: 'hard',
    category: 'Arrays',
    points: 300,
    solved: 234,
    attempts: 0,
    statement: [
      'Given two sorted arrays nums1 and nums2 of size m and n respectively, return the median of the two sorted arrays.',
      'The overall run time complexity should be O(log (m+n)).',
    ],
    examples: [
      { input: 'nums1 = [1,3], nums2 = [2]', output: '2.00000' },
      { input: 'nums1 = [1,2], nums2 = [3,4]', output: '2.50000' },
    ],
    constraints: ['nums1.length == m', 'nums2.length == n', '0 <= m <= 1000', '0 <= n <= 1000', '1 <= m + n <= 2000'],
    defaultCode: {
      javascript: `function findMedianSortedArrays(nums1, nums2) {\n  // Your code here\n  return 0;\n}`,
      typescript: `function findMedianSortedArrays(nums1: number[], nums2: number[]): number {\n  return 0;\n}`,
      python: `def find_median_sorted_arrays(nums1, nums2):\n    pass`,
      java: `class Solution {\n    public double findMedianSortedArrays(int[] nums1, int[] nums2) {\n        return 0;\n    }\n}`,
      cpp: `class Solution {\npublic:\n    double findMedianSortedArrays(vector<int>& a, vector<int>& b) {\n        return 0;\n    }\n};`,
    },
  },
  {
    id: '4',
    title: 'Valid Parentheses',
    shortDescription: 'Check if parentheses are balanced',
    difficulty: 'easy',
    category: 'Stacks',
    points: 100,
    solved: 2341,
    attempts: 0,
    statement: [
      'Given a string s containing just the characters "(", ")", "{", "}", "[" and "]", determine if the input string is valid.',
    ],
    examples: [
      { input: 's = "()"', output: 'true' },
      { input: 's = "()[]{}"', output: 'true' },
      { input: 's = "(]"', output: 'false' },
    ],
    constraints: ['1 <= s.length <= 10⁴', 's consists of parentheses only "()[]{}".'],
    defaultCode: {
      javascript: `function isValid(s) {\n  // Your code here\n  return false;\n}`,
      typescript: `function isValid(s: string): boolean {\n  return false;\n}`,
      python: `def is_valid(s: str) -> bool:\n    return False`,
      java: `class Solution {\n    public boolean isValid(String s) {\n        return false;\n    }\n}`,
      cpp: `class Solution {\npublic:\n    bool isValid(string s) {\n        return false;\n    }\n};`,
    },
  },
  {
    id: '5',
    title: 'Binary Tree Traversal',
    shortDescription: 'Implement in-order, pre-order, and post-order traversals',
    difficulty: 'medium',
    category: 'Trees',
    points: 250,
    solved: 564,
    attempts: 0,
    statement: [
      'Given the root of a binary tree, return the inorder traversal of its nodes values.',
      '(Extend to preorder and postorder in the full version.)',
    ],
    examples: [{ input: 'root = [1,null,2,3]', output: '[1,3,2]' }],
    constraints: ['The number of nodes is in the range [0, 100].', '-100 <= Node.val <= 100'],
    defaultCode: {
      javascript: `function inorderTraversal(root) {\n  // Your code here\n  return [];\n}`,
      typescript: `function inorderTraversal(root: TreeNode | null): number[] {\n  return [];\n}`,
      python: `def inorder_traversal(root):\n    return []`,
      java: `class Solution {\n    public List<Integer> inorderTraversal(TreeNode root) {\n        return new ArrayList<>();\n    }\n}`,
      cpp: `class Solution {\npublic:\n    vector<int> inorderTraversal(TreeNode* root) {\n        return {};\n    }\n};`,
    },
  },
  {
    id: '6',
    title: 'Edit Distance',
    shortDescription: 'Minimum edit distance between two strings',
    difficulty: 'hard',
    category: 'Dynamic Programming',
    points: 350,
    solved: 189,
    attempts: 0,
    statement: [
      'Given two strings word1 and word2, return the minimum number of operations required to convert word1 to word2.',
      'You have three permitted operations: insert a character, delete a character, or replace a character.',
    ],
    examples: [
      { input: 'word1 = "horse", word2 = "ros"', output: '3' },
      { input: 'word1 = "intention", word2 = "execution"', output: '5' },
    ],
    constraints: ['0 <= word1.length, word2.length <= 500', 'word1 and word2 consist of lowercase English letters.'],
    defaultCode: {
      javascript: `function minDistance(word1, word2) {\n  return 0;\n}`,
      typescript: `function minDistance(word1: string, word2: string): number {\n  return 0;\n}`,
      python: `def min_distance(word1: str, word2: str) -> int:\n    return 0`,
      java: `class Solution {\n    public int minDistance(String word1, String word2) {\n        return 0;\n    }\n}`,
      cpp: `class Solution {\npublic:\n    int minDistance(string word1, string word2) {\n        return 0;\n    }\n};`,
    },
  },
]

export function getArenaChallenge(id: string): ArenaChallenge | undefined {
  return ARENA_CHALLENGES.find((c) => c.id === id)
}

export function getNextArenaChallengeId(currentId: string): string | null {
  const idx = ARENA_CHALLENGE_ORDER.indexOf(currentId as (typeof ARENA_CHALLENGE_ORDER)[number])
  if (idx < 0 || idx >= ARENA_CHALLENGE_ORDER.length - 1) return null
  return ARENA_CHALLENGE_ORDER[idx + 1] ?? null
}
