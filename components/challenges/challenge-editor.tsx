'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Play, Send, Copy, RotateCcw, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'

interface ChallengeEditorProps {
  challengeId: string
  title: string
  description: string
  examples: Array<{
    input: string
    output: string
    explanation?: string
  }>
  initialCode?: string
}

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
]

const LANGUAGE_TEMPLATES: Record<string, string> = {
  javascript: `function solve(input) {
  // Write your solution here
  
  return result;
}`,
  python: `def solve(input):
    # Write your solution here
    
    return result`,
  java: `public class Solution {
    public static void solve(String input) {
        // Write your solution here
    }
}`,
  cpp: `#include <iostream>
using namespace std;

int main() {
    // Write your solution here
    
    return 0;
}`,
}

export function ChallengeEditor({ challengeId, title, description, examples, initialCode }: ChallengeEditorProps) {
  const [language, setLanguage] = useState('javascript')
  const [code, setCode] = useState(initialCode || LANGUAGE_TEMPLATES[language] || '')
  const [testResults, setTestResults] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleRunTests = async () => {
    setRunning(true)
    try {
      // Simulate running tests
      await new Promise((resolve) => setTimeout(resolve, 1500))
      setTestResults({
        status: 'passed',
        testsPassed: 5,
        totalTests: 5,
        executionTime: '145ms',
        memory: '32.5MB',
        feedback: 'All test cases passed! Great job.',
      })
    } catch (error) {
      setTestResults({
        status: 'failed',
        testsPassed: 3,
        totalTests: 5,
        error: 'Test case 4 failed',
        feedback: 'Output does not match expected result',
      })
    } finally {
      setRunning(false)
    }
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      // Simulate submission
      await new Promise((resolve) => setTimeout(resolve, 2000))
      setTestResults({
        status: 'accepted',
        testsPassed: 5,
        totalTests: 5,
        executionTime: '145ms',
        memory: '32.5MB',
        feedback: 'Your solution is accepted!',
        difficulty: 'Medium',
        successRate: '94.87%',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang)
    setCode(LANGUAGE_TEMPLATES[newLang] || '')
    setTestResults(null)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-screen max-h-screen">
      {/* Problem Statement */}
      <div className="flex flex-col overflow-hidden border-r border-border/40">
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Header */}
          <div>
            <Badge className="mb-2">Coding Challenge</Badge>
            <h1 className="text-2xl font-bold mb-2">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>

          {/* Examples */}
          <div className="space-y-4">
            <h3 className="font-semibold">Examples</h3>
            {examples.map((example, idx) => (
              <Card key={idx} className="p-4 bg-muted/30 border-border/40">
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Input</p>
                    <pre className="bg-background p-2 rounded text-xs overflow-auto border border-border/40">
                      {example.input}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Output</p>
                    <pre className="bg-background p-2 rounded text-xs overflow-auto border border-border/40">
                      {example.output}
                    </pre>
                  </div>
                  {example.explanation && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Explanation</p>
                      <p className="text-sm text-muted-foreground">{example.explanation}</p>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Constraints */}
          <div className="space-y-2">
            <h3 className="font-semibold">Constraints</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Time Limit: 1 second</li>
              <li>Memory Limit: 256 MB</li>
              <li>Maximum input size: 10^5</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Code Editor */}
      <div className="flex flex-col overflow-hidden">
        {/* Editor Toolbar */}
        <div className="border-b border-border/40 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1">
              <Select value={language} onValueChange={handleLanguageChange}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setCode('')} className="gap-2">
                <RotateCcw className="w-4 h-4" />
                Reset
              </Button>
            </div>
            <Button variant="outline" size="sm" className="gap-2">
              <Copy className="w-4 h-4" />
              Copy
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button onClick={handleRunTests} disabled={running || !code.trim()} className="flex-1 gap-2">
              <Play className="w-4 h-4" />
              {running ? 'Running...' : 'Run Code'}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !code.trim()}
              variant="default"
              className="flex-1 gap-2"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'Submitting...' : 'Submit Code'}
            </Button>
          </div>
        </div>

        {/* Editor and Results */}
        <Tabs defaultValue="editor" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full rounded-none border-b border-border/40">
            <TabsTrigger value="editor" className="flex-1">
              Code
            </TabsTrigger>
            <TabsTrigger value="results" className="flex-1">
              Results
            </TabsTrigger>
          </TabsList>

          <TabsContent value="editor" className="flex-1 overflow-hidden m-0">
            <div className="h-full p-4">
              <Textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="h-full font-mono text-sm resize-none"
                placeholder="Write your code here..."
              />
            </div>
          </TabsContent>

          <TabsContent value="results" className="flex-1 overflow-auto m-0 p-4 space-y-4">
            {!testResults ? (
              <div className="text-center py-8">
                <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Run or submit your code to see results</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Status */}
                <Card
                  className={`p-4 border ${
                    testResults.status === 'accepted'
                      ? 'bg-green-500/10 border-green-500/20'
                      : testResults.status === 'passed'
                        ? 'bg-blue-500/10 border-blue-500/20'
                        : 'bg-red-500/10 border-red-500/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {testResults.status === 'accepted' ? (
                      <CheckCircle className="w-6 h-6 text-green-500" />
                    ) : testResults.status === 'passed' ? (
                      <CheckCircle className="w-6 h-6 text-blue-500" />
                    ) : (
                      <AlertCircle className="w-6 h-6 text-red-500" />
                    )}
                    <div>
                      <p className="font-semibold capitalize">{testResults.status}</p>
                      <p className="text-sm text-muted-foreground">{testResults.feedback}</p>
                    </div>
                  </div>
                </Card>

                {/* Results Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <Card className="p-3 bg-muted/30 border-border/40">
                    <p className="text-xs text-muted-foreground mb-1">Test Cases</p>
                    <p className="text-lg font-bold">
                      {testResults.testsPassed}/{testResults.totalTests}
                    </p>
                  </Card>
                  <Card className="p-3 bg-muted/30 border-border/40">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <Clock className="w-3 h-3" />
                      <span>Execution Time</span>
                    </div>
                    <p className="text-lg font-bold">{testResults.executionTime}</p>
                  </Card>
                </div>

                {testResults.memory && (
                  <Card className="p-3 bg-muted/30 border-border/40">
                    <p className="text-xs text-muted-foreground mb-1">Memory Usage</p>
                    <p className="text-lg font-bold">{testResults.memory}</p>
                  </Card>
                )}

                {testResults.status === 'accepted' && (
                  <Card className="p-4 bg-green-500/10 border-green-500/20">
                    <p className="text-sm font-semibold text-green-300 mb-2">Achievement Unlocked!</p>
                    <p className="text-xs text-green-200 mb-3">You can now view other users' solutions and compare approaches</p>
                    <Button size="sm" variant="outline" className="w-full">
                      View Discussion
                    </Button>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
