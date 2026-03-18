"""
STT Module — faster-whisper speech-to-text.

Identical role as asr_module.py in Phonix, kept as a separate file
so the interviewer app is fully self-contained.

Model is loaded once at startup and cached.
Default: "base" — better accuracy than tiny for free-form answers.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from faster_whisper import WhisperModel

# ── Paths ─────────────────────────────────────────────────────────────────────

MODELS_DIR = Path(__file__).parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

# ── Cache ─────────────────────────────────────────────────────────────────────

_MODEL: WhisperModel | None = None
_MODEL_NAME: str = os.getenv("WHISPER_MODEL", "base")


def load_model(name: str | None = None) -> WhisperModel:
    global _MODEL, _MODEL_NAME
    if name:
        _MODEL_NAME = name
    if _MODEL is None:
        print(f"[STT] Loading faster-whisper/{_MODEL_NAME}…")
        _MODEL = WhisperModel(
            _MODEL_NAME,
            device         = "cpu",
            compute_type   = "int8",
            download_root  = str(MODELS_DIR),
        )
        print(f"[STT] Model ready ✓")
    return _MODEL


def transcribe(audio_bytes: bytes, language: str = "en") -> dict:
    """
    Transcribe audio bytes → {"text": str, "language": str, "words": [...]}
    words: [{"word": str, "start": float, "end": float, "probability": float}]
    """
    model = load_model()

    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        segments, info = model.transcribe(
            tmp_path,
            language         = language,
            beam_size        = 3,
            word_timestamps  = True,
            vad_filter       = True,    # skip silence — cleaner for interview answers
        )

        words_out = []
        text_parts = []

        for seg in segments:
            text_parts.append(seg.text.strip())
            if seg.words:
                for w in seg.words:
                    words_out.append({
                        "word":        w.word.strip(),
                        "start":       round(w.start, 2),
                        "end":         round(w.end,   2),
                        "probability": round(w.probability, 3),
                    })

    finally:
        Path(tmp_path).unlink(missing_ok=True)

    return {
        "text":     " ".join(text_parts),
        "language": info.language,
        "words":    words_out,
    }