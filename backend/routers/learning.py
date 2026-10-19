"""
AI Course Factory — adaptive assessment endpoints for learning.

Generates remedial content when learners struggle with topics.
"""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from core.ai_endpoints import prime_endpoint_allowlist
from core.auth import require_auth, require_internal_secret
from core.dependencies import check_rate_limit, client_ip

# SEC-001/SEC-002: /internal/* is service-to-service only — the Next.js app
# authenticates the user and calls us with x-internal-secret.
router = APIRouter(
    prefix="/internal/learning",
    tags=["learning-adaptive"],
    dependencies=[Depends(require_internal_secret), Depends(prime_endpoint_allowlist)],
)

from models.ai import GenerateCourseReq
from services.ai import handle_generate_course, parse_json_response
from ai_client import UserMessage, TextDelta, StreamDone
from core.dependencies import build_chat


@router.get("/providers/search")
async def search_content_providers(
    request: Request,
    q: str = "",
    provider: str = "auto",
    limit: int = 5,
    auth=Depends(require_auth),
) -> Dict[str, Any]:
    """Search the Content Provider Layer for legitimate educational resources.

    Provider values: auto (YouTube if keyed, then PeerTube), peertube, youtube.
    Returns normalized VideoResource records with embed URLs + license metadata
    so the frontend can embed (never re-host) them.
    """
    await check_rate_limit(f"provider-search:{client_ip(request)}", 60, 60)
    if not q.strip():
        return {"ok": True, "results": []}

    from services.content_providers import search_videos, search_videos_by_provider

    query = q.strip()
    if provider in ("peertube", "youtube"):
        results = await search_videos_by_provider(query, provider, limit=limit)
    else:
        results = await search_videos(query, limit=limit)
    return {"ok": True, "results": [r.to_dict() for r in results]}


@router.get("/courses")
async def list_courses(
    auth=Depends(require_auth),
) -> Dict[str, Any]:
    """List persisted learning courses (AI-generated + any imported)."""
    from core.database import get_database

    db = await get_database()
    cursor = db["learning_courses"].find({}).sort("created_at", -1).limit(200)
    docs = await cursor.to_list(length=200)
    courses = []
    for d in docs:
        d["id"] = d.get("id") or str(d.get("_id", ""))
        courses.append(d)
    return {"ok": True, "data": courses}


@router.get("/courses/{course_id}")
async def get_course(
    course_id: str,
    auth=Depends(require_auth),
) -> Dict[str, Any]:
    """Get a single learning course by id."""
    from core.database import get_database

    db = await get_database()
    course = await db["learning_courses"].find_one({"id": course_id})
    if not course:
        return {"ok": False, "error": "Course not found"}
    course["id"] = course.get("id") or course_id
    return {"ok": True, "data": course}


@router.post("/adaptive/remedial")
async def generate_remedial(
    request: Request,
    req: Dict[str, Any],
    auth=Depends(require_auth)
) -> Dict[str, Any]:
    """Generate remedial lesson and assessment for a weak topic."""
    await check_rate_limit(f"remedial:{auth.user.id if hasattr(auth, 'user') else 'anon'}", 10, 60)

    topic = req.get("topic", "")
    technology = req.get("technology", "")
    level = req.get("level", "Beginner")
    weak_areas = req.get("weak_areas", [])
    previous_score = req.get("previous_score", 0)

    system = (
        "You are an adaptive learning tutor. Generate a targeted remedial lesson "
        "for a student who is struggling with a specific topic. "
        "Return JSON ONLY: { "
        "lesson: { "
        "title: string, "
        "description: string, "
        "content: string, "
        "estimated_minutes: number, "
        "resources: [{ title: string, url: string, type: string, description: string }] "
        "}, "
        "assessment: { "
        "questions: [{ "
        "question: string, "
        "type: 'mcq' | 'coding', "
        "options: string[], "
        "correct_index: number, "
        "explanation: string "
        "}] "
        "} "
        "}"
    )

    user = (
        f"Student is struggling with: {topic}\n"
        f"Subject: {technology} ({level})\n"
        f"Weak areas identified: {', '.join(weak_areas)}\n"
        f"Previous assessment score: {previous_score}%\n\n"
        "Create a focused remedial lesson that:\n"
        "1. Explains the concept simply with examples\n"
        "2. Addresses the specific weak areas\n"
        "3. Includes 3-5 practice questions\n"
        "4. Suggests 2-3 targeted resources\n"
        "Return ONLY the JSON object."
    )

    chat = build_chat(
        "reasoning",
        f"remedial:{abs(hash(topic)) % 10**8}",
        system,
        request.headers,
    )

    buf: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=user)):
        if isinstance(ev, TextDelta):
            buf.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    parsed = parse_json_response("".join(buf)) or {}

    # Fallback if AI fails
    if not parsed.get("lesson") or not parsed.get("assessment"):
        parsed = _fallback_remedial(topic, technology, level, weak_areas)

    return parsed


