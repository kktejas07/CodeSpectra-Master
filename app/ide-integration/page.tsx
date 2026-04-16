'use client'

import { RealtimeAnalyzer } from '@/components/code-scanner/realtime-analyzer'

const sampleCode = `// Example TypeScript code for analysis
function calculateSum(a: number, b: number) {
  console.log('Calculating sum')
  var result = a + b
  return result
}

async function fetchData(url: string) {
  try {
    const response = await fetch(url)
    // TODO fix error handling here
  } catch {
    // Handle error
  }
}

const items = [1, 2, 3]
items.forEach((item) => {
  if (item == 2) {
    console.log('Found item')
  }
})
`

export default function IDEIntegrationPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="max-w-full px-4 py-8">
        <div className="space-y-4 mb-8 max-w-7xl mx-auto">
          <div className="text-center space-y-2 mb-12">
            <h1 className="text-4xl sm:text-5xl font-bold text-foreground">Real-time IDE Integration</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Live code analysis with Monaco Editor, diagnostics panel, and AI-powered quick fixes for instant feedback
            </p>
          </div>
        </div>

        <RealtimeAnalyzer
          initialCode={sampleCode}
          language="typescript"
          onCodeChange={(code) => {
            console.log('[v0] Code changed:', code.length, 'characters')
          }}
        />
      </div>
    </div>
  )
}
