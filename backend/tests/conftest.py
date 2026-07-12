"""Shared test fixtures for the modular backend."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

# Ensure the backend root is on the Python path
BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

# Override env vars for testing
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017/test")
os.environ.setdefault("MONGODB_DB_NAME", "codespectra_test")
os.environ.setdefault("NEXTJS_INTERNAL_URL", "http://localhost:8001")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
os.environ.setdefault("GEMINI_API_KEY", "test-key")
os.environ.setdefault("OPENAI_API_KEY", "test-key")


from server import app  # noqa: E402


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client() -> AsyncClient:
    """Async HTTP test client for the FastAPI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def db_mock():
    """Return a mock database (placeholders for future integration tests)."""
    # ponytail: use mongomock or a real test database when integration
    # tests with MongoDB are needed. For now, mock returns None.
    class FakeDb:
        def __getitem__(self, name):
            return FakeCollection(name)

    class FakeCollection:
        def __init__(self, name: str):
            self.name = name

        async def find_one(self, *a, **kw):
            return None

        async def find(self, *a, **kw):
            return FakeCursor([])

        async def insert_one(self, doc):
            return FakeResult("fake_id_123")

        async def count_documents(self, *a, **kw):
            return 0

    class FakeCursor:
        def __init__(self, items):
            self._items = items

        def sort(self, *a):
            return self

        def skip(self, n):
            return self

        def limit(self, n):
            return self

        async def to_list(self, *a):
            return self._items

    class FakeResult:
        def __init__(self, inserted_id):
            self.inserted_id = inserted_id

    return FakeDb()