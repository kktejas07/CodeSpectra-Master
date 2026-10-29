/**
 * Repairs for 100-Days problems that could never be passed.
 *
 * Measured 2026-10-29: 11 problems across 7 days were ungradeable — either the
 * expected output was a placeholder (`eyJ...signature`, `a1b2c3d4e5f6`,
 * `abc123`) or the task was a design essay graded by exact stdout.
 *
 * Each replacement keeps the day's theme but states a deterministic CLI
 * simulation: commands in, exact stdout out. `tests/hundred-days-repairs.test.ts`
 * holds a reference solution per entry and proves every example matches, so an
 * expected output can never drift again. Solutions are deliberately NOT here —
 * this file ships to the browser.
 *
 * See docs/superpowers/specs/2026-10-29-hundred-days-repair-design.md.
 */
import type { HundredDayProblem } from './100-days-data'

type Repair = Omit<HundredDayProblem, 'starterCode'>

export const HUNDRED_DAYS_REPAIRS: Repair[] = [
  {
    id: 'd86p1',
    title: 'URL Shortener Encoding',
    difficulty: 'medium',
    description: 'Simulate a URL shortener. Keys are the base-36 form of an incrementing counter starting at 1 (1, 2, … 9, a, b, …). Read N commands, each `encode <url>` or `decode <key>`, and print the result of each.',
    inputFormat: 'First line: N. Next N lines: `encode <url>` or `decode <key>`.',
    outputFormat: 'For encode, print the assigned key. For decode, print the original URL, or NOT_FOUND.',
    constraints: '1 <= N <= 1000',
    examples: [
      { input: '4\nencode https://a.example/x\ndecode 1\nencode https://b.example/y\ndecode zz', output: '1\nhttps://a.example/x\n2\nNOT_FOUND' },
      { input: '2\nencode https://c.example\ndecode 1', output: '1\nhttps://c.example' },
    ],
  },
  {
    id: 'd86p2',
    title: 'URL Shortener with Analytics',
    difficulty: 'medium',
    description: 'Extend the shortener with click counts. Commands are `encode <url>`, `decode <key>` and `analytics <key>`. A decode increments that key\'s counter; analytics prints it.',
    inputFormat: 'First line: N. Next N lines: `encode <url>`, `decode <key>` or `analytics <key>`.',
    outputFormat: 'encode: the key. decode: the URL or NOT_FOUND. analytics: the integer count (0 if unused) or NOT_FOUND for an unknown key.',
    constraints: '1 <= N <= 1000',
    examples: [
      { input: '5\nencode https://a.example\ndecode 1\ndecode 1\nanalytics 1\nanalytics 9', output: '1\nhttps://a.example\nhttps://a.example\n2\nNOT_FOUND' },
    ],
  },
  {
    id: 'd88p1',
    title: 'Chat Message Ordering',
    difficulty: 'medium',
    description: 'Order messages from several servers deterministically. Each message is `timestamp node` (both integers). Sort by timestamp, breaking ties by node id ascending, and print the node ids in that order.',
    inputFormat: 'First line: N. Next N lines: `<timestamp> <node>`.',
    outputFormat: 'One line with the node ids in delivery order, space separated.',
    constraints: '1 <= N <= 10^4; timestamps and node ids fit in 32 bits.',
    examples: [
      { input: '4\n5 2\n3 1\n5 1\n1 7', output: '7 1 1 2' },
      { input: '3\n2 9\n2 1\n2 5', output: '1 5 9' },
    ],
  },
  {
    id: 'd96p1',
    title: 'REST API Route Handler',
    difficulty: 'medium',
    description: 'Implement a router for the item resource. Rules: `POST /items` -> 201, `GET /items` -> 200, `GET /items/<id>` -> 200, `DELETE /items/<id>` -> 204, any other method on a known path -> 405, unknown path -> 404.',
    inputFormat: 'First line: N. Next N lines: `<METHOD> <path>`.',
    outputFormat: 'One status code per request.',
    constraints: '1 <= N <= 1000; methods are GET, POST, DELETE, PUT or PATCH.',
    examples: [
      { input: '5\nGET /items\nPOST /items\nGET /items/7\nPUT /items\nGET /nope', output: '200\n201\n200\n405\n404' },
      { input: '2\nDELETE /items/3\nPATCH /items/3', output: '204\n405' },
    ],
  },
  {
    id: 'd98p1',
    title: 'Token Signing (JWT-style)',
    difficulty: 'medium',
    description: 'Build a signed token without a crypto library so it works in every language. Output `<payload>.<signature>`, where signature is the sum of the character codes of payload concatenated with the secret, modulo 1000.',
    inputFormat: 'Line 1: payload text. Line 2: secret.',
    outputFormat: '`<payload>.<signature>`',
    constraints: '1 <= payload length <= 200; secret length >= 1.',
    examples: [
      { input: 'user=alice\ns3cret', output: 'user=alice.614' },
      { input: 'role=admin\nkey', output: 'role=admin.345' },
    ],
  },
  {
    id: 'd98p2',
    title: 'Password Hashing with Salt',
    difficulty: 'medium',
    description: 'Implement the FNV-1a 32-bit hash over `salt + password` (salt first) and print it as 8 lowercase hex digits, zero-padded. The stated algorithm makes the digest reproducible in any language.',
    inputFormat: 'Line 1: password. Line 2: salt.',
    outputFormat: '8 lowercase hex characters.',
    constraints: '1 <= password length <= 100; 1 <= salt length <= 50.',
    examples: [
      { input: 'hunter2\ns4lt', output: '0b050d66' },
      { input: 'correct horse\nabc', output: '77bd5886' },
    ],
  },
  {
    id: 'd99p1',
    title: 'Todo API (CLI simulation)',
    difficulty: 'medium',
    description: 'Simulate a todo service. `add <text>` creates the next id (starting at 1) and prints it; `complete <id>` marks it done and prints OK, or MISSING; `list` prints each item as `<id>:<done|open>:<text>` in creation order.',
    inputFormat: 'First line: N. Next N lines: `add <text>`, `complete <id>` or `list`.',
    outputFormat: 'add: the new id. complete: OK or MISSING. list: one line per item.',
    constraints: '1 <= N <= 1000; text has no spaces (single token).',
    examples: [
      { input: '5\nadd milk\nadd bread\ncomplete 1\nlist\ncomplete 9', output: '1\n2\nOK\n1:done:milk\n2:open:bread\nMISSING' },
    ],
  },
  {
    id: 'd100p1',
    title: 'Mini Search Engine Ranking',
    difficulty: 'hard',
    description: 'Rank documents by how often the query term occurs. Documents are numbered from 1 in input order; a term matches case-insensitively as a whole word. Print matching ids by count descending, ties by id ascending, or `-` when nothing matches.',
    inputFormat: 'Line 1: D. Next D lines: one document each. Then a line with Q. Next Q lines: one query term each.',
    outputFormat: 'One line per query: space separated document ids, or -.',
    constraints: '1 <= D <= 100; 1 <= Q <= 50.',
    examples: [
      { input: '3\nthe cat sat\ncat and dog\na dog\n2\ncat\ndog', output: '1 2\n2 3' },
      { input: '2\nhello world\ngoodbye\n1\nmissing', output: '-' },
    ],
  },
  {
    id: 'd100p2',
    title: 'Distributed Key-Value Ring',
    difficulty: 'hard',
    description: 'Route keys across a 3-node ring. The owning node is `(sum of the key\'s character codes) % 3`. `put <key> <value>` stores on that node and prints `node<N>`; `get <key>` prints the value or MISSING.',
    inputFormat: 'First line: N. Next N lines: `put <key> <value>` or `get <key>`.',
    outputFormat: 'put: node<N>. get: the value or MISSING.',
    constraints: '1 <= N <= 1000; keys and values are single tokens.',
    examples: [
      { input: '4\nput alpha one\nget alpha\nget beta\nput a x', output: 'node2\none\nMISSING\nnode1' },
    ],
  },
  {
    id: 'd100p3',
    title: 'Algorithm Trace (Insertion Sort)',
    difficulty: 'hard',
    description: 'Print an insertion sort trace: after each pass, print the array. A pass inserts the next element into the sorted prefix. Print the final array on the last line.',
    inputFormat: 'Line 1: n. Line 2: n space separated integers.',
    outputFormat: 'One line per pass (n-1 lines for n>1), integers space separated.',
    constraints: '1 <= n <= 100; values fit in 32 bits.',
    examples: [
      { input: '5\n5 2 4 1 3', output: '2 5 4 1 3\n2 4 5 1 3\n1 2 4 5 3\n1 2 3 4 5' },
      { input: '3\n1 2 3', output: '1 2 3\n1 2 3' },
    ],
  },
]
