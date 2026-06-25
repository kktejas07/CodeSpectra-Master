'use client'

import { ChallengeEditor } from '@/components/challenges/challenge-editor'

export default function ChallengePage({ params }: { params: { id: string } }) {
  const challengeId = params.id

  // Sample challenge data - would be fetched from API in production
  const challenge = {
    id: challengeId,
    title: 'Simple Array Sum',
    description: `Given an array of integers, find the sum of all elements.

For example, if the array is [1, 2, 3, 4, 5], the sum should be 15.

You need to implement a function that takes an array as input and returns the sum of all its elements.

Constraints:
- Array length will be between 1 and 100,000
- Each element will be between -1,000,000 and 1,000,000
- You must handle both positive and negative numbers`,
    examples: [
      {
        input: '[1, 2, 3, 4, 5]',
        output: '15',
        explanation: 'The sum of 1 + 2 + 3 + 4 + 5 = 15',
      },
      {
        input: '[10, 20, 30]',
        output: '60',
        explanation: 'The sum of 10 + 20 + 30 = 60',
      },
      {
        input: '[-5, 10, -3]',
        output: '2',
        explanation: 'The sum of -5 + 10 + (-3) = 2',
      },
    ],
    initialCode: `function simpleArraySum(arr) {
  // Write your solution here
  return 0;
}`,
  }

  return (
    <div className="h-screen w-screen overflow-hidden">
      <ChallengeEditor
        challengeId={challenge.id}
        title={challenge.title}
        description={challenge.description}
        examples={challenge.examples}
        initialCode={challenge.initialCode}
      />
    </div>
  )
}
