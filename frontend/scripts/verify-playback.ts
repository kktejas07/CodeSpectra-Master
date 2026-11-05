import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
async function main(){
  const { lessonVideoPlayback } = await import('@/lib/courses/lesson-mp4')
  const r = await lessonVideoPlayback('kubernetes-beginner','q-5a0a3a89-acb7-432b-8454-292ccbafb170')
  console.log('lesson1 playback ->', r ? `bytes=${r.bytes} mime=${(r as any).mime||''}` : 'NULL')
}
main().catch(e=>console.log('ERR',String(e).slice(0,150)))
