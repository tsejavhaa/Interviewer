"""
Session Module — in-memory interview session management.

A session tracks the full lifecycle of one interview:
  setup → questions_ready → in_progress → completed

Each session stores:
  - The role, difficulty, question count
  - All generated questions
  - Per-question answers: transcript, pronunciation report, LLM feedback
  - Timestamps for analytics

Sessions live in memory (no DB). On server restart they're gone.
That's fine for v1 — history persistence can be added later.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Optional


# ── Enums ─────────────────────────────────────────────────────────────────────

class SessionState(str, Enum):
    SETUP       = "setup"         # waiting for role/config
    GENERATING  = "generating"    # LLM generating questions
    READY       = "ready"         # questions ready, not started
    IN_PROGRESS = "in_progress"   # interview underway
    COMPLETED   = "completed"     # all questions answered


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class QuestionEntry:
    index:      int
    question:   str
    audio_path: Optional[str]  = None   # path to TTS mp3 on disk

    # Filled after the user answers
    answered:        bool  = False
    answer_text:     str   = ""
    answer_audio:    bytes = field(default_factory=bytes, repr=False)

    # Pronunciation report from scorer_module
    pronunciation_score: float = 0.0
    pronunciation_grade: str   = ""
    pronunciation_words: list  = field(default_factory=list)

    # Content feedback from LLM
    llm_feedback: str = ""

    # Content quality score from LLM (0-10)
    content_score: int   = -1   # -1 = not yet scored
    content_label: str   = ""
    content_feedback: str = ""

    # Pre-generated hint / model answer
    hint_cache:  str   = ""

    # Pre-generated TTS audio for q0
    audio_cache: bytes = field(default_factory=bytes, repr=False)

    # Origin: "db" = from JSON database, "llm" = LLM generated
    source: str = "llm"

    # Timing
    asked_at:    float = 0.0
    answered_at: float = 0.0


@dataclass
class InterviewSession:
    id:          str
    role:        str
    difficulty:  str
    focus_areas: list[str]
    num_questions: int

    state:     SessionState = SessionState.SETUP
    questions: list[QuestionEntry] = field(default_factory=list)

    current_index: int = 0   # which question is active (0-based)

    created_at:   float = field(default_factory=time.time)
    started_at:   float = 0.0
    completed_at: float = 0.0

    # Final LLM summary (populated at end)
    summary: str = ""

    # TTS voice used for this session
    tts_voice: str = "Samantha"

    # STT language
    language: str = "en"

    def current_question(self) -> Optional[QuestionEntry]:
        if 0 <= self.current_index < len(self.questions):
            return self.questions[self.current_index]
        return None

    def is_done(self) -> bool:
        return self.current_index >= len(self.questions)

    def answered_count(self) -> int:
        return sum(1 for q in self.questions if q.answered)

    def avg_pronunciation_score(self) -> float:
        scores = [q.pronunciation_score for q in self.questions if q.answered]
        return round(sum(scores) / len(scores), 1) if scores else 0.0

    def to_dict(self) -> dict:
        d = asdict(self)
        d["state"] = self.state.value
        # Don't serialise raw audio bytes — too large
        for q in d["questions"]:
            q.pop("answer_audio", None)
            q.pop("audio_cache",  None)
            q.pop("hint_cache",   None)
        return d


# ── Registry ──────────────────────────────────────────────────────────────────
# One active session per server instance.
# v1: single-user. Future: dict keyed by session_id for multi-user.

_current: Optional[InterviewSession] = None


def create_session(
    role:         str,
    difficulty:   str = "mid",
    focus_areas:  list[str] | None = None,
    num_questions: int = 5,
    tts_voice:    str = "Samantha",
    language:     str = "en",
) -> InterviewSession:
    global _current
    _current = InterviewSession(
        id            = uuid.uuid4().hex[:10],
        role          = role,
        difficulty    = difficulty,
        focus_areas   = focus_areas or [],
        num_questions = num_questions,
        tts_voice     = tts_voice,
        language      = language,
    )
    return _current


def get_session() -> Optional[InterviewSession]:
    return _current


def get_session_or_raise() -> InterviewSession:
    if _current is None:
        raise ValueError("No active session. Create one first.")
    return _current


def clear_session() -> None:
    global _current
    _current = None


def advance_question(session: InterviewSession) -> bool:
    """Move to the next question. Returns False if already at end."""
    if session.current_index < len(session.questions) - 1:
        session.current_index += 1
        return True
    return False