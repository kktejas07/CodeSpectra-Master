export type ArenaDifficulty = 'easy' | 'medium' | 'hard'

/** A graded case: what the user's program receives on stdin and must print. */
export type ArenaTestCase = { stdin: string; expected_stdout: string }

export type ArenaChallenge = {
  id: string
  slug?: string
  title: string
  shortDescription: string
  difficulty: ArenaDifficulty
  category: string
  points: number
  solved: number
  attempts: number
  statement: string[]
  /**
   * Displayed to the user AND graded: `input` is the exact stdin, `output` the
   * exact required stdout. They used to be LeetCode-style prose
   * ("nums = [2,7,11,15], target = 9") while the grader fed that string
   * straight to stdin — no starter could ever parse it, so nothing was solvable.
   */
  examples: { input: string; output: string; explanation?: string }[]
  /** Extra graded cases not shown to the user. */
  testCases?: ArenaTestCase[]
  constraints: string[]
  defaultCode: Record<string, string>
  /** Reference solution (JavaScript) — used to verify the cases before publish. */
  solutionCode?: string
}

/**
 * Same starter for every language: read stdin, compute, print. Arena grades a
 * whole program (like the `problems` collection), not a function signature, so
 * a generic skeleton is honest; generated challenges ship problem-specific ones.
 */
const STARTERS: Record<string, string> = {
  javascript: "const src = require('fs').readFileSync(0, 'utf8')\n// TODO: parse `src`, compute the answer, print it with console.log\n",
  typescript: "const src = require('fs').readFileSync(0, 'utf8')\n// TODO: parse `src`, compute the answer, print it with console.log\n",
  python: 'import sys\nsrc = sys.stdin.read()\n# TODO: parse `src`, compute the answer, print it\n',
  java: 'public class Main {\n    public static void main(String[] args) throws Exception {\n        // TODO: read stdin, compute the answer, print it\n    }\n}\n',
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n    // TODO: read stdin, compute the answer, print it\n    return 0;\n}\n',
}

const starter = (): Record<string, string> => ({ ...STARTERS })

