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
    { id: 'find-job', title: 'To find a Job', icon: Briefcase, color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 'compete-upskill', title: 'Compete & Upskill', icon: Brain, color: 'text-pink-500', bg: 'bg-pink-50' },
    { id: 'host-event', title: 'To Host an Event', icon: Tent, color: 'text-red-500', bg: 'bg-red-50' },
    { id: 'be-mentor', title: 'To be a Mentor', icon: UserCircle, color: 'text-indigo-500', bg: 'bg-indigo-50' },
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
        <div className="bg-linear-to-b from-blue-50 to-background p-8 flex flex-col items-center border-b border-border">
          <div className="h-16 w-16 bg-white rounded-full shadow-md flex items-center justify-center mb-4 ring-4 ring-white">
             <Rocket className="h-8 w-8 text-blue-600" />
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
                  className={`flex flex-col items-center p-4 rounded-xl border-2 transition-all duration-200 ${
                    isSelected 
                      ? 'border-primary bg-primary/5 shadow-sm scale-[1.02]' 
                      : 'border-border hover:border-primary/50 hover:bg-accent'
                  }`}
                >
                  <div className={`p-3 rounded-full mb-3 ${goal.bg}`}>
                    <Icon className={`h-6 w-6 ${goal.color}`} />
                  </div>
                  <span className="text-sm font-medium leading-tight">{goal.title}</span>
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
            {loading ? 'Saving...' : 'Explore CodeSpectra'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
