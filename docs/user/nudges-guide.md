# Reminders and follow-ups (nudges)

CodeSpectra sends a small set of automatic reminders and follow-ups, called nudges. Platform admins switch each one on or off under **Admin → Automations**. A nudge that messages people or can issue a coupon starts **off**. A read-only one starts **on**.

## What every nudge respects

- **One shared limit per person.** Every nudge counts toward the same cap, which is 2 a day and 6 a week by default (Admin → Automations → Nudge limits). A deadline reminder gets one extra slot that day, for example a last-chance test invite, a drive starting in an hour or an offer about to expire. A nudge held back by the cap is tried again on the next run while its time window is still open.
- **Stops once you act.** Each reminder checks again right before it goes out. If you submitted the test, paid, renewed, answered the invite or caught up, nothing is sent.
- **Your settings.** Every email has an unsubscribe link. Turning email off in your notification preferences turns these off too. Quiet hours hold reminders until the quiet period ends. WhatsApp goes only to people who agreed to it and haven't replied STOP.
- **Your language.** Emails and in-app notes arrive in your interface language (English, Hindi or Telugu).

Two kinds of message don't count toward the cap. The notice sent 3 days before an automatic renewal charge is one. Digests for hiring staff and mentors are the other.

## The nudges

| Nudge | Who gets it | When | Default |
| --- | --- | --- | --- |
| Test-invite reminder ladder | Candidates | 3 days and 2 hours before an invite closes. The 24-hour reminder already existed. The results page shows "Reminded 2×". | Off |
| Re-engagement with a personal pick | Learners | After 7, 14 and 30 days away. Suggests one item from your study plan's weakest area and shows your best streak. At 30 days it offers to rebuild the plan. | On (already existed) |
| Abandoned plan checkout | Buyers | 1 hour after an unpaid checkout: a resume link. At 24 hours: a one-time coupon, only if an admin sets a percentage. | Off |
| Licence and auto-renew notices | Organisation admins / subscribers | 30 and 7 days before a licence ends, with seat usage. 3 days before an automatic charge, with the amount and a link to manage or cancel. | Off |
| Certification renewal | Credential holders | 14 days and 1 day before expiry. The 60-day notice already existed. At 14 days, employers who found the holder in talent search also get a note. | Off |
| Drive-day reminders and no-shows | Drive candidates / drive owner | 24 hours and 1 hour before a live drive, with a link to the system check. After the drive, the owner sees the no-shows and can add them to another drive from the drive's **Results** tab. | Off |
| Offer follow-ups and expiry | Candidates / recruiters | Candidate reminder after 2 days. Recruiter escalation after 5 days. At the deadline the offer is marked expired and posted to the organisation's Slack or Teams. | Off |
| Background-check vendor chaser | Recruiters | Each day, checks past the vendor's expected time are re-checked with the vendor (IDfy, AuthBridge). On Mondays, recruiters get a list of checks holding up joining dates. | Off |
| Mentor no-shows and ratings | Learners / mentors | 15 minutes after a built-in video session ends, both sides hear if someone didn't join, with the reschedule or refund path. Mentors who miss 2 sessions in 90 days are flagged to admins. 2 hours after the session, the learner is asked for a rating. | Off |
| Weekly employer report | Hiring team members | Mondays at 09:00 in your time zone: tests sent and completed, pass rate, integrity flags, pipeline movement, drives and talent invites accepted. You can unsubscribe from weekly reports on their own. | Off |
| Cohort at-risk learners | Learners / cohort mentors | Learners who missed 2 assignments or went 7 days without activity get one note a week. Mentors get the list. | Off |
| Referral reward and talent-invite follow-ups | Referrers / learners | An email with your share link when a referral reward arrives. Reminders about unanswered talent-search invites after 3 days and on their last day. | Off |
| Feed source health | Platform admins | An alert after 3 bad pulls in a row from an events-feed or tech-news source. The source is switched off after 7 days of failures. | On |
| Content freshness | Platform admins | Weekly. Lists Learn posts and questions that are over a year old, mention deprecated APIs or have dead links. AI suggests what to update, within a daily and monthly cap. Over the cap, you get a template checklist instead. | Off |

## For organisations: workflow templates

Organisation admins can install these templates from **Workflows → Templates**. They start on events from the read-only **Nudge signals** automation, which is on by default:

- Test-invite reminder ladder (`assessment.invite.expiring`)
- Offer follow-ups (`offer.pending`) and Offer expired alert (`offer.expired`)
- Drive no-show follow-up (`drive.no_show`)
- Background check overdue (`bgv.overdue`)
- Cohort at-risk nudge (`cohort.member_at_risk`)
- Talent-invite follow-up (`talent.invite.pending`)
- Licence renewal alert (`licence.expiring`)

A template and the built-in nudge that send the same email share one de-duplication key, so nobody gets the same email twice. Templates that post to Slack need your incoming-webhook URL.

## For platform admins: run log

Each nudge card shows its last run. **Nudge run log** lists every send, cap, stop and skip from the last 60 days, with ids only (no addresses or message text). It also shows a 7-day count for each automation. **Content freshness** is the editor queue: open the item, edit it, then mark it updated or dismiss it.