const SEED_CHALLENGES: ArenaChallenge[] = [
  {
    id: '1', title: 'Two Sum', shortDescription: 'Find two indices that add up to a target',
    difficulty: 'easy', category: 'Arrays', points: 100, solved: 0, attempts: 0,
    statement: [
      'Input (stdin): line 1 is a JSON array of integers, line 2 is the target integer.',
      'Print the two indices (0-based, in any order) whose values add up to the target, as a JSON array. Exactly one solution exists.',
    ],
    examples: [
      { input: '[2,7,11,15]\n9', output: '[0,1]', explanation: 'nums[0] + nums[1] == 9' },
      { input: '[3,2,4]\n6', output: '[1,2]' },
      { input: '[3,3]\n6', output: '[0,1]' },
    ],
    constraints: ['2 <= nums.length <= 10^4', '-10^9 <= nums[i] <= 10^9', 'Exactly one valid answer exists.'],
    defaultCode: starter(),
    solutionCode: "const [line1, line2] = require('fs').readFileSync(0, 'utf8').trim().split('\\n')\nconst nums = JSON.parse(line1)\nconst target = Number(line2)\nconst seen = new Map()\nfor (let i = 0; i < nums.length; i++) {\n  const want = target - nums[i]\n  if (seen.has(want)) { console.log(JSON.stringify([seen.get(want), i])); break }\n  seen.set(nums[i], i)\n}\n",
  },
  {
    id: '2', title: 'Longest Substring Without Repeating Characters', shortDescription: 'Length of the longest substring with all-distinct characters',
    difficulty: 'medium', category: 'Strings', points: 200, solved: 0, attempts: 0,
    statement: [
      'Input (stdin): a single line containing the string s.',
      'Print the length of the longest substring without repeating characters as an integer.',
    ],
    examples: [
      { input: 'abcabcbb', output: '3', explanation: '"abc"' },
      { input: 'bbbbb', output: '1' },
      { input: 'pwwkew', output: '3', explanation: '"wke"' },
    ],
    constraints: ['0 <= s.length <= 5 * 10^4'],
    defaultCode: starter(),
    solutionCode: "const s = require('fs').readFileSync(0, 'utf8').replace(/\\r?\\n$/, '')\nconst last = new Map()\nlet start = 0, best = 0\nfor (let i = 0; i < s.length; i++) {\n  if (last.has(s[i]) && last.get(s[i]) >= start) start = last.get(s[i]) + 1\n  last.set(s[i], i)\n  best = Math.max(best, i - start + 1)\n}\nconsole.log(best)\n",
  },
  {
    id: '3', title: 'Median of Two Sorted Arrays', shortDescription: 'Median of two sorted arrays',
    difficulty: 'hard', category: 'Arrays', points: 300, solved: 0, attempts: 0,
    statement: [
      'Input (stdin): line 1 is a JSON array, line 2 is a JSON array. Both are sorted.',
      'Print the median of the merged values. Print an integer when it is whole, otherwise a decimal (e.g. 2 or 2.5).',
    ],
    examples: [
      { input: '[1,3]\n[2]', output: '2' },
      { input: '[1,2]\n[3,4]', output: '2.5' },
    ],
    constraints: ['0 <= nums1.length, nums2.length <= 1000', 'nums1 and nums2 are sorted ascending'],
    defaultCode: starter(),
    solutionCode: "const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split('\\n').map(l => JSON.parse(l))\nconst all = [...a, ...b].sort((x, y) => x - y)\nconst n = all.length\nconst mid = n % 2 ? all[(n - 1) / 2] : (all[n / 2 - 1] + all[n / 2]) / 2\nconsole.log(Number.isInteger(mid) ? String(mid) : String(mid))\n",
  },
  {
    id: '4', title: 'Valid Parentheses', shortDescription: 'Decide whether brackets are balanced',
    difficulty: 'easy', category: 'Stacks', points: 100, solved: 0, attempts: 0,
    statement: [
      'Input (stdin): a single line of bracket characters ( ) [ ] { }.',
      'Print true if every bracket is closed by the same type in the correct order, otherwise false.',
    ],
    examples: [
      { input: '()', output: 'true' },
      { input: '()[]{}', output: 'true' },
      { input: '(]', output: 'false' },
    ],
    constraints: ['1 <= s.length <= 10^4'],
    defaultCode: starter(),
    solutionCode: "const s = require('fs').readFileSync(0, 'utf8').trim()\nconst pairs = { ')': '(', ']': '[', '}': '{' }\nconst stack = []\nlet ok = true\nfor (const ch of s) {\n  if (ch === '(' || ch === '[' || ch === '{') stack.push(ch)\n  else if (stack.pop() !== pairs[ch]) { ok = false; break }\n}\nconsole.log(ok && stack.length === 0 ? 'true' : 'false')\n",
  },
  {
    id: '5', title: 'Binary Tree Inorder Traversal', shortDescription: 'Inorder traversal of a level-order tree array',
    difficulty: 'easy', category: 'Trees', points: 100, solved: 0, attempts: 0,
    statement: [
      'Input (stdin): a JSON array describing a binary tree in level order, using null for missing nodes.',
      'Print the inorder traversal (left, node, right) as a JSON array.',
    ],
    examples: [
      { input: '[1,null,2,3]', output: '[1,3,2]' },
      { input: '[]', output: '[]' },
      { input: '[1]', output: '[1]' },
    ],
    constraints: ['0 <= nodes <= 100'],
    defaultCode: starter(),
    solutionCode: "const raw = require('fs').readFileSync(0, 'utf8').trim()\nconst arr = raw ? JSON.parse(raw) : []\nconst out = []\nif (arr.length && arr[0] !== null) {\n  const root = { v: arr[0], l: null, r: null }\n  const q = [root]\n  let i = 1\n  while (q.length && i < arr.length) {\n    const node = q.shift()\n    const left = i < arr.length ? arr[i++] : null\n    const right = i < arr.length ? arr[i++] : null\n    if (left !== null) { node.l = { v: left, l: null, r: null }; q.push(node.l) }\n    if (right !== null) { node.r = { v: right, l: null, r: null }; q.push(node.r) }\n  }\n  const walk = (n) => { if (!n) return; walk(n.l); out.push(n.v); walk(n.r) }\n  walk(root)\n}\nconsole.log(JSON.stringify(out))\n",
  },
  {
    id: '6', title: 'Edit Distance', shortDescription: 'Minimum operations to turn one word into another',
    difficulty: 'hard', category: 'Dynamic Programming', points: 300, solved: 0, attempts: 0,
    statement: [
      'Input (stdin): line 1 is word1, line 2 is word2.',
      'Print the minimum number of single-character insertions, deletions or replacements needed.',
    ],
    examples: [
      { input: 'horse\nros', output: '3' },
      { input: 'intention\nexecution', output: '5' },
    ],
    constraints: ['0 <= word length <= 500', 'Words are lowercase English letters'],
    defaultCode: starter(),
    solutionCode: "const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split('\\n')\nconst prev = Array.from({ length: b.length + 1 }, (_, j) => j)\nfor (let i = 1; i <= a.length; i++) {\n  let diag = prev[0]\n  prev[0] = i\n  for (let j = 1; j <= b.length; j++) {\n    const tmp = prev[j]\n    prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))\n    diag = tmp\n  }\n}\nconsole.log(a.length === 0 ? b.length : a.length === 0 ? b.length : prev[b.length])\n",
  },
]

export const ARENA_CHALLENGES: ArenaChallenge[] = SEED_CHALLENGES

/**
 * Seed lookup ONLY (Mongo unreachable fallback). Runtime reads go through
 * `lib/arena/store.ts` — the list, detail page, AI adapt route, submit grader
 * and point awards must all see the same rows, including generated ones.
 */
export function getArenaChallenge(id: string): ArenaChallenge | undefined {
  return ARENA_CHALLENGES.find(c => c.id === id)
}
