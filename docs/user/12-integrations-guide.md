> **Customer Documentation**
> **Last Updated**: 2026-07-08
> **Audience**: Logged-in users (students, developers, recruiters, admins)

# Integrations Guide

Connect external services to CodeSpectra for automated scanning, notifications, and more. Access integrations from the Admin panel.

## Available Integrations

| Integration | Purpose |
|-------------|---------|
| **GitHub OAuth** | Connect repositories for manual scanning |
| **GitHub App** | Automated PR comments, webhook-driven scanning |
| **Slack** | Post scan results and alerts to channels |
| **SonarQube** | Pull quality gates from an existing SonarQube server |

## GitHub OAuth

Connect your GitHub account to scan repositories directly from CodeSpectra.

### Setup (for admins)
1. Go to **Admin → Platform Settings → Integrations**
2. Register a new OAuth App in your GitHub account settings:
   - **Homepage URL**: Your CodeSpectra instance URL
   - **Authorization callback URL**: `[your-domain]/api/auth/callback/github`
3. Copy the **Client ID** and **Client Secret** from GitHub
4. Paste them into the GitHub OAuth fields in CodeSpectra settings
5. Click **Save integrations**

### Usage (for end users)
1. Navigate to Scanner → GitHub mode
2. Click **Connect GitHub** to authorize via OAuth
3. Browse your repositories
4. Select a file to scan

## GitHub Webhooks

Configure webhooks to automatically scan code on each push.

### Setup
1. Go to your GitHub repository → Settings → Webhooks
2. Click **Add webhook**
3. **Payload URL**: `https://[your-domain]/api/github/webhook`
4. **Content type**: `application/json`
5. **Secret**: Your configured webhook secret (set in Admin → Platform Settings → Integrations)
6. **Events**: Select "Just the push event" or customize
7. Click **Add webhook**

### Verification
- Webhook deliveries are logged for audit
- Check the webhook delivery log in your GitHub repository settings
- Failed deliveries show error details for troubleshooting

## GitHub App (Admin)

For advanced integration (PR comments, status checks):
1. Go to **Admin → Integrations**
2. Click **Configure GitHub App**
3. Enter your GitHub App ID, Private Key, and Webhook Secret
4. Click **Save**

The GitHub App allows CodeSpectra to:
- Post scan results as PR comments
- Set commit status checks
- Auto-scan on pull request events

## Slack Integration (Admin)

1. Go to **Admin → Integrations**
2. Find the Slack integration card
3. Configure the Slack webhook URL or app integration
4. Select which notification types to post to Slack
5. Save the configuration

Slack can receive:
- Scan results and quality summaries
- Quality gate pass/fail status
- Team activity updates

## SonarQube Integration (Admin)

1. Go to **Admin → Integrations**
2. Find the SonarQube integration card
3. Enter your SonarQube server URL and authentication token
4. Save the configuration

This pulls quality gate results from your existing SonarQube server into CodeSpectra.
