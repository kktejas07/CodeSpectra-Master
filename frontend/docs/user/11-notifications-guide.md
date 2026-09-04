> **Customer Documentation**
> **Last Updated**: 2026-07-08
> **Audience**: Logged-in users (students, developers, recruiters, admins)

# Notifications Guide

Stay informed about platform activity through the notifications system. Access your inbox from the sidebar bell icon or `/dashboard/notifications`.

## Inbox

The notifications inbox (`/dashboard/notifications`) shows all your notifications in reverse chronological order.

### Notification Items
Each notification shows:
- **Title** — brief summary
- **Message** — additional details
- **Timestamp** — when the notification was created
- **Status badge** — "New" badge for unread notifications

### Mark as Read/Unread
- Click any unread notification to mark it as **read** (highlighted border fades)
- Read notifications are shown with a subtle border

### Mark All Read
Click **Mark all read** to mark every notification as read at once.

## Notification Preferences

Configure your notification channels at `/dashboard/notifications/preferences`.

### Channels

The platform supports three notification channels:

#### In-App
Alerts displayed while you are using the dashboard. Toggle on/off and configure categories.

#### Email
Product and account update emails sent to your inbox. Configure:
- Support events
- Billing events
- Integration events
- Security events
- Product updates

#### Slack
Workspace notifications via Slack integration. Requires Slack integration to be configured by an admin.

### Category Toggles
For each enabled channel, you can fine-tune which categories generate notifications:
- **Support** — support-related updates
- **Billing** — invoice, payment, and subscription events
- **Integrations** — third-party service events
- **Security** — login alerts, permission changes
- **Updates** — product updates and announcements

## Quiet Hours

Quiet hours let you suppress notifications during specific times:
- **Start time** — when quiet hours begin (default: 22:00)
- **End time** — when quiet hours end (default: 08:00)
- During quiet hours, notifications are queued and delivered when quiet hours end

Note: Quiet hours is a preview feature. Connect to your notification service to enforce delivery windows.

## Digest Settings

### Daily Digest
Receive one summary per day of all notifications you missed.

### Weekly Report
Receive a weekly summary of your activity and usage highlights.

Digests help reduce notification noise while keeping you informed.

## Settings Quick Toggle

From the Settings page (`/dashboard/settings`), you can quickly toggle:
- **Email notifications** — master switch for all email notifications
- **Push notifications** — master switch for all in-app notifications

Fine-grained controls are available on the Notification Preferences page.

## Privacy

Notification preferences are stored per-account and used only to deliver notifications. You can change or revoke channels at any time.
