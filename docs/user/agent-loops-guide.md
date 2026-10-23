> **Customer Documentation**
> **Last Updated**: 2026-10-23
> **Audience**: Platform admins

# Agent Loops Guide

Agent loops (**Admin → Agent loops**, `/dashboard/admin/agent-loops`) are scheduled agents that look over the platform and **suggest** work. A suggestion (a *finding*) never changes anything until a platform admin clicks its button here, or confirms the matching copilot action.

| Loop | Runs | Default | What it does |
|---|---|---|---|
| Content QA | Weekly (Sunday 02:00 UTC) | On | Re-checks published Learn posts (broken links, possibly out of date, few readers), published tech news (dead source link, a deadline or event date that has passed) and approved coding questions (re-runs the reference solution in the code sandbox). Suggests **Back to draft**, **Unpublish** or **Switch off question**. No AI. |
| SEO and content gaps | Weekly (Sunday 04:00 UTC) | On | Compares what people search for with what Learn covers. Suggests **Add Learn topic** (the Learn writer then drafts it for review) or **Translate** an English post into Hindi / Telugu when people search in that language. |
| Community moderator | Every 30 minutes | Off | Checks new forum posts. Clear spam (the same link posted again and again, or a link-heavy post from a brand-new account) is hidden when **Hide clear spam right away** is on — otherwise suggested. Doubtful posts (prompt-injection text, profanity, shouting, duplicates) are reported to the moderators' queue with the reason. Unanswered questions get a suggested answer built from public Learn and events pages. |
| Analytics insights | Weekly (Monday 03:00 UTC) | On (notes off) | Compares this week with last: KPIs, funnels, AI spend and failures, copilot use, failed workflow runs and scheduled-job health. Keeps a "what changed" note in its findings; with **Send notes** on, each platform admin gets it in their language (in-app, and by email when they allow email notifications). **Organisation admins** (off) also sends each organisation's admins a note about their own organisation. |
| Daily social pack | Daily (03:00 UTC = 08:30 IST) | Off | Builds **Today's pack** in the Social studio — see below. |

## Settings, caps and the run log

Open a loop to change its switch, schedule, items per run and AI settings. AI is optional in every loop and always capped: **AI calls per day** and **AI spend per month (USD)**, plus the platform AI budget hard stop. When AI is off, capped or the text looks like a prompt-injection attempt, the loop uses its rule-based fallback (template captions, topic titles from the query, link-only answer suggestions, number-only notes).

**Run now** runs a loop at once (even when switched off; the caps still apply). The **run log** lists every run with its counts, notes (for example `sandbox_unavailable`, `link_checker_unavailable`, `notified:3`) and why AI was not used. Runs and their health also appear under **Admin → Automations → Job health** (`agent-loop:*`).

## Findings

Each finding shows how urgent it is, the item it is about, and a button for its fix when there is one. **Dismiss** hides it; a dismissed problem that is still there comes back after 30 days. Applied and dismissed findings stay in the list (filter by status). Every apply and dismiss is written to the audit log.

## Search data (SEO loop)

Questions typed in the public **Ask** box are counted as normalised text only — no user, IP or session; emails, links and phone numbers are removed and anything the prompt guard flags is not stored (kept 90 days). You can also paste a Google Search Console **Queries** export (CSV) on the SEO loop.

## Today's pack (Social studio)

**Admin → Social studio → Today's pack** shows the loop's picks: the best not-yet-posted items (upcoming deadlines and fresh items first, one per type), captions for every network in each chosen language (the studio's own fact-checked caption writer; captions you edited are never overwritten), share cards and a suggested posting time per network in India time. **Nothing is posted automatically.** Use **Captions and share** to open the composer, post with the share buttons and mark each network as posted. **Approve pack** only records that you have reviewed it. With **Send notes** on, platform admins get a notification when the pack is ready.

## Copilot

The copilot can list findings (`list_agent_loop_findings`) and propose applying or dismissing one finding at a time (`decide_agent_loop_finding`) — the action runs only after you confirm it.

## Workflows

Two platform events can trigger workflows: **Agent loop finished a run** (`agent_loop.run_finished`) and **Daily social pack ready** (`social.pack_ready`).
