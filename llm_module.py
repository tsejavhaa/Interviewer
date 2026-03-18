"""
LLM Module — Ollama HTTP client.

Responsibilities:
  1. Generate interview questions for a given role + difficulty
  2. Give brief content feedback on a candidate's answer
  3. Produce a final session summary

Why Ollama?
  Ollama runs as a local server (brew install ollama → ollama serve).
  We just HTTP-call it — no Python SDK needed, no GPU required.
  llama3.2:1b is ~1.3 GB and runs at ~30 tok/s on M1 CPU.

Supported models (set OLLAMA_MODEL in env or call set_model()):
  llama3.2:1b   — fastest, good enough for interview Q&A  (default)
  llama3.2:3b   — better reasoning, still fits in 8 GB
  qwen2.5:1.5b  — alternative, very fast

Install:
  brew install ollama
  ollama serve          # keep running in a separate terminal
  ollama pull llama3.2:1b
"""

from __future__ import annotations

import json
import os
import re
import requests
from typing import Generator

# ── Config ────────────────────────────────────────────────────────────────────

OLLAMA_BASE   = os.getenv("OLLAMA_BASE", "http://localhost:11434")
OLLAMA_MODEL  = os.getenv("OLLAMA_MODEL", "llama3.2:1b")

# Timeout for Ollama requests (seconds)
# First call can be slow while Ollama loads the model weights into memory
REQUEST_TIMEOUT = 45


# ── Health check ──────────────────────────────────────────────────────────────

def is_available() -> bool:
    """Return True if Ollama is running and the model is ready."""
    try:
        r = requests.get(f"{OLLAMA_BASE}/api/tags", timeout=3)
        models = [m["name"] for m in r.json().get("models", [])]
        return any(OLLAMA_MODEL in m for m in models)
    except Exception:
        return False


def get_model() -> str:
    return OLLAMA_MODEL


def set_model(name: str) -> None:
    global OLLAMA_MODEL
    OLLAMA_MODEL = name


# ── Core completion ───────────────────────────────────────────────────────────

