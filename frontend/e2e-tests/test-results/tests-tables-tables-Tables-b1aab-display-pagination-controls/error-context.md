# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/tables/tables.spec.ts >> Tables Tests >> Pagination >> should display pagination controls
- Location: tests/tables/tables.spec.ts:6:9

# Error details

```
Test timeout of 30000ms exceeded while setting up "authenticatedPage".
```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - generic [ref=f1e2]:
    - complementary [ref=f1e3]:
      - link "CodeSpectra" [ref=f1e5] [cursor=pointer]:
        - /url: /
      - generic [ref=f1e12]:
        - generic [ref=f1e13]: Code quality + competitive coding, one platform
        - heading "Ship cleaner code. Win the competition." [level=1] [ref=f1e17]: Ship cleaner code.Win the competition.
        - paragraph [ref=f1e18]: AI-powered static analysis meets competitive coding challenges. Scan, fix, and compete — all in one workspace.
        - generic [ref=f1e19]:
          - generic [ref=f1e20]: AI fix suggestions on every issue
          - generic [ref=f1e25]: 40+ languages, real test cases, live judging
          - generic [ref=f1e30]: Quality gates that block bad pushes
        - generic [ref=f1e37]:
          - generic [ref=f1e38]: analysis.ts
          - generic [ref=f1e43]: "// 1 bug, 2 smells found function analyze(code) { if (code == null) { // 🟢 use === instead } return runQualityGate(code) }"
      - generic [ref=f1e44]:
        - generic [ref=f1e45]: © 2026 CodeSpectra
        - generic [ref=f1e46]:
          - link "Privacy" [ref=f1e47] [cursor=pointer]:
            - /url: /privacy
          - link "Terms" [ref=f1e48] [cursor=pointer]:
            - /url: /terms
    - main [ref=f1e49]:
      - generic [ref=f1e50]:
        - generic [ref=f1e51]:
          - heading "Sign in to your account" [level=2] [ref=f1e52]
          - paragraph [ref=f1e53]:
            - text: New to CodeSpectra?
            - link "Create an account" [ref=f1e54] [cursor=pointer]:
              - /url: /auth/signup
        - generic [ref=f1e55]:
          - button "Google" [ref=f1e56]
          - button "GitHub" [ref=f1e57]
        - generic [ref=f1e58]: or sign in with email
        - generic [ref=f1e63]:
          - generic [ref=f1e64]:
            - generic [ref=f1e65]: Email
            - textbox "Email" [ref=f1e70]:
              - /placeholder: you@example.com
          - generic [ref=f1e71]:
            - generic [ref=f1e72]:
              - generic [ref=f1e73]: Password
              - link "Forgot password?" [ref=f1e74] [cursor=pointer]:
                - /url: /auth/forgot-password
            - generic [ref=f1e75]:
              - textbox "Password" [ref=f1e79]:
                - /placeholder: Enter your password
              - button [ref=f1e80]
          - generic [ref=f1e84] [cursor=pointer]:
            - checkbox "Keep me signed in" [checked] [ref=f1e85]
            - generic [ref=f1e86]: Keep me signed in
          - button "Sign in" [ref=f1e87]
        - paragraph [ref=f1e88]:
          - text: By signing in you agree to our
          - link "Terms" [ref=f1e89] [cursor=pointer]:
            - /url: /terms
          - text: and
          - link "Privacy Policy" [ref=f1e90] [cursor=pointer]:
            - /url: /privacy
          - text: .
  - button "Open Next.js Dev Tools" [ref=f1e96] [cursor=pointer]
  - alert [ref=f1e100]
```