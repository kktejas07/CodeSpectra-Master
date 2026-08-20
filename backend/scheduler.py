import asyncio
import logging
from datetime import datetime, timezone
from services.ai import handle_generate_course

# Run every 12 hours
GENERATION_INTERVAL_SEC = 12 * 60 * 60

async def _course_generation_loop():
    logging.info("Course generation scheduler started.")
    while True:
        try:
            # We want to wait for 12 hours between runs, but we might want to do a run immediately?
            # Actually, doing it immediately might slow down startup or we just wait 12 hours first.
            logging.info("Sleeping before next course generation...")
            await asyncio.sleep(GENERATION_INTERVAL_SEC)
            
            logging.info("Running scheduled course generation...")
            # For this example, we generate a random tech course, or maybe one from a predefined list.
            # In a real scenario, we'd read this from a queue or database.
            req = {
                "courseType": "Crash Course",
                "topic": "Advanced Data Structures in Python",
                "difficulty": "Intermediate"
            }
            # handle_generate_course expects (request, req, user_id, auth_user, mock=False)
            # Since this is a background task, we mock the request and user
            class MockUser:
                id = "system"
            
            class MockAuth:
                user = MockUser()

            # We can't easily mock fastapi Request, so we might need a workaround or adapt the service function.
            # handle_generate_course does not strictly require request for anything other than headers (which we can fake).
            class MockRequest:
                headers = {}
                
            await handle_generate_course(
                request=MockRequest(),
                req=req,
                user_id="system",
                auth_user=MockAuth(),
                mock=False
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
