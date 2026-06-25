"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, Loader2, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("idle");
    setMessage(null);
    setLoading(true);

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/reset-password`
        : "/auth/reset-password";

    const { error } = await authClient.forgetPassword({
      email: email.trim().toLowerCase(),
      redirectTo,
    });

    setLoading(false);

    if (error) {
      // Reveal nothing about whether the email exists.
      setStatus("success");
      setMessage(
        "If an account exists for that email, a password reset link has been sent.",
      );
      return;
    }
    setStatus("success");
    setMessage(
      "If an account exists for that email, a password reset link has been sent.",
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6" data-testid="forgot-password-card">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Forgot password?</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" data-testid="forgot-password-form">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9"
                data-testid="forgot-password-email-input"
              />
            </div>
          </div>

          {status === "success" && message && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400"
              data-testid="forgot-password-success"
            >
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{message}</span>
            </div>
          )}
          {status === "error" && message && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              data-testid="forgot-password-error"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{message}</span>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
            data-testid="forgot-password-submit-button"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...
              </>
            ) : (
              "Send reset link"
            )}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link
            href="/auth/login"
            className="font-medium text-primary hover:underline"
            data-testid="back-to-login-link"
          >
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
