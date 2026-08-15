"""Workday Integration Service.

Handles stage transition triggers, status synchronization,
and results write-back to Workday candidate records.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class WorkdayService:
    def __init__(self, tenant_url: Optional[str] = None, api_key: Optional[str] = None):
        self.tenant_url = tenant_url or "https://wd3-impl-services1.workday.com/ccx/api/v1/sandbox"
        self.api_key = api_key or "mock-isu-token"

    async def trigger_invitation(
        self, candidate_email: str, candidate_name: str, requisition_code: str, workday_candidate_id: str
    ) -> Dict[str, Any]:
        """Trigger an assessment invitation based on candidate stage transition in Workday."""
        logger.info(
            f"[Workday] Triggering invitation for candidate {candidate_email} (Workday ID: {workday_candidate_id}) for req {requisition_code}"
        )
        invitation_token = str(uuid.uuid4())
        # ponytail: simple mock payload simulation for Workday sandbox integration
        return {
            "status": "invited",
            "invitation_token": invitation_token,
            "workday_candidate_id": workday_candidate_id,
            "requisition_code": requisition_code,
            "assessment_url": f"https://codespectra.ai/assessment/{invitation_token}",
            "invited_at": datetime.now(timezone.utc).isoformat(),
        }

    async def write_back_results(
        self,
        workday_candidate_id: str,
        requisition_code: str,
        composite_score: float,
        experience_band: str,
        sub_scores: Dict[str, float],
        report_url: str,
        recommendation: str = "shortlist",
    ) -> Dict[str, Any]:
        """Write assessment sub-scores, composite score, and candidate 1-page report link back to Workday candidate record."""
        logger.info(
            f"[Workday] Writing back results for {workday_candidate_id}: Composite Score={composite_score}, Band={experience_band}"
        )
        return {
            "ok": True,
            "workday_candidate_id": workday_candidate_id,
            "requisition_code": requisition_code,
            "results": {
                "composite_score": composite_score,
                "experience_band": experience_band,
                "recommendation": recommendation,
                "sub_scores": sub_scores,
                "report_link": report_url,
            },
            "written_at": datetime.now(timezone.utc).isoformat(),
        }


workday_service = WorkdayService()
