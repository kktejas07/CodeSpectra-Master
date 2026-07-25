# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/forms/forms.spec.ts >> Forms Validation Tests >> Dropdowns >> should have default selection
- Location: tests/forms/forms.spec.ts:245:9

# Error details

```
Test timeout of 30000ms exceeded while setting up "authenticatedPage".
```

# Page snapshot

```yaml
- generic [active]:
  - generic [ref=f1e2]:
    - generic [ref=f1e3]: CodeSpectra
    - generic [ref=f1e8]:
      - generic [ref=f1e9]: scan — codespectra
      - generic [ref=f1e14]:
        - generic [ref=f1e15]:
          - generic [ref=f1e16]: "1"
          - text: "import { Scanner } from \"codespectra\""
        - generic [ref=f1e17]:
          - generic [ref=f1e18]: "2"
          - text: const analyzer = new Scanner()
        - generic [ref=f1e19]:
          - generic [ref=f1e20]: "3"
          - text: const issues = analyzer.scan(code)
        - generic [ref=f1e21]:
          - generic [ref=f1e22]: "4"
          - text: "issues.forEach(i => {"
        - generic [ref=f1e23]:
          - generic [ref=f1e24]: "5"
          - text: const fix = ai.suggestFix(i)
        - generic [ref=f1e25]:
          - generic [ref=f1e26]: "6"
          - text: "console.log(`Fixed: ${i.id}`)"
        - generic [ref=f1e27]:
          - generic [ref=f1e28]: "7"
          - text: "})"
        - generic [ref=f1e29]:
          - generic [ref=f1e30]: "8"
          - text: "if (issues.length === 0) {"
        - generic [ref=f1e31]:
          - generic [ref=f1e32]: "9"
          - text: console.log("Clean build")
        - generic [ref=f1e33]:
          - generic [ref=f1e34]: "10"
          - text: "}"
        - generic [ref=f1e35]:
          - generic [ref=f1e36]: "11"
          - text: analyzer.generateReport()
    - generic [ref=f1e39]:
      - generic [ref=f1e40]: SCANNING
      - generic [ref=f1e41]: "-3%"
  - button "Open Next.js Dev Tools" [ref=f1e47] [cursor=pointer]
  - alert [ref=f1e51]
```