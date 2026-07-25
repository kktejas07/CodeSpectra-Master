# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/forms/forms.spec.ts >> Forms Validation Tests >> Date Validation >> should accept valid date formats
- Location: tests/forms/forms.spec.ts:184:9

# Error details

```
Test timeout of 30000ms exceeded while setting up "authenticatedPage".
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]: CodeSpectra
    - generic [ref=e9]:
      - generic [ref=e10]: scan — codespectra
      - generic [ref=e15]:
        - generic [ref=e16]:
          - generic [ref=e17]: "1"
          - text: "import { Scanner } from \"codespectra\""
        - generic [ref=e18]:
          - generic [ref=e19]: "2"
          - text: const analyzer = new Scanner()
        - generic [ref=e20]:
          - generic [ref=e21]: "3"
          - text: const issues = analyzer.scan(code)
        - generic [ref=e22]:
          - generic [ref=e23]: "4"
          - text: "issues.forEach(i => {"
        - generic [ref=e24]:
          - generic [ref=e25]: "5"
          - text: const fix = ai.suggestFix(i)
        - generic [ref=e26]:
          - generic [ref=e27]: "6"
          - text: "console.log(`Fixed: ${i.id}`)"
        - generic [ref=e28]:
          - generic [ref=e29]: "7"
          - text: "})"
        - generic [ref=e30]:
          - generic [ref=e31]: "8"
          - text: "if (issues.length === 0) {"
        - generic [ref=e32]:
          - generic [ref=e33]: "9"
          - text: console.log("Clean build")
        - generic [ref=e34]:
          - generic [ref=e35]: "10"
          - text: "}"
        - generic [ref=e36]:
          - generic [ref=e37]: "11"
          - text: analyzer.generateReport()
    - generic [ref=e42]:
      - generic [ref=e43]: SCANNING
      - generic [ref=e44]: 77%
  - generic [ref=e45]:
    - complementary [ref=e46]:
      - link "CodeSpectra" [ref=e48] [cursor=pointer]:
        - /url: /
      - generic [ref=e55]:
        - generic [ref=e56]: Code quality + competitive coding, one platform
        - heading "Ship cleaner code. Win the competition." [level=1] [ref=e60]: Ship cleaner code.Win the competition.
        - paragraph [ref=e61]: AI-powered static analysis meets competitive coding challenges. Scan, fix, and compete — all in one workspace.
        - generic [ref=e62]:
          - generic [ref=e63]: AI fix suggestions on every issue
          - generic [ref=e68]: 40+ languages, real test cases, live judging
          - generic [ref=e73]: Quality gates that block bad pushes
        - generic [ref=e80]:
          - generic [ref=e81]: analysis.ts
          - generic [ref=e86]: "// 1 bug, 2 smells found function analyze(code) { if (code == null) { // 🟢 use === instead } return runQualityGate(code) }"
      - generic [ref=e87]:
        - generic [ref=e88]: © 2026 CodeSpectra
        - generic [ref=e89]:
          - link "Privacy" [ref=e90] [cursor=pointer]:
            - /url: /privacy
          - link "Terms" [ref=e91] [cursor=pointer]:
            - /url: /terms
    - main [ref=e92]:
      - generic [ref=e93]:
        - generic [ref=e94]:
          - heading "Sign in to your account" [level=2] [ref=e95]
          - paragraph [ref=e96]:
            - text: New to CodeSpectra?
            - link "Create an account" [ref=e97] [cursor=pointer]:
              - /url: /auth/signup
        - generic [ref=e98]:
          - button "Google" [ref=e99]
          - button "GitHub" [ref=e100]
        - generic [ref=e101]: or sign in with email
        - generic [ref=e106]:
          - generic [ref=e107]:
            - generic [ref=e108]: Email
            - textbox "Email" [ref=e113]:
              - /placeholder: you@example.com
              - text: test@codespectra.io
          - generic [ref=e114]:
            - generic [ref=e115]:
              - generic [ref=e116]: Password
              - link "Forgot password?" [ref=e117] [cursor=pointer]:
                - /url: /auth/forgot-password
            - generic [ref=e118]:
              - textbox "Password" [active] [ref=e122]:
                - /placeholder: Enter your password
                - text: Test@123456
              - button [ref=e123]
          - generic [ref=e127] [cursor=pointer]:
            - checkbox "Keep me signed in" [checked] [ref=e128]
            - generic [ref=e129]: Keep me signed in
          - button "Sign in" [ref=e130]
        - paragraph [ref=e131]:
          - text: By signing in you agree to our
          - link "Terms" [ref=e132] [cursor=pointer]:
            - /url: /terms
          - text: and
          - link "Privacy Policy" [ref=e133] [cursor=pointer]:
            - /url: /privacy
          - text: .
  - button "Open Next.js Dev Tools" [ref=e139] [cursor=pointer]:
    - generic [ref=e142]:
      - text: Compiling
      - generic [ref=e143]:
        - generic [ref=e144]: .
        - generic [ref=e145]: .
        - generic [ref=e146]: .
  - alert [ref=e147]
```