def _complete(prompt: str, system: str = "", max_tokens: int = 512) -> str:
    """
    Send a prompt to Ollama and return the full response string.
    Blocks until the model finishes generating.
    """
    payload = {
        "model":  OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "num_predict": max_tokens,
            "temperature": 0.7,
            "top_p":       0.9,
        },
    }
    if system:
        payload["system"] = system

    resp = requests.post(
        f"{OLLAMA_BASE}/api/generate",
        json    = payload,
        timeout = REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json().get("response", "").strip()


def _complete_stream(prompt: str, system: str = "") -> Generator[str, None, None]:
    """
    Stream tokens from Ollama. Yields one token string at a time.
    Used for the feedback endpoint so the UI can show text as it arrives.
    """
    payload = {
        "model":  OLLAMA_MODEL,
        "prompt": prompt,
        "stream": True,
        "options": {"temperature": 0.7},
    }
    if system:
        payload["system"] = system

    with requests.post(
        f"{OLLAMA_BASE}/api/generate",
        json    = payload,
        stream  = True,
        timeout = REQUEST_TIMEOUT,
    ) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines():
            if line:
                chunk = json.loads(line)
                token = chunk.get("response", "")
                if token:
                    yield token
                if chunk.get("done"):
                    break


# ── Interview question generation ─────────────────────────────────────────────

SYSTEM_INTERVIEWER = """You are a professional technical interviewer.
Ask clear, concise interview questions. Be direct and professional.
Return only the questions — no numbering, no preamble, no explanations."""


def generate_questions(
    role:         str,
    difficulty:   str = "mid",    # "junior" | "mid" | "senior"
    count:        int = 5,
    focus_areas:  list[str] | None = None,
) -> list[str]:
    """
    Generate `count` interview questions for a given role and difficulty.
    Returns a plain list of question strings.
    """
    focus = ""
    if focus_areas:
        focus = f"Focus on these areas: {', '.join(focus_areas)}."

    prompt = f"""List {count} {difficulty} {role} interview questions.
{focus}One per line. Questions only."""

    raw = _complete(prompt, system=SYSTEM_INTERVIEWER, max_tokens=180)

    # Parse — one question per non-empty line
    questions = [
        line.strip().lstrip("0123456789.-) ").strip()
        for line in raw.splitlines()
        if line.strip() and "?" in line
    ]

    # Fallback: split on newlines if no "?" found
    if not questions:
        questions = [l.strip() for l in raw.splitlines() if len(l.strip()) > 10]

    return questions[:count]


# ── Answer feedback ───────────────────────────────────────────────────────────

SYSTEM_FEEDBACK = """You are a concise, honest interview coach.
Give brief, actionable feedback on interview answers.
Be direct. Max 3 sentences. Focus on content quality, not pronunciation."""


def feedback_on_answer(
    question:   str,
    answer:     str,
    role:       str,
) -> str:
    """
    Return a brief text assessment of the candidate's answer.
    Streaming version available via feedback_stream().
    """
    if not answer.strip():
        return "No answer was detected. Please try again."

    prompt = f"""Role: {role}
Question: {question}
Candidate answered: "{answer}"

Give brief feedback (2–3 sentences) on the quality and completeness of this answer."""

    return _complete(prompt, system=SYSTEM_FEEDBACK, max_tokens=150)


def feedback_stream(
    question: str,
    answer:   str,
    role:     str,
) -> Generator[str, None, None]:
    """Streaming version of feedback_on_answer for SSE."""
    if not answer.strip():
        yield "No answer detected."
        return

    prompt = f"""Role: {role}
Question: {question}
Candidate answered: "{answer}"

Give brief feedback (2–3 sentences) on the quality of this answer."""

    yield from _complete_stream(prompt, system=SYSTEM_FEEDBACK)


# ── Hint / model answer ───────────────────────────────────────────────────────

SYSTEM_HINT = """You are a senior interview coach helping someone practice.
Write a concise, strong model answer to the interview question.
Structure: 2–4 sentences covering the key points a strong candidate would say.
Be direct and concrete. Use plain language. No fluff."""


def generate_hint(
    question: str,
    role:     str,
    difficulty: str = "mid",
) -> str:
    """
    Return a model answer / hint for the given interview question.
    Called when the user clicks the Hint button.
    """
    prompt = f"""Role: {difficulty}-level {role}
Question: "{question}"

Write a concise model answer (3–5 sentences) that a strong candidate would give.
Focus on what to say, not how to say it."""

    return _complete(prompt, system=SYSTEM_HINT, max_tokens=200)


def hint_stream(
    question:   str,
    role:       str,
    difficulty: str = "mid",
) -> Generator[str, None, None]:
    """Streaming version of generate_hint for SSE."""
    prompt = f"""Role: {difficulty}-level {role}
Question: "{question}"

Write a concise model answer (3–5 sentences) that a strong candidate would give."""

    yield from _complete_stream(prompt, system=SYSTEM_HINT)


# ── Session summary ───────────────────────────────────────────────────────────

SYSTEM_SUMMARY = """You are a professional interview evaluator.
Write a concise, honest overall assessment of an interview session.
Be constructive and specific. Max 5 sentences."""


def generate_summary(
    role:    str,
    qa_log:  list[dict],   # list of {question, answer, score}
) -> str:
    """
    Generate a final summary for a completed interview session.

    qa_log format:
      [{"question": "...", "answer": "...", "score": 85}, ...]
    """
    lines = []
    for i, qa in enumerate(qa_log, 1):
        lines.append(
            f"Q{i}: {qa['question']}\n"
            f"A{i}: {qa['answer']} (pronunciation score: {qa.get('score', '?')}%)"
        )

    prompt = f"""Interview role: {role}
Session transcript:
{chr(10).join(lines)}

Write a 4–5 sentence overall assessment covering:
1. Communication and pronunciation quality
2. Answer depth and relevance
3. One specific strength and one area to improve"""

    return _complete(prompt, system=SYSTEM_SUMMARY, max_tokens=250)


# ── Answer content scoring ────────────────────────────────────────────────────

SYSTEM_SCORER = """You are a strict but fair technical interview evaluator.
Score the candidate's answer from 0 to 10 based on accuracy, completeness, and depth.
Return ONLY a JSON object with exactly these fields, nothing else:
{"score": <0-10>, "label": "<one of: No answer|Poor|Weak|Basic|Fair|Good|Strong|Excellent|Outstanding|Perfect>", "feedback": "<one concise sentence explaining the score>"}"""


def score_answer(
    question:   str,
    answer:     str,
    hint:       str = "",
    role:       str = "",
    difficulty: str = "mid",
) -> dict:
    """
    Rate the candidate's answer 0-10 using LLM.

    Returns dict with keys: score (int 0-10), label (str), feedback (str)
    Falls back to {"score": 0, "label": "Error", "feedback": "..."} on failure.
    """
    import json as _json

    hint_section = f"\nModel Answer (for reference):\n{hint}" if hint else ""

    prompt = f"""Role: {difficulty}-level {role}
Question: {question}
Candidate answered: "{answer}"{hint_section}

Rate this answer 0-10. Return only JSON."""

    try:
        raw = _complete(prompt, system=SYSTEM_SCORER, max_tokens=120)

        # Strip markdown fences if present
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        result = _json.loads(raw.strip())
        score  = max(0, min(10, int(result.get("score", 0))))
        label  = result.get("label", _score_label(score))
        feedback = result.get("feedback", "")
        return {"score": score, "label": label, "feedback": feedback}
    except Exception as e:
        # Fallback: empty answer = 0, anything else = 3
        s = 0 if len(answer.strip()) < 5 else 3
        return {"score": s, "label": _score_label(s), "feedback": f"Scoring unavailable ({e})"}


def _score_label(s: int) -> str:
    labels = ["No answer","Poor","Weak","Basic","Fair","Good","Strong","Excellent","Outstanding","Outstanding","Perfect"]
    return labels[max(0, min(10, s))]