import { Db, MongoClient } from "mongodb";

/**
 * MongoDB client setup for CodeSpectra.
 *
 * Env:
 *   - MONGODB_URI            Primary connection string (Atlas SRV recommended)
 *   - MONGODB_URI_FALLBACK   Optional fallback (e.g. mongodb://localhost:27017)
 *   - MONGODB_DB_NAME        Logical DB name (default: "codespectra")
 *
 * If the primary URI fails (e.g. Atlas IP allowlist not yet configured) we
 * automatically fall back to the secondary URI and log the swap. Subsequent
 * requests use the cached working client.
 */

const uri = process.env.MONGODB_URI;
const uriFallback = process.env.MONGODB_URI_FALLBACK;
const dbName = process.env.MONGODB_DB_NAME || "codespectra";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var _mongoActiveUri: string | undefined;
}

const CLIENT_OPTS = {
  serverSelectionTimeoutMS: 6000,
  connectTimeoutMS: 6000,
  socketTimeoutMS: 30000,
  maxPoolSize: 20,
  retryWrites: true,
};

async function connect(targetUri: string): Promise<MongoClient> {
  const client = new MongoClient(targetUri, CLIENT_OPTS);
  await client.connect();
  // Sanity ping
  await client.db(dbName).command({ ping: 1 });
  return client;
}

async function buildClient(): Promise<MongoClient> {
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not defined. Add it to .env.local before using MongoDB-backed features.",
    );
  }
  try {
    const c = await connect(uri);
    global._mongoActiveUri = uri;
    return c;
  } catch (e) {
    if (uriFallback) {
      console.warn(
        `[mongodb] primary connection failed (${(e as Error).message.slice(0, 80)}), falling back to MONGODB_URI_FALLBACK`,
      );
      const c = await connect(uriFallback);
      global._mongoActiveUri = uriFallback;
      return c;
    }
    throw e;
  }
}

function getClientPromise(): Promise<MongoClient> {
  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = buildClient().catch((err) => {
        global._mongoClientPromise = undefined;
        throw err;
      });
    }
    return global._mongoClientPromise;
  }
  return buildClient();
}

export async function getMongoClient(): Promise<MongoClient> {
  return getClientPromise();
}

export async function getMongoDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(dbName);
}

export const MONGODB_DB_NAME = dbName;
