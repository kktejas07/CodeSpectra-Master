import { MongoClient } from 'mongodb';
import * as fs from 'node:fs'
import * as path from 'node:path'

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)$/)
      if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  }
}
loadEnv()

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("No MONGODB_URI");
  console.log(`Connecting to ${uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')} …`)
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || 'codespectra');
  const res = await db.collection('security_blocklist').deleteMany({});
  console.log('Unblocked IPs from security_blocklist:', res.deletedCount);
  await client.close();
}
run();
