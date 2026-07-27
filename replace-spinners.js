const fs = require('fs')
const path = require('path')

const targetDir = './frontend/app/dashboard'

function walkSync(currentDirPath, callback) {
  fs.readdirSync(currentDirPath).forEach(function (name) {
    const filePath = path.join(currentDirPath, name)
    const stat = fs.statSync(filePath)
    if (stat.isFile()) {
      callback(filePath, stat)
    } else if (stat.isDirectory()) {
      walkSync(filePath, callback)
    }
  })
}

let count = 0

walkSync(targetDir, (filePath) => {
  if (!filePath.endsWith('page.tsx')) return
  
  let content = fs.readFileSync(filePath, 'utf8')
  if (!content.includes('usePageGuard')) return
  
  let modified = false

  // Replace various return styles for !gate.ready
  // Regex 1: The big block from fix-guards.js
  const bigBlockRegex = /if\s*\(!gate\.ready\)\s*\{\s*return\s*\(\s*<div[^>]*>[\s\S]*?<\/div>\s*\)\s*\}/
  if (bigBlockRegex.test(content)) {
    content = content.replace(bigBlockRegex, 'if (!gate.ready) return <LoadingSpinner />')
    modified = true
  }
  
  // Regex 2: Single line return null or other
  const singleLineRegex = /if\s*\(!gate\.ready\)\s*return\s+(null|<Loader2[^>]*\/>|<div[^>]*>.*<\/div>|<div>.*?<\/div>)/
  if (singleLineRegex.test(content)) {
    content = content.replace(singleLineRegex, 'if (!gate.ready) return <LoadingSpinner />')
    modified = true
  }

  // Regex 3: Return containing <LoadingSpinner /> without being exact matches above
  // Wait, if it already has <LoadingSpinner />, it might be correct.
  // We want to make sure the import is added if it was modified or if it uses LoadingSpinner.
  
  if (content.includes('<LoadingSpinner />') && !content.includes('LoadingSpinner')) {
    // this check is slightly flawed if it's already there, we do a better check below
  }

  if (modified || content.includes('<LoadingSpinner />')) {
    if (!content.includes("from '@/components/ui/loading-spinner'")) {
      // Inject the import
      const importLines = content.split('\n')
      let lastImportIndex = -1
      
      for (let i = 0; i < importLines.length; i++) {
        if (importLines[i].startsWith('import ')) {
          lastImportIndex = i
        }
      }
      
      if (lastImportIndex !== -1) {
        importLines.splice(lastImportIndex + 1, 0, `import { LoadingSpinner } from '@/components/ui/loading-spinner'`)
        content = importLines.join('\n')
      }
    }
    fs.writeFileSync(filePath, content)
    count++
    console.log(`Updated ${filePath}`)
  }
})

console.log(`Finished updating ${count} files.`)
