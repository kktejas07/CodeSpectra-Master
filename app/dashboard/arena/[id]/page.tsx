'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Code2, Play, CheckCircle, AlertCircle } from 'lucide-react'

export default function ChallengePage({ params }: { params: { id: string } }) {
  const [code, setCode] = useState(`function solution(nums, target) {
  // Write your solution here
  return [];
}`)
  const [language, setLanguage] = useState('javascript')
  const [submitted, setSubmitted] = useState(false)
  const [results, setResults] = useState<any>(null)

  const handleSubmit = async () => {
    setSubmitted(true)
    // Mock submission
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setResults({
      passed: 5,
      total: 5,
      runtime: '45ms',
      memory: '42.5MB',
    })
  }

  const handleRun = async () => {
    // Mock run
    console.log('Running code...')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Code2 className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Two Sum</h1>
        </div>
        <div className="flex gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400">
            EASY
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
            Arrays
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400">
            100 Points
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Problem Description */}
        <div className="space-y-4">
          <div className="p-6 rounded-lg bg-card border border-border space-y-4">
            <div>
              <h2 className="font-bold text-foreground mb-2">Problem Description</h2>
              <p className="text-foreground/70 text-sm leading-relaxed">
                Given an array of integers nums and an integer target, return the indices of the two
                numbers such that they add up to target.
              </p>
              <p className="text-foreground/70 text-sm leading-relaxed mt-2">
                You may assume that each input has exactly one solution, and you may not use the same
                element twice. You can return the answer in any order.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-foreground">Example</h3>
              <div className="p-3 rounded bg-background font-mono text-sm">
                <p className="text-foreground/80">Input: nums = [2,7,11,15], target = 9</p>
                <p className="text-foreground/80">Output: [0,1]</p>
                <p className="text-foreground/50 text-xs mt-2">Because nums[0] + nums[1] == 9, we return [0, 1].</p>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-foreground">Constraints</h3>
              <ul className="text-foreground/70 text-sm space-y-1">
                <li>• 2 &lt;= nums.length &lt;= 10⁴</li>
                <li>• -10⁹ &lt;= nums[i] &lt;= 10⁹</li>
                <li>• -10⁹ &lt;= target &lt;= 10⁹</li>
                <li>• Only one valid answer exists.</li>
              </ul>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-bold text-foreground mb-2">Test Cases</h3>
              <div className="space-y-2">
                <div className="p-3 rounded bg-background text-sm">
                  <p className="text-green-400 font-medium">✓ Test 1</p>
                  <p className="text-foreground/60 text-xs">nums = [2,7,11,15], target = 9</p>
                </div>
                <div className="p-3 rounded bg-background text-sm">
                  <p className="text-green-400 font-medium">✓ Test 2</p>
                  <p className="text-foreground/60 text-xs">nums = [3,2,4], target = 6</p>
                </div>
                <div className="p-3 rounded bg-background text-sm">
                  <p className="text-green-400 font-medium">✓ Test 3</p>
                  <p className="text-foreground/60 text-xs">nums = [3,3], target = 6</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Code Editor */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-card border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="cpp">C++</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Code</label>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full h-96 p-4 rounded-lg bg-background border border-border text-foreground placeholder:text-foreground/50 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          <div className="flex gap-3">
            <Button onClick={handleRun} variant="outline" className="flex-1">
              <Play className="w-4 h-4 mr-2" />
              Run Code
            </Button>
            <Button onClick={handleSubmit} disabled={submitted} className="flex-1">
              Submit Solution
            </Button>
          </div>

          {/* Results */}
          {results && (
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="font-bold text-green-400">All Tests Passed!</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-foreground/70">
                <div>
                  <p className="text-xs text-foreground/50">Test Cases</p>
                  <p className="font-bold text-foreground">{results.passed}/{results.total}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground/50">Runtime</p>
                  <p className="font-bold text-foreground">{results.runtime}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground/50">Memory</p>
                  <p className="font-bold text-foreground">{results.memory}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
