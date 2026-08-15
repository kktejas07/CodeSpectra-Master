'use client'

import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Play,
  Send,
  Copy,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  Loader2,
  HelpCircle,
  BookOpen,
  ChevronUp,
  Star,
  MessageSquare,
  Share2,
  Trophy,
} from 'lucide-react'
import { Github } from '@/components/ui/brand-icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { csrfFetch } from '@/lib/csrf-fetch'

const Editor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  ),
})

interface ChallengeEditorProps {
  challengeId: string
  title: string
  description: string
  descriptionComponent?: React.ReactNode | null
  examples: Array<{
    input: string
    output: string
    explanation?: string
  }>
  initialCode?: string
  problemSlug?: string
  hackathonId?: string
  constraints?: string
  inputFormat?: string
  outputFormat?: string
  onSubmitSuccess?: (result: any) => void
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
  // Your code here

  return result;
}

// Optional: handle stdin
const input = require('fs').readFileSync('/dev/stdin', 'utf8').trim();
const lines = input.split('\\n');
// Process lines[0], lines[1], etc.
console.log(solve(lines[0]));`,
  typescript: `function solve(input: string): string {
  // Your code here

  return result;
}

// Optional: handle stdin
const input = require('fs').readFileSync('/dev/stdin', 'utf8').trim();
const lines = input.split('\\n');
// Process lines[0], lines[1], etc.
console.log(solve(lines[0]));`,
  python: `import sys

def solve(input_str):
    # Your code here
    lines = input_str.strip().split('\\n')
    return result

# Read from stdin
input_data = sys.stdin.read().strip()
print(solve(input_data))`,
  java: `import java.util.*;
import java.io.*;

public class Solution {
    public static String solve(String input) {
        // Your code here
        String[] lines = input.trim().split("\\n");
        return result;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) {
            sb.append(line).append("\\n");
        }
        System.out.println(solve(sb.toString()));
    }
}`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

string solve(string input) {
    // Your code here
    stringstream ss(input);
    string line;
    vector<string> lines;
    while (getline(ss, line)) {
        lines.push_back(line);
    }
    return result;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(NULL);

    string input, line;
    while (getline(cin, line)) {
        input += line + "\\n";
    }
    cout << solve(input);
    return 0;
}`,
}

const GETTING_STARTED_STEPS = [
  {
    icon: <BookOpen className="w-4 h-4 text-primary" />,
    title: 'Read the problem',
    desc: 'Understand what needs to be solved. Check examples and constraints.',
  },
  {
    icon: <MessageSquare className="w-4 h-4 text-primary" />,
    title: 'Write your solution',
    desc: 'Select your preferred language and write code in the editor.',
  },
  {
    icon: <Play className="w-4 h-4 text-primary" />,
    title: 'Run your code',
    desc: 'Click "Run Code" to test against sample inputs before submitting.',
  },
  {
    icon: <Send className="w-4 h-4 text-primary" />,
    title: 'Submit for scoring',
    desc: 'Click "Submit Code" to run against all test cases and get your score.',
  },
]

