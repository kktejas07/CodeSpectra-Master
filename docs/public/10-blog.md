> **Public Documentation**
> **Last Updated**: 2026-08-22
> **Audience**: Everyone (no login required)

# Blog / Newsroom

CodeSpectra’s public Newsroom lives at **[/blog](/blog)**.

## What you’ll find

| Category | Purpose |
|---|---|
| **Signals** | Industry news rewritten for builders — takeaways, not copy-paste |
| **Product** | Releases and launches |
| **Engineering** | How we build |
| **Careers** | Skills, roles, roadmaps |
| **Campus** | Hackathons and community |
| **Playbook** | Guides and deep dives |

## Newsletter vs blog

- **Newsletter** — push to inbox / in-app notification
- **Blog** — evergreen URL you can share and search later

Important campaigns can be published to both.

## Coming next (Signals pipeline)

Automated collection from **public RSS** (not Unstop scrapes) → AI rewrite in CodeSpectra voice → human approve in **Admin → Signals** → publish to Newsroom.

- Cron: `POST /api/cron/signals-ingest?secret=CRON_SECRET`
- Admin: `/dashboard/admin/signals` (Run ingest / Publish / Reject)
- Newsletter campaigns can also **Publish to Newsroom** from the newsletter admin list.
