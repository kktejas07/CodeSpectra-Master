> **Customer Documentation**
> **Last Updated**: 2026-07-08
> **Audience**: Logged-in users (students, developers, recruiters, admins)

# Organization Guide

The Organization section is available to users with the **tenant_admin** role. Access it from the sidebar under Organization (`/dashboard/admin/team`).

## Team Members

The team management page shows all members in your organization.

### Member List
Each member entry displays:
- **Name**
- **Email**
- **Role** — the user's access level within CodeSpectra
- **Status** — active or inactive

The member list shows up to 15 members at a time with a scrollable list.

### Team Stats
The dashboard displays key metrics:
- **Team members** — total count
- **Active members** — currently active users
- **Total scans** — combined code scans across the team
- **Challenges** — team-wide challenge completions

## Inviting Members

To invite new members:
1. Click **Invite Members** button
2. Enter the email address of the person you want to invite
3. Select their role
4. Send the invitation

New members will receive an email with instructions to join your organization.

## Roles

Team members can have different roles within your organization:
- **User** — standard platform access
- **Tenant Admin** — organization management access (can manage team, view activity, configure integrations)

## Team Activity

View your team's activity feed at `/dashboard/admin/team/activity`. This shows:
- Recent code scans by team members
- Challenge completions
- Review activity
- New member joins

Activity is displayed as a timeline with timestamps and member details.

## Quick Actions

The Organization page provides quick links to:

- **Team Activity** — full activity feed
- **Integrations** — configure external service connections
- **Pricing & Plans** — manage subscription plans
- **Billing** — manage billing and invoices
- **Email Settings** — configure email delivery
- **Notifications** — manage team notification preferences

## Integrations

Organization admins can configure integrations that affect the entire team:
- **GitHub OAuth** — connect repositories for scanning
- **Slack** — post scan results and alerts to channels
- **SonarQube** — pull quality gates from existing SonarQube server

See the Integrations Guide for detailed setup instructions.
