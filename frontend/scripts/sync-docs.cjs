#!/usr/bin/env node
/**
 * Keep frontend/docs in sync with repo-root docs/ for Docker builds.
 * Build context is frontend/, so markdown must live under frontend/docs.
 * Source of truth: ../docs/{public,user}
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

for (const section of ['public', 'user']) {
  const src = path.join(rootDocs, section)
  if (!fs.existsSync(src)) continue
  const dest = path.join(destDocs, section)
  fs.rmSync(dest, { recursive: true, force: true })
  copyDir(src, dest)
}
console.log('[sync-docs] mirrored docs/public + docs/user → frontend/docs')
