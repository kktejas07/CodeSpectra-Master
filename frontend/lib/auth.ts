import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { MongoClient } from "mongodb";

/**
 * Better Auth server instance for CodeSpectra.
 *
 * Phase 1 of the Supabase → MongoDB migration. This file is wired into the
 * catch-all route at `app/api/auth/[...all]/route.ts`. Existing Supabase auth
 * pages still work; new Better Auth endpoints live under `/api/auth/*`.
 *
 * Env required at runtime:
 *   - MONGODB_URI
 *   - MONGODB_DB_NAME            (optional, defaults to "codespectra")
 *   - BETTER_AUTH_SECRET         (openssl rand -base64 32)
 *   - NEXT_PUBLIC_APP_URL        (e.g. http://localhost:3000)
 *   - GITHUB_CLIENT_ID           (optional, enables GitHub OAuth)
 *   - GITHUB_CLIENT_SECRET       (optional)
 *
 * Note: `betterAuth({ database })` accepts a function that returns the
 * adapter, so we lazily build the MongoDB client on first auth request
 * rather than at module import time. This keeps `next build` working even
 * when MONGODB_URI is unset.
 */

const dbName = process.env.MONGODB_DB_NAME || "codespectra";

function buildAdapter() {
  // The MongoDB driver is lazy: constructing a MongoClient does not open a
  // TCP connection. So we always return a real adapter and let actual auth
  // calls fail at request time if the URI is bogus. This lets `next build`
  // configure Better Auth cleanly even when MONGODB_URI is empty.
  const uri = process.env.MONGODB_URI || "mongodb://placeholder:27017/codespectra";
  const client = new MongoClient(uri);
  const db = client.db(dbName);
  return mongodbAdapter(db);
}

// Cache the adapter so we don't rebuild on every request.
let _adapter: ReturnType<typeof mongodbAdapter> | undefined;
const databaseAdapter = ((options) => {
  if (!_adapter) {
    _adapter = buildAdapter();
  }
  return _adapter(options);
}) as ReturnType<typeof mongodbAdapter>;

const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  database: databaseAdapter,
  emailAndPassword: {
    enabled: true,
    revokeSessionsOnPasswordReset: true,
    minPasswordLength: 8,
  },
  socialProviders,
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
        required: false,
        input: false, // do not allow client to set role at signup
      },
      organizationId: {
        type: "string",
        required: false,
        input: false,
      },
      fullName: {
        type: "string",
        required: false,
        // mapped from signup's `name` field below
        input: false,
      },
      tenantId: {
        type: "string",
        required: false,
        input: false,
      },
      isActive: {
        type: "boolean",
        defaultValue: true,
        required: false,
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh session every 24h
  },
  advanced: {
    cookiePrefix: "codespectra",
  },
});

export type Auth = typeof auth;
