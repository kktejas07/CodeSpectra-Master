# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/ui/ui.spec.ts >> UI Testing >> Broken Buttons >> should not have disabled buttons that appear clickable
- Location: tests/ui/ui.spec.ts:14:9

# Error details

```
Test timeout of 30000ms exceeded while setting up "authenticatedPage".
```

# Page snapshot

```yaml
- generic [active]:
  - button "Open Next.js Dev Tools" [ref=e6] [cursor=pointer]:
    - generic [ref=e9]:
      - text: Rendering
      - generic [ref=e10]:
        - generic [ref=e11]: .
        - generic [ref=e12]: .
        - generic [ref=e13]: .
  - alert [ref=e14]
```