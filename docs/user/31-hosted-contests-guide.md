> **Customer Documentation**
> **Last Updated**: 2026-10-23
> **Audience**: Everyone; organisers and platform admins

# Hosted Contests Guide

CodeSpectra hosts contests in ten formats at `/contests`. Each contest has its own page with the rules, schedule, prizes and leaderboard.

## Formats

| Format | What you do |
|--------|-------------|
| Theory-to-code sprint | Read a short concept brief (an algorithm, a protocol, a formula) and implement it; hidden tests decide the score |
| Reverse coding | Work out what a black box does from examples (and by running it), then write code that does the same |
| Debug-a-thon (bug bash) | Fix seeded buggy code; your score is the share of tests you turn green, minus a small time penalty |
| Capture the flag (CTF) | Solve security puzzles and submit the hidden flags; points drop as more teams solve a challenge |
| Datathon | Train a model and upload predictions; a public split ranks you live, a hidden private split decides the final board |
| Prompt-a-thon | Write a prompt; we run it on our model against hidden inputs and score the share it gets right |
| Ideathon / pitch | Pitch an idea with a short deck and a video; judges score it on the rubric |
| Code golf | Pass every test with the fewest characters |
| System design jam | Write up an architecture with a diagram; judges score it on the rubric |
| Open-source sprint | Contribute to the registered repositories; every merged pull request during the sprint earns points |

## Taking part

1. Open a contest and **register** — solo, or as a team (create a team and share its join code).
2. Before the start you see only the task titles and points; briefs, datasets and code open when the contest starts.
3. Submit during the contest. Coding formats let you run the sample tests first.
4. The leaderboard is live, shown after the end, or hidden, as the organiser chose. Results are final once the organiser **releases** them; certificates follow the contest's certificate rule.

### Prompt-a-thon runs

Each person has a limited number of runs per contest, and only one run can be in progress at a time. If the model does not answer some of the hidden cases (a time-out or provider hiccup), the run is **not scored and does not use up a run** — try again shortly. Prompts that try to change the model's rules or pull hidden data are refused.

## For organisers

Platform admins and organisation admins create contests in **Admin → Contests**: pick a format, fill in the tasks (hidden tests, flags and labels are stored separately and never sent to participants), set the schedule, team rules, leaderboard and certificates, then **publish**. Judged formats (ideathon, system design jam) use the rubric and assigned judges. The AI copilot can draft, publish and release contest results for you to confirm, and can find contests by description.
