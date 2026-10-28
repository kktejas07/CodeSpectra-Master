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
import { useT } from "@/lib/i18n/client";
import type { Translator } from "@/lib/i18n/catalog";
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
function loginErrorMessage(code: string | null, t: Translator): string | null {
  if (!code) return null;
  switch (code) {
    case "sso_idp_error":
      return t("auth.ssoIdpError");
    case "sso_missing_code":
    case "sso_invalid_state":
      return t("auth.ssoExpired");
    case "sso_provider_not_found":
    case "sso_unsupported_provider_type":
      return t("auth.ssoUnavailable");
    case "sso_discovery_failed":
    case "sso_bad_discovery":
    case "sso_token_exchange_failed":
    case "sso_token_exchange_error":
    case "sso_userinfo_failed":
    case "sso_userinfo_error":
      return t("auth.ssoUnreachable");
    case "sso_no_email":
    case "sso_email_unverified":
      return t("auth.ssoNoEmail");
    case "sso_domain_mismatch":
      return t("auth.ssoDomainMismatch");
    case "sso_account_disabled":
      return t("auth.accountDisabled");
    case "sso_maintenance":
      return t("auth.maintenance");
    case "sso_registration_closed":
      return t("auth.registrationClosed");
    case "access_denied":
      return t("auth.signInCancelled");
    default:
      return code.startsWith("sso_") ? t("auth.ssoIncomplete") : t("auth.signInIncomplete");
  }
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get("redirectTo") || searchParams.get("redirect"));
  const { t, rich } = useT();

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    () => loginErrorMessage(searchParams.get("error"), t) || (searchParams.get("verify_error") ? t("auth.verifyLinkInvalid") : null),
  );
  const notice =
    searchParams.get("verified") === "true"
      ? t("auth.emailVerified")
      : searchParams.get("verify_sent") === "1"
        ? t("auth.accountCreatedVerify")
      : searchParams.get("expired") === "1"
        ? t("auth.sessionEnded")
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
        throw new Error(data.error || t("auth.codeDidNotWork"));
      }
      router.push(safeRedirect(data.redirect || redirectTo));
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("auth.codeDidNotWork"));
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
        setError(t("auth.enterTotpToFinish"));
      } else {
        setError(err instanceof Error ? err.message : t("auth.badCredentials"));
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
      setError(err instanceof Error ? err.message : t("auth.oauthIncomplete", { provider: name }));
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
      if (!res.ok) throw new Error(data.error || t("auth.ssoNotSetUp"));
      if (data.redirect_url) window.location.href = data.redirect_url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("auth.ssoFailed"));
      setLoading(false);
    }
  }

  async function handleFaceLogin(result: LivenessCapture) {
    setError(null);
    if (!email) {
      setError(t("auth.faceEnterEmailFirst"));
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
      if (!res.ok) throw new Error(data.error || t("auth.faceFailed"));
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
      setError(err instanceof Error ? err.message : t("auth.faceFailed"));
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
        throw new Error(data.error || t("auth.codeDidNotWork"));
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
      setError(err instanceof Error ? err.message : t("auth.codeDidNotWork"));
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
        throw new Error(data.error || t("auth.resendFailed"));
      }
      setEmailCode("");
      setEmailCodeNotice(t("auth.newCodeSent"));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("auth.resendFailed"));
    } finally {
      setLoading(false);
    }
  }

  const emailField = (
    <Field
      id="email"
      label={mode === "sso" ? t("auth.workEmail") : t("auth.email")}
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
          <p className="cs-display max-w-[18ch] text-4xl">{t("auth.loginAsideHeadline")}</p>
          <div className="space-y-6">
            <AsideNote title={t("auth.asideAssessmentTitle")}>
              {t("auth.asideAssessmentBody")}
            </AsideNote>
            <AsideNote title={t("auth.asideOrgTitle")}>
              {platformSettings.enable_sso_login ? t("auth.asideOrgBodySso") : t("auth.asideOrgBody")}
            </AsideNote>
          </div>
        </div>
      }
    >
      <AuthHeading title={mode === "sso" ? t("auth.signInWithSso") : mode === "face" ? t("auth.signInWithFace") : t("auth.signIn")}>
        {mode === "password" ? (
          <>
            {t("auth.newToCodeSpectra")}{" "}
            <Link href={`/auth/signup${redirectTo !== "/dashboard" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`} className="font-semibold text-cs-accent-text underline decoration-2 underline-offset-4">
              {t("auth.createAccount")}
            </Link>
          </>
        ) : mode === "sso" ? (
          t("auth.ssoHeadingHint")
        ) : (
          t("auth.faceHeadingHint")
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
              ? t("auth.faceRecognised")
              : pendingSecondFactor === "oauth"
                ? t("auth.oauthConfirmed")
                : t("auth.orgSignedIn")}{" "}
            {t("auth.enterTotpToFinishShort")}
          </p>
          <Field
            id="pending-totp-code"
            label={t("auth.authenticatorCode")}
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
            {t("auth.verifyAndSignIn")}
          </PrimaryButton>
        </form>
      )}

      {!pendingSecondFactor && mode === "password" && (
        <>
          <form onSubmit={onSubmit} className="space-y-5" noValidate={false}>
            {emailField}
            <PasswordField
              id="password"
              label={t("auth.password")}
              placeholder={t("auth.passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              labelAction={
                <Link href="/auth/forgot-password" className="text-sm font-medium text-cs-accent-text hover:underline">
                  {t("auth.forgotPassword")}
                </Link>
              }
            />
            {totpRequired && (
              <Field
                id="totp-code"
                label={t("auth.authenticatorCode")}
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
              {t("auth.signIn")}
            </PrimaryButton>
            <TurnstileWidget onVerify={(token) => setTurnstileToken(token)} resetKey={turnstileResetKey} />
          </form>

          <Divider>{t("auth.or")}</Divider>

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
                {t("auth.useSso")}
                {lastLogin?.method === "sso" && <span className="rounded-full bg-cs-mark px-2 text-xs font-semibold text-cs-accent-ink">{t("auth.lastUsed")}</span>}
              </button>
            )}
            <button type="button" onClick={() => goTo("face")} className="inline-flex items-center gap-2 font-medium text-cs-ink-soft hover:text-cs-ink">
              <ScanFace className="h-4 w-4" aria-hidden />
              {t("auth.signInWithFace")}
            </button>
          </div>
        </>
      )}

      {!pendingSecondFactor && mode === "sso" && (
        <form onSubmit={handleSso} className="space-y-5">
          {emailField}
          <PrimaryButton type="submit" loading={loading}>
            {t("auth.continueToOrg")}
          </PrimaryButton>
        </form>
      )}

      {!pendingSecondFactor && mode === "face" && emailCodePending && (
        <form onSubmit={handleEmailCode} className="space-y-5">
          <p className="text-cs-ink-soft">
            {rich("auth.faceNewDeviceCode", { email: <span className="font-semibold text-cs-ink">{email.trim().toLowerCase()}</span> })}
          </p>
          {emailCodeNotice && (
            <p role="status" className="rounded-md border border-cs-grid px-4 py-3 text-[15px] text-cs-ink-soft">
              {emailCodeNotice}
            </p>
          )}
          <Field
            id="face-email-code"
            label={t("auth.codeFromEmail")}
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
            {t("auth.verifyAndSignIn")}
          </PrimaryButton>
          <button
            type="button"
            onClick={() => void resendEmailCode()}
            disabled={loading}
            className="text-[15px] font-medium text-cs-ink-soft hover:text-cs-ink disabled:opacity-50"
          >
            {t("auth.sendNewCode")}
          </button>
          <p className="text-sm text-cs-ink-soft">{t("auth.rememberDevice")}</p>
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
            <p className="text-cs-ink-soft">{t("auth.enterEmailForCamera")}</p>
          )}
          <p className="text-sm text-cs-ink-soft">
            {t("auth.livenessHint")}
          </p>
        </div>
      )}

      {(mode !== "password" || pendingSecondFactor) && (
        <button type="button" onClick={() => goTo("password")} className="mt-6 text-[15px] font-semibold text-cs-accent-text hover:underline">
          {t("auth.usePasswordInstead")}
        </button>
      )}

      <p className="mt-10 text-sm text-cs-ink-soft">
        {rich("auth.agreeSignIn", {
          terms: <Link href="/terms" className="underline hover:text-cs-ink">{t("auth.terms")}</Link>,
          privacy: <Link href="/privacy" className="underline hover:text-cs-ink">{t("auth.privacyPolicy")}</Link>,
        })}
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
