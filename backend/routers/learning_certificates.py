"""
Certificate generation and verification for learning courses.

QR-verifiable certificates tied to course completion.
"""
from __future__ import annotations

import hashlib
import os
from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from core.auth import require_auth
from core.dependencies import check_rate_limit

router = APIRouter(prefix="/internal/learning", tags=["learning-certificates"])


class IssueCertificateReq(BaseModel):
    course_id: str
    user_id: str
    score: float
    completion_criteria: Dict[str, Any] = {}


@router.post("/certificates/issue")
async def issue_certificate(
    request: Request,
    req: IssueCertificateReq,
    auth=Depends(require_auth)
) -> Dict[str, Any]:
    """Issue a certificate for completed course."""
    await check_rate_limit(f"cert-issue:{auth.user.id if hasattr(auth, 'user') else 'anon'}", 5, 300)

    from core.database import get_database
    db = await get_database()

    # Verify user completed the course
    progress_col = db["learning_progress"]
    course_col = db["learning_courses"]

    course = await course_col.find_one({"id": req.course_id})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Check completion criteria
    progress = await progress_col.find({
        "user_id": req.user_id,
        "course_id": req.course_id,
        "completed": True
    }).to_list(length=200)

    total_lessons = 0
    for section in course.get("sections", []):
        total_lessons += len(section.get("lessons", []))

    if total_lessons == 0 or len(progress) < total_lessons:
        raise HTTPException(status_code=400, detail="Course not completed")

    if req.score < course.get("passing_score", 70):
        raise HTTPException(status_code=400, detail=f"Score {req.score}% below passing threshold {course.get('passing_score', 70)}%")

    # Generate certificate token
    token_data = f"{req.user_id}:{req.course_id}:{datetime.utcnow().isoformat()}:{os.urandom(8).hex()}"
    cert_token = hashlib.sha256(token_data.encode()).hexdigest()[:16].upper()
    cert_id = f"CS-{course.get('id', 'COURSE')[:4].upper()}-{cert_token[:8]}"

    # Store certificate
    cert_doc = {
        "id": cert_id,
        "token": cert_token,
        "user_id": req.user_id,
        "course_id": req.course_id,
        "course_title": course.get("title"),
        "score": req.score,
        "issued_at": datetime.utcnow().isoformat(),
        "verified": True,
    }
    await db["learning_certificates"].insert_one(cert_doc)

    return {
        "ok": True,
        "certificate": {
            "id": cert_id,
            "token": cert_token,
            "course_title": course.get("title"),
            "score": req.score,
            "issued_at": cert_doc["issued_at"],
            "verify_url": f"/cert/verify/{cert_token}",
        }
    }


@router.get("/certificates/verify/{token}")
async def verify_certificate(token: str) -> Dict[str, Any]:
    """Public endpoint to verify a certificate."""
    from core.database import get_database
    db = await get_database()

    cert = await db["learning_certificates"].find_one({"token": token.upper()})
    if not cert:
        return {
            "valid": False,
            "message": "Certificate not found",
        }

    return {
        "valid": True,
        "certificate": {
            "id": cert.get("id"),
            "course_title": cert.get("course_title"),
            "user_name": cert.get("user_name", "Certificate Holder"),
            "score": cert.get("score"),
            "issued_at": cert.get("issued_at"),
            "verified": cert.get("verified", True),
        }
    }


@router.get("/certificates/my")
async def list_my_certificates(
    auth=Depends(require_auth)
) -> Dict[str, Any]:
    """List current user's certificates."""
    from core.database import get_database
    from core.auth import get_current_user

    user = await get_current_user(auth)
    db = await get_database()

    certs = await db["learning_certificates"].find({"user_id": user.id}).sort([("issued_at", -1)]).to_list(length=50)
    return {"ok": True, "data": _serialize(certs)}


def _serialize(doc):
    if isinstance(doc, list):
        return [{k: str(v) if k == "_id" else v for k, v in d.items()} for d in doc]
    return {k: str(v) if k == "_id" else v for k, v in doc.items()}


# ── QR Code Generation (returns SVG) ───────────────────────────

@router.get("/certificates/qr/{token}")
async def generate_certificate_qr(token: str) -> Response:
    """Generate QR code SVG for certificate verification."""
    from core.database import get_database
    db = await get_database()

    cert = await db["learning_certificates"].find_one({"token": token.upper()})
    if not cert:
        # Return error QR
        qr_content = "INVALID_CERTIFICATE"
    else:
        base_url = os.environ.get("FRONTEND_URL", "https://codespectra.com")
        qr_content = f"{base_url}/cert/verify/{token.upper()}"

    # Generate simple SVG QR code (in production, use a proper QR library)
    qr_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="white"/>
      <text x="100" y="100" font-family="monospace" font-size="10" text-anchor="middle" fill="black">
        {qr_content[:50]}
      </text>
      <text x="100" y="115" font-family="monospace" font-size="8" text-anchor="middle" fill="#666">
        Scan to verify
      </text>
    </svg>'''

    return Response(content=qr_svg, media_type="image/svg+xml")


# ── Certificate PDF Generation (placeholder) ───────────────────

@router.get("/certificates/pdf/{token}")
async def generate_certificate_pdf(token: str) -> Response:
    """Generate PDF certificate."""
    from core.database import get_database
    db = await get_database()

    cert = await db["learning_certificates"].find_one({"token": token.upper()})
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")

    # Return placeholder - in production use reportlab or weasyprint
    pdf_content = f"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 24 Tf 100 700 Td (CodeSpectra Certificate) Tj ET
BT /F1 18 Tf 100 650 Td ({cert.get('course_title', 'Course')}) Tj ET
BT /F1 12 Tf 100 600 Td (Score: {cert.get('score', 0)}%) Tj ET
BT /F1 12 Tf 100 570 Td (ID: {cert.get('id', 'N/A')}) Tj ET
BT /F1 12 Tf 100 540 Td (Verify: https://codespectra.com/cert/verify/{token}) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000010 00000 n
0000000060 00000 n
0000000117 00000 n
0000000218 00000 n
0000000389 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
492
%%EOF"""

    return Response(
        content=pdf_content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="certificate-{cert.get("id")}.pdf"'}
    )