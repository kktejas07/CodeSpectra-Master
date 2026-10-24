#!/usr/bin/env node
/**
 * Keep frontend/docs in sync with repo-root docs/ for Docker builds.
 * Build context is frontend/, so markdown must live under frontend/docs.
 * Source of truth: ../docs — every folder and root .md file. public + user are
 * served on /docs; the rest are indexed for the admin assistant only
 * (lib/rag/sources/docs.ts INTERNAL_DOC_FOLDERS) and never served.
 * Mirror-only entries (frontend/docs/design, i18n, …) are left alone.
 */
const fs = require('fs')
const path = require('path')

const rootDocs = path.join(__dirname, '..', '..', 'docs')
const destDocs = path.join(__dirname, '..', 'docs')

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else fs.copyFileSync(from, to)
  }
}

if (!fs.existsSync(rootDocs)) {
  // Docker build: only frontend/ is in context; mirror already copied into image.
  if (fs.existsSync(path.join(destDocs, 'public'))) {
    console.log('[sync-docs] using bundled frontend/docs')
    process.exit(0)
  }
  console.warn('[sync-docs] no ../docs and no frontend/docs — /docs pages will 404')
  process.exit(0)
}

fs.mkdirSync(destDocs, { recursive: true })
for (const entry of fs.readdirSync(rootDocs, { withFileTypes: true })) {
  const src = path.join(rootDocs, entry.name)
  const dest = path.join(destDocs, entry.name)
  if (entry.isDirectory()) {
    fs.rmSync(dest, { recursive: true, force: true })
    copyDir(src, dest)
  } else if (entry.name.endsWith('.md')) {
    fs.copyFileSync(src, dest)
  }
}
console.log('[sync-docs] mirrored docs/ → frontend/docs')
