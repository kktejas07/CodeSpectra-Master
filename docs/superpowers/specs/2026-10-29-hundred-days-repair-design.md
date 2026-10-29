# 100 Days — ungradeable problems: repair spec

> **Auto-Generated**: Internal Engineering documentation.

- Date: 2026-10-29
- Status: proposed (awaiting review)
- Scope: 11 problems across 7 days of `lib/100-days-data.ts`
- Blocked by: nothing (arena's stdin/stdout contract landed in #400; 100-Days already uses the same contract)

## 1. What was measured

`HUNDRED_DAYS` = 100 days / 302 problems. Scanning every problem for
gradeability (`scripts`-style scan, 2026-10-29) flags **11 problems across 7
days**. The rest are fine — the per-language starters read stdin and print
stdout, so the contract itself is sound.

| Day | Problem | Why it cannot pass |
|---|---|---|
| 21 | `d21p3` Find Median from Data Stream | flagged by the prose heuristic only — **verify, probably fine** (it is algorithmic) |
| 86 | `d86p1` URL Shortener Encoding | expected output is a placeholder (`abc123`, `example.com/very/long/url`) |
| 86 | `d86p2` URL Shortener with Analytics | same placeholder outputs |
| 88 | `d88p1` Chat Message Ordering | asks for a design description; graded by exact stdout |
| 96 | `d96p1` REST API Route Handler | asks for route-handler design; no deterministic stdout |
| 98 | `d98p1` JWT Token Generation | expected output is a literal fake token (`eyJ...signature`); real HMAC output can never match |
| 98 | `d98p2` Password Hashing | expected output is `a1b2c3d4e5f6` — a placeholder |
| 99 | `d99p1` Todo App Backend API | design prompt; not gradeable by stdout |
| 100 | `d100p1` Build a Mini Search Engine | design prompt, `constraints: N/A` |
| 100 | `d100p2` Design a Distributed System | design prompt, `constraints: N/A` |
| 100 | `d100p3` Algorithm Visualization Dashboard | design prompt, `constraints: N/A` |

A learner cannot pass any of these no matter how correct their code is: the
expected stdout is either invented or describes prose.

## 2. Principle for the repair

Keep the learning objective, make the output deterministic. Each flagged
problem becomes a **CLI simulation of the same concept** — the thing a
stdout-grader can score — rather than a design essay:

| Now | Becomes |
|---|---|
| URL shortener (86) | Given `encode <url>` / `decode <key>` / `analytics <key>` commands, print the key (deterministic base-36 of a rolling counter), the URL, or the count |
| Chat message ordering (88) | Given messages with `(timestamp, node)` pairs, print a total order using a Lamport-clock rule and ties broken by node id |
| REST route handler (96) | Given `METHOD /path` lines, print the status code a correct router returns (`200/201/404/405`) from a stated route table |
| JWT (98) | Drop HMAC (not reproducible across languages) → given claims and a secret, print `base64url(header).base64url(payload).<checksum>` where checksum is a **stated, simple** function (e.g. sum of bytes mod 1000) |
| Password hashing (98) | Given `password` and `salt`, print the stated deterministic digest (e.g. repeated FNV-1a over `salt + password`, hex) — teaches salting without pretending to be PBKDF2 |
| Todo API (99) | Given `add <text>`, `complete <id>`, `list`, print the resulting state |
| Mini search engine (100) | Given documents and queries, print ranked ids (term frequency, ties by id) |
| Distributed key-value store (100) | Given `put/get` commands against a 3-node ring, print the node that owns each key (`hash(key) % 3`) and the value |
| Algorithm visualisation (100) | Given an array, print the sequence of comparisons/swaps of insertion sort — deterministic and self-checking |

Day 21's median problem is verified as-is and left alone unless the scan's
heuristic was right.

## 3. Verification

Same pattern that caught real bugs twice already (`tests/arena-seed-cases.test.ts`):

- A **test-only** reference solution per repaired problem (not shipped — keeps
  answers out of the browser bundle) executed against every example.
- The test fails if an example's expected stdout drifts from what a correct
  implementation prints.
- A scan assertion in the same test: no problem in `HUNDRED_DAYS` may carry a
  placeholder-shaped output, `constraints: 'N/A'`, or an empty input.

## 4. Non-goals

- Not moving `HUNDRED_DAYS` into Mongo (bundle size / daily updates) — separate
  change, tracked by the practice-content spec §5.
- Not touching the other 291 problems.
- Not changing the 100-day structure, themes, or language starters.

## 5. Risk

Changing a day's problem changes what a learner is asked to do. The proposals
preserve the theme but replace "design and describe" with "implement this
deterministic simulation". If a day's design discussion is the point, the
alternative is marking it review-only rather than graded — that needs a product
decision, not a code change.
