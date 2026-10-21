/**
 * Built-in coding problems for the live-coding round (pure). Used only when
 * the question bank has no approved coding item with sample cases at the
 * level. Every case is stdin → stdout, checked by hand.
 */
import type { PlannedQuestion } from './types'

type Builtin = Omit<PlannedQuestion, 'id'> & { difficulty: 'Easy' | 'Medium' | 'Hard' }

export const BUILTIN_PROBLEMS: Builtin[] = [
  {
    difficulty: 'Easy', kind: 'code', topic: 'Strings',
    text: 'Read a line of words separated by single spaces and print the words in reverse order, separated by single spaces.',
    expected_points: ['Split on spaces', 'Reverse the list', 'O(n) time'],
    test_cases: [{ input: 'the sky is blue', output: 'blue is sky the' }, { input: 'hello world', output: 'world hello' }],
  },
  {
    difficulty: 'Easy', kind: 'code', topic: 'Stacks',
    text: 'Read a string of brackets ()[]{} and print true if every bracket is closed in the right order, otherwise false.',
    expected_points: ['Use a stack', 'Match closing to the latest opening', 'Empty stack at the end'],
    test_cases: [{ input: '()[]{}', output: 'true' }, { input: '(]', output: 'false' }, { input: '{[()]}', output: 'true' }],
  },
  {
    difficulty: 'Easy', kind: 'code', topic: 'Hashing',
    text: 'First line n, second line n integers, third line a target. Print the 0-based indices i j (i < j) of the two numbers that add up to the target. Exactly one answer exists.',
    expected_points: ['Hash map of value → index', 'Single pass', 'O(n) time, O(n) space'],
    test_cases: [{ input: '4\n2 7 11 15\n9', output: '0 1' }, { input: '3\n3 2 4\n6', output: '1 2' }],
  },
  {
    difficulty: 'Medium', kind: 'code', topic: 'Dynamic programming',
    text: 'First line n, second line n integers (some negative). Print the largest sum of a non-empty contiguous subarray.',
    expected_points: ["Kadane's algorithm", 'Handle all-negative input', 'O(n) time, O(1) space'],
    test_cases: [{ input: '9\n-2 1 -3 4 -1 2 1 -5 4', output: '6' }, { input: '3\n-3 -1 -2', output: '-1' }],
  },
  {
    difficulty: 'Medium', kind: 'code', topic: 'Sliding window',
    text: 'Read a string and print the length of its longest substring without repeating characters.',
    expected_points: ['Sliding window with last-seen positions', 'Move the left edge past repeats', 'O(n) time'],
    test_cases: [{ input: 'abcabcbb', output: '3' }, { input: 'bbbbb', output: '1' }, { input: 'pwwkew', output: '3' }],
  },
  {
    difficulty: 'Hard', kind: 'code', topic: 'Intervals',
    text: 'First line n, then n lines "start end". Merge all overlapping intervals and print them sorted by start, one "start end" per line.',
    expected_points: ['Sort by start', 'Extend the current interval while overlapping', 'O(n log n) time'],
    test_cases: [{ input: '4\n1 3\n2 6\n8 10\n15 18', output: '1 6\n8 10\n15 18' }, { input: '2\n1 4\n4 5', output: '1 5' }],
  },
  {
    difficulty: 'Hard', kind: 'code', topic: 'Heaps',
    text: 'First line n and k, second line n integers. Print the k most frequent values, most frequent first (ties: smaller value first), separated by spaces.',
    expected_points: ['Count with a hash map', 'Heap or bucket sort for top k', 'State the tie rule'],
    test_cases: [{ input: '6 2\n1 1 1 2 2 3', output: '1 2' }, { input: '5 1\n4 4 5 5 6', output: '4' }],
  },
]

/** Pick `count` built-in problems for a difficulty (falls back to neighbours), stable by seed. */
export function pickBuiltinProblems(difficulty: 'Easy' | 'Medium' | 'Hard', count: number, seed: number): Builtin[] {
  const order = difficulty === 'Hard' ? ['Hard', 'Medium', 'Easy'] : difficulty === 'Medium' ? ['Medium', 'Easy', 'Hard'] : ['Easy', 'Medium', 'Hard']
  const pool = order.flatMap((d) => {
    const items = BUILTIN_PROBLEMS.filter((p) => p.difficulty === d)
    const s = Math.abs(seed) % Math.max(1, items.length)
    return [...items.slice(s), ...items.slice(0, s)]
  })
  return pool.slice(0, Math.max(0, count))
}
