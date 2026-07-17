export interface HundredDayProblem {
  day: number
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  description: string
  inputFormat: string
  outputFormat: string
  constraints: string
  examples: Array<{ input: string; output: string; explanation?: string }>
  starterCode: Record<string, string>
}

const STARTERS: Record<string, string> = {
  python: `def solve(input_str):\n    lines = input_str.strip().split('\\n')\n    # Your code here\n    pass\n\ninput_data = input()\nprint(solve(input_data))`,
  javascript: `function solve(input) {\n  const lines = input.trim().split('\\n');\n  // Your code here\n}\n\nprocess.stdin.resume();\nprocess.stdin.on('data', d => {\n  console.log(solve(d.toString()));\n});`,
  java: `import java.util.*;\npublic class Solution {\n    public static String solve(String input) {\n        String[] lines = input.trim().split("\\n");\n        // Your code here\n        return "";\n    }\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        StringBuilder sb = new StringBuilder();\n        while (sc.hasNextLine()) sb.append(sc.nextLine()).append("\\n");\n        System.out.println(solve(sb.toString()));\n    }\n}`,
  cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\nstring solve(string input) {\n    stringstream ss(input);\n    string line;\n    vector<string> lines;\n    while (getline(ss, line)) lines.push_back(line);\n    // Your code here\n    return "";\n}\n\nint main() {\n    string input, line;\n    while (getline(cin, line)) input += line + "\\n";\n    cout << solve(input);\n    return 0;\n}`,
}

export const HUNDRED_DAYS: HundredDayProblem[] = [
  {
    day: 1, title: 'Hello, World!', difficulty: 'easy',
    description: 'Write a program that takes a name as input and prints "Hello, {name}!" as output.',
    inputFormat: 'A single line containing a name (string).',
    outputFormat: 'Print "Hello, {name}!" where {name} is the input string.',
    constraints: '1 ≤ |name| ≤ 100',
    examples: [{ input: 'Alice', output: 'Hello, Alice!' }],
    starterCode: STARTERS,
  },
  {
    day: 2, title: 'Sum of Two Numbers', difficulty: 'easy',
    description: 'Given two integers A and B, print their sum.',
    inputFormat: 'Two integers A and B separated by a space.',
    outputFormat: 'Print a single integer - the sum of A and B.',
    constraints: '-10^9 ≤ A, B ≤ 10^9',
    examples: [{ input: '3 5', output: '8' }],
    starterCode: STARTERS,
  },
  {
    day: 3, title: 'Even or Odd', difficulty: 'easy',
    description: 'Given an integer, determine if it is even or odd. Print "Even" if it is even, "Odd" if it is odd.',
    inputFormat: 'A single integer N.',
    outputFormat: 'Print "Even" or "Odd".',
    constraints: '-10^6 ≤ N ≤ 10^6',
    examples: [
      { input: '4', output: 'Even' },
      { input: '7', output: 'Odd' },
    ],
    starterCode: STARTERS,
  },
  {
    day: 4, title: 'Factorial', difficulty: 'easy',
    description: 'Compute the factorial of a given non-negative integer N. Factorial of N (N!) is the product of all positive integers less than or equal to N. By definition, 0! = 1.',
    inputFormat: 'A single integer N.',
    outputFormat: 'Print the factorial of N.',
    constraints: '0 ≤ N ≤ 12',
    examples: [{ input: '5', output: '120' }],
    starterCode: STARTERS,
  },
  {
    day: 5, title: 'Reverse a String', difficulty: 'easy',
    description: 'Given a string, reverse it and print the result.',
    inputFormat: 'A single line containing a string S.',
    outputFormat: 'Print the reversed string.',
    constraints: '1 ≤ |S| ≤ 1000',
    examples: [{ input: 'hello', output: 'olleh' }],
    starterCode: STARTERS,
  },
  {
    day: 6, title: 'Palindrome Check', difficulty: 'easy',
    description: 'Given a string, check if it is a palindrome (reads the same forwards and backwards). Print "Yes" if it is a palindrome, "No" otherwise.',
    inputFormat: 'A single line containing a string S.',
    outputFormat: 'Print "Yes" or "No".',
    constraints: '1 ≤ |S| ≤ 1000',
    examples: [
      { input: 'racecar', output: 'Yes' },
      { input: 'hello', output: 'No' },
    ],
    starterCode: STARTERS,
  },
  {
    day: 7, title: 'Fibonacci Sequence', difficulty: 'easy',
    description: 'Print the first N terms of the Fibonacci sequence. The Fibonacci sequence starts with 0 and 1, and each subsequent term is the sum of the previous two.',
    inputFormat: 'A single integer N.',
    outputFormat: 'Print N space-separated integers - the first N Fibonacci numbers.',
    constraints: '1 ≤ N ≤ 30',
    examples: [{ input: '7', output: '0 1 1 2 3 5 8' }],
    starterCode: STARTERS,
  },
  {
    day: 8, title: 'Count Vowels', difficulty: 'easy',
    description: 'Given a string, count the number of vowels (a, e, i, o, u) in it. The check should be case-insensitive.',
    inputFormat: 'A single line containing a string S.',
    outputFormat: 'Print the count of vowels.',
    constraints: '1 ≤ |S| ≤ 10^5',
    examples: [
      { input: 'Hello World', output: '3' },
      { input: 'AEIOU', output: '5' },
    ],
    starterCode: STARTERS,
  },
  {
    day: 9, title: 'Find Maximum', difficulty: 'easy',
    description: 'Given an array of N integers, find and print the maximum element.',
    inputFormat: 'First line: integer N. Second line: N space-separated integers.',
    outputFormat: 'Print the maximum integer.',
    constraints: '1 ≤ N ≤ 10^5, -10^6 ≤ arr[i] ≤ 10^6',
    examples: [{ input: '5\n3 7 2 9 1', output: '9' }],
    starterCode: STARTERS,
  },
  {
    day: 10, title: 'Armstrong Number', difficulty: 'easy',
    description: 'An Armstrong number is a number that equals the sum of its digits each raised to the power of the number of digits. For example, 153 = 1^3 + 5^3 + 3^3. Given a number N, determine if it is an Armstrong number. Print "Yes" or "No".',
    inputFormat: 'A single integer N.',
    outputFormat: 'Print "Yes" or "No".',
    constraints: '1 ≤ N ≤ 10^7',
    examples: [
      { input: '153', output: 'Yes' },
      { input: '123', output: 'No' },
    ],
    starterCode: STARTERS,
  },
  {
    day: 11, title: 'Prime Number', difficulty: 'easy',
    description: 'Given an integer N, determine if it is a prime number. A prime number is greater than 1 and has no positive divisors other than 1 and itself. Print "Yes" or "No".',
    inputFormat: 'A single integer N.',
    outputFormat: 'Print "Yes" if prime, "No" otherwise.',
    constraints: '1 ≤ N ≤ 10^6',
    examples: [
      { input: '7', output: 'Yes' },
      { input: '10', output: 'No' },
    ],
    starterCode: STARTERS,
  },
  {
    day: 12, title: 'GCD of Two Numbers', difficulty: 'easy',
    description: 'Given two integers A and B, find their Greatest Common Divisor (GCD) using the Euclidean algorithm.',
    inputFormat: 'Two integers A and B separated by a space.',
    outputFormat: 'Print the GCD of A and B.',
    constraints: '1 ≤ A, B ≤ 10^9',
    examples: [{ input: '12 18', output: '6' }],
    starterCode: STARTERS,
  },
  {
    day: 13, title: 'FizzBuzz', difficulty: 'easy',
    description: 'Print numbers from 1 to N. For multiples of 3, print "Fizz" instead of the number. For multiples of 5, print "Buzz". For numbers that are multiples of both 3 and 5, print "FizzBuzz".',
    inputFormat: 'A single integer N.',
    outputFormat: 'Print N lines - each line is the result for that number.',
    constraints: '1 ≤ N ≤ 100',
    examples: [{ input: '5', output: '1\n2\nFizz\n4\nBuzz' }],
    starterCode: STARTERS,
  },
  {
    day: 14, title: 'Anagram Check', difficulty: 'easy',
    description: 'Given two strings, determine if they are anagrams of each other (contain the same characters in the same frequency). Print "Yes" or "No". The check is case-insensitive and ignores spaces.',
    inputFormat: 'Two lines, each containing a string.',
    outputFormat: 'Print "Yes" if they are anagrams, "No" otherwise.',
    constraints: '1 ≤ |S| ≤ 10^5',
    examples: [
      { input: 'listen\nsilent', output: 'Yes' },
      { input: 'hello\nworld', output: 'No' },
    ],
    starterCode: STARTERS,
  },
  {
    day: 15, title: 'Binary Search', difficulty: 'easy',
    description: 'Given a sorted array of N integers and a target value, find the index (0-based) of the target using binary search. If the target is not found, print -1.',
    inputFormat: 'First line: two integers N and target. Second line: N space-separated sorted integers.',
    outputFormat: 'Print the index of the target, or -1 if not found.',
    constraints: '1 ≤ N ≤ 10^5, -10^6 ≤ arr[i], target ≤ 10^6',
    examples: [{ input: '6 9\n1 3 5 7 9 11', output: '4' }],
    starterCode: STARTERS,
  },
  {
    day: 16, title: 'Move Zeroes', difficulty: 'easy',
    description: 'Given an array of integers, move all zeroes to the end while maintaining the relative order of non-zero elements. Print the modified array.',
    inputFormat: 'First line: integer N. Second line: N space-separated integers.',
    outputFormat: 'Print N space-separated integers with zeroes moved to the end.',
    constraints: '1 ≤ N ≤ 10^5',
    examples: [{ input: '5\n0 1 0 3 12', output: '1 3 12 0 0' }],
    starterCode: STARTERS,
  },
  {
    day: 17, title: 'First Non-Repeating Character', difficulty: 'easy',
    description: 'Given a string, find the first non-repeating character and print it. If all characters repeat, print "None".',
    inputFormat: 'A single line containing a string S.',
    outputFormat: 'Print the first non-repeating character, or "None".',
    constraints: '1 ≤ |S| ≤ 10^5',
    examples: [
      { input: 'swiss', output: 'w' },
      { input: 'aabb', output: 'None' },
    ],
    starterCode: STARTERS,
  },
  {
    day: 18, title: 'Two Sum', difficulty: 'easy',
    description: 'Given an array of integers and a target sum, find two numbers in the array that add up to the target. Print their indices (1-based). Assume exactly one solution exists.',
    inputFormat: 'First line: two integers N and target. Second line: N space-separated integers.',
    outputFormat: 'Print two space-separated integers - the 1-based indices of the two numbers.',
    constraints: '2 ≤ N ≤ 10^5, -10^6 ≤ arr[i], target ≤ 10^6',
    examples: [{ input: '4 9\n2 7 11 15', output: '1 2' }],
    starterCode: STARTERS,
  },
  {
    day: 19, title: 'Valid Parentheses', difficulty: 'easy',
    description: 'Given a string s containing just the characters "(", ")", "{", "}", "[" and "]", determine if the input string has valid parentheses. A string is valid if every opening bracket has a matching closing bracket in the correct order.',
    inputFormat: 'A single line containing the string S.',
    outputFormat: 'Print "Yes" if valid, "No" otherwise.',
    constraints: '1 ≤ |S| ≤ 10^5',
    examples: [
      { input: '()[]{}', output: 'Yes' },
      { input: '(]', output: 'No' },
    ],
    starterCode: STARTERS,
  },
  {
    day: 20, title: 'Longest Common Prefix', difficulty: 'easy',
    description: 'Given an array of strings, find the longest common prefix string shared by all of them. If there is no common prefix, print an empty string.',
    inputFormat: 'First line: integer N. Next N lines: the strings.',
    outputFormat: 'Print the longest common prefix.',
    constraints: '1 ≤ N ≤ 200, 1 ≤ |S| ≤ 200',
    examples: [{ input: '3\nflower\nflow\nflight', output: 'fl' }],
    starterCode: STARTERS,
  },
]
