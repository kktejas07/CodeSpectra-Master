import { MongoClient } from 'mongodb'
async function run() {
  const c = new MongoClient('mongodb://localhost:27017')
  await c.connect()
  const db = c.db('codespectra')
  const course = await db.collection('courses').findOne({ id: 'cpp-dsa' })
  if (!course) return
  const lesson = course.sections[0].lessons[0]
  console.log("Lesson type:", lesson.videoType)
  console.log("Has script?", !!lesson.script)
  console.log("URL:", lesson.url)
  await c.close()
}
run()
