import { Db, MongoClient } from "mongodb";

/**
 * MongoDB client setup for CodeSpectra.
 *
 * Reads connection details from env:
 *   - MONGODB_URI        Full Atlas/local connection string
 *   - MONGODB_DB_NAME    Logical DB name (default: "codespectra")
 *
 * In development we cache the client promise on `globalThis` so HMR does not
 * open a new connection on every reload.
 */

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || "codespectra";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function buildClientPromise(): Promise<MongoClient> {
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not defined. Add it to .env.local before using MongoDB-backed features.",
    );
  }
  const client = new MongoClient(uri);
  return client.connect();
}

function getClientPromise(): Promise<MongoClient> {
  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = buildClientPromise();
    }
    return global._mongoClientPromise;
  }
  return buildClientPromise();
}

export async function getMongoClient(): Promise<MongoClient> {
  return getClientPromise();
}

export async function getMongoDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(dbName);
}

export const MONGODB_DB_NAME = dbName;
