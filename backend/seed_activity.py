import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta
import random

MONGO_URL = "mongodb://admin:password@mongo:27017/?authSource=admin"
DB_NAME = "codespectra"

async def seed():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # Get superadmin
    admin = await db.users.find_one({"email": "superadmin@codespectra.com"})
    if not admin:
        print("Superadmin not found! Finding any user...")
        admin = await db.users.find_one({})
        if not admin:
            print("No users found in database! Creating superadmin...")
            import uuid
            admin = {
                "id": str(uuid.uuid4()),
                "email": "superadmin@codespectra.com",
                "name": "Super Admin",
                "role": "superadmin",
                "points": 0
            }
            await db.users.insert_one(admin)
    
    admin_id = admin.get("id")
    if not admin_id:
        print("Superadmin doesn't have an string 'id' field, using _id string")
        admin_id = str(admin.get("_id"))
    
    # Clear old mock submissions to prevent infinite buildup
    await db.submissions.delete_many({"user_id": admin_id, "problem_id": "mock_problem"})
    
    # Generate submissions for the past 60 days
    submissions_col = db.submissions
    
    submissions = []
    now = datetime.utcnow()
    for _ in range(150):
        # Random day in the last 60 days
        days_ago = random.randint(0, 60)
        # Random hour/min
        hours = random.randint(0, 23)
        mins = random.randint(0, 59)
        submit_time = now - timedelta(days=days_ago, hours=hours, minutes=mins)
        
        submissions.append({
            "user_id": admin_id,
            "problem_id": "mock_problem",
            "status": "Accepted",
            "created_at": submit_time.isoformat() + "Z"
        })
    
    if submissions:
        await submissions_col.insert_many(submissions)
        print(f"Seeded {len(submissions)} submissions for {admin['email']}!")

    # Now create some users with points for the leaderboard
    # Check if they exist first
    users_to_seed = [
        {"email": "aniket@example.com", "name": "Aniket", "points": 142975},
        {"email": "prakash@example.com", "name": "Prakash", "points": 143137},
        {"email": "purbayon@example.com", "name": "Purbayon", "points": 139425},
        {"email": "jane@example.com", "name": "Jane", "points": 110000},
    ]

    for u in users_to_seed:
        existing = await db.users.find_one({"email": u["email"]})
        if not existing:
            import uuid
            new_id = str(uuid.uuid4())
            await db.users.insert_one({
                "id": new_id,
                "email": u["email"],
                "name": u["name"],
                "points": u["points"],
                "role": "user",
                "created_at": now.isoformat() + "Z"
            })
            print(f"Created user {u['name']} with {u['points']} points")
        else:
            await db.users.update_one({"email": u["email"]}, {"$set": {"points": u["points"], "name": u["name"]}})
            print(f"Updated points for user {u['name']}")

    # Also give the superadmin some points
    await db.users.update_one({"email": "superadmin@codespectra.com"}, {"$set": {"points": 120500}})
    print("Updated superadmin points to 120500")

if __name__ == "__main__":
    asyncio.run(seed())