def _fallback_remedial(
    topic: str, technology: str, level: str, weak_areas: List[str]
) -> Dict[str, Any]:
    return {
        "lesson": {
            "title": f"Remedial: {topic}",
            "description": f"Focused review of {topic} for {technology} learners",
            "content": f"This remedial lesson covers {topic} with emphasis on: {', '.join(weak_areas) if weak_areas else 'core concepts'}. "
                       f"Start by reviewing the fundamentals, then work through the examples step by step. "
                       f"Practice the exercises at the end to reinforce understanding.",
            "estimated_minutes": 20,
            "resources": [
                {
                    "title": f"{technology} Documentation: {topic}",
                    "url": f"https://docs.{technology.lower()}.org/",
                    "type": "documentation",
                    "description": f"Official documentation for {topic}"
                },
                {
                    "title": f"Video Tutorial: {topic}",
                    "url": f"https://www.youtube.com/results?search_query={technology}+{topic.replace(' ', '+')}+tutorial+explained",
                    "type": "video",
                    "description": f"Educational video explaining {topic}"
                },
                {
                    "title": f"Interactive Practice: {topic}",
                    "url": "https://www.freecodecamp.org/learn/",
                    "type": "interactive",
                    "description": f"Hands-on exercises for {topic}"
                }
            ]
        },
        "assessment": {
            "questions": [
                {
                    "question": f"What is the primary purpose of {topic} in {technology}?",
                    "type": "mcq",
                    "options": [
                        f"To {topic.lower()}",
                        f"To manage {technology} memory",
                        f"To handle user input",
                        f"To optimize performance"
                    ],
                    "correct_index": 0,
                    "explanation": f"{topic} is used to {topic.lower()} in {technology}."
                },
                {
                    "question": f"Which of the following is a common mistake when working with {topic}?",
                    "type": "mcq",
                    "options": [
                        "Forgetting to initialize variables",
                        "Using the wrong syntax",
                        "Not handling edge cases",
                        "All of the above"
                    ],
                    "correct_index": 3,
                    "explanation": f"All of these are common pitfalls when learning {topic}."
                },
                {
                    "question": f"Write a simple example demonstrating {topic} in {technology}.",
                    "type": "coding",
                    "options": [],
                    "correct_index": -1,
                    "explanation": f"Your solution should demonstrate proper usage of {topic}."
                }
            ]
        }
    }


@router.post("/adaptive/next-lesson")
async def recommend_next_lesson(
    request: Request,
    req: Dict[str, Any],
    auth=Depends(require_auth)
) -> Dict[str, Any]:
    """Recommend the next lesson based on current progress and weak areas."""
    await check_rate_limit(f"next-lesson:{auth.user.id if hasattr(auth, 'user') else 'anon'}", 20, 60)

    completed_lessons = req.get("completed_lessons", [])
    weak_topics = req.get("weak_topics", [])
    technology = req.get("technology", "")
    level = req.get("level", "Beginner")

    # Simple logic: if weak topics exist, recommend remedial
    if weak_topics:
        return {
            "type": "remedial",
            "topic": weak_topics[0],
            "message": f"Recommended: Review {weak_topics[0]} before continuing"
        }

    next_lesson = req.get("next_lesson", {})
    return {
        "type": "continue",
        "lesson": next_lesson,
        "message": "Ready for the next lesson!"
    }


@router.post("/courses/{course_id}/chat")
async def handle_course_chat(
    course_id: str,
    request: Request,
    req: Dict[str, Any],
    auth=Depends(require_auth)
) -> Dict[str, Any]:
    """Handle chat specific to a course or lesson."""
    await check_rate_limit(f"course-chat:{auth.user.id if hasattr(auth, 'user') else 'anon'}", 20, 60)
    
    message = req.get("message", "")
    lesson_id = req.get("lesson_id")
    
    if not message:
        return {"ok": False, "error": "Message is required"}
        
    system = (
        "You are an AI Teaching Assistant for a programming course. "
        "Answer the student's questions accurately, focusing on the concepts taught in the course. "
        "Provide code examples when relevant, and keep your explanations clear and concise."
    )
    
    user = (
        f"Student Question: {message}\n"
    )
    if lesson_id:
        user += f"Context: The student is currently viewing lesson ID: {lesson_id}\n"
        
    chat = build_chat(
        "reasoning",
        f"course-chat:{auth.user.id}:{course_id}",
        system,
        request.headers,
    )
    
    buf: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=user)):
        if isinstance(ev, TextDelta):
            buf.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
            
    return {"ok": True, "reply": "".join(buf).strip()}