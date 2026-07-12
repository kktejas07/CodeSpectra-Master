"""Reusable async CRUD base for MongoDB-backed services.

Every new feature can inherit from this, or just compose it, to avoid
duplicating the same find / insert / update / delete patterns.

Usage:

    class UsersService(CRUDBase[UserDoc]):
        collection_name = "users"
"""
from __future__ import annotations

from typing import Any, Dict, Generic, List, Optional, Type, TypeVar

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase
from pydantic import BaseModel

from core.database import get_database

# Type of the document dict stored in MongoDB
DocT = TypeVar("DocT", bound=Dict[str, Any])
# Type of a Pydantic model used as the response schema
ModelT = TypeVar("ModelT", bound=BaseModel)


class CRUDBase(Generic[DocT, ModelT]):
    """Minimal async CRUD — override `collection_name` in subclasses."""

    collection_name: str = ""
    _db_conn: Optional[AsyncIOMotorDatabase] = None

    def __init__(self, db: Optional[AsyncIOMotorDatabase] = None) -> None:
        self._db_conn = db

    async def _db(self) -> AsyncIOMotorDatabase:
        if self._db_conn is None:
            return await get_database()
        return self._db_conn

    async def col(self) -> AsyncIOMotorCollection:
        db = await self._db()
        return db[self.collection_name]

    async def list(
        self,
        filter: Optional[Dict[str, Any]] = None,
        sort: Optional[List[tuple]] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[DocT]:
        c = await self.col()
        cursor = c.find(filter or {})
        if sort:
            cursor = cursor.sort(sort)
        return await cursor.skip(skip).to_list(length=limit)

    async def get(self, id: str) -> Optional[DocT]:
        c = await self.col()
        return await c.find_one({"_id": ObjectId(id)})

    async def get_by(self, field: str, value: Any) -> Optional[DocT]:
        c = await self.col()
        return await c.find_one({field: value})

    async def create(self, data: Dict[str, Any]) -> str:
        c = await self.col()
        result = await c.insert_one(data)
        return str(result.inserted_id)

    async def update(
        self, id: str, data: Dict[str, Any]
    ) -> Optional[DocT]:
        c = await self.col()
        await c.update_one({"_id": ObjectId(id)}, {"$set": data})
        return await self.get(id)

    async def delete(self, id: str) -> bool:
        c = await self.col()
        result = await c.delete_one({"_id": ObjectId(id)})
        return result.deleted_count > 0

    async def count(self, filter: Optional[Dict[str, Any]] = None) -> int:
        c = await self.col()
        return await c.count_documents(filter or {})