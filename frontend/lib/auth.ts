import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { MongoClient } from "mongodb";
import { readTrustedOrigins } from "./server-secrets-cache";

const dbName = process.env.MONGODB_DB_NAME || "codespectra";

const CLIENT_OPTS = {
  serverSelectionTimeoutMS: 6000,
  connectTimeoutMS: 6000,
  socketTimeoutMS: 30000,
  maxPoolSize: 20,
  retryWrites: true,
};

function buildAdapter() {
  const uri =
    process.env.MONGODB_URI || "mongodb://placeholder:27017/codespectra";
  const client = new MongoClient(uri, CLIENT_OPTS);
  const db = client.db(dbName);
  return mongodbAdapter(db);
}

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
  // Accept Origin headers from any of these domains. The external preview
  // domain changes per env so we include the wildcard `*.emergentagent.com`
  // pattern via the explicit list below — Better Auth performs an exact
  // origin match.
  // Trusted origins resolver — runs per request. Sources:
  //   1. Static defaults (localhost, hard-coded preview, NEXT_PUBLIC_APP_URL)
  //   2. BETTER_AUTH_TRUSTED_ORIGINS env (comma-separated)
  //   3. MongoDB `platform_settings.secrets.trusted_origins_extra` (admin-managed)
  //   4. *.preview.emergentagent.com and *.preview.emergentcf.cloud — Emergent
  //      preview environments rotate hostnames between deploys, so we accept
  //      any cluster URL coming from the request's Origin header that matches
  //      one of the known patterns.
  // Trailing slashes are stripped; only http/https origins are accepted.
  trustedOrigins: async (request: Request): Promise<string[]> => {
    const staticOrigins = [
      "http://localhost:3000",
      "https://codespectra-master.preview.emergentagent.com",
      ...(process.env.NEXT_PUBLIC_APP_URL ? [process.env.NEXT_PUBLIC_APP_URL] : []),
      ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS
        ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : []),
    ];

    // Auto-trust any Emergent preview hostname coming from the request itself.
    // This avoids a re-deploy every time the preview URL rotates.
    const PREVIEW_HOST_RE = /\.preview\.(emergentagent\.com|emergentcf\.cloud)$/i;
    const auto: string[] = [];
    try {
      const originHeader = request.headers.get("origin");
      if (originHeader) {
        const u = new URL(originHeader);
        if (PREVIEW_HOST_RE.test(u.hostname)) auto.push(u.origin);
      }
      const fwdHost =
        request.headers.get("x-forwarded-host") || request.headers.get("host");
      const fwdProto =
        request.headers.get("x-forwarded-proto") ||
        (fwdHost?.includes("localhost") ? "http" : "https");
      if (fwdHost && PREVIEW_HOST_RE.test(fwdHost)) {
        auto.push(`${fwdProto}://${fwdHost}`);
      }
    } catch {
      /* malformed Origin header — ignore */
    }

    let dynamic: string[] = [];
    try {
      dynamic = await readTrustedOrigins();
    } catch {
      /* If DB read fails, fall back to static list only (don't break auth). */
    }
    return [...staticOrigins, ...auto, ...dynamic].map((o) =>
      o.replace(/\/+$/, ""),
    );
  },
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
