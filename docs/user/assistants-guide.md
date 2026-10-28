# Assistants: support chat, org onboarding, placement officer, mentor matching, revenue and renewals

Five assistants built on the AI copilot (same tools, permissions, proposals and audit). A superadmin
switches each one on or off in **Admin → Assistants**, sets its caps and reads its run log.
Anything that would message people or change money is a **proposal** you confirm in **Admin → AI copilot**.

| Assistant | Who uses it | Where | Default |
|---|---|---|---|
| Support assistant | Learners and company users | Support (`/dashboard/support`) | **Off** (spends AI) |
| Org onboarding | New company / college admins | Get set up (`/dashboard/admin/onboarding`) | On (checklist); nudge e-mails off |
| Placement officer assistant | College placement teams | AI copilot | On (copilot tools); weekly report e-mail off |
| Mentor matching | Learners | Study plan → "Mentors who can help" | On (suggestions); follow-ups off |
| Revenue and renewals | Superadmin | AI copilot (daily proposals) | On (proposals only — nothing is sent until confirmed) |

## Support assistant

Ask in plain words ("why can't I see my score?", "when does my plan renew?"). It answers from the
help centre and **your own** records only: your plan and credits, your test submissions and open
invites, your tickets, your study plan, your marketplace orders and — for organisation admins —
your organisation's plan usage. It has no way to look up another person and cannot change anything.

- **Create a ticket from this** turns the question (and the answer) into a support ticket in your name.
- When AI is off or a cap is reached it still works: you get the matching help articles and your own facts.
- Limits: 6 questions a minute, a daily number per person (default 30), a platform-wide daily AI cap
  (default 300) and a monthly AI cost cap (default $5); the platform AI budget hard stop also applies
  (feature `assistant-support`).
- Questions are logged without your name or e-mail (a one-way reference only).

## Org onboarding

A checklist of setup steps for your organisation:
companies — profile and hiring settings, team, first test, first invite, first job, connected apps;
colleges — college profile (departments and batches), team, students, first placement drive, first test, connected apps.
Each open step links to its page; steps the copilot can draft (a test, an invite, a job) have **Ask the copilot**,
which opens the copilot with the request — you review the proposal there. With **Send messages** on, admins of
organisations younger than 60 days get one in-app + e-mail nudge per open step every few days (default 3);
**Hide reminders** stops them for your organisation.

## Placement officer assistant (copilot)

In the AI copilot, college admins can ask for: the weekly placement report, batch readiness, **students to nudge**
(joined students with no practice or readiness under 40, skipping anyone nudged in the last 7 days), a **drive
shortlist** (drive company test 60 % + readiness 40 %) and **company practice tests** to assign.
`nudge_students` and `assign_company_practice` are proposals; students get an in-app message and an e-mail in their
language (their notification settings apply). With **Send messages** on, every Monday the college admins get the
weekly report and a copilot conversation with a ready "nudge these students" proposal.

## Mentor matching

On the study plan, up to three mentors are suggested from your focus areas, your target company, your interface
language and time zone, and their rating. Each card shows why it was picked and the best-fit session. With
**Send messages** on, learners get one follow-up 1–72 hours after a mentor session asking for a rating and pointing
to the study plan.

## Revenue and renewals

Every day (from 10:00 IST) the agent scans: prepaid plans ending soon, failed renewals, organisation licences
ending, licences over 90 % of seats, organisations over 80 % of their monthly assessment limit, plans that lapsed in
the last 14 days and coupons nearly used up. It drafts up to 10 proposals (one per person or organisation) in a new
copilot conversation for the superadmin who switched it on and sends them an in-app notice:
`send_renewal_reminder`, `send_upgrade_offer` and `send_winback_offer` (a single-use, 14-day coupon — a money
proposal). The same signal is not proposed again for 3 days, or for the cooldown (default 14 days) once acted on.
You can also ask the copilot "who is up for renewal?" at any time.

## For admins

- Scheduled runs are listed under Admin → Cron jobs / Automations health as `assistant-revenue`,
  `assistant-onboarding`, `assistant-placement-report` and `assistant-mentor-followup` (each claimed once per window).
- **Run now** on Admin → Assistants runs a loop immediately (the switches still apply).
- The run log keeps 90 days and stores counts, never names or e-mail addresses.
