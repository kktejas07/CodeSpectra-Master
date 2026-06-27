"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  ArrowRight,
  Code2,
  Eye,
  EyeOff,
  Github,
  Loader2,
  Lock,
  Mail,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signInWithEmail, signInWithGithub } = useAuth();

  const devAccounts = [
    { role: "Superadmin", email: "superadmin@codespectra.com", password: "SuperAdmin123!" },
    { role: "Tenant admin", email: "admin@codespectra.com", password: "TenantAdmin123!" },
    { role: "User", email: "demo@codespectra.com", password: "DemoPass123!" },
    { role: "Recruiter", email: "recruiter@codespectra.com", password: "RecruiterPass123!" },
  ];

  async function handleDevLogin(accEmail: string, accPassword: string) {
    setError(null);
    setLoading(true);
    try {
      await signInWithEmail(accEmail, accPassword);
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Dev login failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signInWithEmail(email.trim().toLowerCase(), password);
      router.push(redirectTo);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid email or password";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleGithubSignIn() {
    setError(null);
    setLoading(true);
    try {
      await signInWithGithub();
      router.push(redirectTo);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "GitHub sign-in failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-[1.05fr_1fr] bg-background">
      {/* Brand panel — visible on lg+ */}
      <aside className="hidden lg:flex relative overflow-hidden flex-col justify-between p-12 xl:p-16 bg-[radial-gradient(60%_60%_at_30%_20%,hsl(var(--primary)/0.18)_0%,transparent_60%),radial-gradient(40%_40%_at_80%_90%,hsl(var(--primary)/0.10)_0%,transparent_55%)]">
        <div aria-hidden className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_40px_-8px_hsl(var(--primary)/0.7)]">
            <Terminal className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">CodeSpectra</span>
        </div>
        <div className="relative space-y-8 max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 backdrop-blur px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            Code quality + competitive coding, one platform
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold tracking-tight leading-[1.05]">
            Ship cleaner code.<br />
            <span className="text-primary">Win the competition.</span>
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            CodeSpectra fuses SonarQube-grade static analysis with a HackerRank-style arena. Scan, fix, and compete — all in one workspace.
          </p>
          <div className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Zap className="h-4 w-4" />
              </span>
              <span className="text-foreground/85">AI fix suggestions on every issue</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Terminal className="h-4 w-4" />
              </span>
              <span className="text-foreground/85">40+ languages, real test cases, live judging</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Code2 className="h-4 w-4" />
              </span>
              <span className="text-foreground/85">Quality gates that block bad pushes</span>
            </div>
          </div>
        </div>
        <div className="relative flex items-center justify-between text-xs text-muted-foreground">
          <span>&copy; 2026 CodeSpectra</span>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-foreground transition">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition">Terms</Link>
          </div>
        </div>
      </aside>

      {/* Login form */}
      <main className="flex items-center justify-center px-6 py-10 sm:px-12">
        <div className="w-full max-w-md space-y-7">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Terminal className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold">CodeSpectra</span>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">Sign in to your account</h2>
            <p className="text-sm text-muted-foreground">
              New to CodeSpectra?{" "}
              <Link href="/auth/signup" className="font-medium text-primary hover:underline">Create an account</Link>
            </p>
          </div>

          <Button
            variant="outline"
            onClick={handleGithubSignIn}
            disabled={loading}
            className="w-full h-11"
          >
            <Github className="mr-2 h-4 w-4" />
            Continue with GitHub
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider">
              <span className="bg-background px-3 text-muted-foreground">or sign in with email</span>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-destructive/10 text-destructive text-sm rounded-lg p-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 h-11"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/auth/forgot-password"
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-10 h-11"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={keepSignedIn}
                onChange={(e) => setKeepSignedIn(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="text-muted-foreground">Keep me signed in</span>
            </label>

            <Button type="submit" disabled={loading} className="w-full h-11 group">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Sign in
              {!loading && <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
            </Button>
          </form>

          {/* Dev quick login — always visible */}
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
            <p className="mb-2 font-semibold uppercase tracking-wider text-muted-foreground">Dev quick login</p>
            <div className="flex flex-wrap gap-2">
              {devAccounts.map((acc) => (
                <button
                  key={acc.role}
                  type="button"
                  onClick={() => handleDevLogin(acc.email, acc.password)}
                  disabled={loading}
                  className="rounded border border-border/80 bg-background px-2 py-1 transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {acc.role}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">Click a role to fill credentials, then press <em>Sign in</em>.</p>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            By signing in you agree to our{" "}
            <Link href="/terms" className="underline hover:text-foreground">Terms</Link> and{" "}
            <Link href="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
