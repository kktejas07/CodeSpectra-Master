import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
async function main() {
  const { renderAndStoreLessonMp4 } = await import('@/lib/courses/render-mp4')
  const t0 = Date.now()
  const script = [{
    id: 's1', type: 'title' as const, title: 'Hello', content: ['A tiny 3-second clip'],
    spokenText: 'This is a quick render smoke test.', durationInFrames: 90,
  }]
  const out = await renderAndStoreLessonMp4({ courseId: 'smoke', lessonId: 'smoke', script, videoMinutes: 1 })
  console.log('RENDER OK in', ((Date.now() - t0) / 1000).toFixed(0) + 's ->', JSON.stringify(out))
}
main().then(() => process.exit(0)).catch(e => { console.log('RENDER FAIL:', (e as Error).message?.slice(0, 200)); process.exit(1) })
