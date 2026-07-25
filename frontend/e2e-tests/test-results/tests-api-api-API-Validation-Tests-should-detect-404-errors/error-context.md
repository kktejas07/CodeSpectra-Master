# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/api/api.spec.ts >> API Validation Tests >> should detect 404 errors
- Location: tests/api/api.spec.ts:99:7

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