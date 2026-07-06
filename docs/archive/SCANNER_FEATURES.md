# CodeSpectra Code Scanner - Enhanced Features

## Overview

The CodeSpectra Code Scanner is an advanced code quality analysis tool inspired by industry leaders **SonarCloud** and **HackerRank**. It provides comprehensive code analysis, GitHub integration, and AI-powered suggestions.

## Key Features

### 1. Manual Code Analysis
- **Paste Your Code**: Analyze code directly from the editor
- **Multi-language Support**: JavaScript, TypeScript, Python, Java, C++, C#, Go, Rust
- **Real-time Feedback**: Get instant analysis results
- **Scan History**: Keep track of previous scans and compare

### 2. Advanced Metrics Dashboard (SonarCloud-inspired)

#### Quality Score (0-100)
Overall code quality rating based on comprehensive analysis

#### Issue Categories
- **Bugs**: Potential runtime errors and logical issues
- **Vulnerabilities**: Security risks and exploitable weaknesses
- **Code Smells**: Design and readability issues
- **Security Hotspots**: Areas requiring security review

#### Code Metrics
- **Duplicated Code %**: Percentage of repeated code (lower is better)
- **Complexity Score**: Cyclomatic complexity measurement (lower is better, target < 15)
- **Maintainability Index**: Long-term code health (target > 70)
- **Test Coverage %**: Code coverage by tests (target > 50%)

### 3. GitHub Integration (Planned Features)

#### Connect Your GitHub Account
- OAuth authentication with GitHub
- Secure token storage
- One-click authorization

#### Repository Scanning
- Browse and select repositories
- Scan entire repos or specific files
- Automatic scanning on push/PR
- Track quality across commits

#### GitHub Features Coming Soon
- **Automatic Scanning**: Scan on every push and PR
- **Pull Request Reviews**: Automatic code quality checks on PR submissions
- **Trend Analysis**: Historical tracking of code quality improvements
- **Team Insights**: Compare code quality across team members

### 4. AI-Powered Suggested Fixes

#### Smart Recommendations
- Specific issue fixes with code examples
- Confidence levels (shown as percentage)
- Side-by-side before/after comparison
- Effort estimates (minutes to fix)

#### Fix Categories
- Security vulnerability patches
- Bug fixes with null-safe patterns
- Code smell refactorings
- Complexity reductions
- Performance optimizations

#### One-Click Application
- Copy suggested code
- Apply fixes with a single click
- Track applied fixes
- Rollback capability

### 5. Quality Gates (Future Enhancement)

Define quality standards for your code:
- Minimum quality score thresholds
- Maximum allowed bugs/vulnerabilities
- Complexity limits
- Code coverage requirements
- Standards compliance (OWASP, CWE, NIST)

### 6. Scan History & Comparison

Track your progress:
- Recent scans overview
- Quality score trends
- Issue reduction tracking
- Performance improvements
- Side-by-side scan comparisons

## How to Use

### Manual Code Analysis

1. **Go to Dashboard → Code Scanner**
2. **Select "Manual Analysis" tab**
3. **Choose your programming language**
4. **Paste your code** into the editor
5. **Click "Scan Code"** to analyze
6. **Review the results**:
   - Quality score and metrics
   - Detected issues with severity levels
   - AI-suggested fixes
   - Best practices and recommendations

### GitHub Integration (Coming Soon)

1. **Go to Dashboard → Code Scanner**
2. **Select "GitHub Integration" tab**
3. **Click "Connect GitHub"**
4. **Authorize CodeSpectra** to access your repositories
5. **Browse your repositories**
6. **Select a repository** to scan
7. **Choose files or scan entire repo**
8. **Set up automatic scanning** (optional)
9. **Review results and trends**

## Metrics Explained

### Code Smells
Design and readability issues that don't break functionality but reduce maintainability. Examples:
- Long methods (>20 lines)
- Duplicate code blocks
- Complex conditional logic
- Missing documentation

