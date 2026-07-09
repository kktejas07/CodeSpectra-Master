> **Customer Documentation**
> **Last Updated**: 2026-07-08
> **Audience**: Logged-in users (students, developers, recruiters, admins)

# Problems Guide

## Browse the Problem Catalog

Navigate to **Problems** in the sidebar (`/dashboard/problems`) to browse the full catalog.

The problem list shows each problem with:
- **Index number** and **title**
- **Topic tags** (e.g., arrays, strings, dynamic programming)
- **Difficulty badge** — Easy (green), Medium (amber), Hard (red)

### Filter and Search

- **Search bar** — type to filter problems by name
- **Difficulty buttons** — click All, Easy, Medium, or Hard to narrow results

Click any problem to open it.

## Problem Detail Page

Each problem (`/dashboard/problems/[slug]`) has a split-pane layout:

### Left Pane — Problem Statement
- **Title and metadata** — difficulty, topics
- **Description** — the problem statement in Markdown
- **Input format, output format, and constraints**
- **Sample test cases** — example inputs and expected outputs

### Right Pane — Code Editor

The Monaco code editor (the same editor that powers VS Code) with:
- **Language selector** — 40+ languages including Python, JavaScript, TypeScript, Java, C++, C#, Go, Rust, Ruby, PHP, Swift, Kotlin, Scala, Dart, and more
- **Starter code** — pre-loaded template code for your chosen language
- **Syntax highlighting** — full IDE-grade highlighting
- **Font** — JetBrains Mono monospace font

## Run and Submit Code

### Run
1. Write your solution in the editor
2. Click **Run** (play icon) to execute against the sample test cases
3. View output in the results panel — shows stdout, stderr, and pass/fail for each sample test

### Submit
1. Click **Submit** (send icon) to run against all test cases (sample + hidden)
2. View full results including pass/fail count, execution time, and score
3. Hidden test case results are shown after submission

### Execution Engine
Code is executed on the **Piston** execution engine — a secure, sandboxed multi-language runner. Results include execution time per test case.

## View Results

After submission, the results panel shows:
- **Pass/fail count** — e.g., "12/15 tests passed"
- **Score** — percentage score
- **Per-test results** — each test shows whether it passed, actual output vs expected output, and execution time
- **Error output** — any stderr or runtime errors

## AI Features

### Smart Hints
Stuck on a problem? Use the **Smart Hints** panel (four progressive levels):
1. **Nudge** — a gentle direction hint
2. **Approach** — suggested approach or algorithm
3. **Pseudocode** — step-by-step pseudocode
4. **Solution** — full solution code

### AI Analysis
After submitting, AI analysis provides feedback on:
- **Time complexity**
- **Space complexity**
- **Efficiency score**
- **Edge case coverage**
- **Code readability**

### AI Grading
Scored problems include rubric-based grading across correctness, efficiency, style, and other criteria with a total score and letter grade.

## Supported Languages

Python 3, JavaScript, TypeScript, Java, C++, C, C#, Go, Rust, Ruby, PHP, Swift, Kotlin, Scala, Dart, Bash, Perl, Haskell, Lua, R, Julia, Elixir, Clojure, Groovy, OCaml, Erlang, Racket, SQL, and many more.
