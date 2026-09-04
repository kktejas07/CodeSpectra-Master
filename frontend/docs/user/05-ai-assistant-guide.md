> **Customer Documentation**
> **Last Updated**: 2026-07-08
> **Audience**: Logged-in users (students, developers, recruiters, admins)

# AI Assistant Guide

CodeSpectra provides multiple AI-powered features to help you code, learn, and improve.

## Ask CodeSpectra Chat

The **Ask CodeSpectra** floating chat button is available across the entire dashboard (bottom-right corner).

### How to use
1. Click the chat button to open the chat panel
2. Type your question about coding, debugging, or concepts
3. Press Enter to send
4. The AI streams its response in real-time (SSE streaming)

### What to ask
- "Explain this algorithm"
- "How do I fix this error?"
- "What's the time complexity of my code?"
- "Help me understand recursion"
- Code review requests

The AI is context-aware — it knows the current problem you're working on, your recent submissions, and scan results.

## AI Code Review

Navigate to the scanner's **Review** mode to get a structured AI code review.

The AI analyzes your code and returns:
- **Time complexity analysis**
- **Space complexity analysis**
- **Efficiency score**
- **Edge case detection**
- **Readability suggestions**
- **Best practices checklist**
- **Security vulnerability scan**

### AI Grading
For graded problems, the AI provides:
- Per-criterion scores (correctness, efficiency, style)
- Total score and letter grade
- Specific feedback on what to improve

## Smart Hints

While solving problems, the **Smart Hints** panel provides four progressive levels of help:

1. **Nudge** — A subtle direction without giving away the answer
2. **Approach** — Suggested algorithm or data structure
3. **Pseudocode** — Step-by-step pseudocode outline
4. **Solution** — The complete solution (use as last resort)

Hints are tailored to your current code and progress.

## AI Agent Workspace

The Agent Workspace (`/dashboard/agent`) is a two-pane interface for multi-step AI code transformations.

### How it works
1. **Left pane** — chat with the AI agent. Describe what you want (e.g., "Refactor for O(n) using memoization")
2. **Right pane** — live Monaco editor showing your code as the agent edits it

### Controls
- **Language selector** — Python, JavaScript, TypeScript, C++, Java, Go
- **Max steps** — choose 1-5 steps for the agent's execution plan
- **Run** button or `Cmd+Enter` to execute

### Example prompts
- "Refactor for O(n) using memoization"
- "Add input validation and a docstring"
- "Translate this to TypeScript"
- "Add 3 edge-case unit tests"
- "Fix the bug in this sorting function"

### Agent Output
The agent shows:
- **Steps tab** — each step's thought process and summary
- **Code tab** — the final code after all steps

The agent runs on Claude Sonnet 4.5 and can perform multi-step planning, code editing, and re-analysis.

## Codebase Chat Sidebar

In the scanner's **Chat** mode, you can interact with your codebase using the Gemini AI Assistant. Ask questions about your scanned code, get explanations, and request modifications.

## Available AI Models

| Feature | Model |
|---------|-------|
| Conversational chat | Claude Sonnet 4.5 |
| Code hints | Gemini 3 Flash |
| Code review | Claude Sonnet 4.5 |
| Code analysis | Gemini 3 Flash |
| Grading | Claude Sonnet 4.5 |
| Agent workspace | Claude Sonnet 4.5 |
| Problem generation | Claude Sonnet 4.5 |
| Skill insights | Gemini 3 Flash |
