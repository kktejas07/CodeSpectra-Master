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
    icon: 'Terminal',
    extension: '.sh',
    templates: {
      boilerplate: `#!/bin/bash\n\n# Your script here\necho "Hello, World!"`,
    }
  },
  {
    id: 'dart',
    name: 'Dart',
    displayName: 'Dart 3',
    icon: 'Brackets',
    extension: '.dart',
    templates: {
      boilerplate: `int solve(int n) {\n  // Your code here\n  return 0;\n}\n\nvoid main() {\n  print(solve(0));\n}`,
    },
  },
  {
    id: 'elixir',
    name: 'Elixir',
    displayName: 'Elixir 1.16',
    icon: 'Beaker',
    extension: '.ex',
    templates: {
      boilerplate: `defmodule Solution do\n  def solve(n) do\n    # Your code here\n    0\n  end\nend`,
    },
  },
  {
    id: 'haskell',
    name: 'Haskell',
    displayName: 'GHC 9.6',
    icon: 'Sigma',
    extension: '.hs',
    templates: {
      boilerplate: `solve :: Int -> Int\nsolve n = 0\n\nmain :: IO ()\nmain = print (solve 0)`,
    },
  },
  {
    id: 'perl',
    name: 'Perl',
    displayName: 'Perl 5.38',
    icon: 'FileCode',
    extension: '.pl',
    templates: {
      boilerplate: `use strict;\nuse warnings;\n\nsub solve {\n  my ($n) = @_;\n  return 0;\n}\n\nprint solve(0);`,
    },
  },
  {
    id: 'r',
    name: 'R',
    displayName: 'R 4.3',
    icon: 'LineChart',
    extension: '.r',
    templates: {
      boilerplate: `solve <- function(n) {\n  # Your code here\n  0\n}\n\nprint(solve(0))`,
    },
  },
  {
    id: 'julia',
    name: 'Julia',
    displayName: 'Julia 1.10',
    icon: 'Atom',
    extension: '.jl',
    templates: {
      boilerplate: `function solve(n::Int)::Int\n  # Your code here\n  return 0\nend\n\nprintln(solve(0))`,
    },
  },
  {
    id: 'lua',
    name: 'Lua',
    displayName: 'Lua 5.4',
    icon: 'Moon',
    extension: '.lua',
    templates: {
      boilerplate: `function solve(n)\n  -- Your code here\n  return 0\nend\n\nprint(solve(0))`,
    },
  },
  {
    id: 'powershell',
    name: 'PowerShell',
    displayName: 'PowerShell 7',
    icon: 'Shell',
    extension: '.ps1',
    templates: {
      boilerplate: `function Solve([int]$n) {\n  # Your code here\n  return 0\n}\n\nWrite-Output (Solve 0)`,
    },
  },
  {
    id: 'fsharp',
    name: 'F#',
    displayName: 'F# 8',
    icon: 'Layers',
    extension: '.fs',
    templates: {
      boilerplate: `module Solution\n\nlet solve (n: int) : int =\n    // Your code here\n    0\n\nprintfn "%i" (solve 0)`,
    },
  },
  {
    id: 'ocaml',
    name: 'OCaml',
    displayName: 'OCaml 5.1',
    icon: 'Box',
    extension: '.ml',
    templates: {
      boilerplate: `let solve n =\n  (* Your code here *)\n  0\n\nlet () = Printf.printf "%d\\n" (solve 0)`,
    },
  },
  {
    id: 'solidity',
    name: 'Solidity',
    displayName: 'Solidity 0.8',
    icon: 'Hexagon',
    extension: '.sol',
    templates: {
      boilerplate: `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract Solution {\n    function solve(uint256 n) external pure returns (uint256) {\n        return 0;\n    }\n}`,
    },
  },
  {
    id: 'nim',
    name: 'Nim',
    displayName: 'Nim 2.0',
    icon: 'Navigation',
    extension: '.nim',
    templates: {
      boilerplate: `proc solve(n: int): int =\n  # Your code here\n  0\n\necho solve(0)`,
    },
  },
  {
    id: 'crystal',
    name: 'Crystal',
    displayName: 'Crystal 1.11',
    icon: 'Gem',
    extension: '.cr',
    templates: {
      boilerplate: `def solve(n : Int32) : Int32\n  # Your code here\n  0\nend\n\nputs solve(0)`,
    },
  },
  {
    id: 'fortran',
    name: 'Fortran',
    displayName: 'Fortran 2008',
    icon: 'Binary',
    extension: '.f90',
    templates: {
      boilerplate: `program main\n  implicit none\n  integer :: n\n  n = 0\n  print *, solve(n)\ncontains\n  integer function solve(x)\n    integer, intent(in) :: x\n    solve = 0\n  end function solve\nend program main`,
    },
  },
  {
    id: 'cobol',
    name: 'COBOL',
    displayName: 'GnuCOBOL',
    icon: 'Archive',
    extension: '.cob',
    templates: {
      boilerplate: `       IDENTIFICATION DIVISION.\n       PROGRAM-ID. HELLO.\n       PROCEDURE DIVISION.\n           DISPLAY "Hello"\n           STOP RUN.`,
    },
  },
  {
    id: 'vbnet',
    name: 'VB.NET',
    displayName: 'VB.NET',
    icon: 'LayoutGrid',
    extension: '.vb',
    templates: {
      boilerplate: `Module Solution\n  Function Solve(n As Integer) As Integer\n    ' Your code here\n    Return 0\n  End Function\n  Sub Main()\n    Console.WriteLine(Solve(0))\n  End Sub\nEnd Module`,
    },
  },
]

export const getLanguageById = (id: string): Language | undefined => {
  return PROGRAMMING_LANGUAGES.find(lang => lang.id === id)
}

export const getLanguageByName = (name: string): Language | undefined => {
  return PROGRAMMING_LANGUAGES.find(lang => lang.displayName.toLowerCase() === name.toLowerCase())
}
