'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Briefcase, Brain, Tent, UserCircle, Rocket } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

export function WelcomeModal() {
  const { user, refreshUser } = useAuth()
  const [open, setOpen] = useState(false)
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Show modal if user is logged in but hasn't set an onboarding goal
    if (user && !user.onboardingGoal) {
      setOpen(true)
    }
  }, [user])

  const goals = [
    { id: 'find-job', title: 'Find a job', icon: Briefcase, color: 'text-primary', bg: 'bg-primary/10' },
    { id: 'compete-upskill', title: 'Compete & upskill', icon: Brain, color: 'text-primary', bg: 'bg-primary/10' },
    { id: 'host-event', title: 'Host an event', icon: Tent, color: 'text-primary', bg: 'bg-primary/10' },
    { id: 'be-mentor', title: 'Be a mentor', icon: UserCircle, color: 'text-primary', bg: 'bg-primary/10' },
  ]

  const handleSubmit = async () => {
    if (!selectedGoal) return

    setLoading(true)
    try {
      const { csrfFetch } = await import('@/lib/csrf-fetch')
      const res = await csrfFetch('/api/user/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboardingGoal: selectedGoal }),
      })
      
      if (res.ok) {
        setOpen(false)
        await refreshUser()
      } else {
        console.error('Failed to save onboarding goal')
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  // Prevent closing by clicking outside or pressing escape
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !user?.onboardingGoal) {
      return // Do not allow closing if goal is not set
    }
    setOpen(newOpen)
  }

  if (!user) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-150 text-center p-0 overflow-hidden">
        <div className="flex flex-col items-center border-b border-border bg-linear-to-b from-primary/10 to-background p-8">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-card text-primary shadow-sm">
             <Rocket className="h-8 w-8" aria-hidden />
          </div>
          <p className="text-sm font-medium text-muted-foreground mb-1">Your account has been created!</p>
          <DialogTitle className="text-2xl font-bold">What brings you to CodeSpectra?</DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">This helps us create a better experience for you.</p>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {goals.map((goal) => {
              const Icon = goal.icon
              const isSelected = selectedGoal === goal.id
              return (
                <button
                  key={goal.id}
                  onClick={() => setSelectedGoal(goal.id)}
                  aria-pressed={isSelected}
                  className={`flex flex-col items-center rounded-2xl border-2 p-4 transition-[border-color,background-color,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transform-none ${
                    isSelected 
                      ? 'border-primary bg-primary/5 shadow-sm scale-[1.02]' 
                      : 'border-border hover:border-primary/50 hover:bg-accent'
                  }`}
                >
                  <div className={`p-3 rounded-full mb-3 ${goal.bg}`}>
                    <Icon className={`h-6 w-6 ${goal.color}`} />
                  </div>
                  <span className="text-sm font-medium leading-tight text-foreground">{goal.title}</span>
                </button>
              )
            })}
          </div>

          <Button 
            onClick={handleSubmit} 
            disabled={!selectedGoal || loading} 
            className="w-full sm:w-auto px-12 rounded-full font-semibold"
            size="lg"
          >
            {loading ? 'Saving…' : 'Explore CodeSpectra'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
