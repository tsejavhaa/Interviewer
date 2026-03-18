from __future__ import annotations
import json as _json
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
import db_module

router = APIRouter(prefix="/db")

# DATABASE  — Q&A knowledge base  (data/db.json)



@router.get("/records")
def db_list(role: str = "", difficulty: str = "", search: str = ""):
    return db_module.get_all(role=role or None, difficulty=difficulty or None, search=search or None)


@router.get("/stats")
def db_stats():
    return db_module.stats()


@router.post("/records")
async def db_create(
    question:   str = Form(...),
    answer:     str = Form(...),
    role:       str = Form(""),
    difficulty: str = Form(""),
    tags:       str = Form(""),
):
    return db_module.create(
        question=question, answer=answer, role=role, difficulty=difficulty,
        tags=[t.strip() for t in tags.split(",") if t.strip()],
    )


@router.put("/records/{record_id}")
async def db_update(
    record_id:  str,
    question:   str = Form(None),
    answer:     str = Form(None),
    role:       str = Form(None),
    difficulty: str = Form(None),
    tags:       str = Form(None),
):
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags is not None else None
    record = db_module.update(record_id=record_id, question=question, answer=answer,
                              role=role, difficulty=difficulty, tags=tag_list)
    if record is None:
        raise HTTPException(404, "Record not found")
    return record


@router.delete("/records/{record_id}")
def db_delete(record_id: str):
    if not db_module.delete(record_id):
        raise HTTPException(404, "Record not found")
    return {"deleted": record_id}


@router.post("/import-json")
async def db_import(file: UploadFile = File(...)):
    """
    Import questions from a JSON file.
    Supports the ML interview dataset format:
      { "questions": [{ "Question", "Answer", "Difficulty", "Tags", "id" }] }
    Also supports flat array format: [{ ... }]
    Returns { imported, skipped, total }
    """
    if not file.filename.endswith(".json"):
        raise HTTPException(400, "File must be a .json file")
    data = await file.read()
    try:
        parsed = __import__("json").loads(data)
    except Exception:
        raise HTTPException(400, "Invalid JSON file")

    # Normalize to a list of question dicts
    if isinstance(parsed, list):
        raw_questions = parsed
    elif isinstance(parsed, dict) and "questions" in parsed:
        raw_questions = parsed["questions"]
    else:
        raise HTTPException(400, "JSON must be an array or have a 'questions' key")

    imported = 0
    skipped  = 0
    for q in raw_questions:
        question = q.get("Question") or q.get("question", "")
        answer   = q.get("Answer")   or q.get("answer",   "")
        if not question or not answer:
            skipped += 1
            continue
        difficulty = (q.get("Difficulty") or q.get("difficulty") or "").lower()
        tags       = q.get("Tags") or q.get("tags") or []
        role       = q.get("Role") or q.get("role") or ""
        db_module.create(
            question=question, answer=answer,
            role=role, difficulty=difficulty, tags=tags,
        )
        imported += 1

    return {"imported": imported, "skipped": skipped, "total": imported + skipped}

@router.post("/reset-used")
def db_reset_used():
    """Clear the used-questions history so all questions can be picked again."""
    n = db_module.reset_used_questions()
    return {"cleared": n, "message": f"Reset {n} used question IDs — all questions available again"}