const fs = require('fs')
const path = require('path')

const frontendDir = path.join(__dirname, 'frontend/app/dashboard')
const permissionsFile = path.join(__dirname, 'frontend/lib/page-permissions.ts')

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f)
    let isDirectory = fs.statSync(dirPath).isDirectory()
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f))
  })
}

const permsCode = fs.readFileSync(permissionsFile, 'utf8')
function parseArray(regex) {
  const match = permsCode.match(regex)
  return match ? match[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(s => s && !s.startsWith('//')) : []
}

const ADMIN_ROUTES = parseArray(/export const ADMIN_ONLY_ROUTES: string\[\] = \[\s*([\s\S]*?)\s*\]/)
const TENANT_ROUTES = parseArray(/export const TENANT_ADMIN_ROUTES: string\[\] = \[\s*([\s\S]*?)\s*\]/)
const JUDGE_ROUTES = parseArray(/export const JUDGE_ROUTES: string\[\] = \[\s*([\s\S]*?)\s*\]/)
const USER_ROUTES = parseArray(/export const ALL_USER_ROUTES: string\[\] = \[\s*([\s\S]*?)\s*\]/)

function getRequiredRoleForRoute(route) {
  const base = route.split('?')[0]
  for (const r of TENANT_ROUTES) if (base === r || base.startsWith(r + '/')) return 'tenant_admin'
  for (const r of ADMIN_ROUTES) if (base === r || base.startsWith(r + '/')) return 'superadmin'
  for (const r of JUDGE_ROUTES) if (base === r || base.startsWith(r + '/')) return 'judge'
  for (const r of USER_ROUTES) if (base === r || base.startsWith(r + '/')) return 'user'
  return 'user'
}

let errors = 0
let issues = []
let clientFiles = []
let serverFiles = []
let mismatches = []

walkDir(frontendDir, (filePath) => {
  if (!filePath.endsWith('page.tsx')) return
  
  const relPath = filePath.replace(frontendDir, '').replace(/\/page\.tsx$/, '')
  const route = '/dashboard' + (relPath === '' ? '' : relPath)
  
  const content = fs.readFileSync(filePath, 'utf8')
  
  const isClient = content.includes("'use client'") || content.includes('"use client"')
  const hasHook = content.includes('usePageGuard')
  const match = content.match(/usePageGuard\(\s*(['"][^'"]+['"])?\s*\)/)
  
  const mappedRole = getRequiredRoleForRoute(route)
  
  if (!hasHook) {
    if (isClient) {
      issues.push(`[No Hook - Client] ${route} has no usePageGuard. Should check for '${mappedRole}'`)
      clientFiles.push({ filePath, route, mappedRole })
    } else {
      issues.push(`[No Hook - Server] ${route} is a server component without usePageGuard.`)
      serverFiles.push({ filePath, route, mappedRole })
    }
    errors++
  } else if (match) {
    let arg = match[1] ? match[1].replace(/['"]/g, '') : 'user'
    if (arg.startsWith('/')) {
      const resolvedRole = getRequiredRoleForRoute(arg)
      if (resolvedRole !== mappedRole) {
        issues.push(`[Mismatch] ${route} passes route '${arg}' which resolves to '${resolvedRole}', but route is mapped to '${mappedRole}'`)
        mismatches.push({ filePath, route, mappedRole })
        errors++
      }
    } else {
      if (arg !== mappedRole) {
        issues.push(`[Mismatch] ${route} uses usePageGuard('${arg}') but route is mapped to '${mappedRole}'`)
        mismatches.push({ filePath, route, mappedRole })
        errors++
      }
    }
  }
})

console.log(`Audit Complete. Found ${errors} issues.`)
console.log(issues.join('\n'))

fs.writeFileSync('audit-client.json', JSON.stringify(clientFiles, null, 2))
fs.writeFileSync('audit-server.json', JSON.stringify(serverFiles, null, 2))
fs.writeFileSync('audit-mismatches.json', JSON.stringify(mismatches, null, 2))
