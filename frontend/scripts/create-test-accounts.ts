import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'

const MONGODB_URI = 'mongodb://localhost:27017'
const DB_NAME = 'codespectra'

async function createAccounts() {
  const client = new MongoClient(MONGODB_URI)
  try {
    await client.connect()
    const db = client.db(DB_NAME)
    const users = db.collection('user')

    // 1. Judge Account
    const judgeEmail = 'test-judge@example.com'
    const judgeExists = await users.findOne({ email: judgeEmail })
    if (!judgeExists) {
      await users.insertOne({
        id: randomUUID(),
        email: judgeEmail,
        name: 'Test Judge',
        role: 'judge',
        created_at: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      })
      console.log('Created judge account:', judgeEmail)
    } else {
      console.log('Judge account already exists:', judgeEmail)
    }

    // 2. Tenant Admin Account
    const tenantEmail = 'test-tenant@example.com'
    const tenantExists = await users.findOne({ email: tenantEmail })
    if (!tenantExists) {
      await users.insertOne({
        id: randomUUID(),
        email: tenantEmail,
        name: 'Test Tenant Admin',
        role: 'tenant_admin',
        created_at: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      })
      console.log('Created tenant admin account:', tenantEmail)
    } else {
      console.log('Tenant account already exists:', tenantEmail)
    }

    // 3. User Account
    const userEmail = 'test-user@example.com'
    const userExists = await users.findOne({ email: userEmail })
    if (!userExists) {
      await users.insertOne({
        id: randomUUID(),
        email: userEmail,
        name: 'Test Regular User',
        role: 'user',
        created_at: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      })
      console.log('Created user account:', userEmail)
    } else {
      console.log('User account already exists:', userEmail)
    }

    console.log('\nAll test accounts verified/created.')
    console.log('NOTE: Since CodeSpectra uses Firebase/OTP auth in this environment, you can login to these accounts by typing their email and clicking the magic link or OTP sent to the console/email, depending on your auth setup.')

  } catch (error) {
    console.error('Error creating accounts:', error)
  } finally {
    await client.close()
  }
}

createAccounts()
