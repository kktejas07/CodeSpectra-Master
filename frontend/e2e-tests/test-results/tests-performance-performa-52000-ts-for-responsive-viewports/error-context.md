# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/performance/performance.spec.ts >> Visual Regression Tests >> should take screenshots for responsive viewports
- Location: tests/performance/performance.spec.ts:297:7

# Error details

```
Test timeout of 30000ms exceeded while setting up "authenticatedPage".
```

# Page snapshot

```yaml
- generic [active]:
  - button "Open Next.js Dev Tools" [ref=e6] [cursor=pointer]:
    - generic [ref=e9]:
      - text: Compiling
      - generic [ref=e10]:
        - generic [ref=e11]: .
        - generic [ref=e12]: .
        - generic [ref=e13]: .
  - alert [ref=e14]
```