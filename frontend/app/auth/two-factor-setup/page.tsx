"use client";

/**
 * Required 2FA for admins (audit A-041). The proxy page gate sends a
 * superadmin / tenant admin here once their grace period is over
 * (lib/admin-2fa.ts); they set up an authenticator app and go back.
 * Anyone can open it to turn 2FA on.
 */
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Illustration } from "@/components/illustrations/spot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { csrfFetch } from "@/lib/csrf-fetch";
import { safeRedirect } from "@/lib/safe-redirect";

type Policy = { status: "ok" } | { status: "grace"; daysLeft: number } | { status: "required" };

function TwoFactorSetupInner() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = safeRedirect(params.get("redirectTo"));
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [policy, setPolicy] = useState<Policy>({ status: "ok" });
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/user/2fa/status", { credentials: "include" })
      .then(async (r) => {
        if (r.status === 401) { setSignedIn(false); return; }
        const j = await r.json().catch(() => ({}));
        setEnabled(j.enabled === true);
        if (j.policy) setPolicy(j.policy);
      })
      .catch(() => setError("We couldn’t check your account. Refresh to try again."))
      .finally(() => setLoading(false));
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/user/2fa/setup", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.otpauth) throw new Error(j.error || "Couldn’t start setup. Try again.");
      const QRCode = await import("qrcode");
      setQr(await QRCode.toDataURL(j.otpauth, { width: 200, margin: 2 }));
      setSecret(j.secret);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t start setup. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/user/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code.replace(/\s/g, "") }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || "That code didn’t work. Try the newest code in your app.");
      setEnabled(true);
      router.replace(redirectTo);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn’t work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell aside={<Illustration name="security" className="mx-auto w-72" />}>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Turn on two-factor sign-in</h1>
          <p className="text-sm text-muted-foreground">
            {policy.status === "required"
              ? "Admin accounts must use an authenticator app. Set it up to keep using the dashboard."
              : policy.status === "grace"
                ? `Admin accounts must use an authenticator app. You have ${policy.daysLeft} day${policy.daysLeft === 1 ? "" : "s"} left to set it up.`
                : "Protect your account with a code from an authenticator app (Google Authenticator, 1Password, Authy…)."}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Checking your account…</div>
        ) : !signedIn ? (
          <Button asChild className="w-full rounded-lg"><Link href={`/auth/login?redirectTo=${encodeURIComponent("/auth/two-factor-setup")}`}>Sign in first</Link></Button>
        ) : enabled ? (
          <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400"><ShieldCheck className="h-4 w-4" /> Two-factor sign-in is on.</p>
            <Button className="w-full rounded-lg" onClick={() => router.replace(redirectTo)}>Continue</Button>
          </div>
        ) : !qr ? (
          <Button className="h-11 w-full rounded-lg" onClick={() => void start()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}
            Set up authenticator app
          </Button>
        ) : (
          <form onSubmit={verify} className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Scan this code with your authenticator app, then enter the 6-digit code it shows.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code for your authenticator app" className="mx-auto h-48 w-48 rounded-lg bg-white p-2" />
            <p className="text-center text-xs text-muted-foreground">Can’t scan? Enter this key: <span className="font-mono break-all text-foreground">{secret}</span></p>
            <div className="space-y-1.5">
              <Label htmlFor="totp-code">6-digit code</Label>
              <Input id="totp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <Button type="submit" className="h-11 w-full rounded-lg" disabled={busy || code.replace(/\s/g, "").length !== 6}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}
              Turn on
            </Button>
          </form>
        )}

        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </div>
    </AuthShell>
  );
}

export default function TwoFactorSetupPage() {
  return (
    <Suspense fallback={null}>
      <TwoFactorSetupInner />
    </Suspense>
  );
}
