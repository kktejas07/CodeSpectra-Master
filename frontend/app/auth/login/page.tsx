"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, ScanFace } from "lucide-react";
import { safeRedirect } from "@/lib/safe-redirect";
import { csrfFetch } from "@/lib/csrf-fetch";
import { Github } from "@/components/ui/brand-icons";
import { useAuth, getLastLogin } from "@/lib/auth-context";
import { FaceCamera, type LivenessCapture } from "@/components/auth/face-camera";
import { pickLivenessChallenge, type LivenessChallenge } from "@/lib/auth-face-liveness";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { DeviceShowcase } from "@/components/visuals";
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

/** Plain-language text for the `?error=` codes the SSO / OAuth callbacks send back. */
function loginErrorMessage(code: string | null): string | null {
  if (!code) return null;
  switch (code) {
    case "sso_idp_error":
      return "Your organisation’s sign-in page reported a problem. Try again, or ask your admin.";
    case "sso_missing_code":
    case "sso_invalid_state":
      return "Your single sign-on attempt expired or was started in another tab. Start again from this page.";
    case "sso_provider_not_found":
    case "sso_unsupported_provider_type":
      return "Single sign-on isn’t available for your organisation right now. Sign in with email, or ask your admin.";
    case "sso_discovery_failed":
    case "sso_bad_discovery":
    case "sso_token_exchange_failed":
    case "sso_token_exchange_error":
    case "sso_userinfo_failed":
    case "sso_userinfo_error":
      return "We couldn’t reach your organisation’s sign-in service. Try again in a few minutes.";
    case "sso_no_email":
    case "sso_email_unverified":
      return "Your organisation didn’t share a verified email address with us. Ask your admin to check the single sign-on setup.";
    case "sso_domain_mismatch":
      return "That account’s email isn’t on a domain your organisation’s single sign-on covers. Use your work account, or sign in with email.";
    case "sso_account_disabled":
      return "This account has been deactivated. Contact your administrator.";
    case "access_denied":
      return "Sign-in was cancelled. Choose a sign-in method to try again.";
    default:
      return code.startsWith("sso_")
        ? "Single sign-on didn’t complete. Try again, or sign in with email."
        : "Sign-in didn’t complete. Try again, or use another sign-in method.";
  }
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get("redirectTo") || searchParams.get("redirect"));

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    () => loginErrorMessage(searchParams.get("error")) || (searchParams.get("verify_error") ? "That verification link is invalid or has expired. Sign in and send a new one from Settings." : null),
  );
  const notice =
    searchParams.get("verified") === "true"
      ? "Your email is verified. Sign in to continue."
      : searchParams.get("expired") === "1"
        ? "Your session ended. Sign in again to continue."
        : null;
  // First factor passed with face or SSO; the server holds a 5-minute pending
  // sign-in until the authenticator code is entered (POST /api/auth/two-factor).
  const [pendingSecondFactor, setPendingSecondFactor] = useState<"face" | "sso" | "oauth" | null>(() => {
    const tf = searchParams.get("twofactor");
    return tf === "sso" || tf === "oauth" ? tf : null;
  });
  const [lastLogin, setLastLogin] = useState<{ method: string; at: string } | null>(null);
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [platformSettings, setPlatformSettings] = useState<{ enable_sso_login?: boolean }>({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  // Face sign-in: a fresh random challenge per attempt (remounts the camera),
  // and the emailed-code step for a device this account hasn't trusted yet.
  const [faceChallenge, setFaceChallenge] = useState<LivenessChallenge | null>(null);
  const [faceAttempt, setFaceAttempt] = useState(0);
  const [emailCodePending, setEmailCodePending] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeNotice, setEmailCodeNotice] = useState<string | null>(null);

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

  const newFaceAttempt = () => {
    setFaceChallenge(pickLivenessChallenge());
    setFaceAttempt((n) => n + 1);
  };

  const goTo = (m: Mode) => {
    setError(null);
    setPendingSecondFactor(null);
    setTotpCode("");
    setEmailCodePending(false);
    setEmailCode("");
    setEmailCodeNotice(null);
    if (m === "face") newFaceAttempt();
    setMode(m);
  };

  async function handleSecondFactor(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await csrfFetch("/api/auth/two-factor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totpToken: totpCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.expired) {
          setPendingSecondFactor(null);
          setTotpCode("");
        }
        throw new Error(data.error || "That code didn’t work. Try again.");
      }
      router.push(safeRedirect(data.redirect || redirectTo));
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "That code didn’t work. Try again.");
      setLoading(false);
    }
  }

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
      if (err && typeof err === "object" && "twoFactorRequired" in err) {
        setTotpCode("");
        setPendingSecondFactor("oauth");
        return;
      }
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
      const res = await csrfFetch("/api/auth/sso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), redirect: redirectTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "SSO isn’t set up for this email domain. Ask your admin, or sign in with email.");
      if (data.redirect_url) window.location.href = data.redirect_url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "SSO sign-in failed.");
      setLoading(false);
    }
  }

  async function handleFaceLogin(result: LivenessCapture) {
    setError(null);
    if (!email) {
      setError("Enter your email first, then look at the camera.");
      newFaceAttempt();
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/face-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          descriptors: result.descriptors.map((d) => Array.from(d)),
          liveness: { challenge: result.challenge, passed: result.passed },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Face sign-in didn’t work. Try again, or use your password.");
      if (data.emailCodeRequired) {
        setEmailCode("");
        setEmailCodeNotice(null);
        setEmailCodePending(true);
        setLoading(false);
        return;
      }
      if (data.twoFactorRequired) {
        setTotpCode("");
        setPendingSecondFactor("face");
        setLoading(false);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Face sign-in didn’t work. Try again, or use your password.");
      newFaceAttempt();
      setLoading(false);
    }
  }

  async function handleEmailCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEmailCodeNotice(null);
    setLoading(true);
    try {
      const res = await csrfFetch("/api/auth/face-email-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: emailCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.expired) {
          setEmailCodePending(false);
          setEmailCode("");
          newFaceAttempt();
        }
        throw new Error(data.error || "That code didn’t work. Try again.");
      }
      if (data.twoFactorRequired) {
        setEmailCodePending(false);
        setTotpCode("");
        setPendingSecondFactor("face");
        setLoading(false);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "That code didn’t work. Try again.");
      setLoading(false);
    }
  }

  async function resendEmailCode() {
    setError(null);
    setEmailCodeNotice(null);
    setLoading(true);
    try {
      const res = await csrfFetch("/api/auth/face-email-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resend: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.expired) {
          setEmailCodePending(false);
          newFaceAttempt();
        }
        throw new Error(data.error || "We couldn’t send a new code. Try again in a minute.");
      }
      setEmailCode("");
      setEmailCodeNotice("We sent a new code. Earlier codes no longer work.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "We couldn’t send a new code. Try again in a minute.");
    } finally {
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
        <div className="space-y-8">
          <DeviceShowcase variant="candidate" compact className="mx-0 max-w-[360px]" />
          <p className="cs-display max-w-[18ch] text-4xl">Your assessments, results and shortlists.</p>
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
          "Works if you’ve enrolled your face in your account settings."
        )}
      </AuthHeading>

      {notice && !error && (
        <p role="status" className="mb-5 rounded-md border border-cs-grid px-4 py-3 text-[15px] text-cs-ink-soft">
          {notice}
        </p>
      )}
      {error && <FormError>{error}</FormError>}

      {pendingSecondFactor && (
        <form onSubmit={handleSecondFactor} className="space-y-5">
          <p className="text-cs-ink-soft">
            {pendingSecondFactor === "face"
              ? "Face recognised."
              : pendingSecondFactor === "oauth"
                ? "Your Google or GitHub account is confirmed."
                : "Your organisation signed you in."}{" "}
            Enter the 6-digit code
            from your authenticator app to finish.
          </p>
          <Field
            id="pending-totp-code"
            label="Authenticator code"
            inputMode="numeric"
            maxLength={6}
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            autoComplete="one-time-code"
            autoFocus
            required
            className="text-center text-xl tracking-[0.4em] tabular-nums"
          />
          <PrimaryButton type="submit" loading={loading} disabled={totpCode.length !== 6}>
            Verify and sign in
          </PrimaryButton>
        </form>
      )}

      {!pendingSecondFactor && mode === "password" && (
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

      {!pendingSecondFactor && mode === "sso" && (
        <form onSubmit={handleSso} className="space-y-5">
          {emailField}
          <PrimaryButton type="submit" loading={loading}>
            Continue to your organisation
          </PrimaryButton>
        </form>
      )}

      {!pendingSecondFactor && mode === "face" && emailCodePending && (
        <form onSubmit={handleEmailCode} className="space-y-5">
          <p className="text-cs-ink-soft">
            Face recognised. This is a new device, so we emailed a 6-digit code to{" "}
            <span className="font-semibold text-cs-ink">{email.trim().toLowerCase()}</span>. It expires in 10 minutes.
          </p>
          {emailCodeNotice && (
            <p role="status" className="rounded-md border border-cs-grid px-4 py-3 text-[15px] text-cs-ink-soft">
              {emailCodeNotice}
            </p>
          )}
          <Field
            id="face-email-code"
            label="Code from your email"
            inputMode="numeric"
            maxLength={6}
            value={emailCode}
            onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            autoComplete="one-time-code"
            autoFocus
            required
            className="text-center text-xl tracking-[0.4em] tabular-nums"
          />
          <PrimaryButton type="submit" loading={loading} disabled={emailCode.length !== 6}>
            Verify and sign in
          </PrimaryButton>
          <button
            type="button"
            onClick={() => void resendEmailCode()}
            disabled={loading}
            className="text-[15px] font-medium text-cs-ink-soft hover:text-cs-ink disabled:opacity-50"
          >
            Send a new code
          </button>
          <p className="text-sm text-cs-ink-soft">After this, we’ll remember this device for face sign-in.</p>
        </form>
      )}

      {!pendingSecondFactor && mode === "face" && !emailCodePending && (
        <div className="space-y-5">
          {emailField}
          {email && faceChallenge ? (
            <div className="overflow-hidden rounded-md border border-cs-grid">
              <FaceCamera
                key={faceAttempt}
                mode="verify"
                livenessChallenge={faceChallenge}
                onCapture={() => {}}
                onLivenessCapture={(r) => void handleFaceLogin(r)}
                onError={(err) => setError(err.message)}
              />
            </div>
          ) : (
            <p className="text-cs-ink-soft">Enter your email to turn on the camera.</p>
          )}
          <p className="text-sm text-cs-ink-soft">
            We’ll ask you to blink or turn your head to check it’s really you. On a new device we’ll also email you a code.
          </p>
        </div>
      )}

      {(mode !== "password" || pendingSecondFactor) && (
        <button type="button" onClick={() => goTo("password")} className="mt-6 text-[15px] font-semibold text-cs-accent-text hover:underline">
          Sign in with a password instead
        </button>
      )}

      <p className="mt-10 text-sm text-cs-ink-soft">
        By signing in you agree to the{" "}
        <Link href="/terms" className="underline hover:text-cs-ink">terms</Link> and{" "}
        <Link href="/privacy" className="underline hover:text-cs-ink">privacy policy</Link>.
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
