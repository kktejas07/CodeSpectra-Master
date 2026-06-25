"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "./auth";

/**
 * Better Auth React client for CodeSpectra.
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
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
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
