'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Code2, AlertCircle, CheckCircle, Github, Mail, ChevronRight, ArrowLeft, Eye, EyeOff } from 'lucide-react'
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
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [userId, setUserId] = useState<string>('')

  const handleBasicsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

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
        setSuccess('Account created!')
        setTimeout(() => {
          setStep('face-offer')
        }, 1500)
      } else {
        setError(result.error || 'Signup failed. Please try again.')
      }
    } catch (err) {
      setError('An unexpected error occurred.')
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
    } finally {
      setLoading(false)
    }
  }

  const handleSkipFaceEnrollment = async () => {
    setLoading(true)
    try {
      const result = await skipFaceEnrollment(userId)

      if (result.success) {
        setSuccess('Skipped face enrollment.')
        setTimeout(() => {
          setStep('complete')
        }, 1500)
      } else {
        setError(result.error || 'Failed to skip face enrollment.')
      }
    } catch (err) {
      setError('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleCompleteSignup = () => {
    router.push('/auth/login')
  }

  const steps = ['basics', 'password', 'face-offer', 'face-enroll', 'complete'] as const
  const currentStepIndex = steps.indexOf(step)

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="space-y-8">
          {/* Header */}
          <div className="text-center">
            <Link href="/" className="inline-flex items-center gap-2.5 mb-8">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                <Code2 className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold">CodeSpectra</span>
            </Link>
            <h1 className="text-3xl font-bold mb-2">
              {step === 'basics' && 'Create account'}
              {step === 'password' && 'Create password'}
              {step === 'face-offer' && 'Secure access'}
              {step === 'face-enroll' && 'Add Face ID'}
              {step === 'complete' && 'Welcome!'}
            </h1>
            <p className="text-muted-foreground">
              {step === 'basics' && 'Join thousands of developers'}
              {step === 'password' && 'Keep your account secure'}
              {step === 'face-offer' && 'Enable biometric login'}
              {step === 'face-enroll' && 'Capture 3 angles for accuracy'}
              {step === 'complete' && 'Your account is ready'}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="flex items-center gap-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 rounded-full transition-all ${
                  i <= currentStepIndex ? 'bg-primary' : 'bg-border'
                }`}
              />
            ))}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-600 text-sm px-4 py-3 rounded-xl flex items-start gap-3">
              <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />
              <p>{success}</p>
            </div>
          )}

          {/* Step 1: Basics */}
          {step === 'basics' && (
            <form onSubmit={handleBasicsSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">Full name</label>
                <Input
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11"
                />
              </div>

              <Button type="submit" className="w-full h-11 text-base gap-2">
                Continue
                <ChevronRight className="w-4 h-4" />
              </Button>
            </form>
          )}

          {/* Step 2: Password */}
          {step === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">At least 8 characters</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Confirm password</label>
                <div className="relative">
                  <Input
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('basics')}
                  className="flex-1 h-11 gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
                <Button 
                  type="submit" 
                  disabled={loading} 
                  className="flex-1 h-11 text-base gap-2"
                >
                  {loading ? 'Creating...' : 'Create'}
                  {!loading && <ChevronRight className="w-4 h-4" />}
                </Button>
              </div>
            </form>
          )}

          {/* Step 3: Face Enrollment Offer */}
          {step === 'face-offer' && (
            <div className="space-y-6">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 space-y-4 text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                  <span className="text-3xl">🔐</span>
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">Secure with Face ID</h3>
                  <p className="text-sm text-muted-foreground">
                    Enable biometric login for faster, more secure access.
                  </p>
                </div>

                <div className="space-y-2 text-left text-sm">
                  {['Bank-level face recognition', 'No passwords required', '3-angle capture for accuracy'].map((item) => (
                    <div key={item} className="flex gap-3 items-center">
                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      <span className="text-muted-foreground">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Button 
                  onClick={() => setStep('face-enroll')} 
                  className="w-full h-11 text-base"
                >
                  Set Up Face ID
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSkipFaceEnrollment}
                  disabled={loading}
                  className="w-full h-11"
                >
                  {loading ? 'Skipping...' : 'Skip for Now'}
                </Button>
              </div>
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
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Welcome to CodeSpectra!</h2>
                <p className="text-muted-foreground">
                  Your account is ready. Let&apos;s start analyzing code.
                </p>
              </div>

              <Button 
                onClick={handleCompleteSignup} 
                className="w-full h-11 text-base gap-2"
              >
                Go to Login
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Footer - Only show on basics step */}
          {step === 'basics' && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/40"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="px-3 bg-background text-xs text-muted-foreground">or continue with</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-11 gap-2">
                  <Github className="w-5 h-5" />
                  GitHub
                </Button>
                <Button variant="outline" className="h-11 gap-2">
                  <Mail className="w-5 h-5" />
                  Google
                </Button>
              </div>

              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  Already have an account?{' '}
                  <Link href="/auth/login" className="text-primary font-medium hover:text-primary/80 transition-colors">
                    Sign in
                  </Link>
                </p>

                <p className="text-xs text-muted-foreground">
                  By signing up, you agree to our{' '}
                  <Link href="#" className="text-primary/60 hover:text-primary transition-colors">Terms</Link>
                  {' '}and{' '}
                  <Link href="#" className="text-primary/60 hover:text-primary transition-colors">Privacy Policy</Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
