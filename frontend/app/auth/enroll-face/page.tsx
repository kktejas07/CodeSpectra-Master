"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeRedirect } from "@/lib/safe-redirect";
import Link from "next/link";
import { FaceCamera } from "@/components/auth/face-camera";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";
import { Suspense, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { csrfFetch } from "@/lib/csrf-fetch";
import { SoftGlow } from "@/components/visuals";
import { Scene } from "@/components/illustrations/scenes";

function EnrollFaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get("redirect"));
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  // Replacing an existing face scan needs a re-auth (password or authenticator code).
  const [reauth, setReauth] = useState<{ password: boolean; totp: boolean } | null>(null);
  const [reauthSecret, setReauthSecret] = useState("");
  const [pendingDescriptor, setPendingDescriptor] = useState<number[] | null>(null);
  const { user } = useAuth();

  const isMandatory = user?.createdAt 
    ? new Date().getTime() - new Date(user.createdAt).getTime() > 7 * 24 * 60 * 60 * 1000 
    : false;

  const submit = useCallback(async (descriptor: number[], secret?: string) => {
    setLoading(true);
    setError(null);
    try {
      const extra: Record<string, string> = {};
      if (secret) {
        if (/^\d{6}$/.test(secret) && reauth?.totp) extra.code = secret;
        else extra.password = secret;
      }
      const res = await csrfFetch("/api/auth/face-enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descriptor, ...extra }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { error?: string; reauthRequired?: boolean; methods?: { password: boolean; totp: boolean } }));
        if (data.reauthRequired) {
          setPendingDescriptor(descriptor);
          setReauth(data.methods || { password: false, totp: false });
          setReauthSecret("");
          setError(data.error || "Confirm it’s you to replace your face scan.");
          setLoading(false);
          return;
        }
        throw new Error(data.error || `Your face scan couldn’t be saved (${res.status}).`);
      }

      router.push(redirectTo);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
      setPendingDescriptor(null);
      setReauth(null);
      setCameraKey((k) => k + 1);
    }
  }, [router, redirectTo, reauth]);

  const handleCapture = useCallback(async (descriptor: Float32Array | null) => {
    if (!descriptor) {
      setError("Your face wasn’t detected. Try again in good light.");
      return;
    }
    await submit(Array.from(descriptor));
  }, [submit]);

  const handleError = useCallback((err: Error) => setError(err.message), []);

  const handleSkip = () => {
    router.push(redirectTo);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-background relative isolate overflow-hidden">
      {/* Background decoration */}
      <div aria-hidden className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
      <SoftGlow />

      <main className="w-full max-w-md relative z-10 bg-card border border-border shadow-sm dark:shadow-none rounded-3xl p-8 space-y-8">
        <div className="flex flex-col items-center text-center space-y-4">
          <Scene name="proctored-test" className="w-full max-w-[200px] sm:max-w-[280px]" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Secure your account</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Enroll your face to verify your identity during assessments. Face sign-in also needs two-step verification.
            </p>
            {isMandatory && (
              <div className="mt-4 flex items-center gap-2 bg-yellow-500/10 text-yellow-600 text-sm rounded-lg p-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>The 7-day grace period has expired. Face enrollment is now mandatory to continue.</span>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-destructive/10 text-destructive text-sm rounded-lg p-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {reauth && pendingDescriptor && (reauth.password || reauth.totp) && (
          <form
            className="space-y-3"
            onSubmit={(e) => { e.preventDefault(); if (reauthSecret) void submit(pendingDescriptor, reauthSecret); }}
          >
            <Label htmlFor="reauth-secret">
              {reauth.password && reauth.totp ? "Password or authenticator code" : reauth.password ? "Password" : "Authenticator code"}
            </Label>
            <Input
              id="reauth-secret"
              type={reauth.password ? "password" : "text"}
              inputMode={reauth.password ? undefined : "numeric"}
              autoComplete={reauth.password ? "current-password" : "one-time-code"}
              value={reauthSecret}
              onChange={(e) => setReauthSecret(e.target.value)}
              autoFocus
            />
            <Button type="submit" className="w-full" disabled={loading || !reauthSecret}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm and save"}
            </Button>
          </form>
        )}

        <div className={reauth && pendingDescriptor ? "hidden" : "py-4"}>
          <FaceCamera
            key={cameraKey}
            mode="enroll"
            onCapture={handleCapture}
            onError={handleError}
          />
        </div>

        <div className="space-y-4 pt-4 border-t border-border">
          <p className="text-xs text-center text-muted-foreground">
            Your biometric data is encrypted and securely stored. We do not store raw images or video.
          </p>
          <div className="flex flex-col gap-2">
            {!isMandatory && (
              <Button 
                variant="ghost" 
                onClick={handleSkip} 
                disabled={loading}
                className="text-muted-foreground"
              >
                Skip for now
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function EnrollFacePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <EnrollFaceInner />
    </Suspense>
  );
}
