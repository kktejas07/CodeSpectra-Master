import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

/**
 * Catch-all route for Better Auth.
 *
 * Mounts every Better Auth endpoint under /api/auth/* :
 *   - POST /api/auth/sign-up/email
 *   - POST /api/auth/sign-in/email
 *   - POST /api/auth/sign-out
 *   - GET  /api/auth/get-session
 *   - POST /api/auth/forget-password
 *   - POST /api/auth/reset-password
 *   - GET  /api/auth/sign-in/social/github  → redirects to GitHub
 *   - GET  /api/auth/callback/github
 *
 * The existing Supabase routes in this app live elsewhere; they are untouched
 * by this handler so the rest of the app keeps working during migration.
 */
export const { GET, POST } = toNextJsHandler(auth);
