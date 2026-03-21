"""
Database Module — interview Q&A knowledge base stored as JSON.

Structure:
  data/
    db.json       ← all records

Each record:
  {
    "id":         "abc123",
    "question":   "What is gradient descent?",
    "answer":     "Gradient descent is an optimization algorithm...",
    "role":       "Machine Learning Engineer",
    "difficulty": "mid",
    "tags":       ["ml", "optimization"],
    "created_at": "2026-03-15T12:00:00",
    "updated_at": "2026-03-15T12:00:00"
  }
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).parent / "data"
DB_FILE  = DATA_DIR / "db.json"


def _load() -> list[dict]:
    DATA_DIR.mkdir(exist_ok=True)
    if not DB_FILE.exists():
        DB_FILE.write_text("[]")
    try:
        records = json.loads(DB_FILE.read_text())
        # Normalize difficulty + role casing (fix legacy imports)
        for r in records:
            if "difficulty" in r:
                r["difficulty"] = r["difficulty"].strip().lower()
            if "role" in r:
                r["role"] = r["role"].strip()
        return records
    except Exception:
        return []


def _save(records: list[dict]) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    DB_FILE.write_text(json.dumps(records, indent=2, ensure_ascii=False))


def get_all(
    role:       Optional[str] = None,
    difficulty: Optional[str] = None,
    search:     Optional[str] = None,
) -> list[dict]:
    records = _load()
    if role:
        records = [r for r in records if r.get("role","").lower() == role.lower()]
    if difficulty:
        records = [r for r in records if r.get("difficulty","").lower() == difficulty.lower()]
    if search:
        s = search.lower()
        records = [r for r in records
                   if s in r.get("question","").lower()
                   or s in r.get("answer","").lower()
                   or any(s in t for t in r.get("tags",[]))]
    return sorted(records, key=lambda r: r.get("created_at",""), reverse=True)


def get_by_id(record_id: str) -> Optional[dict]:
    return next((r for r in _load() if r["id"] == record_id), None)


def create(
    question:   str,
    answer:     str,
    role:       str  = "",
    difficulty: str  = "",
    tags:       list[str] = None,
) -> dict:
    records = _load()
    now = datetime.now().isoformat(timespec="seconds")
    record = {
        "id":         uuid.uuid4().hex[:10],
        "question":   question.strip(),
        "answer":     answer.strip(),
        "role":       role.strip(),
        "difficulty": difficulty.strip(),
        "tags":       [t.strip() for t in (tags or []) if t.strip()],
        "created_at": now,
        "updated_at": now,
    }
    records.append(record)
    _save(records)
    return record


def update(
    record_id:  str,
    question:   Optional[str] = None,
    answer:     Optional[str] = None,
    role:       Optional[str] = None,
    difficulty: Optional[str] = None,
    tags:       Optional[list[str]] = None,
) -> Optional[dict]:
    records = _load()
    for r in records:
        if r["id"] == record_id:
            if question   is not None: r["question"]   = question.strip()
            if answer     is not None: r["answer"]      = answer.strip()
            if role       is not None: r["role"]        = role.strip()
            if difficulty is not None: r["difficulty"]  = difficulty.strip()
            if tags       is not None: r["tags"]        = [t.strip() for t in tags if t.strip()]
            r["updated_at"] = datetime.now().isoformat(timespec="seconds")
            _save(records)
            return r
    return None


def delete(record_id: str) -> bool:
    records = _load()
    new = [r for r in records if r["id"] != record_id]
    if len(new) == len(records):
        return False
    _save(new)
    return True


def stats() -> dict:
    records = _load()
    roles = {}
    diffs = {}
    for r in records:
        roles[r.get("role","Unknown")] = roles.get(r.get("role","Unknown"), 0) + 1
        diffs[r.get("difficulty","—")] = diffs.get(r.get("difficulty","—"), 0) + 1
    return {"total": len(records), "by_role": roles, "by_difficulty": diffs}

# ══════════════════════════════════════════════════════════════════
# Used-question tracking  — persists across server restarts
# ══════════════════════════════════════════════════════════════════

USED_FILE = DATA_DIR / "used_questions.json"


def _load_used() -> set[str]:
    """Load the set of already-used question IDs from disk."""
    DATA_DIR.mkdir(exist_ok=True)
    if not USED_FILE.exists():
        return set()
    try:
        return set(json.loads(USED_FILE.read_text()))
    except Exception:
        return set()


def _save_used(used: set[str]) -> None:
    USED_FILE.write_text(json.dumps(sorted(used), indent=2))


def pick_questions(
    role:         str,
    difficulty:   str,
    count:        int,
    focus_areas:  list[str] | None = None,
) -> tuple[list[dict], int]:
    """
    Pick up to `count` unused questions from the DB matching role+difficulty.
    Falls back to broader matching if not enough exact matches.

    Returns:
        (records, db_count) where db_count = how many came from DB
        Each record has keys: id, question, answer (hint)
    """
    import random

    used = _load_used()
    all_records = _load()

    def match(r: dict) -> bool:
        """Strict match: role AND difficulty must match."""
        role_ok = r.get("role", "").lower() == role.lower()
        diff_ok = r.get("difficulty", "").lower() == difficulty.lower()
        unused  = r["id"] not in used
        return role_ok and diff_ok and unused

    # Strict match: same role + same difficulty + unused
    pool = [r for r in all_records if match(r)]

    # If exhausted (all matching questions used), reset used for this role+difficulty
    if not pool:
        # Reset only the used IDs that belong to this role+difficulty
        matching_ids = {
            r["id"] for r in all_records
            if r.get("role","").lower() == role.lower()
            and r.get("difficulty","").lower() == difficulty.lower()
        }
        if matching_ids:
            refreshed = used - matching_ids  # keep other role/diff used IDs
            _save_used(refreshed)
            used = refreshed
            pool = [r for r in all_records if match(r)]

    # Never fall back to different difficulty — let LLM fill remaining slots

    random.shuffle(pool)
    chosen = pool[:count]

    # Mark chosen as used
    used.update(r["id"] for r in chosen)
    _save_used(used)

    return chosen, len(chosen)


def reset_used_questions() -> int:
    """Clear the used-questions history. Returns how many were cleared."""
    used = _load_used()
    n = len(used)
    _save_used(set())
    return n