#!/usr/bin/env node
/**
 * @anon-aadhaar/core ships `"types": "./src/index.ts"`, which pulls broken
 * upstream .ts into `next build` typecheck. Point types at a stub instead.
 * Runs on prebuild / Docker so Dokploy works even if patch-package ran too early.
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', 'node_modules', '@anon-aadhaar', 'core')
const pkgPath = path.join(root, 'package.json')
if (!fs.existsSync(pkgPath)) process.exit(0)

const stubDir = path.join(root, 'dist')
fs.mkdirSync(stubDir, { recursive: true })
fs.writeFileSync(
  path.join(stubDir, 'index.d.ts'),
  `/** Stub types — upstream points "types" at src/*.ts which fails Next typecheck. */
export declare function verify(pcd: unknown, useTestAadhaar?: boolean): Promise<boolean>
export declare function init(args?: unknown): Promise<void>
export declare const AnonAadhaarCorePackage: unknown
export type AnonAadhaarCore = unknown
export type AnonAadhaarProof = unknown
export type AnonAadhaarArgs = unknown
declare const _default: { verify: typeof verify }
export default _default
`,
)

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
if (pkg.types !== './dist/index.d.ts') {
  pkg.types = './dist/index.d.ts'
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log('[ensure-anon-aadhaar-types] redirected @anon-aadhaar/core types → dist/index.d.ts')
}
