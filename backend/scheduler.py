import asyncio
import logging
import os
from models.ai import GenerateCourseReq
from services.ai import handle_generate_course

# Run every 12 hours
GENERATION_INTERVAL_SEC = 12 * 60 * 60

# Topic rotation: each scheduler run picks the next topic in this list.
# Override via SCHEDULER_TOPICS env var as a comma-separated list.
# ponytail: rotating topics diversifies auto-generated content without
# requiring a live database lookup; ceiling is SCHEDULER_TOPICS.
_DEFAULT_TOPICS = [
    ("Python", "Intermediate", "Advanced Data Structures in Python"),
    ("JavaScript", "Beginner", "Modern JavaScript Fundamentals"),
    ("TypeScript", "Intermediate", "TypeScript for Full-Stack Development"),
    ("React", "Intermediate", "Building Scalable React Applications"),
    ("Node.js", "Intermediate", "Server-Side Development with Node.js"),
    ("SQL", "Beginner", "Relational Databases and SQL Essentials"),
    ("Go", "Beginner", "Go Programming Fundamentals"),
    ("Rust", "Intermediate", "Systems Programming with Rust"),
    ("Docker", "Beginner", "Containerisation with Docker"),
    ("Kubernetes", "Intermediate", "Container Orchestration with Kubernetes"),
    ("System Design", "Advanced", "Designing Scalable Distributed Systems"),
    ("Data Structures", "Intermediate", "Core Data Structures for Interviews"),
    ("Algorithms", "Intermediate", "Algorithmic Thinking and Problem Solving"),
    ("Machine Learning", "Intermediate", "Practical Machine Learning with Python"),
    ("DevOps", "Intermediate", "CI/CD Pipelines and DevOps Practices"),
]

def _get_topics():
    raw = os.environ.get("SCHEDULER_TOPICS", "").strip()
    if raw:
        # Format: "Python:Intermediate:Goal text, JS:Beginner:Goal text"
        parsed = []
        for item in raw.split("|"):
            parts = item.strip().split(":", 2)
            if len(parts) == 3:
                parsed.append((parts[0].strip(), parts[1].strip(), parts[2].strip()))
            elif len(parts) == 1 and parts[0]:
                parsed.append((parts[0].strip(), "Intermediate", f"Core {parts[0].strip()} Skills"))
        if parsed:
            return parsed
    return _DEFAULT_TOPICS

# Track which topic to run next (simple in-memory rotation).
_topic_index = 0


class _SchedulerRequest:
    """Minimal stand-in for fastapi.Request.

    handle_generate_course(request, req) only touches request.headers
    (LLM key resolution tolerates a plain dict) and request.client
    (client_ip() tolerates None and falls back to "unknown").
    """

    headers = {}
    client = None

async def _run_once() -> None:
    """Run one course-generation cycle. Factored out so the loop and
    an on-startup immediate run share the same logic."""
    global _topic_index
    topics = _get_topics()
    technology, level, goal = topics[_topic_index % len(topics)]
    _topic_index += 1
    logging.info(f"Running scheduled course generation: {technology} / {level} / {goal}")
    # handle_generate_course(request, req: GenerateCourseReq) — the
    # real signature takes exactly two args. Construct the request
    # model properly; the scheduler has no HTTP request, so pass a
    # minimal stub exposing only .headers / .client.
    req = GenerateCourseReq(
        technology=technology,
        level=level,
        goal=goal,
        duration_hours=10,
    )
    await handle_generate_course(
        request=_SchedulerRequest(),  # type: ignore[arg-type]
        req=req,
    )
    logging.info("Scheduled course generation completed.")


async def _course_generation_loop():
    logging.info("Course generation scheduler started.")
    # Run once immediately on startup so a fresh deployment generates
    # content right away (not after the first 12-hour sleep).
    try:
        await _run_once()
    except Exception as e:
        logging.exception(f"Error in initial course generation: {e}")

    while True:
        try:
            logging.info("Sleeping before next course generation...")
            await asyncio.sleep(GENERATION_INTERVAL_SEC)
            await _run_once()
        except asyncio.CancelledError:
            logging.info("Course generation scheduler cancelled.")
            break
        except Exception as e:
            logging.exception(f"Error in scheduled course generation: {e}")
            await asyncio.sleep(60) # Wait a bit before retrying

def start_scheduler():
    loop = asyncio.get_event_loop()
    task = loop.create_task(_course_generation_loop())
    return task
