import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { MongoClient } from "mongodb";

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
