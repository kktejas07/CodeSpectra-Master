"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, ScanFace } from "lucide-react";
import { safeRedirect } from "@/lib/safe-redirect";
import { Github } from "@/components/ui/brand-icons";
import { useAuth, getLastLogin } from "@/lib/auth-context";
import { FaceCamera } from "@/components/auth/face-camera";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { ThemeIllustration } from "@/components/landing/theme-illustration";
import {
  AuthShell,
  AuthHeading,
  AsideNote,
  Divider,
  Field,
  FormError,
  GoogleIcon,
  LastUsedBadge,
  PasswordField,
  PrimaryButton,
  SecondaryButton,
} from "@/components/auth/auth-shell";

type Mode = "password" | "sso" | "face";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get("redirectTo") || searchParams.get("redirect"));

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLogin, setLastLogin] = useState<{ method: string; at: string } | null>(null);
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [platformSettings, setPlatformSettings] = useState<{ enable_sso_login?: boolean }>({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  const { signInWithEmail, signInWithGoogle, signInWithGithub } = useAuth();

  useEffect(() => {
    const info = getLastLogin();
    if (info) setLastLogin(info);
    fetch("/api/platform/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) setPlatformSettings(data.settings);
      })
      .catch(console.error);
  }, []);

  const goTo = (m: Mode) => {
    setError(null);
    setMode(m);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmail(email.trim().toLowerCase(), password, totpCode || undefined, turnstileToken || undefined);
      router.push(redirectTo);
      router.refresh();
    } catch (err: unknown) {
      // Fresh captcha for the retry (tokens are single-use).
      setTurnstileToken(null);
      setTurnstileResetKey((k) => k + 1);
      if (err && typeof err === "object" && "twoFactorRequired" in err) {
        setTotpRequired(true);
        setError("Enter the 6-digit code from your authenticator app to finish signing in.");
      } else {
        setError(err instanceof Error ? err.message : "That email and password don’t match an account. Check both and try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "github") {
    setError(null);
    setLoading(true);
    try {
      await (provider === "google" ? signInWithGoogle() : signInWithGithub());
      router.push(redirectTo);
      router.refresh();
    } catch (err: unknown) {
      const name = provider === "google" ? "Google" : "GitHub";
      setError(err instanceof Error ? err.message : `${name} sign-in didn’t complete. Try again, or sign in with email.`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSso(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/sso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "SSO isn’t set up for this email domain. Ask your admin, or sign in with email.");
      if (data.redirect_url) window.location.href = data.redirect_url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "SSO sign-in failed.");
      setLoading(false);
    }
  }

  async function handleFaceLogin(descriptor: Float32Array | null) {
    setError(null);
    if (!descriptor) {
      setError("Your face wasn’t detected. Face the camera in good light and try again.");
      return;
    }
    if (!email) {
      setError("Enter your email first, then look at the camera.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/face-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), descriptor: Array.from(descriptor) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Face sign-in failed. Use your password instead.");
      router.push(redirectTo);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Face sign-in failed.");
      setLoading(false);
    }
  }

  const emailField = (
    <Field
      id="email"
      label={mode === "sso" ? "Work email" : "Email"}
      type="email"
      placeholder={mode === "sso" ? "you@company.com" : "you@example.com"}
      value={email}
      onChange={(e) => setEmail(e.target.value)}
      required
      autoComplete="email"
      autoFocus={!email}
    />
  );

  return (
    <AuthShell
      aside={
        <div className="space-y-10">
          <ThemeIllustration name="auth-visor" alt="The CodeSpectra visor mascot beside live test results: 12 of 12 tests passed, 42 minutes left, score 94" width={420} height={260} priority className="w-full max-w-[400px]" />
          <p className="cs-display max-w-[12ch] text-5xl xl:text-6xl">Your assessments, results and shortlists.</p>
          <div className="space-y-6">
            <AsideNote title="Taking an assessment?">
              Sign in with the email address your invite was sent to. No account yet? Open the invite link and it
              will take you to create one.
            </AsideNote>
            <AsideNote title="Signing in for your company or college?">
              {platformSettings.enable_sso_login
                ? "Use single sign-on if your organisation has it set up, or the email your admin invited."
                : "Use the email address your admin invited to your organisation’s workspace."}
            </AsideNote>
          </div>
        </div>
      }
    >
      <AuthHeading title={mode === "sso" ? "Sign in with SSO" : mode === "face" ? "Sign in with your face" : "Sign in"}>
        {mode === "password" ? (
          <>
            New to CodeSpectra?{" "}
            <Link href={`/auth/signup${redirectTo !== "/dashboard" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`} className="font-semibold text-cs-accent-text underline decoration-2 underline-offset-4">
              Create an account
            </Link>
          </>
        ) : mode === "sso" ? (
          "We’ll send you to your organisation’s sign-in page."
        ) : (
          "Works only if you enrolled your face after signing up."
        )}
      </AuthHeading>

      {error && <FormError>{error}</FormError>}

      {mode === "password" && (
        <>
          <form onSubmit={onSubmit} className="space-y-5" noValidate={false}>
            {emailField}
            <PasswordField
              id="password"
              label="Password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              labelAction={
                <Link href="/auth/forgot-password" className="text-sm font-medium text-cs-accent-text hover:underline">
                  Forgot password?
                </Link>
              }
            />
            {totpRequired && (
              <Field
                id="totp-code"
                label="Authenticator code"
                inputMode="numeric"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                autoComplete="one-time-code"
                autoFocus
                className="text-center text-xl tracking-[0.4em] tabular-nums"
              />
            )}
            <PrimaryButton type="submit" loading={loading}>
              Sign in
            </PrimaryButton>
            <TurnstileWidget onVerify={(token) => setTurnstileToken(token)} resetKey={turnstileResetKey} />
          </form>

          <Divider>or</Divider>

          <div className="grid grid-cols-2 gap-3">
            <SecondaryButton onClick={() => handleOAuth("google")} disabled={loading}>
              {lastLogin?.method === "google" && <LastUsedBadge />}
              <GoogleIcon />
              Google
            </SecondaryButton>
            <SecondaryButton onClick={() => handleOAuth("github")} disabled={loading}>
              {lastLogin?.method === "github" && <LastUsedBadge />}
              <Github className="h-5 w-5" />
              GitHub
            </SecondaryButton>
          </div>

          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-[15px]">
            {platformSettings.enable_sso_login && (
              <button type="button" onClick={() => goTo("sso")} className="relative inline-flex items-center gap-2 font-medium text-cs-ink-soft hover:text-cs-ink">
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Use single sign-on (SSO)
                {lastLogin?.method === "sso" && <span className="rounded-full bg-cs-mark px-2 text-xs font-semibold text-cs-accent-ink">Last used</span>}
              </button>
            )}
            <button type="button" onClick={() => goTo("face")} className="inline-flex items-center gap-2 font-medium text-cs-ink-soft hover:text-cs-ink">
              <ScanFace className="h-4 w-4" aria-hidden />
              Sign in with your face
            </button>
          </div>
        </>
      )}

      {mode === "sso" && (
        <form onSubmit={handleSso} className="space-y-5">
          {emailField}
          <PrimaryButton type="submit" loading={loading}>
            Continue to your organisation
          </PrimaryButton>
        </form>
      )}

      {mode === "face" && (
        <div className="space-y-5">
          {emailField}
          {email ? (
            <div className="overflow-hidden rounded-md border border-cs-grid">
              <FaceCamera mode="verify" onCapture={handleFaceLogin} onError={(err) => setError(err.message)} />
            </div>
          ) : (
            <p className="text-cs-ink-soft">Enter your email to turn on the camera.</p>
          )}
        </div>
      )}

      {mode !== "password" && (
        <button type="button" onClick={() => goTo("password")} className="mt-6 text-[15px] font-semibold text-cs-accent-text hover:underline">
          Sign in with a password instead
        </button>
      )}

      <p className="mt-10 text-sm text-cs-ink-soft">
        By signing in you agree to the{" "}
        <Link href="/terms" className="underline hover:text-cs-ink">Terms</Link> and{" "}
        <Link href="/privacy" className="underline hover:text-cs-ink">Privacy Policy</Link>.
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
