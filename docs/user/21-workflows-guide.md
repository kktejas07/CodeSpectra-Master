> **Customer Documentation**
> **Last Updated**: 2026-10-19
> **Audience**: Organization admins and platform admins

# Workflows (Automations) Guide

Workflows automate repeat work: emails, WhatsApp messages, Slack or Teams posts, moving candidates, tagging, certificates, and AI summaries. Find them under **Admin → Workflows** (`/dashboard/admin/workflows`).

## Triggers

- **Event** — something happened on the platform (a test was submitted, a candidate changed stage, a payment failed…), optionally with a filter
- **Schedule** — a cron schedule (UTC), for example every Monday at 09:00
- **Webhook** — an outside system calls a signed URL
- **Manual** — you start it yourself

## Steps

Steps run in order: send an email or WhatsApp template, notify someone in the app, post to Slack or Teams, call a webhook, look up records, ask the AI model (trigger data is passed as data, never as instructions), update a record, move or reject a candidate, wait, branch with if / else, or loop over records.

## Templates

**Templates** gives ready-made workflows (for example payment reminders, assessment follow-ups, hiring nudges). Installing a template creates a copy that is **switched off** so you can fill in its setup first.

## Runs and failures

Every run is listed with each step's result. A failed run can be **re-run from the failed step**; a waiting run can be cancelled. Test runs use the sample data and never send real messages. Each organisation has daily limits on runs, emails, WhatsApp messages, webhooks and AI steps.

## Scheduled copilot tasks

Ask the AI copilot something like "every Monday at 9:00, email me new applicants" and it drafts a schedule workflow (look up the records → write a short AI summary → email or notify you). Once you confirm, it appears here like any other workflow and you can switch it off at any time.
