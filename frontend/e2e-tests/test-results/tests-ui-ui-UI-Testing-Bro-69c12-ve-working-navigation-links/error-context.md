# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/ui/ui.spec.ts >> UI Testing >> Broken Links >> should have working navigation links
- Location: tests/ui/ui.spec.ts:52:9

# Error details

```
Test timeout of 30000ms exceeded while setting up "authenticatedPage".
```

# Page snapshot

```yaml
- generic [active]:
  - button "Open Next.js Dev Tools" [ref=f1e6] [cursor=pointer]:
    - generic [ref=f1e9]:
      - text: Compiling
      - generic [ref=f1e10]:
        - generic [ref=f1e11]: .
        - generic [ref=f1e12]: .
        - generic [ref=f1e13]: .
  - alert [ref=f1e14]
```