import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const uri = process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/?authSource=admin'
const client = new MongoClient(uri)

async function run() {
  await client.connect()
  const db = client.db('codespectra')
  const ebooks = await db.collection('ebooks').find({}).toArray()
  console.log('Ebooks in DB:', ebooks.map(e => ({ slug: e.slug, id: e.id, _id: e._id })))
  await client.close()
}
run().catch(console.error)
