from __future__ import annotations
import asyncio, json, time
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse

import llm_module, tts_module, stt_module, scorer_module, session_module, db_module
from session_module import SessionState

router = APIRouter(prefix="/session")

# ── Session create ─────────────────────────────────────────────────────────────

@router.post("/create")
async def create_session(
    role:          str = Form(...),
    difficulty:    str = Form("mid"),
    focus_areas:   str = Form(""),
    num_questions: int = Form(5),
    tts_voice:     str = Form("Samantha"),
    tts_speed:     str = Form("1.0"),
    language:      str = Form("en"),
):
    focus = [f.strip() for f in focus_areas.split(",") if f.strip()]

    tts_module.set_voice(tts_voice)
    tts_module.set_speed(tts_speed)

    sess = session_module.create_session(
        role=role, difficulty=difficulty, focus_areas=focus,
        num_questions=num_questions, tts_voice=tts_voice, language=language,
    )
    sess.state = SessionState.GENERATING

    # ── Step 1: Pick questions from DB first, fill remainder with LLM ────────
    db_records, db_count = await asyncio.to_thread(
        db_module.pick_questions,
        role=role, difficulty=difficulty,
        count=num_questions, focus_areas=focus or None,
    )

    llm_needed = num_questions - db_count
    llm_questions: list[str] = []

    if llm_needed > 0:
        try:
            llm_questions = await asyncio.to_thread(
                llm_module.generate_questions,
                role=role, difficulty=difficulty,
                count=llm_needed, focus_areas=focus or None,
            )
        except Exception as exc:
            session_module.clear_session()
            raise HTTPException(500, f"LLM error: {exc}")

        # Pad if LLM returned fewer than expected
        while len(llm_questions) < llm_needed:
            llm_questions.append(f"Tell me about your experience as a {role}.")

    # ── Build QuestionEntry list: DB records first, then LLM ─────────────────
    idx = 0
    for rec in db_records:
        entry = session_module.QuestionEntry(index=idx, question=rec["question"])
        entry.hint_cache = rec.get("answer", "")   # pre-fill hint from DB
        entry.source     = "db"
        sess.questions.append(entry)
        idx += 1

    for q_text in llm_questions[:llm_needed]:
        entry = session_module.QuestionEntry(index=idx, question=q_text)
        entry.source = "llm"
        sess.questions.append(entry)
        idx += 1

    # Shuffle so DB and LLM questions are interleaved randomly
    import random
    random.shuffle(sess.questions)
    for i, q in enumerate(sess.questions):
        q.index = i

    sess.state      = SessionState.READY
    sess.started_at = time.time()

    return sess.to_dict()


# ── Question audio ─────────────────────────────────────────────────────────────

@router.get("/question/{index}/audio")
async def question_audio(index: int):
    sess = session_module.get_session_or_raise()
    if index >= len(sess.questions):
        raise HTTPException(404, "Question index out of range")

    q = sess.questions[index]
    try:
        # Serve pre-cached audio for q0 if available
        if getattr(q, 'audio_cache', b'') and index == 0:
            audio_bytes = q.audio_cache
        else:
            audio_bytes = await asyncio.to_thread(
                tts_module.speak, q.question, voice=sess.tts_voice
            )
    except Exception as exc:
        raise HTTPException(500, f"TTS error: {exc}")

    sess.questions[index].asked_at = time.time()
    if sess.state == SessionState.READY and index == 0:
        sess.state = SessionState.IN_PROGRESS

    return Response(
        content=audio_bytes, media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )


# ── Submit answer ──────────────────────────────────────────────────────────────

@router.post("/answer/{index}")
async def submit_answer(index: int, audio: UploadFile = File(...)):
    sess = session_module.get_session_or_raise()
    if index >= len(sess.questions):
        raise HTTPException(404, "Question index out of range")

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(400, "Empty audio")

    q_entry  = sess.questions[index]
    question = q_entry.question

    try:
        stt_result = await asyncio.to_thread(
            stt_module.transcribe, audio_bytes, language=sess.language
        )
    except Exception as exc:
        raise HTTPException(500, f"STT error: {exc}")

    transcript  = stt_result.get("text", "").strip()
    pron_report = scorer_module.score(transcript, transcript) if transcript else {
        "overall_score": 0, "grade": "F", "words": [], "feedback": "Nothing detected."
    }

    q_entry.answered            = True
    q_entry.answer_text         = transcript
    q_entry.answer_audio        = audio_bytes
    q_entry.answered_at         = time.time()
    q_entry.pronunciation_score = pron_report["overall_score"]
    q_entry.pronunciation_grade = pron_report["grade"]
    q_entry.pronunciation_words = pron_report.get("words", [])

    # ── Content scoring (LLM rates answer quality 0-10) ──────────────────────
    content_result = await asyncio.to_thread(
        llm_module.score_answer,
        question   = question,
        answer     = transcript,
        hint       = getattr(q_entry, "hint_cache", ""),
        role       = sess.role,
        difficulty = sess.difficulty,
    )
    q_entry.content_score    = content_result["score"]
    q_entry.content_label    = content_result["label"]
    q_entry.content_feedback = content_result["feedback"]

    if sess.answered_count() >= len(sess.questions):
        sess.state        = SessionState.COMPLETED
        sess.completed_at = time.time()

    return {
        "index":      index,
        "question":   question,
        "transcript": transcript,
        "pronunciation": {
            "score":    pron_report["overall_score"],
            "grade":    pron_report["grade"],
            "words":    pron_report.get("words", []),
            "feedback": pron_report.get("feedback", ""),
        },
        "content": {
            "score":    content_result["score"],
            "label":    content_result["label"],
            "feedback": content_result["feedback"],
        },
        "session_done": sess.state == SessionState.COMPLETED,
    }


