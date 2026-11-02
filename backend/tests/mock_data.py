"""
Reusable mock fixtures for backend tests.

Mirrors ``frontend/tests/fixtures/mock-data.ts`` (see
``docs/testing/02-coverage-audit.md`` §4) so both stacks seed the same
shapes. Import from here instead of inlining literals; a schema change is a
one-line fix.

These are plain dicts — the live integration suites (``test_iteration*``,
``test_phase*``) instead drive a running app with real seeded MongoDB, but
any offline unit test that needs a realistic document can pull one here.
"""
from __future__ import annotations

# ---------- 4.1 Admin System / Operations ----------
SERVER_HEALTH = {
    "cpu": 42.5,
    "memory": 68.2,
    "disk": 55.0,
    "uptime": 1209600,
    "docker": {"running": 7, "stopped": 1},
}

REDIS_STATUS = {
    "connected": True,
    "hit_rate": 0.91,
    "keys": 14230,
    "memory": "128MB",
    "rate_limit_counters": {"signin:ip": 12, "signin:email": 3, "ai-requests": 47},
}

WEB_VITALS = {
    "LCP": {"p75": 2100, "rating": "good"},
    "INP": {"p75": 180, "rating": "good"},
    "CLS": {"p75": 0.05, "rating": "good"},
    "TTFB": {"p75": 410, "rating": "needs-improvement"},
}

# ---------- 4.2 Users / Roles ----------
USERS = [
    {"_id": "u_001", "name": "Priya Sharma", "email": "priya@axiss.com", "role": "superadmin", "status": "active"},
    {"_id": "u_002", "name": "Arjun Mehta", "email": "arjun@test.com", "role": "candidate", "status": "active"},
    {"_id": "u_003", "name": "Sunita Rao", "email": "sunita@acme.com", "role": "recruiter", "status": "suspended"},
]

ROLES = [
    {"id": "superadmin", "permissions": ["*"]},
    {"id": "recruiter", "permissions": ["ats:read", "ats:write", "hiring:read"]},
    {"id": "candidate", "permissions": ["exam:take", "profile:write"]},
]

# ---------- 4.3 Assessments / Exam ----------
ASSESSMENT = {
    "_id": "asmnt_001",
    "title": "Senior SWE — DSA Round",
    "duration_minutes": 90,
    "sections": [
        {"id": "sec_mcq", "type": "mcq", "questions": 20, "marks": 20},
        {"id": "sec_code", "type": "coding", "questions": 2, "marks": 30},
    ],
    "settings": {"proctoring": True, "camera_required": True, "browser_lockdown": False},
}

SUBMISSION = {
    "user_id": "u_002",
    "assessment_id": "asmnt_001",
    "score": 42,
    "max_score": 50,
    "answers": [
        {"question_id": "q_001", "selected": "B", "correct": True},
        {"question_id": "q_002", "code": "def two_sum(nums, target): ...", "language": "python"},
    ],
}

# ---------- 4.5 ATS / Hiring Pipeline ----------
JOB = {
    "_id": "job_001",
    "title": "Full Stack Engineer",
    "department": "Engineering",
    "location": "Hyderabad / Remote",
    "pipeline": ["applied", "screen", "technical", "hr", "offer", "hired"],
}

CANDIDATES = [
    {"_id": "c_001", "name": "Rahul Kumar", "stage": "technical", "ai_score": 87.4},
    {"_id": "c_002", "name": "Fatima Sheikh", "stage": "offer", "ai_score": 92.1, "offer_amount": 1800000},
]

# ---------- 4.6 Billing / Plans ----------
SUBSCRIPTION = {
    "org_id": "org_001",
    "plan": "pro",
    "currency": "INR",
    "amount": 4999,
    "interval": "monthly",
    "status": "active",
    "gateway": "razorpay",
    "next_billing_date": "2026-11-27T00:00:00Z",
}

USAGE = {"ai_requests": 4820, "ai_limit": 5000, "candidates": 128, "candidate_limit": 200}

# ---------- 4.7 Analytics / Insights ----------
USER_GROWTH = [
    {"month": "2026-05", "new_users": 340},
    {"month": "2026-06", "new_users": 412},
    {"month": "2026-07", "new_users": 389},
    {"month": "2026-08", "new_users": 501},
    {"month": "2026-09", "new_users": 620},
    {"month": "2026-10", "new_users": 714},
]

USERS_BY_ROLE = {"candidate": 8420, "recruiter": 310, "admin": 12}

MRR = {"INR": 248000, "USD": 2980}

INSIGHTS = {"integrity_flags": 14, "ai_usage_this_month": 38200}

# ---------- 4.9 Proctoring ----------
PROCTOR_SESSION = {
    "_id": "proc_001",
    "exam_id": "asmnt_001",
    "user_id": "u_002",
    "flags": [
        {"type": "tab_switch", "ts": "2025-06-01T09:14:22Z"},
        {"type": "face_not_detected", "ts": "2025-06-01T09:28:05Z"},
    ],
    "recording": {"r2_key": "proc/proc_001/video.webm", "duration_seconds": 5400},
    "verdict": "suspicious",
}

# ---------- 4.10 Crash Analytics ----------
CRASHES = [
    {
        "message": "Cannot read properties of undefined (reading 'id')",
        "severity": "error",
        "component": "AtsEngine",
        "user_id": "u_002",
        "ts": "2026-10-27T04:12:00Z",
    },
    {
        "message": "Redis connection timeout",
        "severity": "fatal",
        "component": "RedisCacheHandler",
        "user_id": None,
        "ts": "2026-10-27T04:15:33Z",
    },
]
