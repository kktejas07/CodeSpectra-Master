> **Customer Documentation**
> **Last Updated**: 2026-07-08
> **Audience**: Logged-in users (students, developers, recruiters, admins)

# Webhooks Guide

Configure webhooks to trigger automated code scans on GitHub events like pushes and pull requests.

## GitHub Webhook Setup

### Prerequisites
- Admin access to the GitHub repository you want to configure
- CodeSpectra instance URL (your platform domain)

### Step-by-Step

1. Go to your GitHub repository
2. Click **Settings** → **Webhooks** → **Add webhook**

#### Payload URL
```
https://[your-domain]/api/github/webhook
```

#### Content Type
```
application/json
```

#### Secret
Set a secret value and save the same value in CodeSpectra under **Admin → Platform Settings → Integrations → GitHub Webhook Secret**.

#### Events to Trigger
Select which events should trigger a scan:
- **Push events** — scan code on every push (recommended)
- **Pull request events** — scan code when PRs are opened or updated
- You can also select "Send me everything" for all events

#### Active
Ensure the webhook is set to **Active** (checked).

3. Click **Add webhook**

## Verify Webhook Delivery

### On GitHub
1. Go to your repository → Settings → Webhooks
2. Click on the webhook you just created
3. The **Recent Deliveries** section shows all webhook attempts
4. Each delivery shows:
   - HTTP status code (200 = success)
   - Request and response headers
   - Payload data
   - Response body

### Troubleshooting
- **403 Forbidden** — webhook secret mismatch. Verify the secret in GitHub matches the one configured in CodeSpectrasettings
- **404 Not Found** — wrong payload URL. Check that the URL points to `/api/github/webhook`
- **Timeout** — the scan may take longer than GitHub's 10-second timeout. The webhook is accepted asynchronously; check your scan history for results

## Webhook Events

| Event | Trigger | Description |
|-------|---------|-------------|
| `push` | Code pushed to repo | Scans all changed files |
| `pull_request` | PR opened/updated | Scans PR diff |
| `pull_request_review` | PR review submitted | Re-scans after review |

## Security

- All webhook payloads are verified using the configured secret
- Only requests with a valid HMAC-SHA256 signature are processed
- Webhook deliveries are logged for audit
- Use a strong, random secret (at least 32 characters)

## Logging

Webhook deliveries are logged in the CodeSpectra audit logs (`/dashboard/admin/audit-logs`). Each log entry includes the repository name, event type, and delivery status.

## Troubleshooting

### Webhook not triggering scans
1. Verify the webhook is **Active** in GitHub settings
2. Check **Recent Deliveries** in GitHub for error responses
3. Ensure the **secret** in GitHub matches the one in CodeSpectra settings
4. Confirm the **payload URL** is correct

### Scans not appearing
1. Check your scan history in CodeSpectra Scanner
2. Verify the repository is connected to CodeSpectra
3. Check the audit logs for webhook delivery errors

### Configuring Multiple Repositories
Repeat the setup for each repository you want to auto-scan. Each repository needs its own webhook pointing to the same CodeSpectra payload URL.
