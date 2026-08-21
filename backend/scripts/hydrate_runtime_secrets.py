#!/usr/bin/env python3
"""Load SESSION_SECRET + INTERNAL_BACKEND_SECRET from Mongo, then exec the app.

Dokploy rebuilds re-apply only Dokploy-stored env and drop ad-hoc --env-add
values. Mongo `platform_settings.secrets` is the durable copy. Logs never
print secret values. Missing URI → exec the original command unchanged.
"""
from __future__ import annotations

import os
import secrets
import sys

MIN = 32
FIELDS = (
    ("session_secret", "SESSION_SECRET"),
    ("internal_backend_secret", "INTERNAL_BACKEND_SECRET"),
)


def usable(value: object) -> bool:
    s = str(value or "").strip()
    return len(s) >= MIN and "•" not in s


def hydrate() -> None:
    uri = (
        os.environ.get("MONGODB_URI")
        or os.environ.get("MONGO_URL")
        or os.environ.get("MONGODB_URI_FALLBACK")
        or ""
    )
    if not uri:
        print("[hydrate] no MONGODB_URI/MONGO_URL — skip", file=sys.stderr)
        return
    from pymongo import MongoClient

    db_name = os.environ.get("MONGODB_DB_NAME", "codespectra")
    client = MongoClient(uri, serverSelectionTimeoutMS=8000)
    try:
        col = client[db_name]["platform_settings"]
        for field, env_key in FIELDS:
            doc = col.find_one({"key": "secrets"}) or {}
            stored = str((doc.get("value") or {}).get(field) or "").strip()
            if usable(stored):
                resolved = stored
            else:
                env_val = (os.environ.get(env_key) or "").strip()
                resolved = env_val if usable(env_val) else secrets.token_hex(32)
                col.update_one(
                    {"key": "secrets"},
                    {"$set": {f"value.{field}": resolved}},
                    upsert=True,
                )
                fresh = col.find_one({"key": "secrets"}) or {}
                won = str((fresh.get("value") or {}).get(field) or "").strip()
                if usable(won):
                    resolved = won
            os.environ[env_key] = resolved
            print(f"[hydrate] {env_key}=SET", file=sys.stderr)
    finally:
        client.close()


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: hydrate_runtime_secrets.py <command> [args...]", file=sys.stderr)
        sys.exit(2)
    try:
        hydrate()
    except Exception as exc:
        print(f"[hydrate] skipped: {exc}", file=sys.stderr)
    os.execvpe(sys.argv[1], sys.argv[1:], os.environ)


if __name__ == "__main__":
    main()
