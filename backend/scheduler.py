import asyncio
import logging
from models.ai import GenerateCourseReq
from services.ai import handle_generate_course

# Run every 12 hours
GENERATION_INTERVAL_SEC = 12 * 60 * 60


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
    logging.info("Running scheduled course generation...")
    # handle_generate_course(request, req: GenerateCourseReq) — the
    # real signature takes exactly two args. Construct the request
    # model properly; the scheduler has no HTTP request, so pass a
    # minimal stub exposing only .headers / .client.
    req = GenerateCourseReq(
        technology="Python",
        level="Intermediate",
        goal="Advanced Data Structures in Python",
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
