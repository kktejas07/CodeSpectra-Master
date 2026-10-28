"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  ArrowLeft,
  Code2,
  Loader2,
  Mail,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { SoftGlow } from "@/components/visuals";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { Illustration } from "@/components/illustrations/spot";
import { useT } from "@/lib/i18n/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const { sendPasswordReset } = useAuth();
  const { t } = useT();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await sendPasswordReset(email.trim().toLowerCase(), turnstileToken || undefined);
      setSent(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("auth.resetSendFailed");
      setError(msg);
      setTurnstileResetKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
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
          <h1 className="text-2xl font-bold tracking-tight">{t("auth.resetYourPassword")}</h1>
          <p className="text-muted-foreground mt-2">
            {sent ? t("auth.checkEmailForReset") : t("auth.enterEmailForReset")}
          </p>
        </div>

        <div className="bg-card border border-border/40 rounded-xl p-6">
          {sent ? (
            <div className="text-center space-y-4">
              <Illustration name="inbox" className="mx-auto w-40" />
              <p className="text-sm text-muted-foreground">
                {t("auth.resetSentBody")}
              </p>
              <Button variant="outline" asChild className="mt-4">
                <Link href="/auth/login">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {t("auth.backToSignIn")}
                </Link>
              </Button>
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
                <Label htmlFor="email">{t("auth.email")}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full gap-2 h-11">
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                {loading ? t("auth.sending") : t("auth.sendResetLink")}
              </Button>
              <TurnstileWidget
                onVerify={(token) => setTurnstileToken(token)}
                resetKey={turnstileResetKey}
              />
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
