import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = "mongodb://admin:password@mongo:27017/?authSource=admin"
DB_NAME = "codespectra"

async def populate():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db["learning_courses"]

    courses = [
        {
            "id": "cpp-dsa",
            "title": "C++ DSA",
            "description": "This course is a complete, structured journey to master Data Structures & Algorithms.",
            "tags": ["CPP"],
            "rating": 4.5,
            "duration": "13",
            "students": 66350,
            "thumbnail": "/courses/cpp.jpg",
            "sections": [
                {
                    "title": "Introduction to C++ & Arrays",
                    "slug": "intro-arrays",
                    "lessons": [
                        {
                            "id": "l1",
                            "title": "Getting Started with C++",
                            "slug": "getting-started",
                            "description": "Learn the basics of C++ syntax, variables, and loops.",
                            "content": "Welcome to C++! In this lesson, we cover variables, data types, and basic I/O.\n\n```cpp\n#include <iostream>\nusing namespace std;\nint main() {\n  cout << \"Hello World!\";\n  return 0;\n}\n```",
                            "resources": [
                                {
                                    "title": "C++ Full Course",
                                    "url": "https://www.youtube.com/watch?v=vLnPwxZdW4Y",
                                    "embed_url": "https://www.youtube.com/embed/vLnPwxZdW4Y",
                                    "provider": "youtube"
                                }
                            ]
                        }
                    ]
                }
            ]
        },
        {
            "id": "os-mastery",
            "title": "Operating System (OS)",
            "description": "This course is designed to help you build strong foundations in OS concepts.",
            "tags": ["Software Tools"],
            "rating": 4.5,
            "duration": "6",
            "students": 66350,
            "thumbnail": "/courses/os.jpg",
            "sections": [
                {
                    "title": "Processes & Threads",
                    "slug": "processes-threads",
                    "lessons": [
                        {
                            "id": "l1",
                            "title": "What is an Operating System?",
                            "slug": "what-is-os",
                            "description": "An introduction to OS concepts.",
                            "content": "An OS is a software that manages computer hardware and software resources.",
                            "resources": [
                                {
                                    "title": "OS Crash Course",
                                    "embed_url": "https://www.youtube.com/embed/mXw9ruZaxzQ",
                                    "provider": "youtube"
                                }
                            ]
                        }
                    ]
                }
            ]
        },
        {
            "id": "web-dev",
            "title": "Full Stack Web Development",
            "description": "Master frontend and backend web development from scratch.",
            "tags": ["Web Dev"],
            "rating": 4.8,
            "duration": "24",
            "students": 120000,
            "thumbnail": "/courses/web.jpg",
            "sections": [
                {
                    "title": "Frontend Basics",
                    "slug": "frontend-basics",
                    "lessons": [
                        {
                            "id": "l1",
                            "title": "HTML & CSS Crash Course",
                            "slug": "html-css",
                            "description": "Learn how to build responsive web layouts.",
                            "content": "HTML provides structure, while CSS styles it.",
                            "resources": [
                                {
                                    "title": "Web Dev Full Course",
                                    "embed_url": "https://www.youtube.com/embed/nu_pCVPKzTk",
                                    "provider": "youtube"
                                }
                            ]
                        }
                    ]
                }
            ]
        },
        {
            "id": "python-ai",
            "title": "Python for AI & ML",
            "description": "Learn Python programming specifically tailored for Artificial Intelligence and Machine Learning applications.",
            "tags": ["Coding"],
            "rating": 4.9,
            "duration": "18",
            "students": 85000,
            "thumbnail": "/courses/python.jpg",
            "sections": [
                {
                    "title": "Python Fundamentals",
                    "slug": "python-fundamentals",
                    "lessons": [
                        {
                            "id": "l1",
                            "title": "Introduction to Python",
                            "slug": "intro-python",
                            "description": "Start coding in Python.",
                            "content": "Python is a versatile language, perfect for AI.",
                            "resources": [
                                {
                                    "title": "Python for Beginners",
                                    "embed_url": "https://www.youtube.com/embed/rfscVS0vtbw",
                                    "provider": "youtube"
                                }
                            ]
                        }
                    ]
                }
            ]
        },
        {
            "id": "system-design",
            "title": "System Design Interview",
            "description": "A comprehensive guide to cracking system design interviews at top tech companies.",
            "tags": ["Management"],
            "rating": 4.7,
            "duration": "10",
            "students": 45200,
            "thumbnail": "/courses/system.jpg",
            "sections": [
                {
                    "title": "Scalability",
                    "slug": "scalability",
                    "lessons": [
                        {
                            "id": "l1",
                            "title": "Vertical vs Horizontal Scaling",
                            "slug": "scaling",
                            "description": "Learn the difference between scaling up and scaling out.",
                            "content": "Vertical scaling means adding more power to your existing machine, while horizontal scaling means adding more machines.",
                            "resources": [
                                {
                                    "title": "System Design Basics",
                                    "embed_url": "https://www.youtube.com/embed/bBTPZ9NdSk8",
                                    "provider": "youtube"
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    ]

    for c in courses:
        # Upsert by id
        await collection.update_one({"id": c["id"]}, {"$set": c}, upsert=True)
        print(f"Upserted course: {c['title']}")

    print("Courses populated successfully!")
    client.close()

if __name__ == "__main__":
    asyncio.run(populate())
