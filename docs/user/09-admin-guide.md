> **Customer Documentation**
> **Last Updated**: 2026-07-08
> **Audience**: Logged-in users (students, developers, recruiters, admins)

# Admin Guide

The Admin section is available to **superadmin** and **tenant_admin** roles. Superadmins see all admin pages; tenant admins see organization management.

Access admin features from the bottom of the sidebar (superadmins only) or via `/dashboard/admin/`.

## User Management

Navigate to `/dashboard/admin/users`.

### View Users
The user management table shows:
- Name and email
- Role (user, tenant_admin, superadmin)
- Status (active, inactive)
- Plan (free, pro, enterprise)
- Joined date
- Last active (relative time, refreshes every 15 seconds)

### Add a User
1. Click **Add User**
2. Enter email, full name, password (optional — if blank, an invite is sent)
3. Select role
4. Click Submit

New users may receive a welcome email or secure sign-in link depending on platform settings.

### Edit User
Click the Edit button on any user to update:
- Full name
- Role
- Status
- Plan

### Change Role
Click **Change Role** on any user to reassign their access level.

### Delete User
1. Click **Delete** on any user
2. Confirm the deletion dialog
3. The user and their account data are permanently removed (irreversible)

The user list auto-refreshes every 30 seconds to stay current.

## Permission Manager

Navigate to `/dashboard/admin/permissions` to manage the RBAC (Role-Based Access Control) grid.

### How it Works
The permission system is database-driven. Resources auto-discover from page routes and API entities.

### Grid View
- Select a role from the dropdown (superadmin, tenant_admin, user)
- The grid shows all resources with columns for Read, Create, Update, Delete, and Manage
- Click any cell to toggle the permission on/off
- Resources marked "new" haven't been assigned permissions yet
- The **Manage** action grants all CRUD permissions

### Bulk Operations
- **Reseed All** — re-discover all resources from the codebase
- **Refresh** — reload current permissions

### Saving
1. Make your changes in the grid
2. Click **Save** (enabled when changes are pending)
3. Changes take effect immediately

### Auto-Seeding
Roles and resources auto-seed on first load. New pages added to `page-permissions.ts` automatically appear in the grid with a "new" badge.

## System Settings

Navigate to `/dashboard/admin/settings` (superadmin only). Settings are organized into sections:

### Branding
- Platform name, tagline, logo URL, favicon URL
- Support email, timezone, date format
- Default locale and currency

### Operations
- Platform status (active, maintenance)
- Maintenance mode message
- Default user role for new registrations
- New user email delivery method

### Product
- Feature flags (challenges, AI, scanner, interviews, certifications, etc.)
- Default plan for new users

### Mail
Configure email providers:
- **Resend**, **SendGrid**, **Postal** — API key configuration
- SMTP settings (host, port, username, password)
- From name and address
- Email templates (welcome, password reset, etc.)

### Integrations
- **GitHub OAuth** — configure Client ID and Client Secret
- **GitHub App** — configure App ID, Private Key, and Webhook Secret
- **Callback URL** — displayed for your reference

### Payments
- **Razorpay** — Key ID, Key Secret, Webhook Secret
- **Stripe** — legacy support for historical webhooks
- Currency selection

## Server Secrets

Located under Platform Settings → Integrations section. Secrets are stored encrypted and masked in the UI.

### Secrets You Can Configure
- Firebase API Key
- Resend API Key
- SendGrid API Key
- Postal API Key
- SMTP credentials
- GitHub OAuth credentials
- GitHub App credentials
- Razorpay credentials
- Stripe webhook secret

## Operations Overview

Navigate to `/dashboard/admin/system`. This dashboard shows:

### Server Health
- **CPU** — usage percentage, cores, load averages
- **RAM** — usage percentage, used/total
- **Disk** — usage percentage, free/total
- **Containers** — running container count, Piston engine status

### Running Containers
List of running Docker containers with CPU/memory usage and status.

### Maintenance Actions
- **Clear Next.js build cache** — clear ISR cache
- **Clear server secrets cache** — invalidate in-memory secrets
- **Restart Piston** — restart the code execution engine
- **System cleanup** — Docker prune + report
- **Docker system prune** — remove unused images, containers, volumes

### Platform Metrics
- Total users, active users (last 15 minutes)
- Platform admins, org admins
- User growth chart, users by role, activity trends

### Analytics Dashboard
Charts showing user growth, role distribution, and activity trends over time.

## Audit Logs

Navigate to `/dashboard/admin/audit-logs`.

The audit log tracks all security-relevant events:
- User creation, deletion, role changes
- Login attempts (success/failure/denied)
- Configuration changes
- Permission modifications
- System actions

### Features
- **Filter** — by severity (info, warning, critical) and outcome (success, failure, denied)
- **Search** — across actor names, actions, and resources
- **Download** — export logs as CSV

Each log entry shows: timestamp, actor, action, resource, severity, outcome, and optional detail.

## Pricing / Plans Management

Navigate to `/dashboard/admin/plans`.

Manage subscription plans (Free, Pro, Enterprise):
- View all plans with their features
- Toggle individual features on/off per plan
- Adjust feature limits (e.g., max scans per month)
- Edit plan descriptions
- Save changes to the database

 ## Team Management (Tenant Admin)

Navigate to `/dashboard/admin/team`.

For organization admins:
- View team members and their roles
- See team stats (total members, active members, total scans, challenges)
- Invite new members
- View team activity

### Quick Actions
- Team activity feed
- Integrations configuration
- Pricing & plans
- Billing
- Email settings
- Notifications

## Organizations (Superadmin)

Navigate to `/dashboard/admin/organizations` (superadmin only). Manage enterprise tenants and their members.

### Create an Organization
Click **New organization**. Enter the org name, optional slug and plan. To create the org admin in the same step, fill in the **Org admin account** section (name, email, password). The account is created with the Org Admin role and attached to the new tenant automatically. Leave the email empty to create the org without an admin and assign one later.

### Members
Click **Members** on an org card to view who's attached to that tenant.
- **Add member** — create a user (name/email/password) attached to this org, choosing **User** or **Org Admin**.
- **Impersonate** — sign in as that member to debug their experience. The ImpersonationBanner appears with an **Exit** button to restore your real session. Platform admins (superadmin) can't be impersonated.

### Edit / Deactivate / Delete
- **Edit** — change name, slug, plan, or active state.
- **Toggle** — deactivate a tenant to block member sign-in/team access.
- **Delete** — remove the org; members are detached but their accounts remain.

Users can also be assigned to an org from `/dashboard/admin/roles` (Organization column) or created via User Management.

