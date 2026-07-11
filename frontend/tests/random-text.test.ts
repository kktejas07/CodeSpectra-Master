import { describe, it, expect } from 'vitest'
import { analyzeCodeLocally } from '../lib/local-code-analyzer'
import { toClientAnalysisPayload } from '../lib/scanner-analysis-mapper'

describe('Random text check vs Real code check', () => {
  it('checks output for random text 1', () => {
    const raw = analyzeCodeLocally('if we added random text also it hsows 100% code corrct fix it please', 'javascript')
    console.log('Random Text 1 Raw Quality:', raw.quality)
    const payload = toClientAnalysisPayload(raw)
    console.log('Random Text 1 Payload Quality:', payload.quality)
    console.log('Random Text 1 Best Practices:', payload.bestPractices)
  })

  it('checks output for random text 2 with punctuation', () => {
    const raw = analyzeCodeLocally('hello world (this is random text) = 100; and more text here that is not code.', 'javascript')
    console.log('Random Text 2 Raw Quality:', raw.quality)
    const payload = toClientAnalysisPayload(raw)
    console.log('Random Text 2 Payload Quality:', payload.quality)
  })

  it('checks output for real TypeScript code', () => {
    const code = `
      function calculateTotal(items: number[]): number {
        if (!items || items.length === 0) {
          return 0;
        }
        return items.reduce((acc, curr) => acc + curr, 0);
      }
    `
    const raw = analyzeCodeLocally(code, 'typescript')
    console.log('Real TS Code Raw Quality:', raw.quality)
    const payload = toClientAnalysisPayload(raw)
    console.log('Real TS Code Payload Quality:', payload.quality)
  })
})
