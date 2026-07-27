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

  // Regex to remove the import
  const importRegex = /import\s+\{\s*LoadingSpinner\s*\}\s+from\s+['"]@\/components\/ui\/loading-spinner['"]\n?/g
  if (importRegex.test(content)) {
    content = content.replace(importRegex, '')
    modified = true
  }

  // Regex to revert `return <LoadingSpinner />` to `return null`
  const spinnerReturnRegex = /if\s*\(!gate\.ready\)\s*return\s+<LoadingSpinner\s*\/>/g
  if (spinnerReturnRegex.test(content)) {
    content = content.replace(spinnerReturnRegex, 'if (!gate.ready) return null')
    modified = true
  }

  if (modified) {
    fs.writeFileSync(filePath, content)
    count++
    console.log(`Reverted ${filePath}`)
  }
})

console.log(`Finished reverting ${count} files.`)
