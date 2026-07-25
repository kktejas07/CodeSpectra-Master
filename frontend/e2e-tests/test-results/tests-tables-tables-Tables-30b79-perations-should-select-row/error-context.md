# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/tables/tables.spec.ts >> Tables Tests >> Table Operations >> should select row
- Location: tests/tables/tables.spec.ts:307:9

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
      - generic [ref=e11]:
        - generic [ref=e12]: Code quality + competitive coding, one platform
        - heading "Ship cleaner code. Win the competition." [level=1] [ref=e16]: Ship cleaner code.Win the competition.
        - paragraph [ref=e17]: AI-powered static analysis meets competitive coding challenges. Scan, fix, and compete — all in one workspace.
        - generic [ref=e18]:
          - generic [ref=e19]: AI fix suggestions on every issue
          - generic [ref=e23]: 40+ languages, real test cases, live judging
          - generic [ref=e27]: Quality gates that block bad pushes
        - generic [ref=e33]:
          - generic [ref=e34]: analysis.ts
          - generic [ref=e35]: "// 1 bug, 2 smells found function analyze(code) { if (code == null) { // 🟢 use === instead } return runQualityGate(code) }"
      - generic [ref=e36]:
        - text: © 2026 CodeSpectra
        - generic [ref=e37]:
          - link "Privacy" [ref=e38] [cursor=pointer]:
            - /url: /privacy
          - link "Terms" [ref=e39] [cursor=pointer]:
            - /url: /terms
    - main [ref=e40]:
      - generic [ref=e41]:
        - generic [ref=e42]:
          - link "CodeSpectra" [ref=e43] [cursor=pointer]:
            - /url: /
          - link "← Back to home" [ref=e49] [cursor=pointer]:
            - /url: /
        - generic [ref=e50]:
          - heading "Sign in to your account" [level=2] [ref=e51]
          - paragraph [ref=e52]:
            - text: New to CodeSpectra?
            - link "Create an account" [ref=e53] [cursor=pointer]:
              - /url: /auth/signup
        - generic [ref=e54]:
          - button "Google" [ref=e55]
          - button "GitHub" [ref=e61]
        - generic [ref=e65]: or sign in with email
        - generic [ref=e67]: Internal server error
        - generic [ref=e70]:
          - generic [ref=e71]:
            - text: Email
            - textbox "Email" [ref=e76]:
              - /placeholder: you@example.com
              - text: test@codespectra.io
          - generic [ref=e77]:
            - generic [ref=e78]:
              - text: Password
              - link "Forgot password?" [ref=e79] [cursor=pointer]:
                - /url: /auth/forgot-password
            - generic [ref=e80]:
              - textbox "Password" [ref=e84]:
                - /placeholder: Enter your password
                - text: Test@123456
              - button [ref=e85]
          - generic [ref=e89]:
            - checkbox "Keep me signed in" [checked] [ref=e90]
            - text: Keep me signed in
          - button "Sign in" [ref=e91]
        - paragraph [ref=e94]:
          - text: By signing in you agree to our
          - link "Terms" [ref=e95] [cursor=pointer]:
            - /url: /terms
          - text: and
          - link "Privacy Policy" [ref=e96] [cursor=pointer]:
            - /url: /privacy
          - text: .
  - button "Open Next.js Dev Tools" [ref=e102] [cursor=pointer]:
    - generic [ref=e105]:
      - text: Compiling
      - generic [ref=e106]:
        - generic [ref=e107]: .
        - generic [ref=e108]: .
        - generic [ref=e109]: .
  - alert [ref=e110]
```