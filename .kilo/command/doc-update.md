# doc-update

Scan the codebase for changes and update all documentation to match current state.

## Usage

```
.kilo doc-update [--full] [--check-only]

  --full       Regenerate all documentation from scratch (slow)
  --check-only Only check for drift, don't make changes
```

## Configuration

```yaml
name: doc-update
description: >
  Scan the codebase for changes and update all documentation to match current state.

usage: |
  .kilo doc-update [--full] [--check-only]

  --full       Regenerate all documentation from scratch (slow)
  --check-only Only check for drift, don't make changes

steps:
  - name: "Scan API Routes"
    run: |
      Count route.ts files and compare to docs/api/01-Overview.md
      Check for new auth patterns or middleware changes

  - name: "Scan Database Schemas"
    run: |
      Check frontend/lib/db/ for new collection definitions
      Verify data dictionary in docs/database/02-Data-Dictionary.md

  - name: "Scan Pages"
    run: |
      Check frontend/app/ for new page.tsx files
      Verify feature matrix in docs/roadmap/02-Feature-Matrix.md

  - name: "Scan Components"
    run: |
      Check frontend/components/ for new components
      Verify component documentation in docs/developer/03-folder-structure.md

  - name: "Update Timestamps"
    run: |
      Update "Last Updated" timestamps on all modified docs

  - name: "Generate Report"
    run: |
      Output summary of changes made
      List any documentation gaps found
```

## Examples

```bash
# Quick drift check
.kilo doc-update --check-only

# Full regeneration
.kilo doc-update --full

# Normal incremental update
.kilo doc-update
```
