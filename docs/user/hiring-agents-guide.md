# Hiring agents

**Where:** Admin → Hiring agents (`/dashboard/admin/hiring-agents`). Organisation admins see their own organisation; a superadmin picks one.

Four background agents draft work for your hiring team. They use the same tools as the AI copilot, so everything they draft is a **proposal**: nothing reaches a candidate, and nothing is saved, until an admin confirms it — unless an organisation admin switches on **auto-send** for that one step. Proposals appear at the top of the page ("Waiting for your confirmation") and in the AI copilot, and expire after 24 hours (the agent drafts them again on its next run if they are still needed).

| Agent | Runs | What it drafts | Default |
|---|---|---|---|
| Hiring sourcer | Nightly, from the run hour (UTC) | For each open job: best matches among learners who opted in to talent search → a shortlist of invites (`send_talent_invites`). Tracks invite replies and new applications; sources again with a slightly lower bar when the funnel stalls. | Off |
| Interview scheduler | Hourly | Interviews nobody booked (after *N* hours), no-shows and cancellations: free times from the whole panel's calendars, spread over different days → a slot offer to the candidate by email (with an unsubscribe link) and WhatsApp only if they agreed to it (`offer_interview_slots`). A time the candidate picked but that could not be booked → a booking (`schedule_interview`). Reminders after booking are the existing 24 h / 1 h interview reminders. | Off |
| Assessment author | Every 15 minutes, from its queue | Queue a job id or paste a job description. The agent picks skills, builds a draft test (question bank first, AI for the rest), checks skill coverage and the difficulty mix, dry-runs every question with a synthetic candidate (the answer key must score full marks, a wrong answer must not), replaces broken questions and fills gaps for up to *N* rounds, then proposes the test (`create_test`, saved unpublished). | Off |
| Integrity reviewer | Hourly, after the integrity sweep | A ranked review queue from trust scores, similar-code clusters and AI-written-code signals, with a neutral evidence summary per case, and proposals to hold a score (or release a hold once a reviewer cleared the attempt) (`set_integrity_hold`). Signals, never verdicts. | On (queue only; AI summaries off) |

## Who gets the proposals

The admin who last switched an agent on owns its scheduled proposals. Before every run that admin is checked again (active account, still an admin of the organisation); if not, the agent is switched off and the run log says why. "Run now" runs as you.

## Limits and AI spend

Each agent has a daily item cap (proposals + auto-sent steps) and a monthly AI cap (USD) per organisation. When the monthly cap or the platform AI budget (with hard stop) is reached, the agents keep working without AI: the sourcer and scheduler never use AI; the author falls back to approved bank questions only; the integrity reviewer uses its template summaries. Every AI call is recorded on Admin → AI usage under `hiring-agent-*`.

## Score holds

A held submission is skipped by score release (Admin → Assessments → Release scores, the copilot's `release_scores` and automatic release) until the hold is released. Candidates are not told about a hold. Holding is a pause for a human review, not a decision.

## Run log

Every run (scheduled or manual) is listed with its status, the items it drafted or auto-sent, notes for skipped items and its AI cost. Background job health is on Admin → Cron jobs (`hiring-agent-*`).

## Copilot

The hiring and assessments specialists can read agent status (`get_hiring_agents`) and draft the same steps on request ("invite these learners to the backend job", "offer Asha three interview times", "hold these two scores").