# ── LLM feedback stream ────────────────────────────────────────────────────────

@router.get("/feedback/{index}")
async def feedback_stream(index: int):
    sess = session_module.get_session_or_raise()
    if index >= len(sess.questions):
        raise HTTPException(404)
    q_entry = sess.questions[index]
    if not q_entry.answered:
        raise HTTPException(400, "Answer not submitted yet")

    async def _gen():
        full = ""
        try:
            tokens = await asyncio.to_thread(
                lambda: list(llm_module.feedback_stream(
                    question=q_entry.question,
                    answer=q_entry.answer_text,
                    role=sess.role,
                ))
            )
            for token in tokens:
                full += token
                yield f"data: {json.dumps({'token': token, 'done': False})}\n\n"
            q_entry.llm_feedback = full
            yield f"data: {json.dumps({'token': '', 'done': True, 'full': full})}\n\n"
        except Exception as exc:
            msg = f"Feedback unavailable: {exc}"
            q_entry.llm_feedback = msg
            yield f"data: {json.dumps({'token': msg, 'done': True, 'full': msg})}\n\n"

    return StreamingResponse(
        _gen(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Hint stream ────────────────────────────────────────────────────────────────

@router.get("/hint/{index}")
async def hint_stream(index: int):
    """
    SSE stream: streams a model answer hint for question[index].
    Can be called any time (before or after answering).
    """
    sess = session_module.get_session_or_raise()
    if index >= len(sess.questions):
        raise HTTPException(404)

    q_entry = sess.questions[index]

    async def _gen():
        full = ""
        try:
            # Serve from pre-generated cache if available (instant)
            if getattr(q_entry, 'hint_cache', ''):
                cached = q_entry.hint_cache
                # Stream cache word by word for smooth appearance
                words = cached.split(' ')
                for i, word in enumerate(words):
                    chunk = word + (' ' if i < len(words)-1 else '')
                    full += chunk
                    yield f"data: {json.dumps({'token': chunk, 'done': False})}\n\n"
                    await asyncio.sleep(0.012)
                yield f"data: {json.dumps({'token': '', 'done': True, 'full': full})}\n\n"
                return
            # Fallback: generate on-demand
            tokens = await asyncio.to_thread(
                lambda: list(llm_module.hint_stream(
                    question=q_entry.question,
                    role=sess.role,
                    difficulty=sess.difficulty,
                ))
            )
            for token in tokens:
                full += token
                yield f"data: {json.dumps({'token': token, 'done': False})}\n\n"
            yield f"data: {json.dumps({'token': '', 'done': True, 'full': full})}\n\n"
        except Exception as exc:
            msg = f"Hint unavailable: {exc}"
            yield f"data: {json.dumps({'token': msg, 'done': True, 'full': msg})}\n\n"

    return StreamingResponse(
        _gen(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Session summary ────────────────────────────────────────────────────────────

@router.get("/summary")
async def session_summary():
    sess = session_module.get_session_or_raise()
    qa_log = [
        {"question": q.question, "answer": q.answer_text, "score": q.pronunciation_score}
        for q in sess.questions if q.answered
    ]
    try:
        summary = await asyncio.to_thread(
            llm_module.generate_summary, role=sess.role, qa_log=qa_log
        )
    except Exception as exc:
        summary = f"Summary unavailable: {exc}"

    sess.summary = summary
    return {
        "summary":  summary,
        "avg_score": sess.avg_pronunciation_score(),
        "answered": sess.answered_count(),
        "total":    len(sess.questions),
        "session":  sess.to_dict(),
    }


# ── Session state ──────────────────────────────────────────────────────────────

@router.get("/session")
def get_session():
    sess = session_module.get_session()
    return sess.to_dict() if sess else {"session": None}


@router.delete("/session")
def delete_session():
    session_module.clear_session()
    return {"cleared": True}