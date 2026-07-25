# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/accessibility/accessibility.spec.ts >> Accessibility Tests >> Keyboard Navigation >> should close modal with Escape key
- Location: tests/accessibility/accessibility.spec.ts:183:9

# Error details

```
Test timeout of 30000ms exceeded while setting up "authenticatedPage".
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - complementary [ref=e3]:
      - link "CodeSpectra" [ref=e5] [cursor=pointer]:
        - /url: /
      - generic [ref=e12]:
        - generic [ref=e13]: Code quality + competitive coding, one platform
        - heading "Ship cleaner code. Win the competition." [level=1] [ref=e17]: Ship cleaner code.Win the competition.
        - paragraph [ref=e18]: AI-powered static analysis meets competitive coding challenges. Scan, fix, and compete — all in one workspace.
        - generic [ref=e19]:
          - generic [ref=e20]: AI fix suggestions on every issue
          - generic [ref=e25]: 40+ languages, real test cases, live judging
          - generic [ref=e30]: Quality gates that block bad pushes
        - generic [ref=e37]:
          - generic [ref=e38]: analysis.ts
          - generic [ref=e43]: "// 1 bug, 2 smells found function analyze(code) { if (code == null) { // 🟢 use === instead } return runQualityGate(code) }"
      - generic [ref=e44]:
        - generic [ref=e45]: © 2026 CodeSpectra
        - generic [ref=e46]:
          - link "Privacy" [ref=e47] [cursor=pointer]:
            - /url: /privacy
          - link "Terms" [ref=e48] [cursor=pointer]:
            - /url: /terms
    - main [ref=e49]:
      - generic [ref=e50]:
        - generic [ref=e51]:
          - heading "Sign in to your account" [level=2] [ref=e52]
          - paragraph [ref=e53]:
            - text: New to CodeSpectra?
            - link "Create an account" [ref=e54] [cursor=pointer]:
              - /url: /auth/signup
        - generic [ref=e55]:
          - button "Google" [disabled]
          - button "GitHub" [disabled]
        - generic [ref=e56]: or sign in with email
        - generic [ref=e61]:
          - generic [ref=e62]:
            - generic [ref=e63]: Email
            - textbox "Email" [ref=e68]:
              - /placeholder: you@example.com
              - text: test@codespectra.io
          - generic [ref=e69]:
            - generic [ref=e70]:
              - generic [ref=e71]: Password
              - link "Forgot password?" [ref=e72] [cursor=pointer]:
                - /url: /auth/forgot-password
            - generic [ref=e73]:
              - textbox "Password" [ref=e77]:
                - /placeholder: Enter your password
                - text: Test@123456
              - button [ref=e78]
          - generic [ref=e82] [cursor=pointer]:
            - checkbox "Keep me signed in" [checked] [ref=e83]
            - generic [ref=e84]: Keep me signed in
          - button "Sign in" [disabled]
        - paragraph [ref=e85]:
          - text: By signing in you agree to our
          - link "Terms" [ref=e86] [cursor=pointer]:
            - /url: /terms
          - text: and
          - link "Privacy Policy" [ref=e87] [cursor=pointer]:
            - /url: /privacy
          - text: .
  - button "Open Next.js Dev Tools" [ref=e93] [cursor=pointer]:
    - generic [ref=e96]:
      - text: Compiling
      - generic [ref=e97]:
        - generic [ref=e98]: .
        - generic [ref=e99]: .
        - generic [ref=e100]: .
  - alert [ref=e101]
```