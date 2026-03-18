"""
TTS Module — Kokoro-82M neural TTS (replaces macOS `say`).

Install:
    pip install kokoro>=0.9.4 soundfile
    brew install espeak-ng        # macOS
    # sudo apt-get install espeak-ng   # Linux

Why Kokoro?
  - 82M parameter open-weight model — near human quality
  - Apache licensed, runs 100% locally (no API key)
  - ~300 MB download on first use (cached by HuggingFace)
  - 24 kHz output — significantly more natural than macOS `say`
  - 20+ voices: American/British English, multiple genders & styles

On Mac M-series:  set PYTORCH_ENABLE_MPS_FALLBACK=1 in your shell
    export PYTORCH_ENABLE_MPS_FALLBACK=1
    uvicorn server:app --host 127.0.0.1 --port 8766

Speed multipliers → passed directly to Kokoro pipeline:
  0.75 = slow  |  1.0 = normal  |  1.25 = fast
"""

from __future__ import annotations

import io
import os
import subprocess
import tempfile
import warnings
from pathlib import Path
from typing import Optional

import numpy as np

# ── Kokoro lazy-load (imported once on first speak()) ─────────────────────────
_pipeline_cache: dict[str, object] = {}   # lang_code → KPipeline instance

def _get_pipeline(lang_code: str = "a"):
    if lang_code not in _pipeline_cache:
        from kokoro import KPipeline
        # Suppress torch weight_norm + dropout warnings (cosmetic, not errors)
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=FutureWarning)
            warnings.filterwarnings("ignore", category=UserWarning)
            _pipeline_cache[lang_code] = KPipeline(
                lang_code=lang_code,
                repo_id="hexgrad/Kokoro-82M",
            )
    return _pipeline_cache[lang_code]


# ── Config ────────────────────────────────────────────────────────────────────

DEFAULT_VOICE = os.getenv("TTS_VOICE", "am_adam")

# Speed multiplier presets (passed directly to KPipeline)
SPEED_PRESETS: dict[str, float] = {
    "0.75": 0.75,   # slow  — clear for non-native speakers
    "1.0":  1.0,    # normal
    "1.25": 1.25,   # fast  — brisk interviewer pace
}

# Available voices — (voice_id, display_name, lang_code, accent, gender)
VOICES: dict[str, dict] = {
    # ── American English ──────────────────────────────────────────────────────
    "af_heart":    {"label": "Heart",    "accent": "American",        "gender": "female", "lang": "a"},
    "af_bella":    {"label": "Bella",    "accent": "American",        "gender": "female", "lang": "a"},
    "af_sarah":    {"label": "Sarah",    "accent": "American",        "gender": "female", "lang": "a"},
    "af_nicole":   {"label": "Nicole",   "accent": "American",        "gender": "female", "lang": "a"},
    "af_sky":      {"label": "Sky",      "accent": "American",        "gender": "female", "lang": "a"},
    "am_adam":     {"label": "Adam",     "accent": "American",        "gender": "male",   "lang": "a"},
    "am_michael":  {"label": "Michael",  "accent": "American",        "gender": "male",   "lang": "a"},
    "am_echo":     {"label": "Echo",     "accent": "American",        "gender": "male",   "lang": "a"},
    "am_eric":     {"label": "Eric",     "accent": "American",        "gender": "male",   "lang": "a"},
    "am_liam":     {"label": "Liam",     "accent": "American",        "gender": "male",   "lang": "a"},
    "am_onyx":     {"label": "Onyx",     "accent": "American",        "gender": "male",   "lang": "a"},
    # ── British English ───────────────────────────────────────────────────────
    "bf_emma":     {"label": "Emma",     "accent": "British",         "gender": "female", "lang": "b"},
    "bf_isabella": {"label": "Isabella", "accent": "British",         "gender": "female", "lang": "b"},
    "bm_george":   {"label": "George",   "accent": "British",         "gender": "male",   "lang": "b"},
    "bm_lewis":    {"label": "Lewis",    "accent": "British",         "gender": "male",   "lang": "b"},
    "bm_daniel":   {"label": "Daniel",   "accent": "British",         "gender": "male",   "lang": "b"},
}

_active_voice: str  = DEFAULT_VOICE
_voices_ready: bool = False   # set True when preload() completes
_active_speed: str  = "1.0"


# ── Setters / getters ─────────────────────────────────────────────────────────

def set_voice(name: str) -> None:
    global _active_voice
    if name in VOICES:
        _active_voice = name

