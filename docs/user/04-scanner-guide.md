> **Customer Documentation**
> **Last Updated**: 2026-07-08
> **Audience**: Logged-in users (students, developers, recruiters, admins)

# Scanner Guide

The CodeScanner is your AI-powered code quality analysis tool. Access it from the sidebar (`/dashboard/scanner`). Switch between modes using the scanner sidebar navigation.

## Scanner Modes

The scanner has 19 different modes accessible via the sidebar:

| Mode | Purpose |
|------|---------|
| **Manual** | Paste or type code and analyze it |
| **GitHub** | Scan GitHub repositories |
| **Quality Gates** | Set quality standards and check pass/fail status |
| **Trends** | Track quality metrics over time |
| **Review** | Collaborative code review with comments |
| **Config** | Configure scan rules, thresholds, and filters |
| **Reports** | Generate and export PDF/JSON/CSV reports |
| **Insights** | Aggregate analytics on code quality and team performance |
| **Metrics** | Browse per-file metrics (complexity, coverage, duplication) |
| **Hotspots** | Security-sensitive code locations |
| **Ratings** | Letter-grade quality ratings (security, reliability, maintainability) |
| **Activity** | Timeline of all scan events |
| **Architecture** | Codebase architecture visualization |
| **PR** | Pull request quality analysis |
| **Branches** | Compare quality metrics across branches |
| **Team** | Team leaderboard for code quality |
| **Chat** | Codebase AI chat assistant |

## Manual Code Paste Mode

1. Select a **programming language** from the dropdown
2. Type or paste your code into the editor (plain textarea or Monaco editor — toggle with the button)
3. Click **Scan Code**
4. View results in the right panel

### Results Include
- **Quality score** — overall rating (0-100)
- **Issues count** — bugs, vulnerabilities, code smells, security hotspots, duplication percentage
- **Complexity score** — cyclomatic complexity
- **Maintainability index**
- **Best practices** — what you did well
- **Recommendations** — suggested improvements
- **Performance analysis**

### AI-Generated Fixes
For each detected issue, the AI Fixes panel can:
- Suggest code fixes
- Apply fixes directly to your code
- Show a diff of before/after

### Scan History
Your recent scans are saved and accessible in the history panel below the editor. Click any past scan to re-view its results.

## GitHub Repository Scanning

1. Switch to **GitHub** mode in the scanner sidebar
2. Connect your GitHub account via OAuth
3. Browse your repositories
4. Select a file to scan
5. View results with the same quality metrics as manual mode

### GitHub Webhooks
Configure repo webhooks to point to `/api/github/webhook` for automatic scanning on each push.

## Quality Gates Dashboard

Quality Gates let you define quality standards that code must meet before merging:

1. Navigate to **Quality Gates** mode
2. View current gate status (pass/fail)
3. Configure thresholds for:
   - Minimum quality score
   - Maximum bugs, vulnerabilities, code smells
   - Coverage requirements
4. Enforce gates on push for CI integration

## Trends & Insights

### Trends
View historical charts of quality metrics over time — quality score, bugs, vulnerabilities, code smells, complexity, and coverage.

### Insights
Aggregate analytics dashboard showing team-wide trends, issue resolution rates, and quality improvements.

## Security Hotspots Viewer

The Security Hotspots view highlights code locations that may need security review. Each hotspot shows:
- File and line number
- Vulnerability type
- Severity rating (critical, major, minor, info)
- AI-suggested remediation

## Fixing Issues

From any scan result:
1. Review the **Suggested Fixes** panel that lists all detected issues
2. Click the **AI Fix** button for any issue to get an AI-generated fix
3. Review the fix in the code diff viewer
4. Click **Apply** to update the source code
5. Re-scan to verify the fix resolved the issue

## Code Review Panel

In **Review** mode, you can:
- View code with inline comments
- Add review comments
- Reply to existing comments
- Resolve discussion threads
- Approve or request changes

## Reports

Generate exportable reports from scan results:
- **PDF** — formatted report with all metrics and issues
- **JSON** — raw data for programmatic use
- **CSV** — spreadsheet-compatible format
- Email reports to recipients
- Generate shareable links
