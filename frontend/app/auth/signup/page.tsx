"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  Trophy,
  User,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    const { error } = await authClient.signUp.email({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      callbackURL: "/dashboard",
    });
    setLoading(false);

    if (error) {
      setError(error.message || "Sign-up failed");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function onGithub() {
    setError(null);
    setLoading(true);
    const { error } = await authClient.signIn.social({
      provider: "github",
      callbackURL: "/dashboard",
    });
    if (error) {
      setError(error.message || "GitHub sign-up failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-[1.05fr_1fr] bg-background">
      {/* LEFT — Brand panel */}
      <aside
        className="hidden lg:flex relative overflow-hidden flex-col justify-between p-12 xl:p-16 bg-[radial-gradient(60%_60%_at_30%_20%,hsl(var(--primary)/0.18)_0%,transparent_60%),radial-gradient(40%_40%_at_80%_90%,hsl(var(--primary)/0.10)_0%,transparent_55%)]"
        data-testid="signup-brand-panel"
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_40px_-8px_hsl(var(--primary)/0.7)]">
            <Code2 className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">CodeSpectra</span>
        </div>

        <div className="relative space-y-8 max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 backdrop-blur px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            <span>Join 10,000+ developers leveling up</span>
          </div>

          <h1 className="text-4xl xl:text-5xl font-bold tracking-tight leading-[1.05]">
            Your code, graded.
            <br />
            <span className="text-primary">Your skills, ranked.</span>
          </h1>

          <p className="text-muted-foreground text-base leading-relaxed">
            Get a free CodeSpectra account: unlimited code scans, AI fixes, and access
            to the coding arena with real test cases across 40+ languages.
          </p>

          <div className="grid grid-cols-1 gap-3 text-sm">
            <Benefit text="Unlimited code quality scans on your repos" />
            <Benefit text="Daily coding challenges with real-time judging" />
            <Benefit text="Climb the leaderboard, earn ranks and badges" />
            <Benefit text="GitHub integration in two clicks" />
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2">
            <Stat label="Languages" value="40+" />
            <Stat label="Daily scans" value="180K" />
            <Stat label="Issues fixed" value="2.4M" />
          </div>
        </div>

        <div className="relative flex items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} CodeSpectra</span>
          <Link href="/" className="hover:text-foreground transition">
            ← Back to home
          </Link>
        </div>
      </aside>

      {/* RIGHT — Form */}
      <main className="flex items-center justify-center px-6 py-10 sm:px-12">
        <div className="w-full max-w-md space-y-7" data-testid="signup-card">
          <div className="lg:hidden flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Code2 className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold">CodeSpectra</span>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">Create your account</h2>
            <p className="text-sm text-muted-foreground">
              Already have one?{" "}
              <Link
                href="/auth/login"
                className="font-medium text-primary hover:underline"
                data-testid="login-link"
              >
                Sign in
              </Link>
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-11"
            onClick={onGithub}
            disabled={loading}
            data-testid="signup-github-button"
          >
            <Github className="mr-2 h-4 w-4" /> Sign up with GitHub
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider">
              <span className="bg-background px-3 text-muted-foreground">or use your email</span>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4" data-testid="signup-form">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-9 h-11"
                  data-testid="signup-name-input"
                />
              </div>
            </div>

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
                  data-testid="signup-email-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 h-11"
                  data-testid="signup-password-input"
                />
              </div>
              <p className="text-xs text-muted-foreground">Min 8 characters.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="pl-9 h-11"
                  data-testid="signup-confirm-input"
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                data-testid="signup-error"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 group"
              disabled={loading}
              data-testid="signup-submit-button"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account...
                </>
              ) : (
                <>
                  Create free account
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            By signing up you agree to our{" "}
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

function Benefit({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <CheckCircle2 className="h-5 w-5 mt-0.5 text-primary shrink-0" />
      <span className="text-foreground/85">{text}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 backdrop-blur px-4 py-3">
      <div className="flex items-center gap-1 text-2xl font-bold tracking-tight">
        <Trophy className="h-4 w-4 text-primary" />
        {value}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
