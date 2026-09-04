'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Building2, 
  ChevronRight, 
  Search,
  Sparkles,
  Target,
  Briefcase,
  Plus
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AiCreditsWidget } from '@/components/ui/ai-credits-widget'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

const MOCK_TESTS = [
  { id: 'tcs-software-engineer', company: 'TCS', role: 'Software Engineer', logo: 'https://logo.clearbit.com/tcs.com', type: 'Tech', level: 'Entry-level' },
  { id: 'tcs-qa-engineer', company: 'TCS', role: 'QA Engineer', logo: 'https://logo.clearbit.com/tcs.com', type: 'Tech', level: 'Mid-level' },
  { id: 'ey-data-analyst', company: 'EY', role: 'Data Analyst', logo: 'https://logo.clearbit.com/ey.com', type: 'Data', level: 'Entry-level' },
  { id: 'fractal-data-scientist', company: 'Fractal Analytics', role: 'Data Scientist', logo: 'https://logo.clearbit.com/fractal.ai', type: 'Data', level: 'Advanced' },
  { id: 'google-sde', company: 'Google', role: 'Software Development Engineer', logo: 'https://logo.clearbit.com/google.com', type: 'Tech', level: 'Mid-level' },
  { id: 'amazon-sde', company: 'Amazon', role: 'SDE I', logo: 'https://logo.clearbit.com/amazon.com', type: 'Tech', level: 'Entry-level' },
  { id: 'wipro-frontend', company: 'Wipro', role: 'Frontend Developer', logo: 'https://logo.clearbit.com/wipro.com', type: 'Tech', level: 'Mid-level' },
]

export default function MockTestsPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [customData, setCustomData] = useState({ company: '', role: '', type: 'Tech', experience: 'Entry-level' })
  const [isGenerating, setIsGenerating] = useState(false)

  const filteredTests = MOCK_TESTS.filter(t => 
    t.company.toLowerCase().includes(search.toLowerCase()) || 
    t.role.toLowerCase().includes(search.toLowerCase())
  )

  const handleGenerate = () => {
    setIsGenerating(true)
    setTimeout(() => {
      setIsGenerating(false)
      setIsModalOpen(false)
      // Navigate to a dynamic ID or just show success for now
      router.push(`/dashboard/mock-tests/custom-ai-generated`)
    }, 2000)
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent inline-flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-primary" />
            AI-Powered Mock Tests
          </h2>
          <p className="text-muted-foreground mt-2">
            Practice role-based assessments generated dynamically by AI for top companies.
          </p>
        </div>
        <div className="w-full sm:w-64 shrink-0 flex flex-col gap-3">
          <AiCreditsWidget />
          <Button onClick={() => setIsModalOpen(true)} className="w-full gap-2">
            <Plus className="w-4 h-4" /> Create Custom Test
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-8 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by company or role..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filteredTests.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredTests.map((test) => (
            <Card key={test.id} className="group hover:border-primary/50 transition-colors cursor-pointer flex flex-col">
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-md border bg-muted p-1 shrink-0 overflow-hidden flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={test.logo} alt={test.company} className="h-full w-full object-contain" onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement!.innerHTML = '<span class="text-xs font-bold text-muted-foreground">' + test.company.substring(0, 2) + '</span>';
                    }} />
                  </div>
                  <div>
                    <CardTitle className="text-base line-clamp-1">{test.company}</CardTitle>
                    <CardDescription className="line-clamp-1 mt-0.5">{test.role}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-4 flex-1">
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="secondary" className="flex items-center gap-1.5 font-normal text-xs bg-muted/60">
                    <Briefcase className="w-3 h-3 text-muted-foreground" /> {test.type}
                  </Badge>
                  <Badge variant="secondary" className="flex items-center gap-1.5 font-normal text-xs bg-muted/60">
                    <Target className="w-3 h-3 text-muted-foreground" /> {test.level}
                  </Badge>
                </div>
              </CardContent>
              <CardFooter className="pt-0">
                <Button 
                  className="w-full gap-2 group-hover:bg-primary/90 transition-colors cursor-pointer"
                  onClick={() => router.push(`/dashboard/mock-tests/${test.id}`)}
                >
                  Start Test <ChevronRight className="w-4 h-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="mt-12">
          <EmptyState 
            title="No tests found" 
            description={`We couldn't find any companies or roles matching "${search}". Create a custom AI-generated test for this specific company and role!`} 
            actionLabel="Generate Custom Test"
            onAction={() => {
              setCustomData({ ...customData, company: search })
              setIsModalOpen(true)
            }}
          />
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> Generate Custom Test
            </DialogTitle>
            <DialogDescription>
              Provide details for the company and role you want to practice for. This costs 1 AI Credit.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="company">Company Name</Label>
              <Input 
                id="company" 
                placeholder="e.g. Stripe, Airbnb" 
                value={customData.company}
                onChange={(e) => setCustomData({...customData, company: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Target Role</Label>
              <Input 
                id="role" 
                placeholder="e.g. Backend Developer" 
                value={customData.role}
                onChange={(e) => setCustomData({...customData, role: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="type">Test Type</Label>
                <select 
                  id="type"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={customData.type}
                  onChange={(e) => setCustomData({...customData, type: e.target.value})}
                >
                  <option>Tech</option>
                  <option>Data</option>
                  <option>Product</option>
                  <option>Design</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="level">Experience Level</Label>
                <select 
                  id="level"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={customData.experience}
                  onChange={(e) => setCustomData({...customData, experience: e.target.value})}
                >
                  <option>Entry-level</option>
                  <option>Mid-level</option>
                  <option>Senior</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={!customData.company || !customData.role || isGenerating}>
              {isGenerating ? (
                <>Generating... <Sparkles className="w-4 h-4 ml-2 animate-pulse" /></>
              ) : (
                <>Generate Test (-1 Credit)</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
