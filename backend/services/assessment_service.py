"""
MongoDB-backed CRUD for Assessment Platform (Requisitions, Question Bank).

Replaces the previous in-memory storage that lost data on every restart.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from core.database import get_database

COLL_REQUISITIONS = "requisitions"
COLL_QUESTION_BANK = "question_bank"


async def create_requisition(data: Dict[str, Any]) -> Dict[str, Any]:
    db = await get_database()
    doc = {
        "id": f"req-{uuid.uuid4().hex[:8]}",
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        **data,
    }
    await db[COLL_REQUISITIONS].insert_one(doc)
    return doc


async def list_requisitions(region: Optional[str] = None, discipline: Optional[str] = None) -> List[Dict[str, Any]]:
    db = await get_database()
    query: Dict[str, Any] = {}
    if region:
        query["region"] = {"$regex": f"^{region}$", "$options": "i"}
    if discipline:
        query["discipline"] = {"$regex": f"^{discipline}$", "$options": "i"}
    cursor = db[COLL_REQUISITIONS].find(query).sort("created_at", -1)
    return await cursor.to_list(length=500)


async def get_requisition(req_id: str) -> Optional[Dict[str, Any]]:
    db = await get_database()
    return await db[COLL_REQUISITIONS].find_one({"id": req_id})


async def update_requisition(req_id: str, update_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    db = await get_database()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db[COLL_REQUISITIONS].update_one({"id": req_id}, {"$set": update_data})
    return await db[COLL_REQUISITIONS].find_one({"id": req_id})


async def delete_requisition(req_id: str) -> bool:
    db = await get_database()
    result = await db[COLL_REQUISITIONS].delete_one({"id": req_id})
    return result.deleted_count > 0


async def create_question_item(data: Dict[str, Any]) -> Dict[str, Any]:
    db = await get_database()
    doc = {
        "id": f"q-{uuid.uuid4().hex[:8]}",
        "version": 1,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        **data,
    }
    await db[COLL_QUESTION_BANK].insert_one(doc)
    return doc


async def list_question_items(
    discipline: Optional[str] = None,
    competency: Optional[str] = None,
    experience_band: Optional[str] = None,
    modality: Optional[str] = None,
) -> List[Dict[str, Any]]:
    db = await get_database()
    query: Dict[str, Any] = {}
    if discipline:
        query["discipline"] = {"$regex": f"^{discipline}$", "$options": "i"}
    if competency:
        query["competency"] = {"$regex": f"^{competency}$", "$options": "i"}
    if experience_band:
        query["experience_band"] = {"$regex": f"^{experience_band}$", "$options": "i"}
    if modality:
        query["modality"] = {"$regex": f"^{modality}$", "$options": "i"}
    cursor = db[COLL_QUESTION_BANK].find(query).sort("created_at", -1)
    return await cursor.to_list(length=500)


async def get_question_item(item_id: str) -> Optional[Dict[str, Any]]:
    db = await get_database()
    return await db[COLL_QUESTION_BANK].find_one({"id": item_id})


async def update_question_item(item_id: str, update_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    db = await get_database()
    current = await db[COLL_QUESTION_BANK].find_one({"id": item_id})
    if current:
        update_data["version"] = current.get("version", 1) + 1
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db[COLL_QUESTION_BANK].update_one({"id": item_id}, {"$set": update_data})
    return await db[COLL_QUESTION_BANK].find_one({"id": item_id})


async def retire_question_item(item_id: str) -> bool:
    db = await get_database()
    result = await db[COLL_QUESTION_BANK].update_one(
        {"id": item_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return result.modified_count > 0
