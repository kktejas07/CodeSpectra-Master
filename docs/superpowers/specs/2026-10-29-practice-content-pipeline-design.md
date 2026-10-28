# Practice Content Pipeline — Arena, Problems, Challenges, Tracks, 100 Days

> **Auto-Generated**: Internal Engineering documentation.

- Date: 2026-10-29
- Status: proposed (awaiting user review)
- Approach: A — one generator lib + backfill CLI + daily scheduler job (approved)
- Decisions: pools grow daily; curriculums filled once; auto-publish only execution-verified items; tracks stay at 9 and get filled

## 1. Goal

Every practice area serves real, solvable content instead of hardcoded seeds:

- Arena, Problems, Challenges each hold **100+ real items**, auto-published only when their hidden tests provably pass.
- Each grows by **one new item per day** without a human in the loop.
- Tracks stop being topic presets: 9 tracks × 12 learn posts × 20 linked problems.
- 100 Days becomes gradeable end to end (days 79–100 currently cannot pass).
- Zero hand-written mock content left in the shipped app.

## 2. Non-goals

- Study Plan: already generated from `question_bank` (17,184 rows). No new content; it only gains the learn posts it was missing.
- No new track catalog, no renames, no UI redesign.
- No change to exam (`exams`/`assessments`) question flow or to `question_bank` rows.
- No scraping of third-party problem sets; all generated content is original.

## 3. Current state (verified against prod, 2026-10-28)

| Area | Collection | Rows | Verdict |
|---|---|---|---|
| Arena | `arena_challenges` | 6 | 6 hardcoded seeds; `solved`/`attempts` invented |
| Problems | `problems` | 22 | LeetCode clones from source seeds |
| Challenges | `challenges` | 6 | Hardcoded; detail page 404s for all of them |
| Tracks | `tracks` | 9 | Topic presets, no curriculum |
| 100 Days | `user_100days_progress` | 1 | Content lives in the client bundle, not Mongo |
| Study Plan | `study_plans` | 2 | ✅ real, generated |
| (feeds Study Plan) | `question_bank` | 17,184 | ✅ real |
| (feeds Tracks) | `learn_posts` | 0 | ❌ empty |

Evidence for the defects:

- `frontend/app/dashboard/arena/[id]/page.tsx:90` reads `getArenaChallenge()` from `lib/arena-challenges.ts`, not the API — rows added to Mongo cannot render.
- `frontend/lib/arena-challenges.ts:18` `ARENA_CHALLENGE_ORDER = ['1'..'6']` caps navigation at 6.
- `frontend/app/api/challenges/route.ts:20-41` seeds `duration_minutes`/`success_rate`; `app/dashboard/challenges/page.tsx:164-165` renders `duration`/`successRate` → `undefined min`.
- `frontend/app/api/challenges/[id]/route.ts:18-22` looks up `_id`/`slug`; seeds have neither → every detail page 404s.
- `frontend/lib/100-days-data.ts` is 865 lines bundled into the client; days 79–100 have placeholder expected outputs (`eyJ...signature`, `a1b2c3d4e5f6`) graded by exact stdout in `app/api/arena/run/route.ts:124-126` — they can never pass.
- `frontend/scripts/seed-all.ts` duplicates the arena/challenge/track seeders with incompatible shapes; whichever runs first wins.

The `learn` scheduler job has run 5,304 times with `last_status: ok` while `learn_posts` is 0 — the generator ticks; its topic queue is empty.

## 4. Architecture

Three thin layers on top of machinery that already exists:

```
backfill CLI (one-off)  ─┐
                         ├─→ generatePracticeItem(kind, opts)
daily scheduler job     ─┘        │
                                  ├─ build prompt        (lib/question-gen-prompt.ts, lib/courses/* patterns)
                                  ├─ provider fallback   (lib/ai/backend.ts → FastAPI)
                                  ├─ normalize + dedupe  (fingerprint)
                                  ├─ execution gate      (Piston, verifyGeneratedProblem)
                                  └─ insert              (published | draft)
```

- **One function** serves both the backfill and the daily job. No second code path to drift.
- **Reused, not rebuilt:** `generateCodingProblem` / `verifyGeneratedProblem` (`lib/services/problems.ts`), `generateBankQuestions` (`lib/question-bank-generate.ts`), `lib/question-bot/quality.ts`, `lib/learn/generate.ts`, `withCronWindow` (`lib/automation/job-lease.ts`), `withCronHeartbeat`, `aiBudgetBlocks` (`lib/ai/usage-record`).
- **New files only:** `lib/practice-content/generate.ts`, `scripts/backfill-practice-content.ts`, `app/api/cron/practice-daily/route.ts`, plus one entry in `lib/automation/job-registry.ts`.

## 5. Content model

| Area | Collection | Grows | Backfill target | Publish rule |
|---|---|---|---|---|
| Arena | `arena_challenges` | +1/day | 6 → 100 | execution-verified |
| Problems | `problems` | +1/day | 22 → 100 | execution-verified |
| Challenges | `challenges` | +1/day | 6 → 100 | draft → admin |
| Tracks | `tracks` + `learn_posts` | no | 9 × (12 posts + 20 problems) | draft → admin |
| 100 Days | new `hundred_days` | no | repair 22 days (79–100) | execution-verified |