export function ChallengeEditor({
  challengeId,
  title,
  description,
  descriptionComponent,
  examples,
  initialCode,
  problemSlug,
  hackathonId,
  constraints,
  inputFormat,
  outputFormat,
  onSubmitSuccess,
}: ChallengeEditorProps) {
  const [language, setLanguage] = useState('javascript')
  const [code, setCode] = useState(initialCode || LANGUAGE_TEMPLATES[language] || '')
  const codeRef = useRef(code)
  codeRef.current = code
  const [testResults, setTestResults] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [lastSubmissionId, setLastSubmissionId] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [githubRepo, setGithubRepo] = useState('')
  const [submittingGithub, setSubmittingGithub] = useState(false)
  const [githubSubmitted, setGithubSubmitted] = useState(false)
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'))
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  const handleRunTests = async () => {
    if (!codeRef.current.trim() || !problemSlug) return
    setRunning(true)
    setTestResults(null)
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          problem_slug: problemSlug,
          language,
          source_code: codeRef.current,
          mode: 'run',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Run failed')
      setTestResults({
        status: data.status,
        testsPassed: data.passed_tests,
        totalTests: data.total_tests,
        executionTime: `${data.total_time_ms}ms`,
        feedback:
          data.status === 'accepted'
            ? 'All sample tests passed!'
            : data.stderr_excerpt || 'Some tests failed',
        results: data.results,
      })
    } catch (error: any) {
      setTestResults({
        status: 'error',
        feedback: error.message,
        testsPassed: 0,
        totalTests: 0,
      })
    } finally {
      setRunning(false)
    }
  }

  const handleSubmit = async () => {
    if (!codeRef.current.trim() || !problemSlug) return
    setSubmitting(true)
    setTestResults(null)
    try {
      const res = await csrfFetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          problem_slug: problemSlug,
          language,
          source_code: codeRef.current,
          mode: 'submit',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Submit failed')

      if (hackathonId) {
        await csrfFetch(`/api/hackathons/${hackathonId}/submissions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            problem_slug: problemSlug,
            code: codeRef.current,
            language,
          }),
        }).catch(() => {})
      }

      setLastSubmissionId(data.submissionId)
      setTestResults({
        status: data.status,
        testsPassed: data.passed_tests,
        totalTests: data.total_tests,
        executionTime: `${data.total_time_ms}ms`,
        feedback:
          data.status === 'accepted'
            ? 'Your solution is accepted!'
            : data.stderr_excerpt || 'Not all tests passed',
        score: data.score,
      })
      if (onSubmitSuccess) onSubmitSuccess(data)
      if (data.status === 'accepted' || data.status === 'passed') {
        setShowSuccessModal(true)
      }
    } catch (error: any) {
      setTestResults({
        status: 'error',
        feedback: error.message,
        testsPassed: 0,
        totalTests: 0,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang)
    if (!initialCode) {
      setCode(LANGUAGE_TEMPLATES[newLang] || '')
    }
    setTestResults(null)
  }

  const handleSubmitGithub = async () => {
    if (!githubRepo.trim()) return
    setSubmittingGithub(true)
    try {
      if (hackathonId) {
        await csrfFetch(`/api/hackathons/${hackathonId}/submissions`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            problem_slug: problemSlug,
            github_repo: githubRepo.trim(),
          }),
        })
      }
      setGithubSubmitted(true)
    } catch {
    } finally {
      setSubmittingGithub(false)
    }
  }

  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-0 h-full overflow-hidden bg-background">
      {/* ─── Left Panel: Problem Statement ─── */}
      <div className="flex flex-col overflow-hidden border-r border-border/40 bg-card/30">
        {/* Header */}
        <div className="border-b border-border/40 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Badge className="shrink-0">Coding Challenge</Badge>
            <h1 className="text-base font-bold text-foreground truncate">{title}</h1>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setShowHelp(!showHelp)}
                  >
                    <HelpCircle className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>How it works</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Collapsible Getting Started */}
        {showHelp && (
          <div className="border-b border-border/40 bg-primary/5 px-4 py-4 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-primary" />
                How to solve challenges
              </p>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowHelp(false)}>
                <ChevronUp className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {GETTING_STARTED_STEPS.map((step, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      {step.icon}
                      {step.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Problem description */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-primary" />
              Problem Statement
            </h2>
            {descriptionComponent ? (
              <div className="text-sm">{descriptionComponent}</div>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{description}</p>
            )}
          </div>

          {/* Input / Output formats */}
          {(inputFormat || outputFormat) && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Format</h2>
              {inputFormat && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Input</p>
                  <pre className="bg-muted/40 border border-border/40 rounded-lg p-3 text-xs font-mono text-foreground overflow-auto whitespace-pre-wrap">
                    {inputFormat}
                  </pre>
                </div>
              )}
              {outputFormat && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Output</p>
                  <pre className="bg-muted/40 border border-border/40 rounded-lg p-3 text-xs font-mono text-foreground overflow-auto whitespace-pre-wrap">
                    {outputFormat}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Examples */}
          {examples.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Examples</h2>
              {examples.map((example, idx) => (
                <Card key={idx} className="p-4 bg-muted/30 border-border/40">
                  <p className="text-[10px] font-semibold text-muted-foreground mb-2">Example {idx + 1}</p>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Input</p>
                      <pre className="bg-background p-2 rounded text-xs font-mono text-foreground overflow-auto border border-border/40">
                        {example.input || '(none)'}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Output</p>
                      <pre className="bg-background p-2 rounded text-xs font-mono text-foreground overflow-auto border border-border/40">
                        {example.output || '(none)'}
                      </pre>
                    </div>
                    {example.explanation && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Explanation</p>
                        <p className="text-xs text-muted-foreground">{example.explanation}</p>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Constraints */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Constraints</h2>
            <ul className="space-y-1 text-xs text-muted-foreground list-disc list-inside">
              {constraints ? (
                constraints
                  .split('\n')
                  .filter(Boolean)
                  .map((c, i) => <li key={i}>{c.trim()}</li>)
              ) : (
                <>
                  <li>Time Limit: 1 second</li>
                  <li>Memory Limit: 256 MB</li>
                  <li>Maximum input size: 10^5 elements</li>
                </>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* ─── Right Panel: Code Editor ─── */}
      <div className="flex flex-col overflow-hidden">
        {/* Top toolbar */}
        <div className="border-b border-border/40 p-3 space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Select value={language} onValueChange={handleLanguageChange}>
                <SelectTrigger className="w-36">
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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-8 text-xs"
                      onClick={() => {
                        if (initialCode) {
                          setCode(initialCode)
                        } else {
                          setCode(LANGUAGE_TEMPLATES[language] || '')
                        }
                        setTestResults(null)
                      }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reset to starter template</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs"
                    onClick={() => navigator.clipboard.writeText(codeRef.current)}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy code to clipboard</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Run and Submit buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleRunTests}
              disabled={running || !codeRef.current.trim() || !problemSlug}
              className="flex-1 gap-1.5 h-9 text-xs font-medium"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {running ? 'Running...' : 'Run Code'}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !codeRef.current.trim() || !problemSlug}
              variant="default"
              className="flex-1 gap-1.5 h-9 text-xs font-medium"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {submitting ? 'Submitting...' : 'Submit Code'}
            </Button>
          </div>
        </div>

        {/* Editor + Results tabs */}
        <Tabs defaultValue="editor" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full rounded-none border-b border-border/40 shrink-0">
            <TabsTrigger value="editor" className="flex-1 text-xs gap-1.5">
              <span className="font-mono">{'</>'}</span> Code Editor
            </TabsTrigger>
            <TabsTrigger value="results" className="flex-1 text-xs gap-1.5">
              <Trophy className="w-3.5 h-3.5" />
              Results
              {testResults && (
                <span
                  className={`ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                    testResults.status === 'accepted' || testResults.status === 'passed'
                      ? 'bg-green-500 text-white'
                      : testResults.status === 'error'
                        ? 'bg-red-500 text-white'
                        : 'bg-amber-500 text-white'
                  }`}
                >
                  {testResults.status === 'accepted' || testResults.status === 'passed' ? (
                    <CheckCircle className="w-2.5 h-2.5" />
                  ) : (
                    <AlertCircle className="w-2.5 h-2.5" />
                  )}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Editor tab */}
          <TabsContent value="editor" className="flex-1 overflow-hidden m-0">
            <Editor
              height="100%"
              language={language === 'csharp' ? 'csharp' : language === 'cpp' ? 'cpp' : language}
              theme={isDark ? 'vs-dark' : 'vs'}
              value={code}
              onChange={(v) => setCode(v ?? '')}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                automaticLayout: true,
                scrollBeyondLastLine: false,
                tabSize: 2,
                wordWrap: 'on',
                padding: { top: 12 },
              }}
            />
          </TabsContent>

          {/* Results tab */}
          <TabsContent value="results" className="flex-1 overflow-auto m-0 p-4 space-y-4">
            {!testResults ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Play className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">No results yet</p>
                <p className="text-xs text-muted-foreground max-w-[260px]">
                  Run your code to test against sample inputs, or submit to run against all test cases.
                </p>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={handleRunTests} disabled={!codeRef.current.trim() || !problemSlug}>
                    <Play className="w-3 h-3" /> Run Code
                  </Button>
                  <Button size="sm" className="text-xs gap-1.5" onClick={handleSubmit} disabled={!codeRef.current.trim() || !problemSlug}>
                    <Send className="w-3 h-3" /> Submit
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Status banner */}
                <Card
                  className={`p-4 border ${
                    testResults.status === 'accepted' || testResults.status === 'passed'
                      ? 'bg-green-500/10 border-green-500/30'
                      : testResults.status === 'error'
                        ? 'bg-red-500/10 border-red-500/30'
                        : 'bg-amber-500/10 border-amber-500/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {testResults.status === 'accepted' || testResults.status === 'passed' ? (
                      <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground capitalize">
                        {testResults.status === 'accepted'
                          ? 'Accepted — All tests passed!'
                          : testResults.status === 'passed'
                            ? 'Passed — All tests passed!'
                            : testResults.status === 'error'
                              ? 'Error'
                              : 'Not all tests passed'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{testResults.feedback}</p>
                      {testResults.score != null && (
                        <p className="text-xs font-semibold text-primary mt-1">Score: {testResults.score}/100</p>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2">
                  <Card className="p-3 bg-muted/30 border-border/40 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Tests Passed</p>
                    <p className={`text-lg font-bold ${testResults.testsPassed === testResults.totalTests && testResults.totalTests > 0 ? 'text-green-500' : 'text-amber-500'}`}>
                      {testResults.testsPassed}/{testResults.totalTests}
                    </p>
                  </Card>
                  <Card className="p-3 bg-muted/30 border-border/40 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Time</p>
                    <p className="text-lg font-bold text-foreground">{testResults.executionTime || '—'}</p>
                  </Card>
                  <Card className="p-3 bg-muted/30 border-border/40 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Submission ID</p>
                    <p className="text-xs font-mono font-bold text-foreground truncate">
                      {lastSubmissionId ? `#${lastSubmissionId.slice(0, 6)}` : '—'}
                    </p>
                  </Card>
                </div>

                {/* Test case details */}
                {testResults.results?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-foreground">Test Case Results</p>
                    {testResults.results.map((r: any, i: number) => (
                      <Card
                        key={i}
                        className={`p-3 border ${
                          r.passed ? 'border-green-500/10 bg-green-500/5' : 'border-red-500/10 bg-red-500/5'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {r.passed ? (
                            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                          )}
                          <span className="text-xs font-medium text-foreground">Test Case {i + 1}</span>
                          <Badge
                            variant={r.passed ? 'secondary' : 'destructive'}
                            className="ml-auto text-[9px] h-4 px-1.5"
                          >
                            {r.passed ? 'Passed' : 'Failed'}
                          </Badge>
                        </div>
                        {!r.passed && r.expected && (
                          <div className="mt-1 space-y-0.5 text-[10px] font-mono">
                            <p className="text-muted-foreground">
                              Expected: <span className="text-foreground">{String(r.expected)}</span>
                            </p>
                            <p className="text-muted-foreground">
                              Got: <span className="text-red-400">{r.stdout || '(empty)'}</span>
                            </p>
                          </div>
                        )}
                        {r.passed && r.stdout && (
                          <p className="mt-1 text-[10px] font-mono text-muted-foreground">
                            Output: {String(r.stdout).slice(0, 80)}
                            {String(r.stdout).length > 80 ? '...' : ''}
                          </p>
                        )}
                      </Card>
                    ))}
                  </div>
                )}

                {/* Tips for failed tests */}
                {(testResults.status === 'wrong_answer' || testResults.status === 'failed') && (
                  <Card className="p-4 border border-amber-500/20 bg-amber-500/5">
                    <p className="text-xs font-medium text-foreground mb-1.5">Tips</p>
                    <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Check edge cases — empty input, large values, special characters</li>
                      <li>Verify your output format matches exactly (spaces, newlines)</li>
                      <li>Make sure you read all input lines</li>
                      <li>Try running with sample input first</li>
                    </ul>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Success Modal ─── */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-sm p-6 border-border/60 shadow-2xl">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Solution accepted!</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Your code passed all test cases.{' '}
                  {testResults?.score != null && `Score: ${testResults.score}/100`}
                </p>
              </div>

              {/* Hackathon GitHub share */}
              {hackathonId && (
                <div className="text-left border-t border-border/40 pt-4 space-y-2">
                  <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <Github className="w-3.5 h-3.5 text-primary" />
                    Share your solution
                  </p>
                  {githubSubmitted ? (
                    <div className="flex items-center gap-2 text-xs text-green-500">
                      <CheckCircle className="w-3.5 h-3.5" />
                      GitHub repo submitted!
                    </div>
                  ) : (
                    <>
                      <p className="text-[11px] text-muted-foreground">
                        Paste your GitHub repository URL to share your solution with judges.
                      </p>
                      <div className="flex gap-2">
                        <Input
                          value={githubRepo}
                          onChange={(e) => setGithubRepo(e.target.value)}
                          placeholder="https://github.com/username/repo"
                          className="h-8 text-xs font-mono"
                          onKeyDown={(e) => e.key === 'Enter' && handleSubmitGithub()}
                        />
                        <Button
                          size="sm"
                          className="h-8 text-xs gap-1.5 shrink-0"
                          onClick={handleSubmitGithub}
                          disabled={submittingGithub || !githubRepo.trim()}
                        >
                          {submittingGithub ? <Loader2 className="w-3 h-3 animate-spin" /> : <Share2 className="w-3 h-3" />}
                          Share
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Next steps */}
              <div className="text-left border-t border-border/40 pt-4 space-y-2">
                <p className="text-xs font-medium text-foreground">What&apos;s next?</p>
                <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Move on to the next challenge</li>
                  <li>Review your submission history</li>
                  <li>Share your achievement on LinkedIn</li>
                </ul>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs gap-1.5"
                  onClick={() => setShowSuccessModal(false)}
                >
                  Continue Editing
                </Button>
                <Button size="sm" className="flex-1 text-xs gap-1.5" asChild>
                  <a href="/dashboard/challenges" onClick={() => setShowSuccessModal(false)}>
                    <Trophy className="w-3.5 h-3.5" />
                    All Challenges
                  </a>
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}