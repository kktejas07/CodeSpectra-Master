import { NextResponse } from 'next/server'

const mockJobs = [
  {
    id: '1',
    title: 'Senior Full-Stack Developer',
    company: 'Tech Corp',
    location: 'San Francisco, CA',
    salary: { min: 150000, max: 200000, currency: 'USD' },
    jobType: 'Full-time',
    experienceLevel: 'Senior',
    description: 'Looking for experienced full-stack developer to join our team',
    skills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL'],
    applicants: 24,
    postedAt: '2 days ago',
  },
  {
    id: '2',
    title: 'Frontend Engineer',
    company: 'StartUp Inc',
    location: 'Remote',
    salary: { min: 120000, max: 160000, currency: 'USD' },
    jobType: 'Full-time',
    experienceLevel: 'Mid-level',
    description: 'Help build beautiful user interfaces for our platform',
    skills: ['React', 'TypeScript', 'Tailwind CSS', 'Next.js'],
    applicants: 18,
    postedAt: '5 days ago',
  },
]

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const location = searchParams.get('location')
  const jobType = searchParams.get('jobType')
  const level = searchParams.get('level')

  let filtered = mockJobs

  if (location) filtered = filtered.filter(job => job.location.includes(location))
  if (jobType) filtered = filtered.filter(job => job.jobType === jobType)
  if (level) filtered = filtered.filter(job => job.experienceLevel === level)

  return NextResponse.json(filtered)
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const newJob = {
      id: String(Math.random()),
      ...data,
      applicants: 0,
      postedAt: 'just now',
    }
    return NextResponse.json(newJob, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create job' }, { status: 400 })
  }
}
