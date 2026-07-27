const fs = require('fs')
const path = require('path')

const clientFiles = JSON.parse(fs.readFileSync('audit-client.json', 'utf8'))

let fixedCount = 0

clientFiles.forEach(({ filePath, mappedRole }) => {
  let content = fs.readFileSync(filePath, 'utf8')
  
  // If it already has usePageGuard somehow, skip
  if (content.includes('usePageGuard')) return
  
  // 1. Inject import
  // Find the last import statement or the 'use client' statement
  const importLines = content.split('\n')
  let lastImportIndex = -1
  let useClientIndex = -1
  
  for (let i = 0; i < importLines.length; i++) {
    if (importLines[i].startsWith('import ')) {
      lastImportIndex = i
    }
    if (importLines[i].includes('use client')) {
      useClientIndex = i
    }
  }
  
  const injectIndex = lastImportIndex !== -1 ? lastImportIndex : (useClientIndex !== -1 ? useClientIndex : 0)
  
  importLines.splice(injectIndex + 1, 0, `import { usePageGuard } from '@/lib/use-page-guard'`)
  importLines.splice(injectIndex + 2, 0, `import { Loader2 } from 'lucide-react'`) // Add loader icon just in case
  
  let newContent = importLines.join('\n')
  
  // 2. Inject hook and loading state
  // Look for `export default function `
  const exportRegex = /export\s+default\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/
  const match = newContent.match(exportRegex)
  
  if (match) {
    const exportIndex = match.index
    const afterExport = exportIndex + match[0].length
    
    const before = newContent.slice(0, afterExport)
    const after = newContent.slice(afterExport)
    
    const injectedBody = `
  const gate = usePageGuard('${mappedRole}')
  if (!gate.ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading...
      </div>
    )
  }
`
    fs.writeFileSync(filePath, before + injectedBody + after)
    fixedCount++
  } else {
    console.log(`Failed to find export default function in ${filePath}`)
  }
})

console.log(`Fixed ${fixedCount} client components.`)
