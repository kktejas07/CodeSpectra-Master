export interface HundredDayProblem {
  id: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  description: string
  inputFormat: string
  outputFormat: string
  constraints: string
  examples: Array<{ input: string; output: string; explanation?: string }>
  starterCode: Record<string, string>
}

export interface HundredDay {
  day: number
  theme: string
  topics: string[]
  problems: HundredDayProblem[]
}

function l(key: string): string {
  const templates: Record<string, string> = {
    python: `def solve(input_str):\n    # Your code here\n    pass\n\nif __name__ == "__main__":\n    import sys\n    data = sys.stdin.read().strip()\n    print(solve(data))`,
    javascript: `function solve(input) {\n  // Your code here\n}\n\nprocess.stdin.resume();\nprocess.stdin.on('data', d => {\n  console.log(solve(d.toString()));\n});`,
    typescript: `function solve(input: string): string {\n  // Your code here\n  return '';\n}\n\nconst stdin = require('fs').readFileSync('/dev/stdin', 'utf8').trim();\nconsole.log(solve(stdin));`,
    java: `import java.util.*;\npublic class Solution {\n    public static String solve(String input) {\n        // Your code here\n        return "";\n    }\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        StringBuilder sb = new StringBuilder();\n        while (sc.hasNextLine()) sb.append(sc.nextLine()).append("\\n");\n        System.out.println(solve(sb.toString()));\n    }\n}`,
    cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\nstring solve(string input) {\n    stringstream ss(input);\n    vector<string> lines;\n    string line;\n    while (getline(ss, line)) lines.push_back(line);\n    // Your code here\n    return "";\n}\n\nint main() {\n    string input, line;\n    while (getline(cin, line)) input += line + "\\n";\n    cout << solve(input);\n    return 0;\n}`,
    c: `#include <stdio.h>\n#include <string.h>\n#include <stdlib.h>\n\nchar* solve(char* input) {\n    // Your code here\n    return "";\n}\n\nint main() {\n    char buf[4096];\n    fgets(buf, sizeof(buf), stdin);\n    printf("%s", solve(buf));\n    return 0;\n}`,
    csharp: `using System;\nusing System.IO;\n\nclass Solution {\n    public static string Solve(string input) {\n        // Your code here\n        return "";\n    }\n    \n    static void Main() {\n        string input = Console.In.ReadToEnd();\n        Console.Write(Solve(input));\n    }\n}`,
    go: `package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n\t"strings"\n)\n\nfunc solve(input string) string {\n\t// Your code here\n\treturn ""\n}\n\nfunc main() {\n\tscanner := bufio.NewScanner(os.Stdin)\n\tvar lines []string\n\tfor scanner.Scan() {\n\t\tlines = append(lines, scanner.Text())\n\t}\n\tfmt.Print(solve(strings.Join(lines, "\\n")))\n}`,
    rust: `use std::io::{self, Read};\n\nfn solve(input: &str) -> String {\n    // Your code here\n    String::new()\n}\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_to_string(&mut input).unwrap();\n    print!("{}", solve(&input));\n}`,
    ruby: `def solve(input)\n  # Your code here\n  ""\nend\n\ninput = STDIN.read.chomp\nputs solve(input)`,
    php: `<?php\nfunction solve($input) {\n    // Your code here\n    return "";\n}\n\n$input = stream_get_contents(STDIN);\necho solve($input);`,
    swift: `import Foundation\n\nfunc solve(_ input: String) -> String {\n    // Your code here\n    return ""\n}\n\nlet input = readLine() ?? ""\nprint(solve(input))`,
    kotlin: `fun solve(input: String): String {\n    // Your code here\n    return ""\n}\n\nfun main() {\n    val input = generateSequence(::readLine).joinToString("\\n")\n    print(solve(input))\n}`,
    scala: `object Solution {\n    def solve(input: String): String = {\n        // Your code here\n        ""\n    }\n    def main(args: Array[String]): Unit = {\n        val input = scala.io.Source.stdin.mkString\n        print(solve(input))\n    }\n}`,
    dart: `import \'dart:io\';\n\nString solve(String input) {\n  // Your code here\n  return \'\';\n}\n\nvoid main() {\n  String input = stdin.readLineSync() ?? \'\';\n  print(solve(input));\n}`,
    bash: `#!/bin/bash\nsolve() {\n    # Your code here\n    echo ""\n}\n\nread input\nsolve "$input"`,
    perl: `sub solve {\n    my ($input) = @_;\n    # Your code here\n    return "";\n}\n\nmy $input = do { local $/; <STDIN> };\nprint solve($input);`,
    haskell: `solve :: String -> String\nsolve input = -- Your code here\n    ""\n\nmain :: IO ()\nmain = do\n    input <- getContents\n    putStr $ solve input`,
    lua: `function solve(input)\n    -- Your code here\n    return ""\nend\n\nlocal input = io.read("*a")\nio.write(solve(input))`,
    rscript: `solve <- function(input) {\n  # Your code here\n  return("")\n}\n\ninput <- readLines("stdin", warn=FALSE)\ncat(solve(paste(input, collapse="\\n")))`,
    julia: `function solve(input::String)\n    # Your code here\n    return ""\nend\n\ninput = read(stdin, String)\nprint(solve(input))`,
    elixir: `defmodule Solution do\n  def solve(input) do\n    # Your code here\n    ""\n  end\nend\n\ninput = IO.read(:stdio, :all)\nIO.puts(Solution.solve(input))`,
    clojure: `(defn solve [input]\n  ;; Your code here\n  "")\n\n(def input (slurp *in*))\n(print (solve input))`,
    groovy: `def solve(input) {\n    // Your code here\n    return ""\n}\n\ndef input = System.in.text\nprint solve(input)`,
    ocaml: `let solve input =\n  (* Your code here *)\n  ""\n\nlet () =\n  let input = really_input_string stdin (in_channel_length stdin) in\n  print_string (solve input)`,
    erlang: `-module(solution).\n-export([main/0]).\n\nsolve(Input) ->\n    % Your code here\n    "".\n\nmain() ->\n    case io:get_line("") of\n        eof -> ok;\n        Line ->\n            io:format("~s", [solve(Line)]),\n            main()\n    end.`,
  }
  return templates[key] || templates.python
}

const S = (languageKeys: string[]) => {
  const out: Record<string, string> = {}
  for (const k of languageKeys) out[k] = l(k)
  return out
}

function p(id: string, title: string, diff: HundredDayProblem['difficulty'], desc: string, inputFmt: string, outputFmt: string, constraints: string, exs: HundredDayProblem['examples']): HundredDayProblem {
  const langs = ['python','javascript','typescript','java','cpp','c','csharp','go','rust','ruby','php','swift','kotlin','scala','dart','bash','perl','haskell','lua','rscript','julia','elixir','clojure','groovy','ocaml','erlang']
  return { id, title, difficulty: diff, description: desc, inputFormat: inputFmt, outputFormat: outputFmt, constraints, examples: exs, starterCode: S(langs) }
}

export const HUNDRED_DAYS: HundredDay[] = [
  {
    day: 1, theme: 'Your First Programs', topics: ['basics', 'io'],
    problems: [
      p('d1p1', 'Hello, World!', 'easy', 'Write a program that prints "Hello, World!" to the console.', 'None.', 'Print "Hello, World!" on a single line.', 'None.', [{ input: '', output: 'Hello, World!' }]),
      p('d1p2', 'Sum of Two Numbers', 'easy', 'Given two integers A and B, print their sum.', 'Two integers A and B separated by a space.', 'Print a single integer - the sum of A and B.', '-10^9 ≤ A, B ≤ 10^9', [{ input: '3 5', output: '8' }]),
      p('d1p3', 'Even or Odd', 'easy', 'Given an integer N, print "Even" if it is even, "Odd" if it is odd.', 'A single integer N.', 'Print "Even" or "Odd".', '-10^6 ≤ N ≤ 10^6', [{ input: '4', output: 'Even' }, { input: '7', output: 'Odd' }]),
    ],
  },
  {
    day: 2, theme: 'String Basics', topics: ['strings', 'iteration'],
    problems: [
      p('d2p1', 'Reverse a String', 'easy', 'Given a string S, reverse it and print the result.', 'A single line containing string S.', 'Print the reversed string.', '1 ≤ |S| ≤ 1000', [{ input: 'hello', output: 'olleh' }]),
      p('d2p2', 'Palindrome Check', 'easy', 'Given a string, check if it is a palindrome (reads the same forwards and backwards). Print "Yes" or "No".', 'A single line containing string S.', 'Print "Yes" if palindrome, "No" otherwise.', '1 ≤ |S| ≤ 1000', [{ input: 'racecar', output: 'Yes' }, { input: 'hello', output: 'No' }]),
      p('d2p3', 'Count Vowels', 'easy', 'Count the number of vowels (a,e,i,o,u) in a string. Case-insensitive.', 'A single line containing string S.', 'Print the vowel count.', '1 ≤ |S| ≤ 10^5', [{ input: 'Hello World', output: '3' }]),
      p('d2p4', 'String Length', 'easy', 'Given a string, print its length (number of characters).', 'A single line containing string S.', 'Print the integer length.', '1 ≤ |S| ≤ 10^5', [{ input: 'CodeSpectra', output: '11' }]),
    ],
  },
  {
    day: 3, theme: 'Loops & Conditionals', topics: ['loops', 'conditionals'],
    problems: [
      p('d3p1', 'FizzBuzz', 'easy', 'Print numbers 1 to N. Multiples of 3 → "Fizz", multiples of 5 → "Buzz", both → "FizzBuzz".', 'A single integer N.', 'N lines, each the result for that number.', '1 ≤ N ≤ 100', [{ input: '5', output: '1\n2\nFizz\n4\nBuzz' }]),
      p('d3p2', 'Factorial', 'easy', 'Compute N! (factorial) for a non-negative integer N. 0! = 1.', 'A single integer N.', 'Print N!.', '0 ≤ N ≤ 12', [{ input: '5', output: '120' }]),
      p('d3p3', 'Sum of First N Natural Numbers', 'easy', 'Compute and print the sum 1+2+...+N.', 'A single integer N.', 'Print the sum.', '1 ≤ N ≤ 10^6', [{ input: '10', output: '55' }]),
    ],
  },
  {
    day: 4, theme: 'Arrays & Lists', topics: ['arrays', 'iteration'],
    problems: [
      p('d4p1', 'Find Maximum', 'easy', 'Given an array of N integers, find and print the maximum element.', 'First line: N. Second line: N space-separated integers.', 'Print the maximum.', '1 ≤ N ≤ 10^5', [{ input: '5\n3 7 2 9 1', output: '9' }]),
      p('d4p2', 'Array Sum', 'easy', 'Compute and print the sum of all elements in an array.', 'First line: N. Second line: N space-separated integers.', 'Print the total sum.', '1 ≤ N ≤ 10^5', [{ input: '4\n1 2 3 4', output: '10' }]),
      p('d4p3', 'Print Array in Reverse', 'easy', 'Given an array, print it in reverse order.', 'First line: N. Second line: N space-separated integers.', 'Print the array elements in reverse order.', '1 ≤ N ≤ 10^3', [{ input: '4\n1 2 3 4', output: '4 3 2 1' }]),
    ],
  },
  {
    day: 5, theme: 'Math & Number Theory', topics: ['math', 'number-theory'],
    problems: [
      p('d5p1', 'Prime Number Check', 'easy', 'Check if N is prime. Print "Yes" or "No".', 'A single integer N.', 'Print "Yes" if prime, "No" otherwise.', '1 ≤ N ≤ 10^6', [{ input: '7', output: 'Yes' }, { input: '10', output: 'No' }]),
      p('d5p2', 'GCD of Two Numbers', 'easy', 'Find the GCD of A and B using Euclidean algorithm.', 'Two integers A and B separated by a space.', 'Print the GCD.', '1 ≤ A, B ≤ 10^9', [{ input: '12 18', output: '6' }]),
      p('d5p3', 'Armstrong Number', 'easy', 'A number is Armstrong if it equals sum of its digits raised to power of digit count. Print "Yes" or "No".', 'A single integer N.', 'Print "Yes" if Armstrong, "No" otherwise.', '1 ≤ N ≤ 10^7', [{ input: '153', output: 'Yes' }, { input: '123', output: 'No' }]),
      p('d5p4', 'Fibonacci Sequence', 'easy', 'Print the first N Fibonacci numbers (0, 1, 1, 2, 3, 5, ...).', 'A single integer N.', 'N space-separated Fibonacci numbers.', '1 ≤ N ≤ 30', [{ input: '7', output: '0 1 1 2 3 5 8' }]),
    ],
  },
  {
    day: 6, theme: 'String Manipulation', topics: ['strings', 'hashing'],
    problems: [
      p('d6p1', 'Anagram Check', 'easy', 'Check if two strings are anagrams (same character frequency). Print "Yes" or "No". Case-insensitive.', 'Two lines, each a string.', 'Print "Yes" if anagrams, "No" otherwise.', '1 ≤ |S| ≤ 10^5', [{ input: 'listen\nsilent', output: 'Yes' }, { input: 'hello\nworld', output: 'No' }]),
      p('d6p2', 'First Non-Repeating Character', 'easy', 'Find the first character in a string that appears only once. Print it, or "None" if all repeat.', 'A single line containing string S.', 'Print the first non-repeating character or "None".', '1 ≤ |S| ≤ 10^5', [{ input: 'swiss', output: 'w' }, { input: 'aabb', output: 'None' }]),
      p('d6p3', 'Longest Common Prefix', 'easy', 'Find the longest common prefix among N strings. Print empty string if none.', 'First line: N. Next N lines: strings.', 'Print the longest common prefix.', '1 ≤ N ≤ 200, 1 ≤ |S| ≤ 200', [{ input: '3\nflower\nflow\nflight', output: 'fl' }]),
    ],
  },
  {
    day: 7, theme: 'Searching & Sorting', topics: ['searching', 'sorting', 'arrays'],
    problems: [
      p('d7p1', 'Binary Search', 'easy', 'Find the index (0-based) of a target in a sorted array using binary search. Print -1 if not found.', 'First line: N and target. Second line: N sorted integers.', 'Print the index, or -1.', '1 ≤ N ≤ 10^5', [{ input: '6 9\n1 3 5 7 9 11', output: '4' }]),
      p('d7p2', 'Move Zeroes', 'easy', 'Move all zeroes to the end while keeping non-zero order.', 'First line: N. Second line: N integers.', 'N integers with zeroes at the end.', '1 ≤ N ≤ 10^5', [{ input: '5\n0 1 0 3 12', output: '1 3 12 0 0' }]),
      p('d7p3', 'Two Sum', 'easy', 'Given an array and target, find two indices (1-based) whose values sum to target.', 'First line: N and target. Second line: N integers.', 'Two 1-based indices.', '2 ≤ N ≤ 10^5', [{ input: '4 9\n2 7 11 15', output: '1 2' }]),
    ],
  },
  {
    day: 8, theme: 'Stacks & Queues', topics: ['stacks', 'parentheses', 'parsing'],
    problems: [
      p('d8p1', 'Valid Parentheses', 'easy', 'Check if a string with (){}[] has valid matching brackets. Print "Yes" or "No".', 'A single line containing brackets string S.', 'Print "Yes" if valid, "No" otherwise.', '1 ≤ |S| ≤ 10^5', [{ input: '()[]{}', output: 'Yes' }, { input: '(]', output: 'No' }]),
      p('d8p2', 'Remove Outermost Parentheses', 'easy', 'Remove the outermost pair of parentheses from each primitive group. Print the result.', 'A single valid parentheses string S.', 'Print the string without outer parentheses.', '1 ≤ |S| ≤ 10^3', [{ input: '(()())(())', output: '()()()' }]),
      p('d8p3', 'Balanced Brackets Advanced', 'medium', 'Check if a string with (){}[] is balanced. Also check for nested correctness.', 'A single line with brackets.', 'Print "Yes" or "No".', '1 ≤ |S| ≤ 10^5', [{ input: '({[]})', output: 'Yes' }, { input: '([)]', output: 'No' }]),
    ],
  },
  {
    day: 9, theme: 'Recursion Basics', topics: ['recursion', 'math'],
    problems: [
      p('d9p1', 'Recursive Factorial', 'easy', 'Implement factorial using recursion. Print N!.', 'A single integer N.', 'Print N!.', '0 ≤ N ≤ 12', [{ input: '5', output: '120' }]),
      p('d9p2', 'Recursive Fibonacci', 'easy', 'Implement Fibonacci recursively. Print the Nth Fibonacci number (0-indexed: F₀=0, F₁=1).', 'A single integer N.', 'Print Fₙ.', '0 ≤ N ≤ 20', [{ input: '6', output: '8' }]),
      p('d9p3', 'Sum of Digits (Recursive)', 'easy', 'Compute the sum of digits of N using recursion.', 'A single integer N.', 'Print the sum of its digits.', '0 ≤ N ≤ 10^9', [{ input: '1234', output: '10' }]),
    ],
  },
  {
    day: 10, theme: 'Hash Maps & Frequency', topics: ['hashmap', 'frequency', 'counting'],
    problems: [
      p('d10p1', 'Most Frequent Element', 'easy', 'Find and print the most frequently occurring element in an array. If tie, print the smallest.', 'First line: N. Second line: N integers.', 'Print the most frequent element.', '1 ≤ N ≤ 10^5', [{ input: '6\n1 2 2 3 3 3', output: '3' }]),
      p('d10p2', 'Contains Duplicate', 'easy', 'Given an array, print "Yes" if any value appears at least twice, "No" otherwise.', 'First line: N. Second line: N integers.', 'Print "Yes" or "No".', '1 ≤ N ≤ 10^5', [{ input: '4\n1 2 3 1', output: 'Yes' }, { input: '4\n1 2 3 4', output: 'No' }]),
      p('d10p3', 'Word Frequency Counter', 'easy', 'Count how many times each word appears in a sentence. Print each word and its count, sorted alphabetically.', 'A single line of text.', 'One word:count per line, alphabetically.', '1 ≤ words ≤ 100', [{ input: 'the quick brown fox jumps over the lazy dog', output: 'brown:1\nfox:1\ndog:1\njumps:1\nlazy:1\nover:1\nquick:1\nthe:2' }]),
    ],
  },
  {
    day: 11, theme: 'Two Pointers', topics: ['two-pointers', 'arrays'],
    problems: [
      p('d11p1', 'Remove Duplicates from Sorted Array', 'easy', 'Remove duplicates in-place from a sorted array. Print the unique elements in order.', 'First line: N. Second line: N sorted integers.', 'Print unique elements space-separated.', '1 ≤ N ≤ 10^5', [{ input: '6\n1 1 2 2 3 4', output: '1 2 3 4' }]),
      p('d11p2', 'Merge Two Sorted Arrays', 'easy', 'Merge two sorted arrays into one sorted array and print it.', 'First line: N M. Next line: N sorted integers. Next line: M sorted integers.', 'Print N+M sorted integers.', '1 ≤ N, M ≤ 10^3', [{ input: '3 3\n1 3 5\n2 4 6', output: '1 2 3 4 5 6' }]),
      p('d11p3', 'Container With Most Water', 'medium', 'Given N heights of walls, find two walls that contain the most water. Print the max area.', 'First line: N. Second line: N integers (heights).', 'Print the maximum area.', '2 ≤ N ≤ 10^5', [{ input: '9\n1 8 6 2 5 4 8 3 7', output: '49' }]),
    ],
  },
  {
    day: 12, theme: 'Sliding Window', topics: ['sliding-window', 'arrays'],
    problems: [
      p('d12p1', 'Maximum Sum Subarray of Size K', 'easy', 'Given an array and window size K, find the max sum of any contiguous subarray of size K.', 'First line: N K. Second line: N integers.', 'Print the maximum sum.', '1 ≤ K ≤ N ≤ 10^5', [{ input: '5 3\n2 1 5 1 3', output: '9' }]),
      p('d12p2', 'First Negative in Window', 'easy', 'For each window of size K, print the first negative integer. If none, print 0.', 'First line: N K. Second line: N integers.', 'One integer per window.', '1 ≤ K ≤ N ≤ 10^5', [{ input: '5 2\n12 -1 -7 8 -15', output: '-1 -1 -7 -15' }]),
      p('d12p3', 'Longest Substring Without Repeating Chars', 'medium', 'Find the length of the longest substring without repeating characters.', 'A single line string S.', 'Print the length.', '1 ≤ |S| ≤ 10^5', [{ input: 'abcabcbb', output: '3' }]),
    ],
  },
]