const fs = require('fs')
const path = require('path')

const clientFiles = JSON.parse(fs.readFileSync('audit-client.json', 'utf8'))

clientFiles.forEach(({ filePath }) => {
  let content = fs.readFileSync(filePath, 'utf8')
  
  // Find all `import ... from 'lucide-react'`
  const lucideRegex = /import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/g
  
  let matches = [...content.matchAll(lucideRegex)]
  if (matches.length > 1) {
    // If multiple imports from lucide-react exist, merge them
    const allImports = new Set()
    for (const match of matches) {
      const parts = match[1].split(',').map(s => s.trim()).filter(Boolean)
      parts.forEach(p => allImports.add(p))
    }
    
    // Replace the first match with the merged imports
    let first = true
    content = content.replace(lucideRegex, (match) => {
      if (first) {
        first = false
        return `import { ${Array.from(allImports).join(', ')} } from 'lucide-react'`
      }
      return '' // Remove subsequent duplicate import statements
    })
    
    // Clean up empty lines that might have been left
    content = content.replace(/\n\n\n+/g, '\n\n')
    
    fs.writeFileSync(filePath, content)
  }
})

console.log('Duplicate lucide-react imports merged.')
