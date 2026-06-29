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
  const { signInWithEmail, signInWithGoogle, signInWithGithub } = useAuth();

  const devAccounts = [
    { role: "Superadmin", email: "superadmin@codespectra.com", password: "SuperAdmin123!" },
    { role: "Tenant admin", email: "admin@codespectra.com", password: "TenantAdmin123!" },
    { role: "User", email: "demo@codespectra.com", password: "DemoPass123!" },
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

  async function handleGoogleSignIn() {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      router.push(redirectTo);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
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
            <Code2 className="h-5 w-5" />
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
            AI-powered static analysis meets competitive coding challenges. Scan, fix, and compete — all in one workspace.
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
          {/* Code preview card */}
          <div className="relative rounded-xl border border-border bg-card/70 backdrop-blur p-4 shadow-2xl">
            <div className="flex items-center gap-2 pb-3 border-b border-border">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
              <span className="ml-3 text-xs text-muted-foreground font-mono">analysis.ts</span>
            </div>
            <pre className="pt-3 text-xs leading-relaxed font-mono text-foreground/85 overflow-hidden">
              <span className="text-muted-foreground">// 1 bug, 2 smells found</span>
              {"\n"}
              <span className="text-primary">function</span> <span className="text-foreground">analyze</span>(<span className="text-muted-foreground">code</span>) {"{"}
              {"\n"}
              {"  "}<span className="text-primary">if</span> (code == null) {"{"}
              {"\n"}
              {"    "}<span className="text-foreground/60">// 🟢 use === instead</span>
              {"\n"}
              {"  }"}
              {"\n"}
              {"  "}<span className="text-primary">return</span> <span className="text-foreground">runQualityGate</span>(code)
              {"\n"}
              {"}"}
            </pre>
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
              <Code2 className="h-5 w-5" />
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

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full h-11 gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </Button>
            <Button
              variant="outline"
              onClick={handleGithubSignIn}
              disabled={loading}
              className="w-full h-11 gap-2"
            >
              <Github className="w-5 h-5" />
              GitHub
            </Button>
          </div>

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
