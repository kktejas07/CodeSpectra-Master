> **Customer Documentation**
> **Last Updated**: 2026-10-23
> **Audience**: Everyone; platform admins for the review queue

# Tech News Guide

Tech news (`/news`) collects updates from public developer feeds — language releases, cloud and security advisories, India careers news — rewritten into short articles that link to the original source.

## How articles are made

1. On a schedule the platform reads the enabled feeds and skips links it has already seen.
2. The AI extracts a **fact pack** (verifiable claims with dates and source links) and drafts an article from it.
3. A **fact verifier** compares the draft with the fact pack and the source text. Every number, name and claim (for example "sponsored by", "free", "acquired") in the title, summary and body must be backed by them.
4. Articles from **trusted** feeds are published automatically only when the AI pass worked, the source text did not trip the prompt guard and the fact verifier passed. Everything else waits for a platform admin.

AI use is capped per day and per month, and stops when the platform AI budget is used up.

## Review queue (platform admins)

**Admin → Signals** lists drafts with badges: trusted feed, auto-published, no AI pass, source text flagged and **facts need checking** (hover to see the unsupported numbers, names or claims). Approve to publish, reject, or unpublish a live article. Feeds can be switched on or off and marked trusted. The AI copilot can list pending news and draft approve / reject decisions, one article at a time.

## Subscriptions

Subscribe to topics at `/subscriptions` for a daily news digest by email.
