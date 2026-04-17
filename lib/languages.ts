export interface Language {
  id: string
  name: string
  displayName: string
  icon: string
  extension: string
  templates: {
    boilerplate: string
    solution?: string
  }
}

export const PROGRAMMING_LANGUAGES: Language[] = [
  {
    id: 'python',
    name: 'Python',
    displayName: 'Python 3',
    icon: '🐍',
    extension: '.py',
    templates: {
      boilerplate: `# Python 3\n\ndef solve(n):\n    pass\n\nif __name__ == "__main__":\n    pass`,
    }
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    displayName: 'JavaScript (Node.js 16)',
    icon: '🟨',
    extension: '.js',
    templates: {
      boilerplate: `function solve(n) {\n  // Your code here\n}\n\nmodule.exports = solve;`,
    }
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    displayName: 'TypeScript',
    icon: '🔵',
    extension: '.ts',
    templates: {
      boilerplate: `function solve(n: number): number {\n  // Your code here\n  return 0;\n}\n\nexport default solve;`,
    }
  },
  {
    id: 'java',
    name: 'Java',
    displayName: 'Java 11',
    icon: '☕',
    extension: '.java',
    templates: {
      boilerplate: `public class Solution {\n  public static int solve(int n) {\n    // Your code here\n    return 0;\n  }\n\n  public static void main(String[] args) {\n    // Test your solution\n  }\n}`,
    }
  },
  {
    id: 'cpp',
    name: 'C++',
    displayName: 'C++ (g++ 9.2)',
    icon: '⚙️',
    extension: '.cpp',
    templates: {
      boilerplate: `#include <iostream>\nusing namespace std;\n\nint solve(int n) {\n  // Your code here\n  return 0;\n}\n\nint main() {\n  // Test your solution\n  return 0;\n}`,
    }
  },
  {
    id: 'c',
    name: 'C',
    displayName: 'C (gcc 9.2)',
    icon: '🔤',
    extension: '.c',
    templates: {
      boilerplate: `#include <stdio.h>\n\nint solve(int n) {\n  // Your code here\n  return 0;\n}\n\nint main() {\n  // Test your solution\n  return 0;\n}`,
    }
  },
  {
    id: 'csharp',
    name: 'C#',
    displayName: 'C# (.NET 5)',
    icon: '🟦',
    extension: '.cs',
    templates: {
      boilerplate: `using System;\n\npublic class Solution {\n  public static int Solve(int n) {\n    // Your code here\n    return 0;\n  }\n\n  public static void Main() {\n    // Test your solution\n  }\n}`,
    }
  },
  {
    id: 'ruby',
    name: 'Ruby',
    displayName: 'Ruby 2.7',
    icon: '💎',
    extension: '.rb',
    templates: {
      boilerplate: `def solve(n)\n  # Your code here\nend\n\nif __FILE__ == $0\n  # Test your solution\nend`,
    }
  },
  {
    id: 'go',
    name: 'Go',
    displayName: 'Go 1.16',
    icon: '🔷',
    extension: '.go',
    templates: {
      boilerplate: `package main\n\nimport "fmt"\n\nfunc solve(n int) int {\n  // Your code here\n  return 0\n}\n\nfunc main() {\n  // Test your solution\n}`,
    }
  },
  {
    id: 'rust',
    name: 'Rust',
    displayName: 'Rust 1.56',
    icon: '🦀',
    extension: '.rs',
    templates: {
      boilerplate: `fn solve(n: i32) -> i32 {\n  // Your code here\n  0\n}\n\nfn main() {\n  // Test your solution\n}`,
    }
  },
  {
    id: 'kotlin',
    name: 'Kotlin',
    displayName: 'Kotlin 1.5',
    icon: '🟪',
    extension: '.kt',
    templates: {
      boilerplate: `fun solve(n: Int): Int {\n  // Your code here\n  return 0\n}\n\nfun main() {\n  // Test your solution\n}`,
    }
  },
  {
    id: 'swift',
    name: 'Swift',
    displayName: 'Swift 5.3',
    icon: '🍎',
    extension: '.swift',
    templates: {
      boilerplate: `import Foundation\n\nfunc solve(_ n: Int) -> Int {\n  // Your code here\n  return 0\n}\n\n// Test your solution`,
    }
  },
  {
    id: 'php',
    name: 'PHP',
    displayName: 'PHP 8.0',
    icon: '🐘',
    extension: '.php',
    templates: {
      boilerplate: `<?php\n\nfunction solve($n) {\n  // Your code here\n  return 0;\n}\n\n// Test your solution\n?>`,
    }
  },
  {
    id: 'scala',
    name: 'Scala',
    displayName: 'Scala 2.13',
    icon: '🔴',
    extension: '.scala',
    templates: {
      boilerplate: `object Solution {\n  def solve(n: Int): Int = {\n    // Your code here\n    0\n  }\n\n  def main(args: Array[String]) = {\n    // Test your solution\n  }\n}`,
    }
  },
  {
    id: 'sql',
    name: 'SQL',
    displayName: 'SQL (MySQL 8.0)',
    icon: '🗄️',
    extension: '.sql',
    templates: {
      boilerplate: `-- Write your SQL query here\n\nSELECT * FROM table_name;`,
    }
  },
  {
    id: 'bash',
    name: 'Bash',
    displayName: 'Bash 5.0',
    icon: '💻',
    extension: '.sh',
    templates: {
      boilerplate: `#!/bin/bash\n\n# Your script here\necho "Hello, World!"`,
    }
  },
]

export const getLanguageById = (id: string): Language | undefined => {
  return PROGRAMMING_LANGUAGES.find(lang => lang.id === id)
}

export const getLanguageByName = (name: string): Language | undefined => {
  return PROGRAMMING_LANGUAGES.find(lang => lang.displayName.toLowerCase() === name.toLowerCase())
}
