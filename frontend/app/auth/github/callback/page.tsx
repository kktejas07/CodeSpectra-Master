"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Legacy GitHub OAuth callback page.
 *
 * Better Auth handles the GitHub OAuth callback at `/api/auth/callback/github`
 * and redirects directly to `callbackURL` (e.g. /dashboard). This page exists
 * only so any stale GitHub OAuth app still pointing at `/auth/github/callback`
 * gets a friendly redirect rather than a 404.
 *
 * Update your GitHub OAuth app's "Authorization callback URL" to point to:
 *     {APP_URL}/api/auth/callback/github
 */
function GitHubCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      router.replace(`/auth/login?error=${encodeURIComponent(error)}`);
    } else {
      router.replace("/dashboard");
    }
  }, [router, searchParams]);

  return (
    <div
      className="flex items-center gap-3 text-sm text-muted-foreground"
      data-testid="github-callback-loading"
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Completing GitHub sign-in...</span>
    </div>
  );
}

export default function GitHubCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Suspense
        fallback={
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading...</span>
          </div>
        }
      >
        <GitHubCallbackInner />
      </Suspense>
    </div>
  );
}
