"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FaceCamera } from "@/components/auth/face-camera";
import { Button } from "@/components/ui/button";
import { Shield, AlertCircle, Loader2 } from "lucide-react";
import { Suspense, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { csrfFetch } from "@/lib/csrf-fetch";

function EnrollFaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const { user } = useAuth();

  const isMandatory = user?.createdAt 
    ? new Date().getTime() - new Date(user.createdAt).getTime() > 7 * 24 * 60 * 60 * 1000 
    : false;

  const handleCapture = useCallback(async (descriptor: Float32Array, imageBase64: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/auth/face-enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descriptor: Array.from(descriptor)
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(data.error || `Failed to save biometric template (${res.status}).`)
      }

      router.push(redirectTo);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
      setCameraKey((k) => k + 1);
    }
  }, [router, redirectTo]);

  const handleError = useCallback((err: Error) => setError(err.message), []);

  const handleSkip = () => {
    router.push(redirectTo);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div aria-hidden className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <main className="w-full max-w-md relative z-10 bg-card border border-border shadow-2xl rounded-2xl p-8 space-y-8">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Secure Your Account</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Enroll your face for passwordless login and secure identity verification during assessments.
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

        <div className="py-4">
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
