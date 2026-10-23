> **Customer Documentation**
> **Last Updated**: 2026-10-23
> **Audience**: Platform admins

# Social Studio Guide

The social studio (**Admin → Social studio**, `/dashboard/admin/social`) helps the platform team share new content on CodeSpectra's social accounts. **Nothing is ever posted automatically** — the studio prepares captions and opens each network's official share page; you post yourself.

## The queue

Every newly published item is queued: events from the events feed, tech news, contests, hackathons and codeathons, Learn posts, team blog posts, certification programmes and verified company patterns. Items already queued keep their captions and post marks; **Check for new items** pulls anything missed. Filter by type, by posted / not posted, by network or by date.

## Captions

- **Draft captions** writes a caption for every network (LinkedIn, X, Instagram, WhatsApp, Telegram and Facebook) in one language. The AI may only use the item's own facts — title, summary, dates, prize, deadline, mode, organiser and source. A caption with a number the facts do not contain is replaced by the template caption.
- Third-party text is checked by the prompt guard first; if it is flagged, only template captions are used.
- Each network gets its own link with UTM tags (Instagram says "link in bio"). The length checker shows each network's limit.
- AI drafts have a daily limit and a monthly spend cap (Admin → Social studio settings), and stop when the platform AI budget is used up.

## Share and track

Use **Share** to open the network's share page with the caption filled in, then **Mark posted**. The weekly **roundup** picks the week's top items into one post, and **Stats** shows posts per network per week.

## Today's pack

The **Today's pack** tab shows the daily social pack (switched on in **Admin → Agent loops**): the best new items with captions per network and language, share cards and suggested posting times. It never posts — open each item, share it and mark it posted. See the [agent loops guide](./agent-loops-guide.md).

The AI copilot can list the queue (what still needs posting) for platform admins.
