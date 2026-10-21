"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  ArrowLeft,
  Code2,
  Loader2,
  Lock,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { SoftGlow } from "@/components/visuals";
import { Illustration } from "@/components/illustrations/spot";
import { useT } from "@/lib/i18n/client";

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get("oobCode") || searchParams.get("code");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { confirmPasswordReset } = useAuth();
  const { t } = useT();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t("auth.passwordsDontMatch"));
      return;
    }

    if (!oobCode) {
      setError(t("auth.resetCodeMissing"));
      return;
    }

    setLoading(true);

    try {
      await confirmPasswordReset(oobCode, password);
      setSuccess(true);
      setTimeout(() => router.push("/auth/login"), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("auth.resetFailed");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (!oobCode) {
    return (
      <div className="relative isolate min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4 py-12">
      <SoftGlow />
        <div className="w-full max-w-md space-y-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Code2 className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg tracking-tight">CodeSpectra</span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{t("auth.invalidResetLink")}</h1>
          <p className="text-muted-foreground">{t("auth.resetLinkExpired")}</p>
          <Button variant="outline" asChild>
            <Link href="/auth/forgot-password">{t("auth.requestNewResetLink")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4 py-12">
      <SoftGlow />
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Code2 className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg tracking-tight">CodeSpectra</span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{t("auth.setNewPassword")}</h1>
          <p className="text-muted-foreground mt-2">{t("auth.enterNewPasswordBelow")}</p>
        </div>

        <div className="bg-card border border-border/40 rounded-xl p-6">
          {success ? (
            <div className="text-center space-y-4">
              <Illustration name="success" className="mx-auto w-40" />
              <p className="text-sm text-muted-foreground">{t("auth.resetSuccess")}</p>
              <p className="text-xs text-muted-foreground">{t("auth.redirectingToSignIn")}</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              {error && (
                <div role="alert" className="flex items-center gap-2 bg-destructive/10 text-destructive text-sm rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.newPassword")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <PasswordInput
                    id="password"
                    placeholder={t("auth.passwordHint", { min: 8 })}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t("auth.confirmNewPassword")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <PasswordInput
                    id="confirmPassword"
                    placeholder={t("auth.repeatPassword")}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full gap-2 h-11">
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                {loading ? t("auth.resetting") : t("auth.resetPassword")}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-sm">
          <Link
            href="/auth/login"
            className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            {t("auth.backToSignIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
