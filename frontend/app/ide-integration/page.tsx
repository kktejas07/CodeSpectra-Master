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
        <div className="max-w-6xl mx-auto space-y-8 mb-8">
          <div className="text-center space-y-3">
            <h1 className="text-5xl font-bold text-foreground">Real-time IDE integration</h1>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Live code analysis with Monaco Editor, diagnostics panel, and AI-powered quick fixes
            </p>
          </div>
        </div>

        <RealtimeAnalyzer
          initialCode={sampleCode}
          language="typescript"
          onCodeChange={(code) => {
            // Handle code changes
          }}
        />
      </div>
    </div>
  )
}
