# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/forms/forms.spec.ts >> Forms Validation Tests >> Radio Buttons >> should deselect other radios in group
- Location: tests/forms/forms.spec.ts:323:9

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
        - generic [ref=f1e63]: Internal server error
        - generic [ref=f1e67]:
          - generic [ref=f1e68]:
            - generic [ref=f1e69]: Email
            - textbox "Email" [ref=f1e74]:
              - /placeholder: you@example.com
              - text: test@codespectra.io
          - generic [ref=f1e75]:
            - generic [ref=f1e76]:
              - generic [ref=f1e77]: Password
              - link "Forgot password?" [ref=f1e78] [cursor=pointer]:
                - /url: /auth/forgot-password
            - generic [ref=f1e79]:
              - textbox "Password" [ref=f1e83]:
                - /placeholder: Enter your password
                - text: Test@123456
              - button [ref=f1e84]
          - generic [ref=f1e88] [cursor=pointer]:
            - checkbox "Keep me signed in" [checked] [ref=f1e89]
            - generic [ref=f1e90]: Keep me signed in
          - button "Sign in" [ref=f1e91]
        - paragraph [ref=f1e92]:
          - text: By signing in you agree to our
          - link "Terms" [ref=f1e93] [cursor=pointer]:
            - /url: /terms
          - text: and
          - link "Privacy Policy" [ref=f1e94] [cursor=pointer]:
            - /url: /privacy
          - text: .
  - button "Open Next.js Dev Tools" [ref=f1e100] [cursor=pointer]:
    - generic [ref=f1e103]:
      - text: Compiling
      - generic [ref=f1e104]:
        - generic [ref=f1e105]: .
        - generic [ref=f1e106]: .
        - generic [ref=f1e107]: .
  - alert [ref=f1e108]
```