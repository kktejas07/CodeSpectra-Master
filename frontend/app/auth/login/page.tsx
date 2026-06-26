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
  CheckCircle2,
  Code2,
  Github,
  Loader2,
  Lock,
  Mail,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await authClient.signIn.email({
      email: email.trim().toLowerCase(),
      password,
      rememberMe,
      callbackURL: redirectTo,
    });

    setLoading(false);
    if (error) {
      setError(error.message || "Invalid email or password");
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  async function onGithub() {
    setError(null);
    setLoading(true);
    const { error } = await authClient.signIn.social({
      provider: "github",
      callbackURL: redirectTo,
    });
    if (error) {
      setError(error.message || "GitHub sign-in failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-[1.05fr_1fr] bg-background">
      {/* LEFT — Brand panel */}
      <aside
        className="hidden lg:flex relative overflow-hidden flex-col justify-between p-12 xl:p-16 bg-[radial-gradient(60%_60%_at_30%_20%,hsl(var(--primary)/0.18)_0%,transparent_60%),radial-gradient(40%_40%_at_80%_90%,hsl(var(--primary)/0.10)_0%,transparent_55%)]"
        data-testid="login-brand-panel"
      >
        {/* Grid overlay */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_40px_-8px_hsl(var(--primary)/0.7)]">
            <Code2 className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">CodeSpectra</span>
        </div>

        {/* Hero text */}
        <div className="relative space-y-8 max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 backdrop-blur px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            <span>Code quality + competitive coding, one platform</span>
          </div>

          <h1 className="text-4xl xl:text-5xl font-bold tracking-tight leading-[1.05]">
            Ship cleaner code.
            <br />
            <span className="text-primary">Win the competition.</span>
          </h1>

          <p className="text-muted-foreground text-base leading-relaxed">
            CodeSpectra fuses SonarQube-grade static analysis with a HackerRank-style
            arena. Scan, fix, and compete — all in one workspace.
          </p>

          <div className="grid grid-cols-1 gap-3 text-sm">
            <Feature icon={<Zap className="h-4 w-4" />} text="AI fix suggestions on every issue" />
            <Feature
              icon={<Terminal className="h-4 w-4" />}
              text="40+ languages, real test cases, live judging"
            />
            <Feature
              icon={<CheckCircle2 className="h-4 w-4" />}
              text="Quality gates that block bad pushes"
            />
          </div>

          {/* Code preview card */}
          <div
            className="relative rounded-xl border border-border bg-card/70 backdrop-blur p-4 shadow-2xl"
            data-testid="login-code-preview"
          >
            <div className="flex items-center gap-2 pb-3 border-b border-border">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
              <span className="ml-3 text-xs text-muted-foreground font-mono">analysis.ts</span>
            </div>
            <pre className="pt-3 text-xs leading-relaxed font-mono text-foreground/85 overflow-hidden">
              <span className="text-muted-foreground">{"// "}1 bug, 2 smells found</span>
              {"\n"}
              <span className="text-primary">function</span>{" "}
              <span className="text-foreground">analyze</span>(<span className="text-muted-foreground">code</span>) {"{"}
              {"\n  "}
              <span className="text-primary">if</span> (code == null) {"{"}
              {"\n    "}
              <span className="text-foreground/60">{"// 🟢 use === instead"}</span>
              {"\n  "}
              {"}"}
              {"\n  "}
              <span className="text-primary">return</span>{" "}
              <span className="text-foreground">runQualityGate</span>(code)
              {"\n"}
              {"}"}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="relative flex items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} CodeSpectra</span>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-foreground transition">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground transition">
              Terms
            </Link>
          </div>
        </div>
      </aside>

      {/* RIGHT — Form */}
      <main className="flex items-center justify-center px-6 py-10 sm:px-12">
        <div className="w-full max-w-md space-y-7" data-testid="login-card">
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
              <Link
                href="/auth/signup"
                className="font-medium text-primary hover:underline"
                data-testid="signup-link"
              >
                Create an account
              </Link>
            </p>
          </div>

          {/* GitHub button (top) */}
          <Button
            type="button"
            variant="outline"
            className="w-full h-11"
            onClick={onGithub}
            disabled={loading}
            data-testid="login-github-button"
          >
            <Github className="mr-2 h-4 w-4" /> Continue with GitHub
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider">
              <span className="bg-background px-3 text-muted-foreground">or sign in with email</span>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 h-11"
                  data-testid="login-email-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/auth/forgot-password"
                  className="text-xs text-primary hover:underline"
                  data-testid="forgot-password-link"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 h-11"
                  data-testid="login-password-input"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
                data-testid="login-remember-checkbox"
              />
              <span className="text-muted-foreground">Keep me signed in</span>
            </label>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                data-testid="login-error"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 group"
              disabled={loading}
              data-testid="login-submit-button"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </form>

          {/* Dev-mode quick-login picker — only shown in non-prod or with the
              ?dev=1 query parameter. Helps QA flip between roles fast. */}
          {(process.env.NODE_ENV !== 'production' ||
            searchParams.get('dev') === '1') && (
            <div
              className="mt-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs"
              data-testid="dev-quick-login"
            >
              <p className="mb-2 font-semibold uppercase tracking-wider text-muted-foreground">
                Dev quick login
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { role: 'Superadmin', email: 'qa@codespectra.dev', password: 'QApass123!' },
                  { role: 'Tenant admin', email: 'tenant@codespectra.dev', password: 'CodeSpectra@2026' },
                  { role: 'User', email: 'user@codespectra.dev', password: 'CodeSpectra@2026' },
                  { role: 'Recruiter', email: 'recruiter@codespectra.dev', password: 'CodeSpectra@2026' },
                ].map((c) => (
                  <button
                    key={c.email}
                    type="button"
                    onClick={() => {
                      setEmail(c.email)
                      setPassword(c.password)
                    }}
                    className="rounded border border-border/80 bg-background px-2 py-1 transition-colors hover:border-primary hover:text-primary"
                    data-testid={`dev-quick-login-${c.role.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {c.role}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Click a role to fill credentials, then press <em>Sign in</em>.
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            By signing in you agree to our{" "}
            <Link href="/terms" className="underline hover:text-foreground">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
        {icon}
      </span>
      <span className="text-foreground/85">{text}</span>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
