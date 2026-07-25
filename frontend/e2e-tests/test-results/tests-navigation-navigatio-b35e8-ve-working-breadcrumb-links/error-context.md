# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/navigation/navigation.spec.ts >> Navigation Tests >> Breadcrumbs >> should have working breadcrumb links
- Location: tests/navigation/navigation.spec.ts:98:9

# Error details

```
Test timeout of 30000ms exceeded while setting up "authenticatedPage".
```

# Page snapshot

```yaml
- generic [active]:
  - generic [ref=e5] [cursor=pointer]:
    - button "Open Next.js Dev Tools" [ref=e6]
    - generic [ref=e10]:
      - button "Open issues overlay" [ref=e11]:
        - generic [ref=e12]:
          - generic [ref=e13]: "0"
          - generic [ref=e14]: "1"
        - generic [ref=e15]: Issue
      - button "Collapse issues badge" [ref=e16]
  - alert [ref=e19]
```