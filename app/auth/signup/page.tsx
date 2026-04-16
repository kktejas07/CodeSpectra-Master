'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Code2, AlertCircle, CheckCircle, Github, Mail, ChevronRight } from 'lucide-react'
import { FaceRecognition } from '@/components/auth/face-recognition'
import { signUp, enrollFaceRecognition, skipFaceEnrollment } from '@/lib/auth-service'

type SignupStep = 'basics' | 'password' | 'face-offer' | 'face-enroll' | 'complete'

export default function SignUp() {
  const router = useRouter()
  const [step, setStep] = useState<SignupStep>('basics')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [userId, setUserId] = useState<string>('')

  const handleBasicsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation
    if (!fullName.trim()) {
      setError('Full name is required')
      return
    }
    if (!email.includes('@')) {
      setError('Valid email is required')
      return
    }

    setStep('password')
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Validation
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      setLoading(false)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    try {
      const result = await signUp(email, password, fullName)

      if (result.success && result.user) {
        setUserId(result.user.id)
        setSuccess('Account created! Setting up face recognition...')
        setTimeout(() => {
          setStep('face-offer')
        }, 1500)
      } else {
        setError(result.error || 'Signup failed. Please try again.')
      }
    } catch (err) {
      setError('An unexpected error occurred.')
      console.error('Signup error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleFaceEnrollment = async (faceData: { front: string; left: string; right: string }) => {
    setLoading(true)
    try {
      const result = await enrollFaceRecognition(userId, faceData)

      if (result.success) {
        setSuccess('Face enrollment successful!')
        setTimeout(() => {
          setStep('complete')
        }, 1500)
      } else {
        setError(result.error || 'Face enrollment failed. Please try again.')
      }
    } catch (err) {
      setError('An unexpected error occurred during face enrollment.')
      console.error('Face enrollment error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSkipFaceEnrollment = async () => {
    setLoading(true)
    try {
      const result = await skipFaceEnrollment(userId)

      if (result.success) {
        setSuccess('Skipped face enrollment. You can set it up later.')
        setTimeout(() => {
          setStep('complete')
        }, 1500)
      } else {
        setError(result.error || 'Failed to skip face enrollment.')
      }
    } catch (err) {
      setError('An unexpected error occurred.')
      console.error('Skip error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCompleteSignup = () => {
    router.push('/auth/login')
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 bg-primary rounded flex items-center justify-center">
              <Code2 className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground">CodeSpectra</span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            {step === 'basics' && 'Create account'}
            {step === 'password' && 'Choose a password'}
            {step === 'face-offer' && 'Secure your account'}
            {step === 'face-enroll' && 'Enroll your face'}
            {step === 'complete' && 'All set!'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === 'basics' && 'Join thousands of developers mastering their craft'}
            {step === 'password' && 'Create a strong password to protect your account'}
            {step === 'face-offer' && 'Add biometric login for extra security and convenience'}
            {step === 'face-enroll' && 'We capture 3 angles for maximum accuracy'}
            {step === 'complete' && 'Your account is ready to use'}
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-between text-xs">
          {['basics', 'password', 'face-offer', 'face-enroll', 'complete'].map((s, i) => (
            <div
              key={s}
              className={`flex-1 h-1 mx-1 rounded-full transition-colors ${
                (['basics', 'password', 'face-offer', 'face-enroll', 'complete'].indexOf(step) >= i)
                  ? 'bg-primary'
                  : 'bg-border'
              }`}
            />
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-700 text-sm px-4 py-3 rounded flex items-start gap-3">
            <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <p>{success}</p>
          </div>
        )}

        {/* Step 1: Basics */}
        {step === 'basics' && (
          <form onSubmit={handleBasicsSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Full name</label>
              <Input
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bg-card border-border"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email</label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-card border-border"
              />
            </div>

            <Button type="submit" className="w-full gap-2">
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </form>
        )}

        {/* Step 2: Password */}
        {step === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Password</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-card border-border"
              />
              <p className="text-xs text-muted-foreground">At least 8 characters</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Confirm password</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-card border-border"
              />
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('basics')}
                className="flex-1"
              >
                Back
              </Button>
              <Button type="submit" disabled={loading} className="flex-1 gap-2">
                {loading ? 'Creating...' : 'Create account'} <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </form>
        )}

        {/* Step 3: Face Enrollment Offer */}
        {step === 'face-offer' && (
          <div className="space-y-6">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 space-y-4 text-center">
              <div className="text-3xl">🔐</div>
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">Enable Face Recognition</h3>
                <p className="text-sm text-muted-foreground">
                  Add biometric login for faster, more secure access to your account. You can skip this and set it up later.
                </p>
              </div>

              <div className="space-y-3 text-left text-sm">
                <div className="flex gap-3">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">Secure biometric authentication</span>
                </div>
                <div className="flex gap-3">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">No passwords needed</span>
                </div>
                <div className="flex gap-3">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">3-angle face capture for accuracy</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button onClick={() => setStep('face-enroll')} className="w-full">
                Set Up Now
              </Button>
              <Button
                variant="outline"
                onClick={handleSkipFaceEnrollment}
                disabled={loading}
                className="w-full"
              >
                {loading ? 'Skipping...' : 'Skip for Now'}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              You&apos;ll get a reminder in 7 days if you skip now
            </p>
          </div>
        )}

        {/* Step 4: Face Enrollment */}
        {step === 'face-enroll' && (
          <div className="space-y-4">
            <FaceRecognition
              onCapture={handleFaceEnrollment}
              mode="signup"
              onSkip={handleSkipFaceEnrollment}
            />
          </div>
        )}

        {/* Step 5: Complete */}
        {step === 'complete' && (
          <div className="space-y-6 text-center">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto border-2 border-green-500/20">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">Welcome to CodeSpectra!</h2>
              <p className="text-sm text-muted-foreground">
                Your account is all set. Let&apos;s start your coding journey.
              </p>
            </div>

            <Button onClick={handleCompleteSignup} className="w-full gap-2">
              Go to Login <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Footer - Only show on basics step */}
        {step === 'basics' && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-background text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="gap-2">
                <Github className="w-4 h-4" />
                GitHub
              </Button>
              <Button variant="outline" className="gap-2">
                <Mail className="w-4 h-4" />
                Google
              </Button>
            </div>

            <div className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/auth/login" className="text-primary font-medium hover:underline">
                Sign in
              </Link>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              By signing up, you agree to our{' '}
              <Link href="#" className="underline hover:text-foreground">
                Terms
              </Link>
              {' '}and{' '}
              <Link href="#" className="underline hover:text-foreground">
                Privacy Policy
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

