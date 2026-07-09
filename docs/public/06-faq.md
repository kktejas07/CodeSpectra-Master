> **Public Documentation**
> **Last Updated**: 2026-07-08
> **Audience**: Everyone (no login required)

# Frequently Asked Questions

---

## Account Management

### How do I create an account?

Sign up at app.codespectra.io/signup using email and password, Google, or GitHub. No credit card required for the Free tier.

### Can I delete my account?

Yes. You can request account deletion from your settings page. Account deletion removes your personal data, submissions, and scan history permanently.

### How do I reset my password?

Use the "Forgot Password" link on the login page. You'll receive a password reset email with a secure link.

### Can I use the same email for multiple accounts?

No. Each email address can only be associated with one CodeSpectra account.

---

## Security

### Is my code safe on CodeSpectra?

Yes. All data is encrypted in transit (TLS 1.3) and at rest. Your code is processed in isolated sandbox environments. AI models do not train on your code or data.

### Do you store my source code?

Code you submit for scanning is stored securely and used only for analysis and quality tracking. You can delete scans and associated code at any time.

### What happens to my GitHub code when I scan a repository?

We clone the repository temporarily to perform the scan. The scan results (metrics, issues, ratings) are stored — the raw repository data can be deleted after analysis.

### Do you share my data with third parties?

No. Your code, personal information, and usage data are never sold or shared with third parties. See our privacy policy for full details.

### Can I self-host CodeSpectra?

Yes. CodeSpectra supports full Docker Compose deployment. You can run the entire platform on your own infrastructure for complete data control.

---

## Integrations

### Which version control platforms do you support?

Currently, CodeSpectra integrates with GitHub (OAuth, repository scanning, PR reviews). GitLab and Bitbucket support are on the roadmap.

### How does the GitHub integration work?

Connect your GitHub account via OAuth. You can scan any repository you have access to, enable automatic PR reviews, and receive AI code review comments directly on pull requests.

### Is there a CI/CD integration?

Yes. You can trigger scans programmatically via our REST API and webhooks. A native GitHub Action is in development.

### Do you offer an API?

Yes. CodeSpectra provides a REST API for programmatic access to problems, submissions, scans, and quality gates. See the [API Overview](07-api-overview.md) for details.

### What is the MCP Server?

The MCP (Model Context Protocol) server allows external AI tools to interact with CodeSpectra. It exposes tools for listing problems, running code, checking user XP, and viewing leaderboards.

---

## Billing

### What plans do you offer?

CodeSpectra has three tiers: **Free** ($0), **Pro** ($29/month or $199/year), and **Enterprise** ($99/user/month). See the [Pricing page](03-pricing.md) for full details.

### What payment methods are accepted?

We currently accept payments through Razorpay (UPI, credit/debit cards, net banking, wallets — INR only). Stripe global payments are coming soon.

### Can I upgrade or downgrade?

Yes. Changes take effect immediately for upgrades. Downgrades apply at the end of your current billing period.

### Do you offer refunds?

Contact our support team for refund requests. We handle refunds on a case-by-case basis.

### Is there a free trial?

The Free tier is free forever — no time limit. Upgrade to Pro or Enterprise whenever you need more capabilities.

---

## Supported Languages

### How many languages do you support?

CodeSpectra supports 40+ programming languages for code execution, including Python, JavaScript, TypeScript, Java, C++, C#, Go, Rust, and many more. See the [Supported Languages](05-supported-languages.md) page for the full list.

### Can I request a new language?

Yes. Contact support or your account representative to request additional language support.

### How do I change the language in the code editor?

Use the language selector dropdown at the top of the code editor. CodeSpectra will load the appropriate starter template and syntax highlighting.

---

## Data Privacy

### Where is my data stored?

Data is stored in MongoDB Atlas, hosted on cloud infrastructure. For self-hosted deployments, data stays on your infrastructure.

### How long do you keep my data?

Account data is retained for the duration of your account. Scan history and submissions are retained for the life of your account. You can delete specific data at any time.

### Is my code used to train AI models?

No. Your code is never used to train or fine-tune AI models. AI analysis is performed per-request and results are not used for model training.

---

## Enterprise Features

### What enterprise features are available?

Enterprise plans include team management, custom roles, unlimited scans, priority support, dedicated onboarding, and audit logs. SSO/SAML is on the roadmap.

### Do you support single sign-on (SSO)?

SSO via SAML 2.0, Google Workspace, and Microsoft Entra ID is in development and targeted for 2027.

### Can I manage multiple teams?

Yes. Enterprise organizations can create multiple teams with separate settings, members, and quality gate configurations.

### Do you offer an SLA?

Enterprise plans include a 99.9% uptime SLA. Custom SLAs are available for larger deployments.

### How do I get started with Enterprise?

Contact sales@codespectra.io or use the contact form in the app. Our team will set up a personalized onboarding call.

---

## Technical Support

### How do I get help?

Free users can access community support and documentation. Pro users have access to email support. Enterprise users get 24/7 priority support.

### Is there documentation?

Yes. This documentation site covers everything from getting started to advanced features. API documentation is available in the [API Overview](07-api-overview.md).

### How do I report a bug?

Report bugs through the Support page in your dashboard or email support@codespectra.io. Include your browser version, steps to reproduce, and any relevant screenshots.

---

> **Still have questions?** Contact us through the Support page in your dashboard or email support@codespectra.io.
