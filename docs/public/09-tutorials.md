> **Public Documentation**
> **Last Updated**: 2026-07-08
> **Audience**: Everyone (no login required)

# Tutorials

---

## Your First Code Scan

**Difficulty**: Beginner | **Time**: 5 minutes | **Prerequisites**: CodeSpectra account

In this tutorial, you'll learn how to run your first code scan using CodeSpectra's scanner. You'll paste a code snippet, trigger an analysis, and interpret the results dashboard. By the end, you'll understand the A–E quality rating system, know how to identify security hotspots, and see how AI-generated fixes work.

You'll learn how to:
- Navigate the scanner interface
- Choose between manual paste, file upload, and GitHub repository input
- Read the quality dashboard (Security, Reliability, Maintainability, Technical Debt)
- View and apply AI-generated fix suggestions
- Export scan results as a report

[Start the tutorial →](01-getting-started.md#step-2-your-first-code-scan)

---

## Solve Your First Challenge

**Difficulty**: Beginner | **Time**: 10 minutes | **Prerequisites**: CodeSpectra account

This tutorial walks you through solving your first coding problem on CodeSpectra. You'll browse the problem catalog, select a challenge, write a solution in the code editor, and submit it for evaluation. You'll also learn how to use AI hints when you get stuck — from a gentle conceptual nudge all the way to a full solution walkthrough.

You'll learn how to:
- Filter problems by difficulty, topic, and popularity
- Use the Monaco code editor with syntax highlighting
- Run your code against sample test cases
- Submit for full evaluation
- Use AI hints (4 progressive levels)
- View your submission history and skill progression

[Start the tutorial →](01-getting-started.md#step-3-your-first-coding-challenge)

---

## Set Up a Quality Gate

**Difficulty**: Intermediate | **Time**: 10 minutes | **Prerequisites**: CodeSpectra account, at least one code scan completed

Quality gates are automated checkpoints that enforce code quality standards across your projects. In this tutorial, you'll create a quality gate from scratch, configure pass/fail conditions, and test it against a scanned repository. You'll also explore pre-built templates for OWASP, NIST, and standard PR review standards.

You'll learn how to:
- Create a new quality gate configuration
- Set threshold conditions (issues, coverage, duplications, ratings)
- Apply OWASP and NIST compliance templates
- Test a gate against scan results
- Integrate gates into your review workflow
- Monitor gate history and trends

---

## Connect GitHub Repository

**Difficulty**: Intermediate | **Time**: 15 minutes | **Prerequisites**: CodeSpectra account, GitHub account

CodeSpectra's GitHub integration lets you scan repositories, automate PR reviews, and track code quality across your projects. This tutorial covers the full setup flow: authorizing CodeSpectra via OAuth, selecting repositories to scan, and configuring automatic AI code reviews on pull requests.

You'll learn how to:
- Authorize CodeSpectra to access your GitHub account
- Select and connect repositories for scanning
- Trigger a full repository scan
- View per-branch quality analytics
- Enable automatic PR review comments
- Manage GitHub webhook events
- Securely store and rotate GitHub tokens

---

## Run an AI Code Review

**Difficulty**: Beginner | **Time**: 5 minutes | **Prerequisites**: CodeSpectra account, code to review

CodeSpectra's AI code review provides automated, line-level feedback on your code using Claude Sonnet 4.5. This tutorial demonstrates how to submit code for review, understand the structured feedback format, and apply suggested improvements. You'll see how the AI evaluates code quality, identifies potential bugs, security concerns, and maintainability issues — all with actionable recommendations.

You'll learn how to:
- Submit code for AI review from the scanner interface
- Interpret review results (severity, category, line references)
- Apply suggested fixes with one click
- Compare reviews across different code versions
- Configure review preferences and focus areas
- Use AI review in your GitHub PR workflow

---

> **More tutorials coming soon.** Topics in development: "Create Custom Workflows", "Build a Learning Path", "Run a Certification Exam", "Interpret Skill Analytics", "Use the MCP Server", "Set Up Team Analytics", "Configure Organization-Wide Quality Standards".
