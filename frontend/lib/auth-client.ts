"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "./auth";

/**
 * Better Auth React client for CodeSpectra.
 *
 * IMPORTANT: We deliberately do NOT pass a `baseURL`. Better Auth then uses
 * `window.location.origin` at request time, so the same browser bundle works
 * from localhost AND the external preview URL. Hard-coding NEXT_PUBLIC_APP_URL
 * caused "TypeError: Failed to fetch" when the user opened the app via the
 * Emergent preview domain because the client tried to POST to localhost:3000.
 *
 * Uses `inferAdditionalFields<typeof auth>()` so the `role` and
 * `organizationId` fields we added on the server are type-safe on the client.
 *
 * Hooks:
 *   - authClient.useSession()
 * Methods:
 *   - authClient.signUp.email({ email, password, name })
 *   - authClient.signIn.email({ email, password, rememberMe })
 *   - authClient.signIn.social({ provider: "github", callbackURL })
 *   - authClient.signOut()
 *   - authClient.forgetPassword({ email, redirectTo })
 *   - authClient.resetPassword({ newPassword, token })
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  forgetPassword,
  resetPassword,
} = authClient;