### Bugs
Potential runtime errors that should be fixed. Examples:
- Null reference errors
- Unhandled exceptions
- Logic errors
- Type mismatches

### Vulnerabilities
Security risks that could be exploited. Highest priority. Examples:
- SQL injection risks
- Cross-site scripting (XSS)
- Hardcoded secrets
- Insecure deserialization

### Security Hotspots
Code sections that require security review but may be safe. Examples:
- Cryptographic operations
- User input processing
- File operations
- Database queries

### Complexity Score
Measures how complex code logic is:
- **0-10**: Simple, easy to understand
- **10-20**: Moderate, some complexity
- **20+**: Complex, hard to maintain and test

**Recommendation**: Keep complexity < 15 per function/method

### Test Coverage
Percentage of code executed when running tests:
- **< 30%**: Poor, many untested paths
- **30-50%**: Fair, some coverage gaps
- **50-70%**: Good, most code tested
- **70%+**: Excellent, comprehensive testing

**Recommendation**: Aim for 70%+ coverage in production code

## Best Practices

### For Maximum Results

1. **Scan regularly**: Use GitHub integration for automatic scanning
2. **Fix critical issues first**: Vulnerabilities and bugs should be addressed immediately
3. **Track trends**: Monitor your quality score over time
4. **Team standards**: Set quality gates that work for your team
5. **Code reviews**: Use CodeSpectra as part of your review process
6. **Incremental improvement**: Address code smells gradually

### Security First

- Address all vulnerabilities immediately
- Review security hotspots carefully
- Never ignore hardcoded secrets
- Validate all user input
- Keep dependencies updated

### Maintainability

- Reduce code duplication (aim for < 5%)
- Keep complexity low (target < 15)
- Write clear variable/function names
- Add meaningful comments
- Use type safety (TypeScript, static typing)

## API Integration

### Analyze Code Endpoint

**POST** `/api/analyze-code`

Request:
```json
{
  "code": "your code here",
  "language": "javascript"
}
```

Response:
```json
{
  "quality": 75,
  "bugs": 2,
  "vulnerabilities": 1,
  "codeSmells": 15,
  "securityHotspots": 3,
  "duplicatePercentage": 5.2,
  "complexityScore": 12,
  "maintainabilityIndex": 78,
  "testCoveragePercentage": 65,
  "performance": "...",
  "bestPractices": [...],
  "issues": [...],
  "suggestions": [...],
  "timeMs": 1200
}
```

### GitHub Integration Endpoints

- **POST** `/api/github/auth/callback` - Handle OAuth callback
- **GET** `/api/github/repos` - List user's repositories
- **POST** `/api/github/repo-files` - Get file tree
- **POST** `/api/github/file-content` - Get file content
- **POST** `/api/github/disconnect` - Remove GitHub connection
- **GET** `/api/github/integration` - Get current integration status

## Environment Variables Required

For GitHub Integration to work:

```env
NEXT_PUBLIC_GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

## Troubleshooting

### Slow Analysis
- Ensure code snippet is reasonably sized (< 5000 lines recommended)
- Check your internet connection
- Try again if service is busy

### No Issues Found
- Your code might be really good!
- Increase complexity to trigger more analysis
- Verify language is set correctly

### GitHub Connection Failed
- Check OAuth credentials are correct
- Ensure GitHub app is properly configured
- Check user has necessary repository permissions
- Verify Supabase integration is active

## Future Roadmap

- [ ] Real-time IDE integration (WebSocket-based)
- [ ] Custom rule creation
- [ ] Team collaboration features
- [ ] Advanced reporting and exports
- [ ] Performance profiling
- [ ] Dependency analysis
- [ ] License compliance checking
- [ ] AI-powered architecture reviews

## Support

For issues or feature requests:
1. Check the troubleshooting section
2. Review the GitHub issues
3. Contact support via the platform

---

**CodeSpectra** - Master Code Through AI
