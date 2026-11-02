"""
Offline static code-path checks for the frontend app.

These guard refactorings (moved from test_iteration7_features.py, which
needed a live server for the dynamic tests):
- Submission XP code-path (awardXp + first-blood bonus markers)
- Face-MFA cleanup (no residual references to the deleted face-auth-service)

No server or database required — pure repo-relative file checks.
"""
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
FRONTEND_ROOT = REPO_ROOT / "frontend"
SKIP_DIRS = {"node_modules", ".next", ".git", "coverage"}


def _scan_refs(term: str) -> list[Path]:
    """Repo-relative replacement for the old `grep -rln /app/frontend` subprocess."""
    hits = []
    for path in FRONTEND_ROOT.rglob("*.ts*"):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        try:
            if term in path.read_text(encoding="utf-8", errors="replace"):
                hits.append(path)
        except OSError:
            continue
    return hits


# ---------- Code-path verification (Piston blocked) ----------
class TestSubmissionXPCodepath:
    def test_award_xp_exists_in_submissions(self):
        p = FRONTEND_ROOT / "app" / "api" / "submissions" / "route.ts"
        assert p.exists(), f"missing {p}"
        src = p.read_text(encoding="utf-8")
        assert "awardXp" in src, "awardXp not referenced in submissions route"
        assert "FIRST_BLOOD_BONUS" in src, "FIRST_BLOOD_BONUS not referenced"
        # first-blood logic should check for prior accepted submissions
        assert re.search(r"first.?blood", src, re.IGNORECASE), "first-blood marker not found"


# ---------- Face-MFA cleanup ----------
class TestFaceMfaCleanup:
    def test_face_auth_service_deleted(self):
        assert not (FRONTEND_ROOT / "lib" / "face-auth-service.ts").exists()

    def test_no_imports_of_face_auth(self):
        files = _scan_refs("face-auth-service")
        assert files == [], f"residual references to face-auth-service: {files}"
