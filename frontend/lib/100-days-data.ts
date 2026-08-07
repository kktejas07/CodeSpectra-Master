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
  {
    day: 13, theme: 'Linked Lists Basics', topics: ["linked-lists", "pointers"],
    problems: [
      p('d13p1', 'Create a Linked List', 'easy', 'Given N integers, create a singly linked list and print the list elements separated by spaces.', 'First line: N. Second line: N integers.', 'Print the linked list elements separated by spaces.', '1 <= N <= 10^5', [{"input": "5\n10 20 30 40 50", "output": "10 20 30 40 50"}]),
      p('d13p2', 'Insert at Position', 'easy', 'Given a linked list and a value with position, insert the value at the given position (0-indexed). Print the modified list.', 'First line: list elements. Second line: value and position.', 'Print the modified list.', '0 <= position <= length', [{"input": "1 2 4 5\n3 2", "output": "1 2 3 4 5"}]),
      p('d13p3', 'Delete Node by Value', 'easy', 'Given a linked list and a value, remove all nodes with that value. Print the remaining list.', 'First line: list elements. Second line: value to delete.', 'Print the remaining list.', '1 <= list length <= 10^4', [{"input": "1 2 6 3 4 5 6\n6", "output": "1 2 3 4 5"}]),
    ],
  },
  {
    day: 14, theme: 'Singly Linked List Operations', topics: ["linked-lists", "manipulation"],
    problems: [
      p('d14p1', 'Reverse a Linked List', 'easy', 'Reverse a singly linked list and print the reversed list.', 'First line: N. Second line: N integers.', 'Print the reversed list.', '1 <= N <= 10^5', [{"input": "5\n1 2 3 4 5", "output": "5 4 3 2 1"}]),
      p('d14p2', 'Find the Nth Node', 'easy', 'Given a linked list and N, return the value at the Nth position (0-indexed). Print -1 if N is out of bounds.', 'First line: list elements. Second line: N.', 'Print the value at position N or -1.', '0 <= N <= 10^5', [{"input": "10 20 30 40 50\n2", "output": "30"}]),
      p('d14p3', 'Detect Loop in Linked List', 'medium', 'Given a linked list with possible loop, detect if a loop exists. Print Yes or No.', 'First line: list elements. Second line: position where tail connects (0-indexed, -1 for no loop).', 'Print Yes if loop exists, No otherwise.', '1 <= list length <= 10^4', [{"input": "1 2 3 4 5\n1", "output": "Yes"}, {"input": "1 2 3 4 5\n-1", "output": "No"}]),
    ],
  },
  {
    day: 15, theme: 'Doubly Linked Lists', topics: ["doubly-linked-lists", "pointers"],
    problems: [
      p('d15p1', 'Create a Doubly Linked List', 'easy', 'Given N integers, create a doubly linked list and print it forward then backward.', 'First line: N. Second line: N integers.', 'Two lines: forward traversal and backward traversal.', '1 <= N <= 10^5', [{"input": "5\n1 2 3 4 5", "output": "1 2 3 4 5\n5 4 3 2 1"}]),
      p('d15p2', 'Insert at Front and Back', 'easy', 'Given a doubly linked list, insert elements at front and back, then print the list.', 'First line: initial list. Second line: front value. Third line: back value.', 'Print the final list.', '0 <= list length <= 10^4', [{"input": "2 3 4\n1\n5", "output": "1 2 3 4 5"}]),
      p('d15p3', 'Delete Occurrences of Key', 'medium', 'Given a doubly linked list and a key, delete all occurrences of that key. Print the modified list.', 'First line: list elements. Second line: key.', 'Print the modified list.', '1 <= list length <= 10^4', [{"input": "1 2 3 2 4 2 5\n2", "output": "1 3 4 5"}]),
    ],
  },
  {
    day: 16, theme: 'Binary Trees Basics', topics: ["binary-trees", "recursion"],
    problems: [
      p('d16p1', 'Tree Height', 'easy', 'Given a binary tree as level-order input (-1 for null nodes), compute its height.', 'First line: N. Second line: N integers in level-order (-1 for null).', 'Print the height of the tree.', '1 <= N <= 10^4', [{"input": "7\n1 2 3 4 5 -1 6", "output": "3"}]),
      p('d16p2', 'Count Nodes', 'easy', 'Count the total number of nodes in a binary tree given as level-order input.', 'First line: N. Second line: N integers in level-order (-1 for null).', 'Print the node count.', '1 <= N <= 10^4', [{"input": "7\n1 2 3 4 5 -1 6", "output": "6"}]),
      p('d16p3', 'Mirror Tree', 'medium', 'Given a binary tree, construct its mirror image and print the level-order traversal.', 'First line: N. Second line: N integers in level-order (-1 for null).', 'Print mirrored tree in level-order.', '1 <= N <= 10^4', [{"input": "5\n1 2 3 4 -1", "output": "1 3 2 -1 4"}]),
    ],
  },
  {
    day: 17, theme: 'Binary Search Trees', topics: ["bst", "trees"],
    problems: [
      p('d17p1', 'BST Insert and Search', 'easy', 'Build a BST from given elements and search for a value. Print Found or Not Found.', 'First line: N elements to insert. Second line: value to search.', 'Print Found or Not Found.', '1 <= N <= 10^4', [{"input": "5\n3 1 4 1 5\n4", "output": "Found"}]),
      p('d17p2', 'Validate BST', 'medium', 'Given a binary tree in level-order, check if it is a valid BST. Print Yes or No.', 'First line: N. Second line: N integers in level-order.', 'Print Yes if valid BST, No otherwise.', '1 <= N <= 10^4', [{"input": "3\n2 1 3", "output": "Yes"}, {"input": "5\n5 1 4 -1 6 -1 -1 3 -1", "output": "No"}]),
      p('d17p3', 'Kth Smallest in BST', 'medium', 'Find the Kth smallest element in a BST.', 'First line: tree in level-order. Second line: K.', 'Print the Kth smallest element.', '1 <= N <= 10^4', [{"input": "5\n3 1 4 -1 2\n2", "output": "2"}]),
    ],
  },
  {
    day: 18, theme: 'Tree Traversals (In/Pre/Post)', topics: ["tree-traversal", "recursion"],
    problems: [
      p('d18p1', 'Inorder Traversal', 'easy', 'Given a binary tree in level-order, print its inorder traversal.', 'First line: N. Second line: N integers in level-order (-1 for null).', 'Print inorder traversal.', '1 <= N <= 10^4', [{"input": "3\n2 1 3", "output": "1 2 3"}]),
      p('d18p2', 'Preorder Traversal', 'easy', 'Given a binary tree in level-order, print its preorder traversal.', 'First line: N. Second line: N integers in level-order (-1 for null).', 'Print preorder traversal.', '1 <= N <= 10^4', [{"input": "3\n2 1 3", "output": "2 1 3"}]),
      p('d18p3', 'Postorder Traversal', 'easy', 'Given a binary tree in level-order, print its postorder traversal.', 'First line: N. Second line: N integers in level-order (-1 for null).', 'Print postorder traversal.', '1 <= N <= 10^4', [{"input": "3\n2 1 3", "output": "1 3 2"}]),
    ],
  },
  {
    day: 19, theme: 'Hash Maps Deep Dive', topics: ["hashmap", "design"],
    problems: [
      p('d19p1', 'Two Sum Using HashMap', 'easy', 'Given an array and target, find two indices whose values sum to target using a hash map.', 'First line: N and target. Second line: N integers.', 'Two 1-based indices.', '2 <= N <= 10^5', [{"input": "4 9\n2 7 11 15", "output": "1 2"}]),
      p('d19p2', 'Group Anagrams', 'medium', 'Group a list of strings by their anagram equivalence. Print groups one per line.', 'First line: N. Next N lines: strings.', 'Groups of anagrams, one group per line.', '1 <= N <= 10^4, 1 <= |S| <= 100', [{"input": "4\neat tea tan ate nat", "output": "eat tea ate\ntan nat"}]),
      p('d19p3', 'Subarray Sum Equals K', 'medium', 'Count the number of contiguous subarrays whose sum equals K.', 'First line: N and K. Second line: N integers.', 'Print the count.', '1 <= N <= 2*10^4', [{"input": "4 0\n1 -1 1 -1", "output": "4"}]),
    ],
  },
  {
    day: 20, theme: 'Hash Sets and Frequency Maps', topics: ["hashset", "frequency"],
    problems: [
      p('d20p1', 'Intersection of Two Arrays', 'easy', 'Find the intersection of two arrays (unique elements only). Print sorted result.', 'First line: N and M. Second line: N integers. Third line: M integers.', 'Print sorted unique intersection.', '1 <= N, M <= 10^5', [{"input": "4 5\n1 2 2 1\n2 2", "output": "2"}]),
      p('d20p2', 'Top K Frequent Elements', 'medium', 'Find the K most frequent elements in an array. If tie, smaller element comes first.', 'First line: N and K. Second line: N integers.', 'Print K space-separated elements.', '1 <= N <= 10^5', [{"input": "6 2\n1 1 1 2 2 3", "output": "1 2"}]),
      p('d20p3', 'Longest Consecutive Sequence', 'medium', 'Find the length of the longest consecutive elements sequence in an unsorted array.', 'First line: N. Second line: N integers.', 'Print the length of the longest consecutive sequence.', '1 <= N <= 10^5', [{"input": "7\n100 4 200 1 3 2 4", "output": "4"}]),
    ],
  },
  {
    day: 21, theme: 'Heaps and Priority Queues', topics: ["heaps", "priority-queue"],
    problems: [
      p('d21p1', 'Kth Largest Element', 'easy', 'Find the Kth largest element in an unsorted array.', 'First line: N and K. Second line: N integers.', 'Print the Kth largest element.', '1 <= K <= N <= 10^5', [{"input": "6 2\n3 2 1 5 6 4", "output": "5"}]),
      p('d21p2', 'Merge K Sorted Lists', 'medium', 'Merge K sorted lists into one sorted list and print it.', 'First line: K. For each list: first element is size, then elements.', 'Print merged sorted list.', '1 <= K <= 100', [{"input": "3\n3 1 4 7\n2 2 5\n3 3 6 8", "output": "1 2 3 3 4 5 6 7 8"}]),
      p('d21p3', 'Find Median from Data Stream', 'hard', 'Design a data structure that supports adding numbers and finding the median. Process operations and print median after each add.', 'First line: N. Second line: N integers.', 'Print the median after each number (rounded to 1 decimal).', '1 <= N <= 10^5', [{"input": "5\n5 15 1 3 8", "output": "5.0 10.0 5.0 4.0 5.0"}]),
    ],
  },
  {
    day: 22, theme: 'Tries (Prefix Trees)', topics: ["tries", "strings"],
    problems: [
      p('d22p1', 'Implement a Trie', 'medium', 'Implement a trie with insert, search, and startsWith operations. Process commands and print results.', 'First line: N commands. Each command is insert word, search word, or startsWith prefix.', 'For search/startsWith, print true or false.', '1 <= N <= 10^4', [{"input": "5\ninsert apple\nsearch apple\nsearch app\nstartsWith app\ninsert app", "output": "true\nfalse\ntrue"}]),
      p('d22p2', 'Count Distinct Substrings', 'hard', 'Count the number of distinct substrings of a given string (including the empty string).', 'A single string S.', 'Print the count of distinct substrings.', '1 <= |S| <= 5000', [{"input": "ab", "output": "4"}]),
      p('d22p3', 'Word Search II', 'hard', 'Given a 2D board of characters and a list of words, find all words that exist on the board. Print found words.', 'First line: rows and cols. Board rows. Then N words.', 'Print found words sorted, one per line.', '1 <= rows, cols <= 12', [{"input": "3 3\no a a n\ne t a e\ni h k r\n2\noath pea", "output": "oath"}]),
    ],
  },
  {
    day: 23, theme: 'Graph Basics (Adjacency List)', topics: ["graphs", "adjacency-list"],
    problems: [
      p('d23p1', 'Build Adjacency List', 'easy', 'Given an undirected graph with N vertices and M edges, build and print its adjacency list.', 'First line: N M. Next M lines: edges (u v).', 'Print adjacency list: vertex: neighbors sorted.', '1 <= N <= 10^4', [{"input": "4 3\n1 2\n2 3\n3 4", "output": "1: 2\n2: 1 3\n3: 2 4\n4: 3"}]),
      p('d23p2', 'Degree of Each Vertex', 'easy', 'Compute the degree of each vertex in an undirected graph.', 'First line: N M. Next M lines: edges.', 'N lines: degree of vertex i.', '1 <= N <= 10^4', [{"input": "4 3\n1 2\n2 3\n3 4", "output": "1\n2\n2\n1"}]),
      p('d23p3', 'Graph Connectivity Check', 'medium', 'Check if an undirected graph is connected (all vertices reachable from any vertex). Print Yes or No.', 'First line: N M. Next M lines: edges.', 'Print Yes if connected, No otherwise.', '1 <= N <= 10^4', [{"input": "4 3\n1 2\n2 3\n3 4", "output": "Yes"}, {"input": "4 2\n1 2\n3 4", "output": "No"}]),
    ],
  },
  {
    day: 24, theme: 'Union-Find (Disjoint Sets)', topics: ["union-find", "disjoint-sets"],
    problems: [
      p('d24p1', 'Basic Union-Find', 'easy', 'Process union and find operations on elements 1..N. Print the root of each find.', 'First line: N and Q operations. Next Q lines: union a b or find a.', 'For each find, print the root.', '1 <= N, Q <= 10^5', [{"input": "5 5\nunion 1 2\nunion 3 4\nfind 1\nfind 3\nfind 5", "output": "1\n3\n5"}]),
      p('d24p2', 'Number of Connected Components', 'medium', 'Find the number of connected components in an undirected graph using Union-Find.', 'First line: N M. Next M lines: edges.', 'Print the number of connected components.', '1 <= N <= 10^5', [{"input": "5 3\n1 2\n3 4\n4 5", "output": "2"}]),
      p('d24p3', 'Detect Cycle in Undirected Graph', 'medium', 'Using Union-Find, detect if adding edges one by one creates a cycle. Print Cycle at edge i or No cycle.', 'First line: N M. Next M lines: edges added sequentially.', 'Print the edge number (1-indexed) where cycle is detected, or No cycle.', '1 <= N <= 10^5', [{"input": "3 3\n1 2\n2 3\n3 1", "output": "Cycle at edge 3"}]),
    ],
  },
  {
    day: 25, theme: 'Advanced Linked Lists (Cycle Detection, Merge)', topics: ["linked-lists", "algorithms"],
    problems: [
      p('d25p1', 'Detect Cycle and Find Start', 'hard', 'Given a linked list with a cycle, find the node where the cycle begins. Print the value of that node, or -1 if no cycle.', 'First line: list values. Second line: index (0-based) where tail connects, -1 for no cycle.', 'Print the value at cycle start or -1.', '1 <= list length <= 10^4', [{"input": "3 2 0 -1\n1", "output": "2"}]),
      p('d25p2', 'Merge Two Sorted Linked Lists', 'easy', 'Merge two sorted linked lists into one sorted list and print it.', 'First line: list A. Second line: list B.', 'Print the merged sorted list.', '0 <= length <= 10^4', [{"input": "1 3 5\n2 4 6", "output": "1 2 3 4 5 6"}]),
      p('d25p3', 'Remove Nth Node From End', 'medium', 'Remove the Nth node from the end of a linked list and print the result.', 'First line: list values. Second line: N.', 'Print the modified list.', '1 <= list length <= 10^5', [{"input": "1 2 3 4 5\n2", "output": "1 2 3 5"}]),
    ],
  },
  {
    day: 26, theme: 'Binary Search Mastery', topics: ["binary-search", "algorithms"],
    problems: [
      p('d26p1', 'Search in Rotated Sorted Array', 'medium', 'Search for a target in a rotated sorted array. Return the index or -1.', 'First line: N and target. Second line: N integers.', 'Print the index or -1.', '1 <= N <= 10^5', [{"input": "6 3\n4 5 6 7 0 1 2", "output": "-1"}]),
      p('d26p2', 'Find Minimum in Rotated Sorted Array', 'medium', 'Find the minimum element in a rotated sorted array with no duplicates.', 'First line: N. Second line: N integers.', 'Print the minimum element.', '1 <= N <= 10^5', [{"input": "5\n4 5 6 7 0 1 2", "output": "0"}]),
      p('d26p3', 'Aggressive Cows (Maximize Minimum Distance)', 'hard', 'Place C cows in N stalls such that the minimum distance between any two cows is maximized. Print the maximum minimum distance.', 'First line: N C. Second line: N stall positions.', 'Print the maximum minimum distance.', '2 <= C <= N <= 10^5', [{"input": "5 3\n1 2 8 4 9", "output": "3"}]),
    ],
  },
  {
    day: 27, theme: 'Selection and Insertion Sort', topics: ["sorting", "comparison-sort"],
    problems: [
      p('d27p1', 'Selection Sort', 'easy', 'Implement selection sort. Print the array after each swap.', 'First line: N. Second line: N integers.', 'Print the array after each swap.', '1 <= N <= 10^3', [{"input": "4\n64 25 12 22", "output": "12 25 64 22\n12 22 64 25\n12 22 25 64"}]),
      p('d27p2', 'Insertion Sort', 'easy', 'Implement insertion sort. Print the array after each insertion pass.', 'First line: N. Second line: N integers.', 'Print the array after each pass.', '1 <= N <= 10^3', [{"input": "5\n5 2 4 6 1 3", "output": "2 5 4 6 1 3\n2 4 5 6 1 3\n2 4 5 6 1 3\n1 2 4 5 6 3\n1 2 3 4 5 6"}]),
      p('d27p3', 'Sort Characters By Frequency', 'medium', 'Sort characters of a string by frequency (descending). If same frequency, alphabetical order.', 'A single string S.', 'Print the frequency-sorted string.', '1 <= |S| <= 10^5', [{"input": "tree", "output": "eert"}]),
    ],
  },
  {
    day: 28, theme: 'Merge Sort and Quick Sort', topics: ["merge-sort", "quick-sort"],
    problems: [
      p('d28p1', 'Merge Sort Implementation', 'medium', 'Implement merge sort and print the sorted array.', 'First line: N. Second line: N integers.', 'Print the sorted array.', '1 <= N <= 10^5', [{"input": "5\n38 27 43 3 9", "output": "3 9 27 38 43"}]),
      p('d28p2', 'Quick Sort Implementation', 'medium', 'Implement quick sort using last element as pivot. Print the sorted array.', 'First line: N. Second line: N integers.', 'Print the sorted array.', '1 <= N <= 10^5', [{"input": "6\n10 80 30 90 40 50 70", "output": "10 30 40 50 70 80 90"}]),
      p('d28p3', 'Count Inversions', 'hard', 'Count the number of inversions in an array (pairs i<j where arr[i]>arr[j]) using merge sort.', 'First line: N. Second line: N integers.', 'Print the inversion count.', '1 <= N <= 10^5', [{"input": "5\n2 4 1 3 5", "output": "3"}]),
    ],
  },
  {
    day: 29, theme: 'Counting and Radix Sort', topics: ["counting-sort", "radix-sort"],
    problems: [
      p('d29p1', 'Counting Sort', 'easy', 'Implement counting sort for integers in range 0 to K. Print the sorted array.', 'First line: N and K. Second line: N integers in [0, K].', 'Print the sorted array.', '1 <= N <= 10^5, 0 <= K <= 10^4', [{"input": "6 5\n2 0 1 4 3 5", "output": "0 1 2 3 4 5"}]),
      p('d29p2', 'Sort Colors (Dutch National Flag)', 'medium', 'Sort an array containing only 0s, 1s, and 2s in-place in one pass.', 'First line: N. Second line: N integers (0, 1, or 2).', 'Print the sorted array.', '1 <= N <= 10^5', [{"input": "6\n2 0 2 1 1 0", "output": "0 0 1 1 2 2"}]),
      p('d29p3', 'Radix Sort', 'medium', 'Implement radix sort for non-negative integers. Print the sorted array.', 'First line: N. Second line: N non-negative integers.', 'Print the sorted array.', '1 <= N <= 10^4', [{"input": "7\n170 45 75 90 802 24 2", "output": "2 24 45 75 90 170 802"}]),
    ],
  },
  {
    day: 30, theme: 'Recursion Fundamentals', topics: ["recursion", "backtracking-intro"],
    problems: [
      p('d30p1', 'Power of a Number', 'easy', 'Compute x raised to the power n using recursion. Handle negative exponents (return -1 for invalid).', 'Two integers x and n.', 'Print x^n (integer).', '-10 <= x <= 10, 0 <= n <= 20', [{"input": "2 10", "output": "1024"}]),
      p('d30p2', 'Generate Subsets', 'medium', 'Generate all subsets of a given set and print them sorted.', 'First line: N. Second line: N integers.', 'Print subsets, one per line, elements space-separated.', '1 <= N <= 15', [{"input": "3\n1 2 3", "output": "\n1\n2\n1 2\n3\n1 3\n2 3\n1 2 3"}]),
      p('d30p3', 'Tower of Hanoi', 'medium', 'Solve Tower of Hanoi for N disks. Print the moves (from rod, to rod).', 'A single integer N.', 'Print each move as from to on separate lines.', '1 <= N <= 15', [{"input": "3", "output": "1 3\n1 2\n3 2\n1 3\n2 1\n2 3\n1 3"}]),
    ],
  },
  {
    day: 31, theme: 'Backtracking (N-Queens, Sudoku)', topics: ["backtracking", "constraint-satisfaction"],
    problems: [
      p('d31p1', 'N-Queens Count', 'medium', 'Count the number of distinct solutions to the N-Queens problem on an NxN board.', 'A single integer N.', 'Print the number of solutions.', '1 <= N <= 14', [{"input": "4", "output": "2"}, {"input": "8", "output": "92"}]),
      p('d31p2', 'Sudoku Solver', 'hard', 'Solve a partially filled Sudoku puzzle. Print the solved grid.', '9 lines, each 9 characters (0 for empty).', 'Print the solved 9x9 grid.', 'Valid Sudoku input', [{"input": "530070000\n600195000\n098000060\n800060003\n400803001\n700020006\n060000280\n000419005\n000080079", "output": "534678912\n672195348\n198342567\n859761423\n426835791\n713924856\n961537284\n287419635\n345286179"}]),
      p('d31p3', 'Subset Sum Problem', 'medium', 'Determine if there exists a subset of the array that sums to exactly K. Print Yes or No.', 'First line: N and K. Second line: N integers.', 'Print Yes or No.', '1 <= N <= 20, 1 <= K <= 10^3', [{"input": "4 10\n1 2 3 4", "output": "Yes"}]),
    ],
  },
  {
    day: 32, theme: 'Divide and Conquer', topics: ["divide-and-conquer", "algorithms"],
    problems: [
      p('d32p1', 'Maximum Subarray (Divide and Conquer)', 'medium', 'Find the maximum sum contiguous subarray using divide and conquer.', 'First line: N. Second line: N integers.', 'Print the maximum subarray sum.', '1 <= N <= 10^5', [{"input": "6\n-2 1 -3 4 -1 2 1 -5 4", "output": "6"}]),
      p('d32p2', 'Closest Pair of Points', 'hard', 'Find the minimum distance between any pair of points in a 2D plane.', 'First line: N. Next N lines: x y coordinates.', 'Print the minimum distance rounded to 4 decimal places.', '2 <= N <= 10^4', [{"input": "4\n0 0\n0 1\n1 0\n1 1", "output": "1.0000"}]),
      p('d32p3', 'Pow(x, n)', 'medium', 'Compute x raised to the power n using fast exponentiation (divide and conquer).', 'Two integers x and n.', 'Print x^n.', '-100 <= x <= 100, -10^9 <= n <= 10^9', [{"input": "2 10", "output": "1024"}]),
    ],
  },
  {
    day: 33, theme: 'Greedy Algorithms', topics: ["greedy", "optimization"],
    problems: [
      p('d33p1', 'Activity Selection Problem', 'medium', 'Given N activities with start and finish times, select the maximum number of non-overlapping activities. Print the count.', 'First line: N. Next N lines: start finish.', 'Print the maximum count of activities.', '1 <= N <= 10^5', [{"input": "4\n1 2\n3 4\n0 6\n5 7", "output": "3"}]),
      p('d33p2', 'Fractional Knapsack', 'medium', 'Given items with weights and values and a knapsack capacity, maximize total value (can take fractions).', 'First line: N and capacity. Next N lines: weight value.', 'Print the maximum value rounded to 2 decimal places.', '1 <= N <= 10^4', [{"input": "3 50\n10 60\n20 100\n30 120", "output": "240.00"}]),
      p('d33p3', 'Jump Game', 'medium', 'Determine if you can reach the last index from the first index given max jump lengths. Print Yes or No.', 'First line: N. Second line: N integers (max jumps).', 'Print Yes or No.', '1 <= N <= 10^4', [{"input": "5\n2 3 1 1 4", "output": "Yes"}, {"input": "4\n3 2 1 0", "output": "No"}]),
    ],
  },
  {
    day: 34, theme: 'Two Pointers Advanced', topics: ["two-pointers", "sorting"],
    problems: [
      p('d34p1', '3Sum', 'medium', 'Find all unique triplets that sum to zero. Print each triplet sorted.', 'First line: N. Second line: N integers.', 'Print triplets, one per line, sorted.', '3 <= N <= 3000', [{"input": "6\n-1 0 1 2 -1 -4", "output": "-1 -1 2\n-1 0 1"}]),
      p('d34p2', '4Sum', 'hard', 'Find all unique quadruplets that sum to target K. Print each quadruplet sorted.', 'First line: N and K. Second line: N integers.', 'Print quadruplets, one per line, sorted.', '4 <= N <= 200', [{"input": "6 0\n1 0 -1 0 -2 2", "output": "-2 -1 1 2\n-2 0 0 2\n-1 0 0 1"}]),
      p('d34p3', 'Trapping Rain Water', 'hard', 'Given N non-negative integers representing elevation, compute how much water it can trap after raining.', 'First line: N. Second line: N integers.', 'Print the total water trapped.', '1 <= N <= 10^5', [{"input": "12\n0 1 0 2 1 0 1 3 2 1 2 1", "output": "6"}]),
    ],
  },
  {
    day: 35, theme: 'Sliding Window Advanced', topics: ["sliding-window", "optimization"],
    problems: [
      p('d35p1', 'Minimum Window Substring', 'hard', 'Find the minimum window in S that contains all characters of string T. Print the window or empty string if not found.', 'First line: string S. Second line: string T.', 'Print the minimum window substring.', '1 <= |S|, |T| <= 10^5', [{"input": "ADOBECODEBANC\nABC", "output": "BANC"}]),
      p('d35p2', 'Sliding Window Maximum', 'hard', 'Given an array and window size K, find the maximum in each sliding window. Print all maximums.', 'First line: N and K. Second line: N integers.', 'Print window maximums space-separated.', '1 <= K <= N <= 10^5', [{"input": "8 3\n1 3 -1 -3 5 3 6 7", "output": "3 3 5 5 6 7"}]),
      p('d35p3', 'Longest Substring with At Most K Distinct Characters', 'medium', 'Find the length of the longest substring that contains at most K distinct characters.', 'First line: string S. Second line: K.', 'Print the length.', '1 <= |S| <= 10^5, 0 <= K <= 26', [{"input": "eceba\n2", "output": "3"}]),
    ],
  },
  {
    day: 36, theme: 'Kadane\'s Algorithm (Max Subarray)', topics: ["dynamic-programming-intro", "arrays"],
    problems: [
      p('d36p1', 'Maximum Subarray Sum', 'easy', 'Find the contiguous subarray with the largest sum using Kadane\'s algorithm.', 'First line: N. Second line: N integers.', 'Print the maximum subarray sum.', '1 <= N <= 10^5', [{"input": "5\n-2 1 -3 4 -1 2 1 -5 4", "output": "6"}]),
      p('d36p2', 'Maximum Product Subarray', 'medium', 'Find the contiguous subarray with the largest product. Print the maximum product.', 'First line: N. Second line: N integers.', 'Print the maximum product.', '1 <= N <= 2*10^4', [{"input": "4\n2 3 -2 4", "output": "6"}]),
      p('d36p3', 'Maximum Sum Circular Subarray', 'medium', 'Find the maximum sum of a subarray in a circular array. Print the maximum sum.', 'First line: N. Second line: N integers.', 'Print the maximum circular subarray sum.', '1 <= N <= 3*10^4', [{"input": "5\n1 -2 3 -2", "output": "3"}]),
    ],
  },
  {
    day: 37, theme: 'Prefix Sums', topics: ["prefix-sum", "arrays"],
    problems: [
      p('d37p1', 'Range Sum Query', 'easy', 'Answer Q queries asking for the sum of elements in range [L, R] (0-indexed) of an array.', 'First line: N Q. Second line: N integers. Next Q lines: L R.', 'Print the sum for each query.', '1 <= N, Q <= 10^5', [{"input": "5 3\n1 2 3 4 5\n0 2\n1 3\n0 4", "output": "6\n9\n15"}]),
      p('d37p2', 'Find Pivot Index', 'easy', 'Find the index where the sum of elements to the left equals the sum to the right. Print -1 if none.', 'First line: N. Second line: N integers.', 'Print the pivot index or -1.', '1 <= N <= 10^4', [{"input": "6\n1 7 3 6 5 6", "output": "3"}]),
      p('d37p3', 'Subarray Sum Equals K (Prefix Sum)', 'medium', 'Count the number of contiguous subarrays whose sum equals K using prefix sums.', 'First line: N and K. Second line: N integers.', 'Print the count.', '1 <= N <= 2*10^4', [{"input": "4 0\n1 -1 1 -1", "output": "4"}]),
    ],
  },
  {
    day: 38, theme: 'Bit Manipulation Basics', topics: ["bit-manipulation", "binary"],
    problems: [
      p('d38p1', 'Single Number', 'easy', 'Find the element that appears exactly once in an array where all others appear twice. Use XOR.', 'First line: N. Second line: N integers.', 'Print the single number.', '1 <= N <= 3*10^4, N odd', [{"input": "5\n4 1 2 1 2", "output": "4"}]),
      p('d38p2', 'Count Set Bits', 'easy', 'Count the number of 1-bits (set bits) in the binary representation of N.', 'A single integer N.', 'Print the count of set bits.', '0 <= N <= 10^9', [{"input": "13", "output": "3"}]),
      p('d38p3', 'Power of Two', 'easy', 'Check if N is a power of two. Print Yes or No.', 'A single integer N.', 'Print Yes or No.', '-10^9 <= N <= 10^9', [{"input": "16", "output": "Yes"}, {"input": "18", "output": "No"}]),
    ],
  },
  {
    day: 39, theme: 'Bit Manipulation Advanced', topics: ["bit-manipulation", "advanced"],
    problems: [
      p('d39p1', 'Missing Number', 'easy', 'Find the missing number in an array containing N distinct numbers from 0 to N using XOR.', 'First line: N. Second line: N integers.', 'Print the missing number.', '1 <= N <= 10^4', [{"input": "3\n0 1 3", "output": "2"}]),
      p('d39p2', 'Bitwise AND of Numbers Range', 'medium', 'Compute the bitwise AND of all numbers in the range [left, right] inclusive.', 'Two integers left and right.', 'Print the bitwise AND result.', '0 <= left <= right <= 2^31 - 1', [{"input": "5 7", "output": "4"}]),
      p('d39p3', 'Swap All Odds and Even Bits', 'medium', 'Swap all odd-positioned bits with even-positioned bits in the binary representation of N.', 'A single integer N.', 'Print the result after swapping.', '0 <= N <= 10^9', [{"input": "23", "output": "43"}]),
    ],
  },
  {
    day: 40, theme: 'Math and Number Theory', topics: ["number-theory", "math"],
    problems: [
      p('d40p1', 'Sieve of Eratosthenes', 'easy', 'Find all prime numbers up to N using the Sieve of Eratosthenes. Print them space-separated.', 'A single integer N.', 'Print all primes <= N.', '2 <= N <= 10^6', [{"input": "20", "output": "2 3 5 7 11 13 17 19"}]),
      p('d40p2', 'Modular Exponentiation', 'medium', 'Compute (x^n) mod M efficiently using binary exponentiation.', 'Three integers x, n, M.', 'Print (x^n) mod M.', '1 <= x, M <= 10^9, 0 <= n <= 10^18', [{"input": "2 10 1000", "output": "24"}]),
      p('d40p3', 'Extended Euclidean GCD', 'medium', 'Find GCD of A and B and integers x, y such that Ax + By = GCD(A, B). Print x and y.', 'Two integers A and B.', 'Print x y such that Ax + By = GCD(A, B).', '1 <= A, B <= 10^9', [{"input": "35 15", "output": "1 -2"}]),
    ],
  },
  {
    day: 41, theme: 'AVL Trees', topics: ["avl-trees", "balanced-trees"],
    problems: [
      p('d41p1', 'AVL Tree Insertion', 'medium', 'Insert elements into an AVL tree and print the level-order traversal after all insertions.', 'First line: N. Second line: N integers to insert.', 'Print level-order traversal of the AVL tree.', '1 <= N <= 10^3', [{"input": "5\n10 20 30 40 50", "output": "20 10 40 30 50"}]),
      p('d41p2', 'AVL Tree Deletion', 'hard', 'Insert elements into an AVL tree, then delete a given element. Print the level-order traversal.', 'First line: N elements. Second line: element to delete.', 'Print level-order traversal after deletion.', '1 <= N <= 10^3', [{"input": "5\n10 20 30 40 50\n30", "output": "20 10 40 30 50"}]),
      p('d41p3', 'Check if AVL Balanced', 'medium', 'Given a binary tree in level-order, check if it satisfies AVL balance property. Print Yes or No.', 'First line: N. Second line: N integers in level-order (-1 for null).', 'Print Yes if AVL balanced, No otherwise.', '1 <= N <= 10^4', [{"input": "3\n2 1 3", "output": "Yes"}]),
    ],
  },
  {
    day: 42, theme: 'Red-Black Trees (Concept)', topics: ["red-black-trees", "balanced-trees"],
    problems: [
      p('d42p1', 'Check Red-Black Properties', 'medium', 'Given a binary search tree with node colors (R/B), verify all red-black tree properties. Print violations or Valid.', 'First line: N. Next N lines: value color (0=black, 1=red). Level-order.', 'Print Valid or the first violated property.', '1 <= N <= 10^3', [{"input": "3\n2 1\n1 1\n3 0", "output": "Property 4 violated"}]),
      p('d42p2', 'Red-Black Insert Simulation', 'hard', 'Simulate insertion into a red-black tree with rotations and color flips. Print the resulting tree.', 'First line: N. Second line: N integers to insert.', 'Print level-order traversal with colors.', '1 <= N <= 10^3', [{"input": "5\n10 20 30 15 25", "output": "20B 10R 30R 15B 25B"}]),
      p('d42p3', 'Red-Black vs AVL Comparison', 'medium', 'Compare rotation counts for AVL and Red-Black trees for given sequences.', 'First line: N. Second line: N integers.', 'Print rotation counts for each.', '1 <= N <= 10^3', [{"input": "5\n10 20 30 40 50", "output": "AVL: 2 rotations, RB: 2 rotations"}]),
    ],
  },
  {
    day: 43, theme: 'B-Trees (Concept)', topics: ["b-trees", "disk-based-structures"],
    problems: [
      p('d43p1', 'B-Tree Insertion Simulation', 'hard', 'Simulate insertion into a B-Tree of order M. Print the tree after all insertions.', 'First line: M and N. Second line: N integers to insert.', 'Print the B-Tree level-order after all insertions.', '3 <= M <= 10, 1 <= N <= 50', [{"input": "3 7\n10 20 30 40 50 60 70", "output": "40\n10 20 30 50 60 70"}]),
      p('d43p2', 'B-Tree Search', 'medium', 'Search for a key in a given B-Tree. Print Found or Not Found.', 'First line: tree description. Second line: key to search.', 'Print Found or Not Found.', '1 <= keys <= 100', [{"input": "3\n40 10 20 30 50 60 70\n50", "output": "Found"}]),
      p('d43p3', 'B-Tree Range Query', 'hard', 'Given a B-Tree, find all keys in the range [L, R]. Print them sorted.', 'First line: tree. Second line: L R.', 'Print keys in [L, R] sorted.', '1 <= keys <= 1000', [{"input": "3\n40 10 20 30 50 60 70\n25 65", "output": "30 40 50 60"}]),
    ],
  },
  {
    day: 44, theme: 'Segment Trees', topics: ["segment-tree", "range-queries"],
    problems: [
      p('d44p1', 'Range Sum Query with Updates', 'medium', 'Build a segment tree for range sum queries and point updates. Process Q operations.', 'First line: N Q. Second line: N integers. Next Q lines: type val1 val2 (1 idx val = update, 2 l r = query).', 'For each query, print the sum.', '1 <= N, Q <= 10^5', [{"input": "5 5\n1 2 3 4 5\n2 1 3\n1 2 10\n2 1 3\n2 2 4\n2 1 5", "output": "6\n15\n22\n25"}]),
      p('d44p2', 'Range Minimum Query', 'medium', 'Build a segment tree for range minimum queries. Process queries and updates.', 'First line: N Q. Second line: N integers. Next Q lines: type val1 val2.', 'For each query, print the minimum in range.', '1 <= N, Q <= 10^5', [{"input": "5 3\n5 3 7 9 1\n2 1 5\n1 3 2\n2 1 5", "output": "1\n2"}]),
      p('d44p3', 'Count Inversions Using Segment Tree', 'hard', 'Count inversions in an array using a segment tree approach.', 'First line: N. Second line: N integers.', 'Print the inversion count.', '1 <= N <= 10^5', [{"input": "5\n2 4 1 3 5", "output": "3"}]),
    ],
  },
  {
    day: 45, theme: 'Fenwick Trees (Binary Indexed)', topics: ["fenwick-tree", "binary-indexed-tree"],
    problems: [
      p('d45p1', 'Fenwick Tree Point Update Range Query', 'medium', 'Implement a Fenwick tree for point updates and prefix sum queries.', 'First line: N Q. Second line: N integers. Next Q lines: type idx val (1 = update, 2 = prefix sum query).', 'For each query, print the prefix sum.', '1 <= N, Q <= 10^5', [{"input": "5 4\n1 2 3 4 5\n2 3\n1 2 10\n2 3\n2 5", "output": "6\n15\n25"}]),
      p('d45p2', 'Count Smaller Numbers After Self', 'hard', 'For each element, count how many smaller elements appear to its right using a Fenwick tree.', 'First line: N. Second line: N integers.', 'Print counts for each element.', '1 <= N <= 10^5', [{"input": "5\n5 2 6 1 3", "output": "2 1 1 0 0"}]),
      p('d45p3', 'Range Update Point Query', 'medium', 'Implement a Fenwick tree for range updates (add value to [l, r]) and point queries.', 'First line: N Q. Next Q lines: type l r val (1 = range update, 2 = point query).', 'For each query, print the value at index.', '1 <= N, Q <= 10^5', [{"input": "5 3\n1 1 3 5\n2 2\n2 4", "output": "5\n0"}]),
    ],
  },
  {
    day: 46, theme: 'Suffix Arrays', topics: ["suffix-array", "strings"],
    problems: [
      p('d46p1', 'Build Suffix Array', 'medium', 'Build the suffix array of a given string. Print the starting indices of sorted suffixes.', 'A single string S.', 'Print the suffix array (indices 0-based) sorted by suffixes.', '1 <= |S| <= 10^5', [{"input": "banana", "output": "5 3 1 0 4 2"}]),
      p('d46p2', 'Longest Common Substring via Suffix Array', 'hard', 'Find the longest common substring of two strings using suffix arrays.', 'First line: string A. Second line: string B.', 'Print the longest common substring.', '1 <= |A|, |B| <= 10^5', [{"input": "abcde\nabxde", "output": "ab"}]),
      p('d46p3', 'Count Distinct Substrings via Suffix Array', 'hard', 'Count the number of distinct substrings using suffix array and LCP array.', 'A single string S.', 'Print the count of distinct substrings.', '1 <= |S| <= 5000', [{"input": "abab", "output": "7"}]),
    ],
  },
  {
    day: 47, theme: 'LRU Cache Implementation', topics: ["cache", "design", "data-structures"],
    problems: [
      p('d47p1', 'LRU Cache Basic', 'medium', 'Implement an LRU cache with get and put operations in O(1). Process operations and print results.', 'First line: capacity. Next lines: operations (get key / put key value).', 'For get, print the value or -1.', '1 <= capacity <= 10^3', [{"input": "2\nput 1 1\nput 2 2\nget 1\nput 3 3\nget 2", "output": "1\n-1"}]),
      p('d47p2', 'LRU Cache with Timestamp', 'medium', 'Implement LRU cache where access updates recency. Also support getting the least recently used key.', 'First line: capacity. Next lines: operations.', 'For get_lru, print the least recently used key.', '1 <= capacity <= 10^3', [{"input": "2\nput 1 1\nput 2 2\nget_lru\nget 1\nget_lru", "output": "1\n1\n2"}]),
      p('d47p3', 'LRU Cache with Expiry', 'hard', 'Implement LRU cache where entries expire after T seconds. Support get, put, and time-based eviction.', 'First line: capacity and T. Next lines: timestamp operation key value.', 'For get, print the value or -1 if expired.', '1 <= capacity <= 10^3', [{"input": "2 5\n0 put 1 10\n3 put 2 20\n4 get 1\n8 get 2", "output": "10\n-1"}]),
    ],
  },
  {
    day: 48, theme: 'LFU Cache Implementation', topics: ["cache", "design", "frequency"],
    problems: [
      p('d48p1', 'LFU Cache Basic', 'hard', 'Implement an LFU (Least Frequently Used) cache. If tie in frequency, evict LRU.', 'First line: capacity. Next lines: operations (get key / put key value).', 'For get, print the value or -1.', '1 <= capacity <= 10^4', [{"input": "2\nput 1 1\nput 2 2\nget 1\nput 3 3\nget 2\nget 3", "output": "1\n-1\n3"}]),
      p('d48p2', 'LFU with Frequency Report', 'hard', 'Implement LFU cache and support a report operation showing all keys grouped by frequency.', 'First line: capacity. Next lines: operations.', 'For report, print keys grouped by frequency.', '1 <= capacity <= 10^3', [{"input": "3\nput 1 1\nput 2 2\nput 3 3\nget 1\nget 1\nreport", "output": "1: [1]\n2: [2, 3]"}]),
      p('d48p3', 'LFU vs LRU Comparison', 'medium', 'Simulate both LFU and LRU on the same operation sequence and report different eviction orders.', 'First line: capacity. Next lines: operations.', 'Print evicted keys for LFU and LRU.', '1 <= capacity <= 10^3', [{"input": "2\nput 1 1\nput 2 2\nget 1\nput 3 3", "output": "LFU evicted: 2\nLRU evicted: 2"}]),
    ],
  },
  {
    day: 49, theme: 'Bloom Filters', topics: ["bloom-filter", "probabilistic-data-structures"],
    problems: [
      p('d49p1', 'Bloom Filter Simulation', 'medium', 'Implement a Bloom filter with K hash functions. Process add and check operations.', 'First line: size and K. Next lines: operations (add element / check element).', 'For check, print Probably present or Definitely not present.', '1 <= size <= 10^5', [{"input": "100 3\nadd apple\nadd banana\ncheck apple\ncheck cherry", "output": "Probably present\nProbably present\nDefinitely not present"}]),
      p('d49p2', 'Bloom Filter False Positive Rate', 'medium', 'Add N elements to a Bloom filter and measure false positive rate for M test queries.', 'First line: filter size K and hash functions H. Second line: N elements to add. Third line: M test elements.', 'Print the false positive rate as a percentage.', '1 <= N, M <= 10^4', [{"input": "1000 3\n5\napple banana cherry date elderberry\n3\nfig grape honeydew", "output": "0.00"}]),
      p('d49p3', 'Counting Bloom Filter', 'hard', 'Implement a counting Bloom filter that supports deletions using counters instead of bits.', 'First line: size and K. Next lines: operations.', 'For check, print count (0 = not present).', '1 <= size <= 10^5', [{"input": "100 2\nadd hello\nadd world\ncheck hello\nremove hello\ncheck hello", "output": "1\n1\n0"}]),
    ],
  },
  {
    day: 50, theme: 'Skip Lists', topics: ["skip-list", "probabilistic-data-structures"],
    problems: [
      p('d50p1', 'Skip List Insert and Search', 'medium', 'Implement a skip list and process insert and search operations. Print the search results.', 'First line: N operations. Next lines: insert val or search val.', 'For search, print Found or Not Found.', '1 <= N <= 10^4', [{"input": "5\ninsert 3\ninsert 1\ninsert 5\nsearch 3\nsearch 2", "output": "Found\nNot Found"}]),
      p('d50p2', 'Skip List Range Query', 'hard', 'Implement skip list and support range queries [L, R]. Print all elements in range.', 'First line: N operations. Next lines: insert, search, or range L R.', 'For range, print sorted elements in [L, R].', '1 <= N <= 10^4', [{"input": "6\ninsert 3\ninsert 1\ninsert 5\ninsert 7\nrange 2 6\nrange 0 10", "output": "3 5\n1 3 5 7"}]),
      p('d50p3', 'Skip List vs BST Comparison', 'medium', 'Compare search performance of skip list and BST for the same dataset. Print average levels compared.', 'First line: N elements. Second line: M search queries.', 'Print comparison results.', '1 <= N <= 10^4', [{"input": "1000\n100", "output": "Skip List avg levels: 3, BST avg height: 10"}]),
    ],
  },
  {
    day: 51, theme: 'Graph Representations Deep', topics: ["graph-representation", "adjacency-matrix", "adjacency-list"],
    problems: [
      p('d51p1', 'Adjacency Matrix to List', 'easy', 'Convert an adjacency matrix representation of a graph to adjacency list format.', 'First line: N. Next N lines: N integers (adjacency matrix).', 'Print adjacency list: vertex: neighbors.', '1 <= N <= 10^3', [{"input": "3\n0 1 1\n1 0 1\n1 1 0", "output": "1: 2 3\n2: 1 3\n3: 1 2"}]),
      p('d51p2', 'Adjacency List to Matrix', 'easy', 'Convert an adjacency list representation to adjacency matrix.', 'First line: N M. Next M lines: edges.', 'Print N lines of N integers (adjacency matrix).', '1 <= N <= 10^3', [{"input": "3 3\n1 2\n2 3\n1 3", "output": "0 1 1\n1 0 1\n1 1 0"}]),
      p('d51p3', 'Memory Comparison', 'medium', 'Compare memory usage of adjacency matrix vs list for different graph types.', 'First line: N and edge density percentage.', 'Print the space comparison.', '1 <= N <= 10^4', [{"input": "1000 10", "output": "Matrix: 8.0 MB, List: 0.1 MB, Ratio: 80.0"}]),
    ],
  },
  {
    day: 52, theme: 'Adjacency Matrix vs List', topics: ["graph-representation", "performance"],
    problems: [
      p('d52p1', 'Graph Traversal Speed Test', 'medium', 'Run BFS on both adjacency matrix and list representations. Compare operation counts.', 'First line: N M. Next M lines: edges. Next: start vertex.', 'Print operation counts for each.', '1 <= N <= 10^4', [{"input": "5 4\n1 2\n2 3\n3 4\n4 5\n1", "output": "Matrix ops: 25, List ops: 9"}]),
      p('d52p2', 'Edge Existence Check', 'easy', 'Check if an edge exists between two vertices in both representations.', 'First line: N M. Next M lines: edges. Next Q queries.', 'For each query, print results from both representations.', '1 <= N, M, Q <= 10^4', [{"input": "4 3\n1 2\n2 3\n3 4\n2\n1 2\n1 4", "output": "Matrix: Yes, List: Yes\nMatrix: No, List: No"}]),
      p('d52p3', 'Sparse Graph Optimization', 'medium', 'For a sparse graph, show the space savings of adjacency list over matrix.', 'First line: N and approximate edge count.', 'Print space comparison and recommendation.', '1 <= N <= 10^5', [{"input": "10000 5000", "output": "Matrix: 800 MB, List: 0.08 MB, Use adjacency list"}]),
    ],
  },
  {
    day: 53, theme: 'Weighted Graphs', topics: ["weighted-graphs", "edge-weights"],
    problems: [
      p('d53p1', 'Weighted Adjacency List', 'easy', 'Build a weighted adjacency list from edge list and print it with weights.', 'First line: N M. Next M lines: u v w.', 'Print: vertex: (neighbor, weight) pairs.', '1 <= N <= 10^4', [{"input": "4 5\n1 2 10\n2 3 5\n3 4 7\n1 3 15\n1 4 20", "output": "1: (2,10) (3,15) (4,20)\n2: (1,10) (3,5)\n3: (2,5) (4,7) (1,15)\n4: (3,7) (1,20)"}]),
      p('d53p2', 'Minimum Edge Weight', 'easy', 'Find the minimum weight edge in a weighted graph. Print the edge and its weight.', 'First line: N M. Next M lines: u v w.', 'Print the minimum weight edge.', '1 <= N <= 10^4', [{"input": "3 3\n1 2 10\n2 3 5\n1 3 8", "output": "2 3 5"}]),
      p('d53p3', 'Total Weight and Average', 'medium', 'Compute the total weight and average weight of all edges in a weighted graph.', 'First line: N M. Next M lines: u v w.', 'Print: total weight and average (2 decimal).', '1 <= N <= 10^4', [{"input": "3 3\n1 2 10\n2 3 5\n1 3 8", "output": "Total: 23, Average: 7.67"}]),
    ],
  },
  {
    day: 54, theme: 'Directed vs Undirected', topics: ["directed-graphs", "undirected-graphs"],
    problems: [
      p('d54p1', 'Convert Undirected to Directed', 'easy', 'Convert an undirected graph to directed by orienting each edge from smaller to larger vertex.', 'First line: N M. Next M lines: undirected edges.', 'Print directed edges.', '1 <= N <= 10^4', [{"input": "3 3\n1 2\n2 3\n1 3", "output": "1 2\n2 3\n1 3"}]),
      p('d54p2', 'In-Degree and Out-Degree', 'easy', 'For a directed graph, compute in-degree and out-degree of each vertex.', 'First line: N M. Next M lines: directed edges u v.', 'Print: vertex in-degree out-degree for each.', '1 <= N <= 10^4', [{"input": "3 4\n1 2\n1 3\n2 3\n3 1", "output": "1: 1 2\n2: 1 1\n3: 2 1"}]),
      p('d54p3', 'Check if Directed is DAG', 'medium', 'Check if a directed graph is a DAG (no cycles) using topological sort. Print Yes or No.', 'First line: N M. Next M lines: directed edges.', 'Print Yes if DAG, No otherwise.', '1 <= N <= 10^4', [{"input": "3 2\n1 2\n2 3", "output": "Yes"}, {"input": "3 3\n1 2\n2 3\n3 1", "output": "No"}]),
    ],
  },
  {
    day: 55, theme: 'Sparse vs Dense Graphs', topics: ["graph-density", "optimization"],
    problems: [
      p('d55p1', 'Graph Density Calculation', 'easy', 'Calculate the density of a graph (edges / possible edges). Print the density percentage.', 'First line: N M.', 'Print density as a percentage rounded to 2 decimal.', '1 <= N <= 10^4', [{"input": "5 4", "output": "40.00"}]),
      p('d55p2', 'Representation Recommendation', 'easy', 'Given N and M, recommend whether to use adjacency matrix or list based on density.', 'First line: N and M.', 'Print recommendation and reason.', '1 <= N <= 10^5', [{"input": "1000 50000", "output": "Adjacency List (sparse: 10.00%)"}]),
      p('d55p3', 'BFS on Sparse vs Dense', 'medium', 'Compare BFS operation count on adjacency matrix vs list for graphs of varying density.', 'First line: N and density percentages to test.', 'Print comparison table.', '1 <= N <= 10^4', [{"input": "100 10 50 90", "output": "Density 10%: Matrix 10000, List 1000\nDensity 50%: Matrix 10000, List 5000\nDensity 90%: Matrix 10000, List 9000"}]),
    ],
  },
  {
    day: 56, theme: 'DP Fundamentals (Fibonacci, Climbing Stairs)', topics: ["dynamic-programming", "memoization"],
    problems: [
      p('d56p1', 'Fibonacci with Memoization', 'easy', 'Compute the Nth Fibonacci number using top-down DP (memoization). F(0)=0, F(1)=1.', 'A single integer N.', 'Print F(N).', '0 <= N <= 50', [{"input": "10", "output": "55"}]),
      p('d56p2', 'Climbing Stairs', 'easy', 'Count the number of distinct ways to climb N stairs, taking 1 or 2 steps at a time.', 'A single integer N.', 'Print the number of ways.', '1 <= N <= 45', [{"input": "5", "output": "8"}]),
      p('d56p3', 'Min Cost Climbing Stairs', 'medium', 'Given a cost array, find the minimum cost to reach the top. Can start at index 0 or 1.', 'First line: N. Second line: N integers (costs).', 'Print the minimum cost.', '2 <= N <= 10^3', [{"input": "5\n10 15 20 25 30", "output": "30"}]),
    ],
  },
  {
    day: 57, theme: '1D DP (House Robber, Coin Change)', topics: ["1d-dp", "optimization"],
    problems: [
      p('d57p1', 'House Robber', 'medium', 'You cannot rob two adjacent houses. Find the maximum amount you can rob.', 'First line: N. Second line: N integers (amounts).', 'Print the maximum rob amount.', '1 <= N <= 10^4', [{"input": "5\n1 2 3 1 4", "output": "6"}]),
      p('d57p2', 'Coin Change', 'medium', 'Given coin denominations and a target amount, find the minimum number of coins needed. Print -1 if impossible.', 'First line: N and amount. Second line: N coin values.', 'Print minimum coins or -1.', '1 <= N <= 12, 0 <= amount <= 10^4', [{"input": "3 11\n1 2 5", "output": "3"}]),
      p('d57p3', 'House Robber II', 'medium', 'Houses are arranged in a circle. Adjacent houses cannot be robbed. Find the maximum amount.', 'First line: N. Second line: N integers.', 'Print the maximum amount.', '1 <= N <= 10^4', [{"input": "4\n1 2 3 1", "output": "4"}]),
    ],
  },
  {
    day: 58, theme: '2D DP (Unique Paths, Min Path Sum)', topics: ["2d-dp", "grid"],
    problems: [
      p('d58p1', 'Unique Paths', 'medium', 'Count the number of unique paths from top-left to bottom-right of an MxN grid moving only right or down.', 'Two integers M and N.', 'Print the number of unique paths.', '1 <= M, N <= 100', [{"input": "3 7", "output": "28"}]),
      p('d58p2', 'Minimum Path Sum', 'medium', 'Find the path from top-left to bottom-right with minimum sum (right or down moves only).', 'First line: M N. Next M lines: N integers.', 'Print the minimum path sum.', '1 <= M, N <= 200', [{"input": "3 3\n1 3 1\n1 5 1\n4 2 1", "output": "7"}]),
      p('d58p3', 'Unique Paths with Obstacles', 'medium', 'Count unique paths in a grid with obstacles (1 = obstacle, 0 = free). Print 0 if impossible.', 'First line: M N. Next M lines: N integers.', 'Print the number of paths.', '1 <= M, N <= 100', [{"input": "3 3\n0 0 0\n0 1 0\n0 0 0", "output": "2"}]),
    ],
  },
  {
    day: 59, theme: 'Knapsack (0/1, Unbounded)', topics: ["knapsack", "optimization"],
    problems: [
      p('d59p1', '0/1 Knapsack', 'medium', 'Given items with weights and values and a capacity, find the maximum value (each item used at most once).', 'First line: N and capacity. Next N lines: weight value.', 'Print the maximum value.', '1 <= N <= 100, 1 <= capacity <= 10^4', [{"input": "3 50\n10 60\n20 100\n30 120", "output": "220"}]),
      p('d59p2', 'Unbounded Knapsack', 'medium', 'Same as 0/1 knapsack but each item can be used unlimited times.', 'First line: N and capacity. Next N lines: weight value.', 'Print the maximum value.', '1 <= N <= 100, 1 <= capacity <= 10^4', [{"input": "3 100\n5 10\n10 30\n15 40", "output": "300"}]),
      p('d59p3', 'Subset Sum Problem', 'medium', 'Determine if any subset of the array sums to exactly K. Print Yes or No.', 'First line: N and K. Second line: N integers.', 'Print Yes or No.', '1 <= N <= 100, 1 <= K <= 10^4', [{"input": "4 10\n1 2 3 4", "output": "Yes"}]),
    ],
  },
  {
    day: 60, theme: 'Longest Common Subsequence', topics: ["lcs", "string-dp"],
    problems: [
      p('d60p1', 'LCS Length', 'medium', 'Find the length of the longest common subsequence of two strings.', 'Two strings S1 and S2.', 'Print the LCS length.', '1 <= |S1|, |S2| <= 1000', [{"input": "abcde\nace", "output": "3"}]),
      p('d60p2', 'LCS String', 'medium', 'Find the actual longest common subsequence string (not just length).', 'Two strings S1 and S2.', 'Print the LCS string.', '1 <= |S1|, |S2| <= 1000', [{"input": "ABCBDAB\nBDCAB", "output": "BCAB"}]),
      p('d60p3', 'Longest Common Substring', 'medium', 'Find the longest common substring (contiguous) of two strings.', 'Two strings S1 and S2.', 'Print the longest common substring.', '1 <= |S1|, |S2| <= 1000', [{"input": "GeeksforGeeks\nGeeksQuiz", "output": "Geeks"}]),
    ],
  },
  {
    day: 61, theme: 'Longest Increasing Subsequence', topics: ["lis", "optimization"],
    problems: [
      p('d61p1', 'LIS Length', 'medium', 'Find the length of the longest strictly increasing subsequence.', 'First line: N. Second line: N integers.', 'Print the LIS length.', '1 <= N <= 2500', [{"input": "8\n10 9 2 5 3 7 101 18", "output": "4"}]),
      p('d61p2', 'LIS with Binary Search', 'hard', 'Find LIS length in O(N log N) using binary search.', 'First line: N. Second line: N integers.', 'Print the LIS length.', '1 <= N <= 25000', [{"input": "8\n10 9 2 5 3 7 101 18", "output": "4"}]),
      p('d61p3', 'Longest Non-Decreasing Subsequence', 'medium', 'Find the length of the longest non-decreasing subsequence (allows equal elements).', 'First line: N. Second line: N integers.', 'Print the length.', '1 <= N <= 2500', [{"input": "6\n3 4 -1 0 6 2", "output": "5"}]),
    ],
  },
  {
    day: 62, theme: 'Edit Distance', topics: ["edit-distance", "string-dp"],
    problems: [
      p('d62p1', 'Edit Distance', 'medium', 'Find the minimum number of operations (insert, delete, replace) to convert word1 to word2.', 'Two strings word1 and word2.', 'Print the edit distance.', '0 <= |word1|, |word2| <= 500', [{"input": "horse\nros", "output": "3"}]),
      p('d62p2', 'Edit Distance with Operations', 'hard', 'Find the edit distance and list all operations performed.', 'Two strings word1 and word2.', 'Print the distance and each operation.', '0 <= |word1|, |word2| <= 100', [{"input": "kitten\nsitting", "output": "3\nreplace k with s\nreplace e with i\ninsert g"}]),
      p('d62p3', 'One Edit Distance', 'medium', 'Check if two strings are exactly one edit distance apart. Print Yes or No.', 'Two strings S1 and S2.', 'Print Yes or No.', '0 <= |S1|, |S2| <= 10^4', [{"input": "ab\nacb", "output": "Yes"}]),
    ],
  },
  {
    day: 63, theme: 'String DP (Palindromes)', topics: ["palindrome", "string-dp"],
    problems: [
      p('d63p1', 'Longest Palindromic Substring', 'medium', 'Find the longest palindromic substring. Print the substring.', 'A single string S.', 'Print the longest palindromic substring.', '1 <= |S| <= 10^3', [{"input": "babad", "output": "bab"}]),
      p('d63p2', 'Longest Palindromic Subsequence', 'medium', 'Find the length of the longest palindromic subsequence.', 'A single string S.', 'Print the length.', '1 <= |S| <= 1000', [{"input": "bbbab", "output": "4"}]),
      p('d63p3', 'Palindromic Partitioning', 'hard', 'Find the minimum number of cuts needed to partition a string such that every substring is a palindrome.', 'A single string S.', 'Print the minimum cuts.', '1 <= |S| <= 1000', [{"input": "aab", "output": "1"}]),
    ],
  },
  {
    day: 64, theme: 'Matrix Chain Multiplication', topics: ["mcm", "interval-dp"],
    problems: [
      p('d64p1', 'Matrix Chain Multiplication', 'hard', 'Find the minimum number of scalar multiplications needed to multiply a chain of matrices.', 'First line: N. Second line: N dimensions (N-1 matrices).', 'Print the minimum multiplications.', '2 <= N <= 100', [{"input": "4\n10 30 5 60", "output": "4500"}]),
      p('d64p2', 'MCM Parenthesization', 'hard', 'Find the optimal parenthesization for matrix chain multiplication.', 'First line: N. Second line: N dimensions.', 'Print the parenthesization.', '2 <= N <= 10', [{"input": "5\n40 20 30 10 30", "output": "((AB)C)"}]),
      p('d64p3', 'Minimum Score Triangulation', 'hard', 'Given a polygon with N vertices, triangulate it to minimize the total score.', 'First line: N. Second line: N vertex values.', 'Print the minimum score.', '3 <= N <= 50', [{"input": "3\n1 2 3", "output": "12"}]),
    ],
  },
  {
    day: 65, theme: 'DP on Trees', topics: ["tree-dp", "graphs"],
    problems: [
      p('d65p1', 'Maximum Independent Set on Tree', 'hard', 'Find the maximum weight independent set (no two adjacent nodes selected) in a tree.', 'First line: N. Second line: N node weights. Next N-1 lines: edges.', 'Print the maximum weight.', '1 <= N <= 10^4', [{"input": "5\n1 2 3 4 5\n1 2\n1 3\n2 4\n2 5", "output": "12"}]),
      p('d65p2', 'Tree Diameter', 'medium', 'Find the diameter (longest path) of a tree.', 'First line: N. Next N-1 lines: edges.', 'Print the diameter.', '1 <= N <= 10^4', [{"input": "5\n1 2\n2 3\n3 4\n3 5", "output": "4"}]),
      p('d65p3', 'Tree Coloring', 'hard', 'Count the number of ways to color a tree with K colors such that no two adjacent nodes have the same color. Return count mod 10^9+7.', 'First line: N K. Next N-1 lines: edges.', 'Print the count modulo 10^9+7.', '1 <= N <= 10^4, 1 <= K <= 100', [{"input": "3 3\n1 2\n2 3", "output": "6"}]),
    ],
  },
  {
    day: 66, theme: 'Bitmask DP', topics: ["bitmask", "state-space"],
    problems: [
      p('d66p1', 'Travelling Salesman Problem', 'hard', 'Find the minimum cost tour visiting all cities exactly once and returning to the start.', 'First line: N. Next N lines: N integers (distance matrix).', 'Print the minimum cost.', '2 <= N <= 16', [{"input": "4\n0 10 15 20\n10 0 35 25\n15 35 0 30\n20 25 30 0", "output": "80"}]),
      p('d66p2', 'Assign M Tasks to N Workers', 'hard', 'Assign M tasks to N workers (M<=N) with cost matrix. Minimize total cost.', 'First line: N M. Next N lines: M costs.', 'Print the minimum total cost.', '1 <= N <= 12, 1 <= M <= N', [{"input": "3 2\n1 2\n3 4\n5 6", "output": "5"}]),
      p('d66p3', 'Maximum Weight Independent Set (Bitmask)', 'hard', 'Find maximum weight independent set in a graph with N<=20 using bitmask DP.', 'First line: N. Second line: N weights. Next: adjacency.', 'Print the maximum weight.', '1 <= N <= 20', [{"input": "4\n1 2 3 4\n0\n0\n1\n2", "output": "10"}]),
    ],
  },
  {
    day: 67, theme: 'Interval DP', topics: ["interval-dp", "optimization"],
    problems: [
      p('d67p1', 'Palindromic Partitioning (Interval DP)', 'hard', 'Find minimum cuts to partition a string into palindromic substrings using interval DP.', 'A single string S.', 'Print the minimum number of cuts.', '1 <= |S| <= 500', [{"input": "aab", "output": "1"}]),
      p('d67p2', 'Burst Balloons', 'hard', 'Given N balloons with values, burst them to maximize coins.', 'First line: N. Second line: N values.', 'Print the maximum coins.', '1 <= N <= 300', [{"input": "4\n3 1 5 8", "output": "167"}]),
      p('d67p3', 'Optimal BST', 'hard', 'Given sorted keys with frequencies, find the minimum cost search tree.', 'First line: N. Second line: N frequencies.', 'Print the minimum cost.', '1 <= N <= 100', [{"input": "4\n10 20 30 40", "output": "190"}]),
    ],
  },
  {
    day: 68, theme: 'DP with State Compression', topics: ["state-compression", "optimization"],
    problems: [
      p('d68p1', 'Minimum Window Subsequence', 'hard', 'Find the minimum window in S1 that is a subsequence of S2. Print the window.', 'Two strings S1 and S2.', 'Print the minimum window or -1.', '1 <= |S1|, |S2| <= 10^4', [{"input": "abc\ncb", "output": "bc"}]),
      p('d68p2', 'Distinct Subsequences', 'hard', 'Count the number of distinct subsequences of S that equal T.', 'Two strings S and T.', 'Print the count.', '1 <= |S|, |T| <= 1000', [{"input": "rabbbit\nrabbit", "output": "3"}]),
      p('d68p3', 'Interleaving String', 'hard', 'Check if s3 is an interleaving of s1 and s2. Print Yes or No.', 'Three strings s1, s2, s3.', 'Print Yes or No.', '0 <= |s1|, |s2| <= 100', [{"input": "aab\naxy\naaxaby", "output": "Yes"}]),
    ],
  },
  {
    day: 69, theme: 'Digit DP', topics: ["digit-dp", "counting"],
    problems: [
      p('d69p1', 'Count Numbers with No Consecutive Digits', 'medium', 'Count numbers from 1 to N that have no two consecutive identical digits.', 'A single integer N.', 'Print the count.', '1 <= N <= 10^15', [{"input": "100", "output": "90"}]),
      p('d69p2', 'Sum of Digits in Range', 'medium', 'Find the sum of digits of all numbers from A to B.', 'Two integers A and B.', 'Print the sum of all digits.', '1 <= A <= B <= 10^15', [{"input": "1 12", "output": "51"}]),
      p('d69p3', 'Number with Digit Sum = K', 'medium', 'Count numbers from 1 to N whose digit sum equals K.', 'Two integers N and K.', 'Print the count.', '1 <= N <= 10^15, 1 <= K <= 135', [{"input": "100 5", "output": "10"}]),
    ],
  },
  {
    day: 70, theme: 'DP Optimization Techniques', topics: ["dp-optimization", "advanced-dp"],
    problems: [
      p('d70p1', 'Convex Hull Trick - Maximum Sum', 'hard', 'Optimize DP using convex hull trick for linear transitions.', 'First line: N. Second line: N values.', 'Print the DP result.', '1 <= N <= 500000', [{"input": "5\n1 2 3 4 5", "output": "15"}]),
      p('d70p2', 'Divide and Conquer DP', 'hard', 'Optimize DP using divide and conquer when opt[i] <= opt[i+1].', 'First line: N. Second line: N values.', 'Print DP[N].', '1 <= N <= 5000', [{"input": "5\n1 3 2 4 5", "output": "10"}]),
      p('d70p3', 'Knuth\'s Optimization', 'hard', 'Apply Knuth optimization to matrix chain multiplication.', 'First line: N. Second line: N dimensions.', 'Print the optimized result.', '2 <= N <= 500', [{"input": "5\n40 20 30 10 30", "output": "26000"}]),
    ],
  },
  {
    day: 71, theme: 'BFS (Breadth-First Search)', topics: ["bfs", "graph-traversal"],
    problems: [
      p('d71p1', 'BFS Traversal', 'easy', 'Perform BFS on an undirected graph starting from vertex 1. Print the traversal order.', 'First line: N M. Next M lines: edges.', 'Print BFS order (1-indexed).', '1 <= N, M <= 10^5', [{"input": "4 3\n1 2\n2 3\n3 4", "output": "1 2 3 4"}]),
      p('d71p2', 'Shortest Path in Unweighted Graph', 'medium', 'Find the shortest path length from source to destination in an unweighted graph. Print -1 if unreachable.', 'First line: N M. Next M edges. Last line: source and destination.', 'Print the shortest distance or -1.', '1 <= N, M <= 10^5', [{"input": "5 4\n1 2\n2 3\n3 4\n4 5\n1 5", "output": "4"}]),
      p('d71p3', 'Rotting Oranges', 'hard', 'Given a grid where 0=empty, 1=fresh orange, 2=rotten, find minimum minutes until no fresh orange remains. Print -1 if impossible.', 'First line: R C. Next R lines: C integers.', 'Print minimum minutes or -1.', '1 <= R, C <= 100', [{"input": "3 3\n2 1 1\n1 1 0\n0 1 1", "output": "4"}]),
    ],
  },
  {
    day: 72, theme: 'DFS (Depth-First Search)', topics: ["dfs", "graph-traversal"],
    problems: [
      p('d72p1', 'DFS Traversal', 'easy', 'Perform DFS on an undirected graph starting from vertex 1. Print the traversal order.', 'First line: N M. Next M edges.', 'Print DFS order (1-indexed).', '1 <= N, M <= 10^5', [{"input": "4 3\n1 2\n2 3\n3 4", "output": "1 2 3 4"}]),
      p('d72p2', 'Number of Islands', 'medium', 'Given a grid of 0s and 1s, count the number of connected components of 1s.', 'First line: R C. Next R lines: C integers.', 'Print the number of islands.', '1 <= R, C <= 300', [{"input": "4 5\n1 1 0 0 0\n1 1 0 0 0\n0 0 1 0 0\n0 0 0 1 1", "output": "3"}]),
      p('d72p3', 'Cycle Detection in Undirected Graph', 'medium', 'Detect if an undirected graph contains a cycle using DFS. Print Yes or No.', 'First line: N M. Next M edges.', 'Print Yes if cycle exists, No otherwise.', '1 <= N, M <= 10^5', [{"input": "4 4\n1 2\n2 3\n3 4\n4 1", "output": "Yes"}]),
    ],
  },
  {
    day: 73, theme: 'Topological Sort', topics: ["topological-sort", "dag"],
    problems: [
      p('d73p1', 'Topological Sort (Kahn)', 'medium', 'Find a topological ordering of a DAG using Kahn\'s algorithm (BFS-based).', 'First line: N M. Next M directed edges.', 'Print a valid topological order, or -1 if not a DAG.', '1 <= N, M <= 10^5', [{"input": "4 3\n1 2\n2 3\n1 4", "output": "1 2 4 3"}]),
      p('d73p2', 'Course Schedule', 'medium', 'Determine if you can finish all courses (detect cycle in prerequisite graph). Print Yes or No.', 'First line: N courses. Next lines: course prerequisites.', 'Print Yes or No.', '1 <= N <= 10^3', [{"input": "4\n1 0\n2 1\n3 2\n3 0", "output": "Yes"}]),
      p('d73p3', 'Course Schedule II', 'medium', 'Find one valid ordering to finish all courses. Print any valid order.', 'First line: N. Next lines: course prerequisites.', 'Print a valid ordering or -1.', '1 <= N <= 10^3', [{"input": "4\n1 0\n2 1\n3 2\n3 0", "output": "0 1 2 3"}]),
    ],
  },
  {
    day: 74, theme: 'Shortest Path (Dijkstra)', topics: ["dijkstra", "shortest-path"],
    problems: [
      p('d74p1', 'Dijkstra Shortest Path', 'medium', 'Find shortest distances from source to all vertices in a weighted graph with non-negative weights.', 'First line: N M source. Next M lines: u v w.', 'Print distances to all vertices (-1 if unreachable).', '1 <= N <= 10^5', [{"input": "5 6 0\n0 1 2\n0 3 6\n1 2 3\n1 3 8\n2 4 5\n3 4 1", "output": "0 2 5 6 7"}]),
      p('d74p2', 'Path with Maximum Probability', 'medium', 'Find path from start to end with maximum success probability (product of edge probabilities).', 'First line: N edges start end. Next edges: u v prob.', 'Print the maximum probability rounded to 5 decimal.', '2 <= N <= 10^4', [{"input": "3 2 0 2\n1 2 0.5\n2 3 0.5", "output": "0.25000"}]),
      p('d74p3', 'Cheapest Flights Within K Stops', 'medium', 'Find cheapest price from src to dst with at most K stops. Print -1 if not possible.', 'First line: N edges src dst K. Next edges: u v price.', 'Print the cheapest price or -1.', '1 <= N <= 10^4', [{"input": "4 3 0 3 1\n0 1 100\n1 2 100\n2 0 100\n1 3 600\n2 3 200", "output": "700"}]),
    ],
  },
  {
    day: 75, theme: 'Bellman-Ford Algorithm', topics: ["bellman-ford", "negative-weights"],
    problems: [
      p('d75p1', 'Bellman-Ford Shortest Path', 'medium', 'Find shortest paths from source allowing negative weights. Detect negative cycles.', 'First line: N M source. Next M lines: u v w.', 'Print distances or Negative cycle detected.', '1 <= N <= 10^4', [{"input": "4 5 0\n0 1 4\n0 2 5\n1 2 -3\n2 3 4\n1 3 8", "output": "0 4 1 5"}]),
      p('d75p2', 'Detect Negative Cycle', 'medium', 'Detect if a weighted directed graph has a negative cycle. Print Yes or No.', 'First line: N M. Next M edges u v w.', 'Print Yes if negative cycle exists, No otherwise.', '1 <= N <= 10^3', [{"input": "3 3\n0 1 -1\n1 2 -1\n2 0 -1", "output": "Yes"}]),
      p('d75p3', 'Network Delay Time', 'medium', 'Find time for all nodes to receive a signal sent from source. Print -1 if not all reachable.', 'First line: N edges source. Next edges: u v time.', 'Print the minimum time or -1.', '1 <= N <= 500', [{"input": "5 4 2\n2 1 1\n2 3 1\n3 4 1\n4 5 1", "output": "3"}]),
    ],
  },
  {
    day: 76, theme: 'Floyd-Warshall (All Pairs)', topics: ["floyd-warshall", "all-pairs"],
    problems: [
      p('d76p1', 'All Pairs Shortest Path', 'medium', 'Compute shortest distances between all pairs of vertices using Floyd-Warshall.', 'First line: N. Next N lines: N integers (weight matrix, -1 for no edge).', 'Print the N x N shortest distance matrix.', '1 <= N <= 400', [{"input": "4\n0 5 -1 10\n-1 0 3 -1\n-1 -1 0 1\n-1 -1 -1 0", "output": "0 5 8 9\n-1 0 3 4\n-1 -1 0 1\n-1 -1 -1 0"}]),
      p('d76p2', 'Detect Negative Cycle via Floyd-Warshall', 'medium', 'Use Floyd-Warshall to detect negative cycles. Print vertices that are part of negative cycles.', 'First line: N. Next N lines: weight matrix.', 'Print vertices in negative cycles or None.', '1 <= N <= 400', [{"input": "3\n0 1 -5\n-1 0 -1\n-1 -1 0", "output": "1 2 3"}]),
      p('d76p3', 'Transitive Closure', 'medium', 'Compute the transitive closure of a directed graph.', 'First line: N. Next N lines: adjacency matrix.', 'Print the transitive closure matrix.', '1 <= N <= 400', [{"input": "4\n0 1 0 0\n0 0 1 0\n0 0 0 1\n0 0 0 0", "output": "0 1 1 1\n0 0 1 1\n0 0 0 1\n0 0 0 0"}]),
    ],
  },
  {
    day: 77, theme: 'Minimum Spanning Tree (Kruskal)', topics: ["kruskal", "mst"],
    problems: [
      p('d77p1', 'Kruskal MST Weight', 'medium', 'Find the total weight of the MST using Kruskal\'s algorithm. Print -1 if graph is disconnected.', 'First line: N M. Next M edges u v w.', 'Print MST weight or -1.', '1 <= N <= 10^5', [{"input": "5 7\n0 1 2\n0 3 6\n1 2 3\n1 3 8\n1 4 5\n2 4 7\n3 4 9", "output": "16"}]),
      p('d77p2', 'Kruskal MST Edges', 'medium', 'Print the edges included in the MST using Kruskal\'s algorithm.', 'First line: N M. Next M edges u v w.', 'Print MST edges sorted.', '1 <= N <= 10^5', [{"input": "4 5\n0 1 10\n0 2 6\n0 3 5\n1 3 15\n2 3 4", "output": "2 3 4\n0 3 5\n0 1 10"}]),
      p('d77p3', 'MST with Maximum Edge Minimized', 'hard', 'Among all possible MSTs, find the one that minimizes the maximum edge weight.', 'First line: N M. Next M edges u v w.', 'Print the minimized maximum edge weight.', '1 <= N <= 10^5', [{"input": "4 5\n0 1 10\n0 2 6\n0 3 5\n1 3 15\n2 3 4", "output": "10"}]),
    ],
  },
  {
    day: 78, theme: 'Minimum Spanning Tree (Prim)', topics: ["prim", "mst"],
    problems: [
      p('d78p1', 'Prim MST Weight', 'medium', 'Find the total weight of MST using Prim\'s algorithm starting from vertex 0.', 'First line: N M. Next M edges u v w.', 'Print MST weight.', '1 <= N <= 10^5', [{"input": "5 7\n0 1 2\n0 3 6\n1 2 3\n1 3 8\n1 4 5\n2 4 7\n3 4 9", "output": "16"}]),
      p('d78p2', 'Prim MST with Parent Array', 'medium', 'Run Prim\'s algorithm and print the parent of each vertex in the MST.', 'First line: N M. Next M edges u v w.', 'Print parent of each vertex (-1 for root).', '1 <= N <= 10^5', [{"input": "4 5\n0 1 10\n0 2 6\n0 3 5\n1 3 15\n2 3 4", "output": "-1 0 0 2"}]),
      p('d78p3', 'Prim vs Kruskal Comparison', 'medium', 'Compare the number of operations for Prim and Kruskal on the same graph.', 'First line: N M. Next M edges u v w.', 'Print comparison.', '1 <= N <= 10^4', [{"input": "5 7\n0 1 2\n0 3 6\n1 2 3\n1 3 8\n1 4 5\n2 4 7\n3 4 9", "output": "Prim: 21 ops, Kruskal: 24 ops"}]),
    ],
  },
  {
    day: 79, theme: 'Strongly Connected Components (Kosaraju)', topics: ["scc", "graphs"],
    problems: [
      p('d79p1', 'Kosaraju SCC', 'medium', 'Find all strongly connected components of a directed graph using Kosaraju\'s algorithm.', 'First line: N M. Next M directed edges.', 'Print SCCs, one per line, vertices sorted.', '1 <= N <= 10^5', [{"input": "5 5\n1 2\n2 3\n3 1\n3 4\n4 5", "output": "1 2 3\n4\n5"}]),
      p('d79p2', 'Count SCCs', 'easy', 'Count the number of strongly connected components in a directed graph.', 'First line: N M. Next M directed edges.', 'Print the count.', '1 <= N <= 10^5', [{"input": "5 5\n1 2\n2 3\n3 1\n3 4\n4 5", "output": "3"}]),
      p('d79p3', 'Largest SCC Size', 'medium', 'Find the size of the largest strongly connected component.', 'First line: N M. Next M directed edges.', 'Print the size of the largest SCC.', '1 <= N <= 10^5', [{"input": "6 7\n1 2\n2 3\n3 1\n3 4\n4 5\n5 6\n6 4", "output": "3"}]),
    ],
  },
  {
    day: 80, theme: 'Articulation Points and Bridges', topics: ["articulation-points", "bridges"],
    problems: [
      p('d80p1', 'Find Articulation Points', 'medium', 'Find all articulation points in an undirected graph.', 'First line: N M. Next M edges.', 'Print articulation points sorted, or None.', '1 <= N <= 10^5', [{"input": "5 5\n1 2\n2 3\n3 1\n3 4\n4 5", "output": "3 4"}]),
      p('d80p2', 'Find Bridges', 'medium', 'Find all bridges in an undirected graph.', 'First line: N M. Next M edges.', 'Print bridges as u v (u < v), sorted, or None.', '1 <= N <= 10^5', [{"input": "4 4\n1 2\n2 3\n3 4\n4 1", "output": "None"}]),
      p('d80p3', 'Make Graph Disconnected', 'medium', 'Find the minimum number of edges to remove to disconnect the graph. Print -1 if already disconnected.', 'First line: N M. Next M edges.', 'Print the minimum edges to remove or -1.', '1 <= N <= 10^5', [{"input": "4 4\n1 2\n2 3\n3 4\n4 1", "output": "2"}]),
    ],
  },
  {
    day: 81, theme: 'Network Flow (Ford-Fulkerson)', topics: ["network-flow", "max-flow"],
    problems: [
      p('d81p1', 'Max Flow (Ford-Fulkerson)', 'medium', 'Find the maximum flow from source to sink in a flow network.', 'First line: N M source sink. Next M lines: u v capacity.', 'Print the maximum flow.', '2 <= N <= 100', [{"input": "6 9 0 5\n0 1 16\n0 2 13\n1 2 10\n1 3 12\n2 1 4\n2 4 14\n3 2 9\n3 5 20\n4 3 7\n4 5 4", "output": "23"}]),
      p('d81p2', 'Max Flow - Bipartite Matching', 'medium', 'Solve maximum bipartite matching using max flow.', 'First line: N1 N2 M (left nodes, right nodes, edges). Next M edges.', 'Print the maximum matching size.', '1 <= N1, N2 <= 100', [{"input": "3 3 4\n1 1\n1 2\n2 2\n3 3", "output": "3"}]),
      p('d81p3', 'Min Cut', 'hard', 'Find the minimum cut that separates source from sink.', 'First line: N M source sink. Next M edges u v capacity.', 'Print the min cut edges and their total capacity.', '2 <= N <= 100', [{"input": "3 3 0 2\n0 1 10\n0 2 5\n1 2 15", "output": "0 2: 5\nTotal: 5"}]),
    ],
  },
  {
    day: 82, theme: 'Bipartite Graphs', topics: ["bipartite", "graph-coloring"],
    problems: [
      p('d82p1', 'Check Bipartite (BFS)', 'easy', 'Check if an undirected graph is bipartite using BFS. Print Yes or No.', 'First line: N M. Next M edges.', 'Print Yes if bipartite, No otherwise.', '1 <= N <= 10^5', [{"input": "4 4\n1 2\n2 3\n3 4\n4 1", "output": "Yes"}]),
      p('d82p2', 'Bipartite Check with Coloring', 'medium', 'Check bipartiteness and output the two color groups if bipartite.', 'First line: N M. Next M edges.', 'If bipartite: print group1 and group2. Else Not bipartite.', '1 <= N <= 10^5', [{"input": "4 4\n1 2\n2 3\n3 4\n4 1", "output": "Group 1: 1 3\nGroup 2: 2 4"}]),
      p('d82p3', 'Max Bipartite Matching', 'hard', 'Find the maximum matching in a bipartite graph using augmenting paths.', 'First line: N1 N2 M. Next M edges.', 'Print the maximum matching size and edges.', '1 <= N1, N2 <= 500', [{"input": "3 3 4\n1 1\n1 2\n2 2\n3 3", "output": "Size: 3\n1-1\n2-2\n3-3"}]),
    ],
  },
  {
    day: 83, theme: 'Euler Path and Circuit', topics: ["euler-path", "euler-circuit"],
    problems: [
      p('d83p1', 'Check Euler Circuit Existence', 'easy', 'Check if an undirected graph has an Euler circuit. Print Yes or No.', 'First line: N M. Next M edges.', 'Print Yes if Euler circuit exists, No otherwise.', '1 <= N <= 10^5', [{"input": "3 3\n1 2\n2 3\n3 1", "output": "Yes"}]),
      p('d83p2', 'Find Euler Circuit', 'hard', 'Find an Euler circuit in an undirected graph if it exists using Hierholzer\'s algorithm.', 'First line: N M. Next M edges.', 'Print the Euler circuit (1-indexed), or -1.', '1 <= N <= 10^4', [{"input": "4 4\n1 2\n2 3\n3 4\n4 1", "output": "1 2 3 4 1"}]),
      p('d83p3', 'Euler Path Check', 'medium', 'Check if an undirected graph has an Euler path (not circuit). Print Yes or No.', 'First line: N M. Next M edges.', 'Print Yes if Euler path exists, No otherwise.', '1 <= N <= 10^5', [{"input": "3 2\n1 2\n2 3", "output": "Yes"}]),
    ],
  },
  {
    day: 84, theme: 'Hamilton Path and Cycle', topics: ["hamilton-path", "np-complete"],
    problems: [
      p('d84p1', 'Check Hamilton Path Existence', 'medium', 'Check if a Hamilton path exists in a given graph. Print Yes or No.', 'First line: N M. Next M edges.', 'Print Yes or No.', '2 <= N <= 20', [{"input": "4 4\n1 2\n2 3\n3 4\n4 1", "output": "Yes"}]),
      p('d84p2', 'Find Hamilton Cycle', 'hard', 'Find a Hamilton cycle in a graph if one exists. Print the cycle or -1.', 'First line: N M. Next M edges.', 'Print Hamilton cycle (1-indexed) or -1.', '2 <= N <= 20', [{"input": "4 4\n1 2\n2 3\n3 4\n4 1", "output": "1 2 3 4 1"}]),
      p('d84p3', 'Count Hamilton Paths', 'hard', 'Count the number of Hamilton paths in a graph.', 'First line: N M. Next M edges.', 'Print the count.', '2 <= N <= 15', [{"input": "3 3\n1 2\n2 3\n1 3", "output": "6"}]),
    ],
  },
  {
    day: 85, theme: 'Graph Coloring', topics: ["graph-coloring", "greedy"],
    problems: [
      p('d85p1', 'Greedy Graph Coloring', 'medium', 'Color a graph using greedy algorithm. Print the color assigned to each vertex.', 'First line: N M. Next M edges.', 'Print colors assigned (1-indexed).', '1 <= N <= 10^4', [{"input": "5 6\n1 2\n1 3\n2 3\n2 4\n3 5\n4 5", "output": "1 2 2 1 1"}]),
      p('d85p2', 'Chromatic Number (Small Graph)', 'hard', 'Find the chromatic number for a graph with N <= 10.', 'First line: N M. Next M edges.', 'Print the chromatic number.', '1 <= N <= 10', [{"input": "4 5\n1 2\n2 3\n3 4\n4 1\n1 3", "output": "3"}]),
      p('d85p3', 'Bipartite Coloring', 'easy', 'Check if graph is 2-colorable (bipartite). If yes, print the coloring.', 'First line: N M. Next M edges.', 'If bipartite: print coloring. Else Not 2-colorable.', '1 <= N <= 10^5', [{"input": "4 4\n1 2\n2 3\n3 4\n4 1", "output": "1 2 1 2"}]),
    ],
  },
  {
    day: 86, theme: 'URL Shortener Design', topics: ["system-design", "hashing"],
    problems: [
      p('d86p1', 'URL Shortener Encoding', 'medium', 'Design a URL shortener that encodes a long URL to a short key and decodes it back.', 'First line: N commands. Next lines: encode url / decode key.', 'For encode, print the short key. For decode, print the original URL.', '1 <= N <= 10^4', [{"input": "4\nencode https://example.com/very/long/url\ndecode abc123\nencode https://another.com\ndecode abc123", "output": "abc123\nhttps://example.com/very/long/url\ndef456\nhttps://example.com/very/long/url"}]),
      p('d86p2', 'URL Shortener with Analytics', 'medium', 'URL shortener that tracks click counts. Support encode, decode, and analytics.', 'First line: N operations. Next lines: encode, decode, or analytics key.', 'For analytics, print click count.', '1 <= N <= 10^4', [{"input": "5\nencode https://example.com\ndecode abc123\nanalytics abc123\nencode https://test.com\nanalytics def456", "output": "abc123\nhttps://example.com\n1\ndef456\n1"}]),
      p('d86p3', 'Custom Short URLs', 'medium', 'Allow users to specify custom short keys. Handle conflicts gracefully.', 'First line: N operations. Next lines: encode with custom key, or decode.', 'Print Conflict for duplicate keys, or result.', '1 <= N <= 10^4', [{"input": "3\nencode https://example.com mykey\nencode https://test.com mykey\nencode https://other.com newkey", "output": "mykey\nConflict\nnewkey"}]),
    ],
  },
  {
    day: 87, theme: 'Rate Limiter Design', topics: ["system-design", "sliding-window"],
    problems: [
      p('d87p1', 'Fixed Window Rate Limiter', 'medium', 'Implement a fixed window rate limiter. Allow N requests per window of W seconds.', 'First line: N W Q. Next Q lines: timestamp.', 'For each request, print Allowed or Rejected.', '1 <= N, W, Q <= 10^5', [{"input": "3 10 7\n0\n1\n2\n3\n11\n12\n13", "output": "Allowed\nAllowed\nAllowed\nRejected\nAllowed\nAllowed\nAllowed"}]),
      p('d87p2', 'Sliding Window Rate Limiter', 'medium', 'Implement sliding window rate limiter. Allow N requests per W-second window.', 'First line: N W Q. Next Q lines: timestamp.', 'For each request, print Allowed or Rejected.', '1 <= N, W, Q <= 10^5', [{"input": "3 10 7\n0\n5\n10\n11\n12\n15\n20", "output": "Allowed\nAllowed\nAllowed\nRejected\nRejected\nAllowed\nAllowed"}]),
      p('d87p3', 'Token Bucket Rate Limiter', 'hard', 'Implement token bucket rate limiter with refill rate and bucket capacity.', 'First line: capacity refillRate Q. Next Q lines: timestamp.', 'For each request, print Allowed or Rejected.', '1 <= Q <= 10^5', [{"input": "3 1 5\n0\n1\n2\n4\n5", "output": "Allowed\nAllowed\nAllowed\nAllowed\nAllowed"}]),
    ],
  },
  {
    day: 88, theme: 'Chat System Design', topics: ["system-design", "real-time"],
    problems: [
      p('d88p1', 'Chat Message Ordering', 'medium', 'Design a system to order chat messages across multiple servers using logical clocks.', 'First line: N messages. Each with server_id timestamp content.', 'Print messages in global order.', '1 <= N <= 10^4', [{"input": "4\n1 1 Hello\n2 1 Hi\n1 2 Hey\n2 2 How are you", "output": "1:1 Hello\n2:1 Hi\n1:2 Hey\n2:2 How are you"}]),
      p('d88p2', 'Message Deduplication', 'medium', 'Detect and remove duplicate messages using message IDs.', 'First line: N messages. Each with id content.', 'Print unique messages in order, count duplicates.', '1 <= N <= 10^5', [{"input": "5\n1 Hello\n2 Hi\n1 Hello\n3 Hey\n2 Hi", "output": "Hello\nHi\nHey\nDuplicates: 2"}]),
      p('d88p3', 'Read Receipt Tracking', 'medium', 'Track which users have read which messages in a chat system.', 'First line: N messages M users. Next: messages. Then: read receipts.', 'Print unread message count per user.', '1 <= N, M <= 10^4', [{"input": "3 2\n1 msg1\n2 msg2\n3 msg3\n1 1\n2 2", "output": "User 1 unread: 1\nUser 2 unread: 2"}]),
    ],
  },
  {
    day: 89, theme: 'News Feed Design', topics: ["system-design", "feed-generation"],
    problems: [
      p('d89p1', 'Fan-Out on Write', 'medium', 'Implement news feed using fan-out on write approach. When user posts, push to all followers.', 'First line: N users follows. Then: post commands.', 'Print feed for a user after operations.', '1 <= N <= 10^4', [{"input": "3\nfollow 1 2\nfollow 1 3\npost 2 Hello\npost 3 World\nfeed 1", "output": "World\nHello"}]),
      p('d89p2', 'Fan-Out on Read', 'medium', 'Implement news feed using fan-out on read. When user requests feed, pull from followees.', 'First line: N follows. Then: post and feed commands.', 'Print feed on demand.', '1 <= N <= 10^4', [{"input": "3\nfollow 1 2\nfollow 1 3\npost 2 A\npost 3 B\nfeed 1", "output": "B A"}]),
      p('d89p3', 'Feed Pagination', 'medium', 'Implement paginated news feed with cursor-based pagination.', 'First line: N posts. Then: feed requests with page size and cursor.', 'Print paginated results.', '1 <= N <= 10^4', [{"input": "5\npost user1 msg1\npost user2 msg2\npost user1 msg3\nfeed 2 null\nfeed 2 msg3", "output": "msg3\nmsg2\nmsg2\nmsg1"}]),
    ],
  },
  {
    day: 90, theme: 'Notification System Design', topics: ["system-design", "async-processing"],
    problems: [
      p('d90p1', 'Notification Priority Queue', 'medium', 'Implement notification system with priority levels. Process notifications by priority.', 'First line: N notifications. Each: priority user message.', 'Print notifications in priority order.', '1 <= N <= 10^4', [{"input": "4\n1 user1 Low priority\n3 user2 Urgent\n2 user1 Normal\n3 user3 Critical", "output": "Critical\nUrgent\nNormal\nLow priority"}]),
      p('d90p2', 'Notification Delivery Tracking', 'medium', 'Track notification delivery status (sent, delivered, read, failed).', 'First line: N notifications. Then: status updates.', 'Print delivery report.', '1 <= N <= 10^4', [{"input": "3\nsend 1 user1 Hello\nstatus 1 delivered\nstatus 1 read\nreport", "output": "1: read"}]),
      p('d90p3', 'Rate Limited Notifications', 'medium', 'Limit notifications per user to N per hour. Queue excess.', 'First line: limit per hour. Then: send commands.', 'Print which notifications were sent vs queued.', '1 <= limit <= 100', [{"input": "2\nsend user1 a\nsend user1 b\nsend user1 c\nflush", "output": "Sent: a, b\nQueued: c"}]),
    ],
  },
  {
    day: 91, theme: 'Payment System Design', topics: ["system-design", "transactions"],
    problems: [
      p('d91p1', 'Payment State Machine', 'medium', 'Implement payment states: pending, processing, completed, failed, refunded. Process transitions.', 'First line: N transactions. Next: state transitions.', 'Print final state of each transaction.', '1 <= N <= 10^4', [{"input": "3\n1 pending\n1 processing\n1 completed\n2 pending\n2 failed\n3 pending", "output": "1: completed\n2: failed\n3: pending"}]),
      p('d91p2', 'Idempotent Payments', 'medium', 'Process payments with idempotency keys to prevent double charging.', 'First line: N payment requests. Each: id amount.', 'Print Processed or Duplicate.', '1 <= N <= 10^5', [{"input": "4\nkey1 100\nkey2 200\nkey1 100\nkey3 300", "output": "Processed\nProcessed\nDuplicate\nProcessed"}]),
      p('d91p3', 'Payment Reconciliation', 'hard', 'Reconcile payments between internal records and bank statement.', 'First line: N internal records. Second line: M bank records.', 'Print matched, missing from bank, extra in bank.', '1 <= N, M <= 10^4', [{"input": "3\n3\n1 100\n2 200\n3 300\n1 100\n3 300", "output": "Matched: 1 3\nMissing from bank: 2\nExtra in bank: None"}]),
    ],
  },
  {
    day: 92, theme: 'Search Autocomplete Design', topics: ["system-design", "tries"],
    problems: [
      p('d92p1', 'Basic Autocomplete', 'medium', 'Implement search autocomplete that returns top 3 suggestions for a prefix.', 'First line: N words with frequencies. Then: Q prefix queries.', 'For each query, print top 3 suggestions sorted by frequency.', '1 <= N <= 10^4', [{"input": "5\napple 10\napp 5\napplication 8\nbat 3\nball 7\napp\nba", "output": "apple application app\nball bat"}]),
      p('d92p2', 'Rank-Aware Autocomplete', 'medium', 'Autocomplete that ranks by frequency then alphabetically. Support adding new terms.', 'First line: N terms. Then: add and search commands.', 'Print ranked suggestions.', '1 <= N <= 10^4', [{"input": "3\ncoding 100\ncode 50\ncoder 75\nsearch co\nadd compile 200\nsearch co", "output": "coding coder code\ncompile coding coder"}]),
      p('d92p3', 'Trie-Based Autocomplete with Trie', 'hard', 'Build autocomplete using a trie with frequency counts. Support delete and update.', 'First line: N operations. Next: insert, delete, search commands.', 'Print suggestions or status.', '1 <= N <= 10^4', [{"input": "5\ninsert hello 10\ninsert help 5\nsearch he\ndelete help\nsearch he", "output": "hello help\nhello"}]),
    ],
  },
  {
    day: 93, theme: 'Distributed Cache Design', topics: ["system-design", "caching"],
    problems: [
      p('d93p1', 'Consistent Hashing', 'medium', 'Implement consistent hashing with virtual nodes. Map keys to cache servers.', 'First line: N servers M keys.', 'Print key-to-server mapping.', '1 <= N, M <= 10^3', [{"input": "3 5\nserver1 server2 server3\nkey1 key2 key3 key4 key5", "output": "key1: server2\nkey2: server3\nkey3: server1\nkey4: server2\nkey5: server3"}]),
      p('d93p2', 'Cache Eviction LRU', 'medium', 'Simulate LRU cache with given capacity. Process get and put operations.', 'First line: capacity Q. Next Q operations.', 'For each operation, print result.', '1 <= capacity, Q <= 10^3', [{"input": "2 5\nput a 1\nput b 2\nget a\nput c 3\nget b", "output": "1\nEvicted b\n-1"}]),
      p('d93p3', 'Cache Stampede Prevention', 'hard', 'Prevent cache stampede by implementing single-flight pattern for concurrent reads.', 'First line: N concurrent requests for same key.', 'Print how many actually computed vs served from cache.', '1 <= N <= 1000', [{"input": "5", "output": "1 computed, 4 served from cache"}]),
    ],
  },
  {
    day: 94, theme: 'Task Scheduler Design', topics: ["system-design", "scheduling"],
    problems: [
      p('d94p1', 'Task Priority Scheduler', 'medium', 'Implement a task scheduler that executes tasks based on priority.', 'First line: N tasks. Each: name priority duration.', 'Print execution order and total time.', '1 <= N <= 10^4', [{"input": "3\nA 2 5\nB 1 3\nC 3 2", "output": "C A B\nTotal: 10"}]),
      p('d94p2', 'Round Robin Scheduler', 'medium', 'Implement round-robin task scheduler with time quantum Q.', 'First line: Q N. Next N tasks: name duration.', 'Print execution order and completion times.', '1 <= Q, N <= 10^3', [{"input": "3 3\nA 5\nB 3\nC 1", "output": "A B C A B A\nA:9 B:7 C:4"}]),
      p('d94p3', 'DAG Task Scheduler', 'hard', 'Schedule tasks with dependencies (DAG) in minimum time with given workers.', 'First line: N tasks M dependencies W workers. Tasks have durations.', 'Print minimum completion time.', '1 <= N <= 10^4', [{"input": "4 3 2\nA 5\nB 3\nC 4\nD 2\nA B\nA C\nB D", "output": "10"}]),
    ],
  },
  {
    day: 95, theme: 'Key-Value Store Design', topics: ["system-design", "storage"],
    problems: [
      p('d95p1', 'Basic KV Store', 'medium', 'Implement a key-value store with get, put, delete, and scan operations.', 'First line: Q operations. Next: get/put/delete/scan commands.', 'For each operation, print result.', '1 <= Q <= 10^4', [{"input": "6\nput a 1\nput b 2\nget a\nscan a z\ndelete b\nget b", "output": "1\na:1\nb:2\n-1"}]),
      p('d95p2', 'KV Store with TTL', 'medium', 'Key-value store where keys expire after TTL seconds.', 'First line: Q operations with timestamps. Next: put/get with TTL.', 'Print expired or value.', '1 <= Q <= 10^4', [{"input": "4\n0 put a 10 5\n3 get a\n6 get a", "output": "10\nexpired"}]),
      p('d95p3', 'MVCC KV Store', 'hard', 'Key-value store with multi-version concurrency control. Support transactions.', 'First line: Q operations. Next: begin, put, get, commit, rollback.', 'Print versioned values.', '1 <= Q <= 10^4', [{"input": "5\nbegin\nput a 1\nget a\ncommit\nget a", "output": "1\n1"}]),
    ],
  },
  {
    day: 96, theme: 'RESTful API Design', topics: ["api-design", "http"],
    problems: [
      p('d96p1', 'REST API Route Handler', 'medium', 'Design route handlers for a REST API with proper HTTP methods and status codes.', 'First line: N requests. Each: method path.', 'Print the handler response status and action.', '1 <= N <= 10^4', [{"input": "4\nGET /users/1\nPOST /users\nPUT /users/1\nDELETE /users/1", "output": "200 OK - Get user 1\n201 Created - Create user\n200 OK - Update user 1\n204 No Content - Delete user 1"}]),
      p('d96p2', 'API Input Validation', 'medium', 'Validate API request bodies against a schema. Print validation errors.', 'First line: schema definition. Second line: request body.', 'Print Valid or list of errors.', '1 <= fields <= 20', [{"input": "name:string:required\nage:number:1-150\n{\"name\": \"\", \"age\": 200}", "output": "Errors: name is required, age must be between 1 and 150"}]),
      p('d96p3', 'API Rate Limiting Middleware', 'medium', 'Implement rate limiting middleware for API endpoints. Different limits per endpoint.', 'First line: Q requests. Endpoint limits provided. Next: requests.', 'Print Allowed or 429 Too Many Requests.', '1 <= Q <= 10^4', [{"input": "5\nGET /api/data 3/min\nGET /api/data\nGET /api/data\nGET /api/data\nGET /api/data", "output": "Allowed\nAllowed\nAllowed\n429 Too Many Requests"}]),
    ],
  },
  {
    day: 97, theme: 'Database Schema Design', topics: ["database", "normalization"],
    problems: [
      p('d97p1', 'Normalize to 3NF', 'medium', 'Given a table with functional dependencies, normalize to Third Normal Form.', 'First line: relation schema. Second line: functional dependencies.', 'Print the 3NF decomposition.', '1 <= attributes <= 20', [{"input": "R(A,B,C,D)\nA->B\nB->C", "output": "R1(A,B) R2(B,C) R3(A,D)"}]),
      p('d97p2', 'ER Diagram to Schema', 'medium', 'Convert an ER diagram description to relational schema with proper keys.', 'First line: entities. Second line: relationships.', 'Print the relational schema with primary and foreign keys.', '1 <= entities <= 10', [{"input": "Student(id,name)\nCourse(id,title)\nEnrolls(Student.id,Course.id)", "output": "Student(id PK, name)\nCourse(id PK, title)\nEnrolls(Student.id FK, Course.id FK)"}]),
      p('d97p3', 'Index Recommendation', 'medium', 'Given query patterns, recommend optimal indexes for a database schema.', 'First line: schema. Second line: queries.', 'Print recommended indexes.', '1 <= queries <= 10', [{"input": "Users(id,name,email,age)\nSELECT * FROM Users WHERE email = ?\nSELECT * FROM Users WHERE age > ? AND name LIKE ?", "output": "CREATE INDEX idx_email ON Users(email)\nCREATE INDEX idx_age_name ON Users(age, name)"}]),
    ],
  },
  {
    day: 98, theme: 'Authentication System', topics: ["auth", "security"],
    problems: [
      p('d98p1', 'JWT Token Generation', 'medium', 'Implement JWT-like token generation with header, payload, and signature.', 'First line: payload data. Second line: secret key.', 'Print the token (base64 encoded parts).', '1 <= payload size <= 1000', [{"input": "{\"user\":\"alice\",\"role\":\"admin\"}\nsecret123", "output": "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYWxpY2UiLCJyb2xlIjoiYWRtaW4ifQ.signature"}]),
      p('d98p2', 'Password Hashing', 'medium', 'Implement password hashing with salt using PBKDF2-like approach.', 'First line: password. Second line: salt.', 'Print the hash.', '1 <= password length <= 100', [{"input": "mypassword\nabc123", "output": "a1b2c3d4e5f6"}]),
      p('d98p3', 'OAuth2 Flow Simulation', 'hard', 'Simulate the OAuth2 authorization code flow between client, auth server, and resource server.', 'First line: N steps in flow.', 'Print the flow steps and final token.', '1 <= N <= 10', [{"input": "4\nauthorize\ntoken\nvalidate\naccess", "output": "Step 1: Auth code issued\nStep 2: Token exchanged\nStep 3: Token valid\nStep 4: Resource accessed"}]),
    ],
  },
  {
    day: 99, theme: 'Full-Stack Mini App', topics: ["full-stack", "integration"],
    problems: [
      p('d99p1', 'Todo App Backend API', 'medium', 'Design a complete REST API for a todo application with CRUD and filtering.', 'First line: Q operations. Next: API calls.', 'Print API responses with proper status codes.', '1 <= Q <= 10^4', [{"input": "5\nPOST /todos {title:Buy milk,done:false}\nGET /todos\nPATCH /todos/1 {done:true}\nGET /todos?done=true\nDELETE /todos/1", "output": "201 {id:1,title:Buy milk,done:false}\n200 [{id:1,...}]\n200 {id:1,title:Buy milk,done:true}\n200 [{id:1,...}]\n204"}]),
      p('d99p2', 'Real-time Updates Simulation', 'medium', 'Simulate WebSocket-like real-time updates for a collaborative editor.', 'First line: N operations. Next: edits and subscriptions.', 'Print broadcast updates to subscribers.', '1 <= N <= 10^4', [{"input": "3\nsubscribe user1\nedit user1 Hello\nedit user2 World", "output": "user1: Hello\nuser1: World\nuser2: World"}]),
      p('d99p3', 'Full-Stack State Sync', 'hard', 'Synchronize state between client and server with conflict resolution (last-write-wins).', 'First line: N operations. Next: client/server edits with timestamps.', 'Print final state after sync.', '1 <= N <= 10^4', [{"input": "4\nclient put a 1 100\nserver put a 2 90\nclient put a 3 110\nsync", "output": "Final: a=2 (server wins, timestamp 90 > 100)"}]),
    ],
  },
  {
    day: 100, theme: 'Portfolio Project', topics: ["capstone", "portfolio"],
    problems: [
      p('d100p1', 'Build a Mini Search Engine', 'hard', 'Design and describe a mini search engine that indexes documents and supports keyword queries with ranking.', 'Document collection and query terms.', 'Design the system: indexing strategy, ranking algorithm, and API.', 'N/A', [{"input": "Documents: [doc1: data structures, doc2: algorithms, doc3: data algorithms]\nQuery: data", "output": "Index: inverted index with TF-IDF\nRanking: cosine similarity\nAPI: GET /search?q=data -> [doc3, doc1]"}]),
      p('d100p2', 'Design a Distributed System', 'hard', 'Design a distributed key-value store with replication, partitioning, and consistency guarantees.', 'System requirements: availability, consistency, partition tolerance.', 'Design architecture, data flow, and failure handling.', 'N/A', [{"input": "Requirements: high availability, eventual consistency, 3 replicas", "output": "Architecture: consistent hashing for partitioning\nReplication: 3 replicas per partition\nConsistency: quorum reads/writes\nFailure: heartbeat + gossip protocol"}]),
      p('d100p3', 'Algorithm Visualization Dashboard', 'hard', 'Design a system to visualize sorting, searching, and graph algorithms step-by-step. Describe data flow and UI components.', 'N/A', 'Design the visualization pipeline, state management, and rendering approach.', 'N/A', [{"input": "Algorithms: bubble sort, binary search, BFS", "output": "State: array/graph + current step + highlights\nRenderer: canvas-based animation\nControls: play, pause, step, speed\nAPI: GET /algorithms/[name]/steps -> step array"}]),
    ],
  },
]