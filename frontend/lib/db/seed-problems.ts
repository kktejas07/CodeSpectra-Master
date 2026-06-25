/**
 * Default seed problems for the HackerRank-style arena.
 * Inserted on first call to /api/problems if the collection is empty.
 */
import type { ProblemDoc } from '@/lib/db/problems'

export const SEED_PROBLEMS: Omit<ProblemDoc, 'created_at' | 'updated_at'>[] = [
  {
    id: 'p_two_sum',
    slug: 'two-sum',
    title: 'Two Sum',
    difficulty: 'easy',
    topics: ['Array', 'Hash Map'],
    statement_md: `Given an array of integers \`nums\` and an integer \`target\`, return *the indices* of the two numbers that add up to \`target\`.

You may assume that each input has **exactly one solution**, and you may not use the same element twice.

You can return the answer in any order.`,
    input_format:
      'Line 1: integer n.\nLine 2: n space-separated integers (the array).\nLine 3: integer target.',
    output_format: 'Print two space-separated indices (0-based), in any order.',
    constraints: '2 ≤ n ≤ 10^4\n-10^9 ≤ nums[i] ≤ 10^9',
    example_explanation:
      'For nums = [2,7,11,15] and target = 9, nums[0] + nums[1] = 9, so the answer is `0 1`.',
    test_cases: [
      {
        id: 't1',
        stdin: '4\n2 7 11 15\n9',
        expected_stdout: '0 1',
        is_sample: true,
        weight: 1,
      },
      {
        id: 't2',
        stdin: '3\n3 2 4\n6',
        expected_stdout: '1 2',
        is_sample: true,
        weight: 1,
      },
      { id: 't3', stdin: '2\n3 3\n6', expected_stdout: '0 1', is_sample: false, weight: 1 },
      {
        id: 't4',
        stdin: '5\n-1 -2 -3 -4 -5\n-8',
        expected_stdout: '2 4',
        is_sample: false,
        weight: 2,
      },
    ],
    starter_code: {
      python: `def solve():
    n = int(input())
    nums = list(map(int, input().split()))
    target = int(input())
    # TODO: return the two indices that sum to target
    seen = {}
    for i, v in enumerate(nums):
        if target - v in seen:
            print(seen[target - v], i)
            return
        seen[v] = i

solve()
`,
      javascript: `const lines = require('fs').readFileSync('/dev/stdin', 'utf8').split('\\n');
const n = +lines[0];
const nums = lines[1].split(' ').map(Number);
const target = +lines[2];
const seen = new Map();
for (let i = 0; i < n; i++) {
  if (seen.has(target - nums[i])) {
    console.log(seen.get(target - nums[i]), i);
    process.exit(0);
  }
  seen.set(nums[i], i);
}
`,
      cpp: `#include <bits/stdc++.h>
using namespace std;
int main() {
    int n; cin >> n;
    vector<int> a(n); for (auto& x : a) cin >> x;
    long long target; cin >> target;
    unordered_map<long long, int> seen;
    for (int i = 0; i < n; i++) {
        auto it = seen.find(target - a[i]);
        if (it != seen.end()) { cout << it->second << " " << i; return 0; }
        seen[a[i]] = i;
    }
    return 0;
}
`,
    },
    time_limit_ms: 2000,
    memory_limit_kb: 65536,
    is_published: true,
    created_by: null,
  },
  {
    id: 'p_fizzbuzz',
    slug: 'fizzbuzz',
    title: 'FizzBuzz',
    difficulty: 'easy',
    topics: ['Loops', 'Conditionals'],
    statement_md: `Print numbers from 1 to **n**, but:
- Multiples of 3 → \`Fizz\`
- Multiples of 5 → \`Buzz\`
- Multiples of both → \`FizzBuzz\`

One number per line.`,
    input_format: 'A single integer n.',
    output_format: 'n lines following the FizzBuzz rule.',
    constraints: '1 ≤ n ≤ 100',
    example_explanation: 'For n=5 → `1`, `2`, `Fizz`, `4`, `Buzz`',
    test_cases: [
      { id: 't1', stdin: '5', expected_stdout: '1\n2\nFizz\n4\nBuzz', is_sample: true, weight: 1 },
      {
        id: 't2',
        stdin: '15',
        expected_stdout: '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz',
        is_sample: false,
        weight: 2,
      },
    ],
    starter_code: {
      python: `n = int(input())
for i in range(1, n + 1):
    if i % 15 == 0: print("FizzBuzz")
    elif i % 3 == 0: print("Fizz")
    elif i % 5 == 0: print("Buzz")
    else: print(i)
`,
      javascript: `const n = +require('fs').readFileSync('/dev/stdin','utf8').trim();
for (let i = 1; i <= n; i++) {
  if (i % 15 === 0) console.log("FizzBuzz");
  else if (i % 3 === 0) console.log("Fizz");
  else if (i % 5 === 0) console.log("Buzz");
  else console.log(i);
}
`,
    },
    time_limit_ms: 1000,
    memory_limit_kb: 32768,
    is_published: true,
    created_by: null,
  },
  {
    id: 'p_palindrome',
    slug: 'palindrome-check',
    title: 'Palindrome Check',
    difficulty: 'medium',
    topics: ['Strings', 'Two Pointers'],
    statement_md: `Read a string and print \`YES\` if it is a palindrome (case-insensitive, ignoring non-alphanumeric chars), otherwise \`NO\`.`,
    input_format: 'A single line containing the input string.',
    output_format: 'YES or NO',
    constraints: 'Length up to 10^5 characters.',
    example_explanation:
      '"A man, a plan, a canal: Panama" → YES (palindrome ignoring case + punctuation).',
    test_cases: [
      {
        id: 't1',
        stdin: 'A man, a plan, a canal: Panama',
        expected_stdout: 'YES',
        is_sample: true,
        weight: 1,
      },
      { id: 't2', stdin: 'race a car', expected_stdout: 'NO', is_sample: true, weight: 1 },
      { id: 't3', stdin: ' ', expected_stdout: 'YES', is_sample: false, weight: 1 },
      { id: 't4', stdin: 'No lemon, no melon', expected_stdout: 'YES', is_sample: false, weight: 2 },
    ],
    starter_code: {
      python: `import sys, re
s = re.sub(r'[^a-z0-9]', '', sys.stdin.read().lower())
print("YES" if s == s[::-1] else "NO")
`,
      javascript: `const raw = require('fs').readFileSync('/dev/stdin','utf8');
const s = raw.toLowerCase().replace(/[^a-z0-9]/g,'');
console.log(s === [...s].reverse().join('') ? "YES" : "NO");
`,
    },
    time_limit_ms: 2000,
    memory_limit_kb: 65536,
    is_published: true,
    created_by: null,
  },
]
