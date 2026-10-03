"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeRedirect } from "@/lib/safe-redirect";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Code2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Sparkles,
  Terminal,
  UploadCloud,
  User,
  Zap,
  GraduationCap,
  Briefcase,
  Building2,
  BookOpen,
  MapPin,
  CheckCircle2
} from "lucide-react";
import { Github } from "@/components/ui/brand-icons";
import { useAuth } from "@/lib/auth-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SignupIllustration } from "@/components/ui/signup-illustration";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";

function SignupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get("redirect") || searchParams.get("redirectTo"));
  const refCode = searchParams.get("ref");

  // Multi-step Wizard State
  const [step, setStep] = useState(1);
  const totalSteps = 3;

  const [name, setName] = useState("");
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mobile, setMobile] = useState("");
  
  const [userType, setUserType] = useState<"School Student" | "College Student" | "Fresher" | "Professional" | "">("");
  const [domain, setDomain] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [experience, setExperience] = useState("");
  const [classGrade, setClassGrade] = useState("");
  const [currentJobRole, setCurrentJobRole] = useState("");
  const [organisationName, setOrganisationName] = useState("");
  const [organisationType, setOrganisationType] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  
  // Modal State
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const [tempOrgName, setTempOrgName] = useState("");
  const [tempOrgType, setTempOrgType] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signUpWithEmail, signInWithGoogle, signInWithGithub } = useAuth();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  useEffect(() => {
    if (refCode) localStorage.setItem('referral_code', refCode);
  }, [refCode]);

  useEffect(() => {
    const stored = localStorage.getItem('referral_code');
    if (stored && !refCode) {
      // Could push ref into URL if needed, but we keep it in localstorage
    }
  }, [refCode]);

  async function applyReferral() {
    const code = localStorage.getItem('referral_code');
    if (!code) return;
    try {
      await fetch('/api/referral/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
    } catch { /* best effort */ }
    localStorage.removeItem('referral_code');
  }

  const nextStep = () => {
    setError(null);
    if (step === 1) {
      if (!name || !email || !password || !confirmPassword || !mobile) {
        setError("Please fill all required fields in Step 1.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
    } else if (step === 2) {
      if (!userType) {
        setError("Please select a User Type.");
        return;
      }
    }
    setStep((prev) => Math.min(prev + 1, totalSteps));
  };

  const prevStep = () => {
    setError(null);
    setStep((prev) => Math.max(prev - 1, 1));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Final Validation
    if (step === 3) {
      if (userType === 'School Student' && !classGrade) {
        setError("Please select your Class/Grade.");
        return;
      }
      if (userType === 'Professional' && (!currentJobRole || !experience)) {
        setError("Please provide your Job Role and Experience.");
        return;
      }
    }

    setLoading(true);

    try {
      const extendedData = { mobile, userType, domain: domain === 'Other' ? customDomain : domain, experience, classGrade, graduationYear, currentJobRole, organisationName, organisationType };
      // Forward the assessment invite token so invited bulk candidates skip
      // the IP throttle. It usually rides nested inside ?redirect=/assessment/..?inviteToken=..
      let inviteToken: string | undefined
      try {
        inviteToken =
          searchParams.get('inviteToken') ||
          new URLSearchParams((searchParams.get('redirect') || '').split('?')[1] || '').get('inviteToken') ||
          undefined
      } catch {
        inviteToken = searchParams.get('inviteToken') || undefined
      }
      await signUpWithEmail(email.trim().toLowerCase(), password, name.trim(), extendedData, turnstileToken || undefined, inviteToken ? { inviteToken } : undefined);
      await applyReferral();
      // Redirect to Face Biometric Enrollment step
      router.push(`/auth/enroll-face?redirect=${encodeURIComponent(redirectTo)}`);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign up failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignUp() {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      await applyReferral();
      router.push(`/auth/enroll-face?redirect=${encodeURIComponent(redirectTo)}`);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign-up failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleGithubSignUp() {
    setError(null);
    setLoading(true);
    try {
      await signInWithGithub();
      await applyReferral();
      router.push(`/auth/enroll-face?redirect=${encodeURIComponent(redirectTo)}`);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "GitHub sign-up failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const handleOrgSubmit = () => {
    setOrganisationName(tempOrgName);
    setOrganisationType(tempOrgType);
    setIsOrgModalOpen(false);
  };

  const dummyOrgs = [
    { name: "AI Axiss Inx", type: "Company" }
  ];

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-[1.1fr_0.9fr] bg-background">
      {/* Brand panel — visible on lg+ */}
      <aside className="hidden lg:flex relative overflow-hidden flex-col justify-between p-12 xl:p-16 bg-[radial-gradient(60%_60%_at_30%_20%,hsl(var(--primary)/0.18)_0%,transparent_60%),radial-gradient(40%_40%_at_80%_90%,hsl(var(--primary)/0.10)_0%,transparent_55%)]">
        <div aria-hidden className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
        <div className="relative flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_40px_-8px_hsl(var(--primary)/0.7)]">
              <Code2 className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">CodeSpectra</span>
          </Link>
        </div>
        
        {/* Animated Feature Showcase */}
        <div className="relative space-y-12 max-w-lg z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 backdrop-blur px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            Join 10,000+ developers leveling up
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold tracking-tight leading-[1.05]">
            Build your <span className="text-primary">developer identity</span>
          </h1>
          
          <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-linear-to-b before:from-transparent before:via-border before:to-transparent">
            {/* Timeline Item 1 */}
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full border border-white ${step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'} shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-colors duration-500`}>
                <User className="h-4 w-4" />
              </div>
              <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-border bg-card/60 backdrop-blur shadow transition-all duration-500 ${step === 1 ? 'scale-105 border-primary/50 ring-1 ring-primary/20' : 'opacity-70'}`}>
                <p className="font-bold text-sm">1. Basic Info</p>
                <p className="text-xs text-muted-foreground mt-1">Set up your credentials.</p>
              </div>
            </div>
            {/* Timeline Item 2 */}
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full border border-white ${step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'} shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-colors duration-500`}>
                <GraduationCap className="h-4 w-4" />
              </div>
              <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-border bg-card/60 backdrop-blur shadow transition-all duration-500 ${step === 2 ? 'scale-105 border-primary/50 ring-1 ring-primary/20' : 'opacity-70'}`}>
                <p className="font-bold text-sm">2. Career Stage</p>
                <p className="text-xs text-muted-foreground mt-1">Are you a student or pro?</p>
              </div>
            </div>
            {/* Timeline Item 3 */}
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full border border-white ${step >= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'} shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-colors duration-500`}>
                <Building2 className="h-4 w-4" />
              </div>
              <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-border bg-card/60 backdrop-blur shadow transition-all duration-500 ${step === 3 ? 'scale-105 border-primary/50 ring-1 ring-primary/20' : 'opacity-70'}`}>
                <p className="font-bold text-sm">3. Profile Details</p>
                <p className="text-xs text-muted-foreground mt-1">Complete your developer resume.</p>
              </div>
            </div>
          </div>
          
          <div className="mt-8">
            <SignupIllustration />
          </div>
        </div>
        <div className="relative flex items-center justify-between text-xs text-muted-foreground">
          <span>&copy; 2026 CodeSpectra</span>
          <Link href="/" className="hover:text-foreground transition">&larr; Back to home</Link>
        </div>
      </aside>

      {/* Signup form */}
      <main className="flex flex-col px-6 py-10 sm:px-12 relative h-full">
        <div className="w-full max-w-md mx-auto space-y-7 relative z-10">
          
          {/* Mobile logo + back */}
          <div className="lg:hidden flex items-center justify-between mb-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Code2 className="h-5 w-5" />
              </div>
              <span className="text-lg font-semibold">CodeSpectra</span>
            </Link>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold tracking-tight">
                {step === 1 && "Create your account"}
                {step === 2 && "What best describes you?"}
                {step === 3 && "Tell us about your background"}
              </h2>
              <span className="text-sm font-medium text-primary bg-primary/10 px-2 py-1 rounded-md">Step {step}/3</span>
            </div>
            
            {/* Gamified Progress Bar */}
            <div className="w-full bg-muted rounded-full h-2.5 mb-6 overflow-hidden">
              <div className="bg-primary h-2.5 rounded-full transition-all duration-500 ease-out" style={{ width: `${(step / 3) * 100}%` }}></div>
            </div>
            {step === 1 && (
              <p className="text-sm text-muted-foreground">
                Already have one?{" "}
                <Link href="/auth/login" className="font-medium text-primary hover:underline">Sign in</Link>
              </p>
            )}
          </div>

          {step === 1 && (
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={handleGoogleSignUp} disabled={loading} className="w-full h-11 gap-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google
              </Button>
              <Button variant="outline" onClick={handleGithubSignUp} disabled={loading} className="w-full h-11 gap-2">
                <Github className="w-5 h-5" />
                GitHub
              </Button>
            </div>
          )}

          {step === 1 && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase tracking-wider">
                <span className="bg-background px-3 text-muted-foreground">or use your email</span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-destructive/10 text-destructive text-sm rounded-lg p-3 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-5">
            {/* STEP 1: Basic Info */}
            <div className={`space-y-4 transition-all duration-500 ${step === 1 ? 'block animate-in fade-in slide-in-from-right-4' : 'hidden'}`}>
              <div className="space-y-2">
                <Label htmlFor="name">Full name <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="name" type="text" placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} className="pl-9 h-11" required={step === 1} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9 h-11" required={step === 1} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mobile">Mobile Number <span className="text-destructive">*</span></Label>
                <Input id="mobile" type="tel" placeholder="+1 (555) 000-0000" value={mobile} onChange={(e) => setMobile(e.target.value)} className="h-11" required={step === 1} />
              </div>

              <div className="space-y-2 pt-2">
                <Label htmlFor="password">Password <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="password" type={showPassword ? "text" : "password"} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9 pr-10 h-11" required={step === 1} minLength={8} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="confirm" type={showConfirm ? "text" : "password"} placeholder="Repeat your password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="pl-9 pr-10 h-11" required={step === 1} minLength={8} />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* STEP 2: User Type */}
            <div className={`space-y-4 transition-all duration-500 ${step === 2 ? 'block animate-in fade-in slide-in-from-right-4' : 'hidden'}`}>
              <div className="grid grid-cols-2 gap-4">
                <Card 
                  className={`p-4 cursor-pointer hover:border-primary transition-all ${userType === 'School Student' ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}
                  onClick={() => setUserType('School Student')}
                >
                  <BookOpen className={`h-8 w-8 mb-3 ${userType === 'School Student' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <h3 className="font-medium text-sm">School Student</h3>
                  <p className="text-xs text-muted-foreground mt-1">Learning to code early.</p>
                </Card>
                <Card 
                  className={`p-4 cursor-pointer hover:border-primary transition-all ${userType === 'College Student' ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}
                  onClick={() => setUserType('College Student')}
                >
                  <GraduationCap className={`h-8 w-8 mb-3 ${userType === 'College Student' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <h3 className="font-medium text-sm">College Student</h3>
                  <p className="text-xs text-muted-foreground mt-1">Building a portfolio.</p>
                </Card>
                <Card 
                  className={`p-4 cursor-pointer hover:border-primary transition-all ${userType === 'Fresher' ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}
                  onClick={() => setUserType('Fresher')}
                >
                  <Terminal className={`h-8 w-8 mb-3 ${userType === 'Fresher' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <h3 className="font-medium text-sm">Fresher</h3>
                  <p className="text-xs text-muted-foreground mt-1">Looking for first tech job.</p>
                </Card>
                <Card 
                  className={`p-4 cursor-pointer hover:border-primary transition-all ${userType === 'Professional' ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}
                  onClick={() => setUserType('Professional')}
                >
                  <Briefcase className={`h-8 w-8 mb-3 ${userType === 'Professional' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <h3 className="font-medium text-sm">Professional</h3>
                  <p className="text-xs text-muted-foreground mt-1">Upskilling and competing.</p>
                </Card>
              </div>
            </div>

            {/* STEP 3: Domain / Details */}
            <div className={`space-y-4 transition-all duration-500 ${step === 3 ? 'block animate-in fade-in slide-in-from-right-4' : 'hidden'}`}>
              
              {userType === 'School Student' && (
                <div className="space-y-3">
                  <Label>Class/Grade *</Label>
                  <div className="flex flex-wrap gap-2">
                     {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(grade => (
                       <Button type="button" key={grade} variant={classGrade === String(grade) ? 'default' : 'outline'} onClick={() => setClassGrade(String(grade))} className="rounded-full h-10 w-10 p-0 text-sm">{grade}</Button>
                     ))}
                  </div>
                </div>
              )}

              {(userType === 'College Student' || userType === 'Fresher' || userType === 'Professional') && (
                <div className="space-y-3">
                  <Label>Domain *</Label>
                  <div className="flex flex-wrap gap-2">
                     {['Management', 'Engineering', 'Arts & Science', 'Medicine', 'Law', 'Other'].map(d => (
                       <Button type="button" key={d} variant={domain === d ? 'default' : 'outline'} onClick={() => setDomain(d)} className="rounded-full h-9 px-4 text-xs">{d}</Button>
                     ))}
                  </div>
                  {domain === 'Other' && (
                    <Input value={customDomain} onChange={e => setCustomDomain(e.target.value)} placeholder="Type your domain" className="mt-2 h-11 animate-in fade-in slide-in-from-top-1" />
                  )}
                </div>
              )}

              {(userType === 'College Student' || userType === 'Fresher') && (
                <div className="space-y-2 pt-2">
                  <Label>Graduation Year *</Label>
                  <select 
                    value={graduationYear} 
                    onChange={e => setGraduationYear(e.target.value)} 
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="" disabled>Select your graduation year</option>
                    {Array.from({ length: 10 }).map((_, i) => {
                      const year = new Date().getFullYear() - 3 + i;
                      return <option key={year} value={year}>{year}</option>
                    })}
                  </select>
                </div>
              )}

              {userType === 'Professional' && (
                <>
                  <div className="space-y-2 pt-2">
                    <Label>Current Job Role *</Label>
                    <Input value={currentJobRole} onChange={e => setCurrentJobRole(e.target.value)} placeholder="e.g. Full Stack Developer" className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Work Experience *</Label>
                    <select 
                      value={experience} 
                      onChange={e => setExperience(e.target.value)} 
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="" disabled>Select your experience</option>
                      <option value="0-1 years">0-1 years</option>
                      <option value="1-3 years">1-3 years</option>
                      <option value="3-5 years">3-5 years</option>
                      <option value="5-10 years">5-10 years</option>
                      <option value="10+ years">10+ years</option>
                    </select>
                  </div>
                </>
              )}

              {(userType === 'Professional' || userType === 'College Student' || userType === 'Fresher') && (
                <div className="space-y-3 pt-4 border-t border-border mt-4">
                  <Label>Current Company / Organisation *</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      value={organisationName} 
                      onChange={e => setOrganisationName(e.target.value)} 
                      placeholder="Type or select organisation" 
                      className="pl-9 h-11"
                    />
                    <div className="mt-2 text-right">
                      <button type="button" onClick={() => setIsOrgModalOpen(true)} className="text-xs text-primary font-medium hover:underline flex items-center justify-end gap-1 w-full">
                        <MapPin className="h-3 w-3" /> Browse Organisations
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Wizard Navigation */}
            <div className="flex gap-3 pt-6">
              {step > 1 && (
                <Button type="button" variant="outline" onClick={prevStep} className="w-1/3 h-11">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
              )}
              {step < totalSteps ? (
                <Button type="button" onClick={nextStep} className={`${step > 1 ? 'w-2/3' : 'w-full'} h-11`}>
                  Next <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <>
                <Button type="submit" disabled={loading} className={`${step > 1 ? 'w-2/3' : 'w-full'} h-11 bg-primary`}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Complete Signup
                </Button>
                {step === totalSteps && (
                  <TurnstileWidget
                    onVerify={(token) => setTurnstileToken(token)}
                    resetKey={turnstileResetKey}
                  />
                )}
                </>
              )}
            </div>
          </form>

          {step === 1 && (
            <p className="text-xs text-muted-foreground text-center pt-4">
              By signing up you agree to our{" "}
              <Link href="/terms" className="underline hover:text-foreground">Terms</Link> and{" "}
              <Link href="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
            </p>
          )}
        </div>
      </main>

      <Dialog open={isOrgModalOpen} onOpenChange={setIsOrgModalOpen}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden">
          <DialogHeader className="p-6 border-b border-border">
            <DialogTitle>Organisation</DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">Organisation Name <span className="text-destructive">*</span></Label>
              <Input 
                value={tempOrgName} 
                onChange={(e) => setTempOrgName(e.target.value)} 
                placeholder="Enter your organisation name"
                className="h-11"
              />
            </div>
            
            <div className="space-y-3 p-4 border border-border rounded-lg bg-card/30">
              <Label className="text-sm font-medium">Existing Organizations</Label>
              <div className="flex flex-wrap gap-2">
                {dummyOrgs.map((org, idx) => (
                  <button 
                    key={idx} 
                    type="button"
                    onClick={() => {
                      setTempOrgName(org.name);
                      setTempOrgType(org.type);
                    }}
                    className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium bg-background hover:bg-accent transition-colors"
                  >
                    <span className="text-primary">{org.name}</span>
                    <span className="ml-2 text-[10px] text-muted-foreground bg-muted/50 px-1.5 rounded-sm">{org.type}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="flex items-center gap-1">Organisation type <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-2">
                {['Business School', 'Engineering College', 'Company', 'University', 'School', 'Others'].map(type => (
                  <label key={type} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input 
                      type="radio" 
                      name="tempOrgType" 
                      value={type} 
                      checked={tempOrgType === type} 
                      onChange={() => setTempOrgType(type)} 
                      className="accent-primary h-4 w-4" 
                    />
                    {type}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Organisation logo <span className="text-muted-foreground font-normal text-xs ml-2">(Optional)</span></Label>
              <div className="border-2 border-dashed border-border rounded-lg p-10 flex flex-col items-center justify-center text-center hover:bg-accent/30 transition-colors cursor-pointer text-muted-foreground hover:text-foreground">
                <UploadCloud className="h-10 w-10 mb-3 text-muted-foreground/50" />
                <span className="text-sm font-medium">Click here to upload a logo</span>
                <span className="text-xs mt-1 text-muted-foreground/70">If your organisation has a logo, you can upload it here. It will be displayed on your profile.</span>
              </div>
            </div>
          </div>
          
          <DialogFooter className="p-4 border-t border-border flex items-center justify-between sm:justify-between bg-muted/20">
            <Button variant="outline" onClick={() => setIsOrgModalOpen(false)}>Close</Button>
            <Button onClick={handleOrgSubmit} disabled={!tempOrgName || !tempOrgType}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupInner />
    </Suspense>
  );
}
