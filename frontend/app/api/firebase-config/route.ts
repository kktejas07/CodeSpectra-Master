import { NextResponse } from 'next/server'
import { readServerSecrets } from '@/lib/server-secrets-cache'

export async function GET() {
  const secrets = await readServerSecrets()
  const config: Record<string, string | undefined> = {
    apiKey: secrets.firebase_api_key,
    authDomain: secrets.firebase_auth_domain,
    projectId: secrets.firebase_project_id,
    storageBucket: secrets.firebase_storage_bucket,
    messagingSenderId: secrets.firebase_messaging_sender_id,
    appId: secrets.firebase_app_id,
  }
  const missing = Object.entries(config).filter(([, v]) => !v)
  if (missing.length > 0) {
    return NextResponse.json(null, { status: 204 })
  }
  return NextResponse.json(config)
}
