# doc-agent

Maintains all project documentation in sync with the codebase. Runs automatically when code changes are detected.

## Configuration

```yaml
name: doc-agent
type: agent
description: >
  Maintains all project documentation in sync with the codebase.
  Runs automatically when code changes are detected.

trigger:
  events:
    - file_change
    - git_commit
    - git_push
  patterns:
    - "frontend/app/api/**/*.ts"
    - "frontend/lib/**/*.ts"
    - "frontend/app/**/page.tsx"
    - "frontend/components/**/*.tsx"
    - "backend/**/*.py"
    - "docker-compose.yml"
    - "package.json"
    - "requirements.txt"

actions:
  - description: "Update Version History"
    run: |
      Check git log for new commits
      Update docs/developer/04-version-history.md with new entries
      Update timestamps

  - description: "Update API Documentation"
    run: |
      Scan frontend/app/api/ for new/modified route.ts files
      Update docs/api/ with new endpoints

  - description: "Update Database Documentation"
    run: |
      Scan frontend/lib/db/ for new/modified collection definitions
      Update docs/database/ data dictionary and ER diagram

  - description: "Update Feature Matrix"
    run: |
      Scan for new page.tsx files indicating new features
      Update docs/roadmap/02-Feature-Matrix.md

  - description: "Update Architecture Diagrams"
    run: |
      Scan for new components, services, or integration points
      Update docs/architecture/ and docs/diagrams/

  - description: "Update Public Documentation"
    run: |
      Scan for new or modified features, pricing changes
      Update docs/public/  (no internal details exposed)

  - description: "Update Customer Documentation"
    run: |
      Scan for new pages, workflows, UI changes
      Update docs/user/ with updated guides

rules:
  - "Never assume a feature exists without finding it in the codebase"
  - "Mark features as MISSING if not found - never hallucinate"
  - "Update the 'Last Updated' timestamp on every modified doc"
  - "Preserve backward compatibility of documentation structure"
  - "Only update sections that changed - don't regenerate entire documents"
```

## Behavior

The agent activates on any file change, git commit, or git push affecting the monitored patterns. It performs targeted scans of the affected areas and updates only the relevant documentation sections. It never hallucinates features — every documented capability must be verified in the codebase.
