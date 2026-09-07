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

async def _course_generation_loop():
    logging.info("Course generation scheduler started.")
    while True:
        try:
            # We want to wait for 12 hours between runs, but we might want to do a run immediately?
            # Actually, doing it immediately might slow down startup or we just wait 12 hours first.
            logging.info("Sleeping before next course generation...")
            await asyncio.sleep(GENERATION_INTERVAL_SEC)
            
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