def set_speed(speed: str) -> None:
    global _active_speed
    if speed in SPEED_PRESETS:
        _active_speed = speed

def get_voice() -> str:
    return _active_voice

def get_speed() -> str:
    return _active_speed

def get_voices() -> dict:
    return VOICES

def get_speed_presets() -> dict:
    return {
        k: {"label": _speed_label(k), "multiplier": v}
        for k, v in SPEED_PRESETS.items()
    }

def _speed_label(s: str) -> str:
    return {"0.75": "0.75× Slow", "1.0": "1.0× Normal", "1.25": "1.25× Fast"}.get(s, s)


# ── Core speak function ───────────────────────────────────────────────────────

def speak(text: str, voice: Optional[str] = None, speed: Optional[str] = None) -> bytes:
    """
    Convert text → MP3 bytes using Kokoro-82M.

    First call downloads ~300 MB model weights from HuggingFace (cached).
    Subsequent calls are fast (model stays loaded in memory).

    Returns MP3 bytes, or WAV bytes if ffmpeg is not available.
    """
    v     = voice or _active_voice
    spd   = SPEED_PRESETS.get(speed or _active_speed, 1.0)
    vinfo = VOICES.get(v, VOICES[DEFAULT_VOICE])
    lang  = vinfo.get("lang", "a")

    pipeline = _get_pipeline(lang)

    # Collect all audio chunks from the generator
    chunks: list[np.ndarray] = []
    for _gs, _ps, audio in pipeline(text, voice=v, speed=spd):
        chunks.append(audio)

    if not chunks:
        raise RuntimeError("Kokoro produced no audio output")

    audio_np = np.concatenate(chunks)   # shape: (N,)  float32  24 kHz

    # Prepend 220ms silence — prevents first word being clipped by
    # audio hardware/browser startup latency ("How do you" → "do you")
    SAMPLE_RATE   = 24000
    LEADING_MS    = 450
    leading       = np.zeros(int(SAMPLE_RATE * LEADING_MS / 1000), dtype=np.float32)
    audio_np      = np.concatenate([leading, audio_np])

    # Write to WAV in memory
    wav_buf = io.BytesIO()
    import soundfile as sf
    sf.write(wav_buf, audio_np, 24000, format="WAV", subtype="PCM_16")
    wav_bytes = wav_buf.getvalue()

    # Optionally convert to MP3 via ffmpeg
    return _wav_to_mp3(wav_bytes)


def _wav_to_mp3(wav_bytes: bytes) -> bytes:
    """Convert WAV bytes → MP3 bytes via ffmpeg. Falls back to WAV if unavailable."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wf:
        wf.write(wav_bytes)
        wav_path = wf.name

    mp3_path = wav_path.replace(".wav", ".mp3")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", wav_path,
             "-codec:a", "libmp3lame", "-qscale:a", "3",
             "-loglevel", "error", mp3_path],
            check=True, capture_output=True, timeout=20,
        )
        return Path(mp3_path).read_bytes()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return wav_bytes   # fallback: raw WAV (browsers play it fine)
    finally:
        Path(wav_path).unlink(missing_ok=True)
        Path(mp3_path).unlink(missing_ok=True)


def voices_ready() -> bool:
    """Return True once all voices have been pre-warmed."""
    return _voices_ready


def is_available() -> bool:
    """Return True if the kokoro package is importable."""
    try:
        import kokoro  # noqa: F401
        return True
    except ImportError:
        return False


def preload() -> None:
    """
    Warm up ALL voices at startup by generating a short silent phrase.
    This downloads model weights and caches every voice file (~300MB total,
    only on first run). Subsequent runs are instant.
    Called once in background at server start via asyncio.create_task().
    """
    import logging
    log = logging.getLogger("tts_preload")
    warmup_text = "Hello."

    # Load both pipeline langs first (downloads model weights if needed)
    for lang in ("a", "b"):
        try:
            _get_pipeline(lang)
            log.info(f"[TTS] pipeline lang={lang} ready")
        except Exception as e:
            log.warning(f"[TTS] pipeline lang={lang} failed: {e}")

    # Warm up every voice (downloads individual voice files)
    for voice_id, vinfo in VOICES.items():
        try:
            speak(warmup_text, voice=voice_id)
            log.info(f"[TTS] voice {voice_id} ({vinfo['label']}) warmed up")
        except Exception as e:
            log.warning(f"[TTS] voice {voice_id} warmup failed: {e}")

    log.info("[TTS] All voices ready")
    global _voices_ready
    _voices_ready = True