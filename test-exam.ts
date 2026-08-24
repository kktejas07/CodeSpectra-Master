import { getMongoDb } from './frontend/lib/mongodb';

async function main() {
  try {
    const db = await getMongoDb();
    
    // Let's find the submissions for the user or just all submissions to see the exam_id
    const submissions = await db.collection('exam_submissions').find().limit(5).toArray();
    console.log("Submissions:");
    submissions.forEach(s => console.log(`ID: ${s.id}, exam_id: ${s.exam_id}, user_id: ${s.user_id}`));
    
    const exams = await db.collection('exams').find().limit(5).toArray();
    console.log("\nExams:");
    exams.forEach(e => console.log(`ID: ${e.id}, _id: ${e._id}, title: ${e.title}`));

  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

main();
