"""CRUD service stubs for every feature — wired to actual MongoDB collections.

Each service inherits from `CRUDBase` which provides `list`, `get`, `create`,
`update`, `delete`, `count`, and `get_by`.  The `collection_name` maps to the
real MongoDB collection discovered from `frontend/lib/db/`.
"""
from typing import Any, Dict

from services.crud_base import CRUDBase

# ── Challenges ─────────────────────────────────────────────────
class ChallengesService(CRUDBase[Dict[str, Any], Any]):
    """CRUD for `challenges` collection."""
    collection_name = "challenges"

# ── Interviews ─────────────────────────────────────────────────
class InterviewsService(CRUDBase[Dict[str, Any], Any]):
    """CRUD for `interviews` collection."""
    collection_name = "interviews"

# ── Hackathons ─────────────────────────────────────────────────
class HackathonsService(CRUDBase[Dict[str, Any], Any]):
    """CRUD for `hackathons`, `hackathon_teams`, `hackathon_submissions` collections."""
    collection_name = "hackathons"

    async def list_teams(self, hackathon_id: str) -> list[Dict[str, Any]]:
        from core.database import get_database
        db = await get_database()
        col = db["hackathon_teams"]
        cursor = col.find({"hackathon_id": hackathon_id})
        return await cursor.to_list(length=1000)

    async def list_submissions(self, hackathon_id: str) -> list[Dict[str, Any]]:
        from core.database import get_database
        db = await get_database()
        col = db["hackathon_submissions"]
        cursor = col.find({"hackathon_id": hackathon_id})
        return await cursor.to_list(length=1000)

# ── Certifications ─────────────────────────────────────────────
class CertificationsService(CRUDBase[Dict[str, Any], Any]):
    """CRUD for `certifications` collection."""
    collection_name = "certifications"

    async def submit(self, cert_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        doc = await self.get(cert_id)
        if not doc:
            raise ValueError(f"Certification {cert_id} not found")
        from core.database import get_database
        db = await get_database()
        col = db["certification_attempts"]
        result = await col.insert_one({**data, "certification_id": cert_id})
        return {"ok": True, "attempt_id": str(result.inserted_id)}

# ── Analytics ──────────────────────────────────────────────────
class AnalyticsService:
    """Aggregation queries across multiple collections."""

    async def dashboard_stats(self) -> Dict[str, Any]:
        from core.database import get_database
        db = await get_database()
        return {
            "users": await db["user"].count_documents({}),
            "scans": await db["code_scans"].count_documents({}),
            "challenges": await db["challenges"].count_documents({}),
            "hackathons": await db["hackathons"].count_documents({}),
        }

    async def skill_analytics(self) -> list[Dict[str, Any]]:
        from core.database import get_database
        db = await get_database()
        pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
        cursor = db["submissions"].aggregate(pipeline)
        return await cursor.to_list(length=100)

    async def web_vitals(self) -> list[Dict[str, Any]]:
        from core.database import get_database
        db = await get_database()
        col = db["web_vitals"]
        cursor = col.find().sort("_id", -1).limit(100)
        return await cursor.to_list(length=100)

# ── Dashboard ──────────────────────────────────────────────────
class DashboardService(CRUDBase[Dict[str, Any], Any]):
    """Settings stored in `platform_settings` collection."""
    collection_name = "platform_settings"

    async def stats(self) -> Dict[str, Any]:
        from core.database import get_database
        db = await get_database()
        return {
            "active_users": await db["user"].count_documents({"active": True}),
            "total_scans": await db["code_scans"].count_documents({}),
            "recent_activity": await self.list(sort=[("_id", -1)], limit=20),
        }

    async def activity(self) -> list[Dict[str, Any]]:
        return await self.list(sort=[("_id", -1)], limit=50)

# ── Achievements ───────────────────────────────────────────────
class AchievementsService(CRUDBase[Dict[str, Any], Any]):
    """CRUD for `achievements` collection."""
    collection_name = "achievements"

# ── Scanner ────────────────────────────────────────────────────
class ScannerService:
    """Read operations across scanner collections."""
    _scan_col = "code_scans"
    _issue_col = "code_issues"

    async def list_scans(self, limit: int = 100) -> list[Dict[str, Any]]:
        from core.database import get_database
        db = await get_database()
        cursor = db[self._scan_col].find().sort("_id", -1).limit(limit)
        return await cursor.to_list(length=limit)

    async def list_issues(self, scan_id: str | None = None, limit: int = 200) -> list[Dict[str, Any]]:
        from core.database import get_database
        db = await get_database()
        flt = {}
        if scan_id:
            flt["scan_id"] = scan_id
        cursor = db[self._issue_col].find(flt).sort("_id", -1).limit(limit)
        return await cursor.to_list(length=limit)

# ── Integrations ───────────────────────────────────────────────
class IntegrationsService(CRUDBase[Dict[str, Any], Any]):
    """CRUD for `integrations` collection."""
    collection_name = "integrations"

    async def trigger_github_scan(self, repo_url: str) -> Dict[str, Any]:
        from core.database import get_database
        db = await get_database()
        doc = {
            "repo_url": repo_url,
            "status": "queued",
            "created_at": __import__("datetime").datetime.utcnow().isoformat(),
        }
        result = await db["scan_queue"].insert_one(doc)
        return {"ok": True, "queue_id": str(result.inserted_id), "status": "queued"}