Coding items keep the existing shape: `starter_code`, `test_cases[]` (≥6: 2 sample + 4 hidden), `solution_code`, `constraints`, `topics[]`.

## 6. Publish gate

```
candidate → normalize → fingerprint dedupe
   → Piston runs solution_code against ALL hidden tests
        pass  → published: true          (Arena, Problems, 100 Days)
        fail  → reject + log reason, next candidate
non-executable (Challenges, learn posts) → review_status: 'draft'
```

A candidate is retried at most 3 times before the run records a failure; the run never inserts an unverified coding item into a published state. Rejected candidates are logged with their failure reason so a human can see why a slot is empty.

## 7. Cadence

- New job in `lib/automation/job-registry.ts`: `practice-daily`, `everyMinutes: 1440`.
- Body wrapped in `withCronWindow` (single-flight lease, so replicas cannot double-generate) and `withCronHeartbeat` (visible in `/api/admin/cron-jobs`).
- Generates 3 items per run: one arena, one problem, one challenge. Cost per run is a few LLM calls; `aiBudgetBlocks` aborts the run when the platform budget is exhausted rather than overspending.
- Also reachable manually at `POST /api/cron/practice-daily` (`isCronAuthorized`).
- Track curriculum backfill is **not** part of the daily job — it runs once.

## 8. Correctness fixes (must land before content)

**Arena**
- Detail page reads a **new** `GET /api/arena/challenges/[id]` (no such route exists today — only list/adapt/run); delete `ARENA_CHALLENGE_ORDER` capping.
- `solved`/`attempts` computed from `arena_submissions`; remove the invented numbers from `lib/arena-challenges.ts`.
- Detail lookup must accept the seeded row shape (by `id` or `slug`).

**Challenges**
- One schema: `slug`, `duration_minutes`, `success_rate`, `problem_ref?`. Migrate the 6 existing docs in place.
- Fix list rendering (`duration`/`successRate` vs the stored names).
- Fix `api/challenges/[id]` to resolve by `slug`; detail page stops calling `/api/problems/${challengeId}`.

**100 Days**
- Move `HUNDRED_DAYS` out of the client bundle into a `hundred_days` collection, read server-side.
- Replace days 79–100 with gradeable problems (real tests, real expected stdout).
- Content is served by API so daily-repaired days need no deploy.

**Seeders**
- Delete the duplicate arena/challenge/track seeds in `scripts/seed-all.ts`; a single seeder remains per collection.

## 9. Backfill

`frontend/scripts/backfill-practice-content.ts`

- Flags: `--only=arena|problems|challenges|tracks|days`, `--count=N`, `--dry-run`.
- Resumable and idempotent: skips any fingerprint already present, so a re-run tops up instead of duplicating.
- Prints `n/target` per area and exits non-zero if the target is unreachable (so a partial run is visible, never silent).
- Runs against the same Mongo + provider env as the app.

## 10. Testing and acceptance

- **Gate test (new):** a candidate whose hidden tests fail is rejected, not published — proven red by feeding a known-bad solution, green with a correct one.
- **Audit script:** every published coding item has ≥6 test cases that all pass, no duplicate titles/fingerprints, `arena_challenges` ≥ 100, `problems` ≥ 100, `challenges` ≥ 100, every track ≥12 learn posts, no `undefined` duration in any rendered list, zero rows with placeholder expected output.
- **Scheduler test:** a second concurrent run is refused by the lease.
- Existing suite stays green (`sh scripts/pre-push-gate.sh`).

## 11. Phasing

1. **Arena** — §8 Arena fixes, backfill to 100, daily job live. Unblocks the reported complaint.
2. **Challenges + Problems** — schema fixes/migration, backfill to 100.
3. **Tracks + 100 Days** — learn topic queue fix, 108 posts, 22 repaired days, remove the bundle payload.

Each phase ships independently behind its own PR; none depends on a later phase.

## 12. Risks

| Risk | Mitigation |
|---|---|
| LLM provider keys die silently (history: course-worker, course-gen) | Existing fallback chain; run fails loudly with the last provider error; no partial publish |
| Piston down → gate cannot verify | Fail closed (nothing publishes); Piston has 2 months uptime; healthcheck already exists |
| Duplicate/near-duplicate content at 100+ scale | Fingerprint dedupe + title-collision repair, same as `question_bank` |
| Scheduler stalls unnoticed (`cron_runs` staleness has no alert) | Daily job writes heartbeat; add a staleness check to `/api/admin/cron-jobs` display |
| Cost runaway | `aiBudgetBlocks` + per-run item cap (3/day, 3 retries) |
| 100 Days content change alters user progress semantics | Progress keyed by day + problem id; ids preserved through the repair |

## 13. Open questions

- Should repaired 100-Days rows keep their existing problem ids (preserves user progress) even where the problem itself changes? **Default: yes, keep ids.**
- **No admin review surface exists for `challenges` today.** `/dashboard/admin/question-bank` reviews `question_bank` (has `review_status`); `/dashboard/admin/sme-review` reviews `/api/admin/sme-reviews` — neither reads `challenges`. Options: (a) add `review_status` + an approve action to the existing question-bank review page pattern, (b) auto-publish challenges that pass a structural validator (title, ≥3 sections, duration), (c) build a dedicated review page. **Recommendation: (a)** — smallest surface, one new column + one action, and it keeps your "human approves non-executable content" rule.
