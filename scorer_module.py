"""
Scorer Module — pronunciation scoring (reused from Phonix).

In the interviewer context this is used to score how clearly
the candidate pronounced their answer, separate from content quality.
Content quality is handled by llm_module.feedback_on_answer().
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import asdict, dataclass
from difflib import SequenceMatcher


@dataclass
class WordResult:
    word:   str     # target word
    spoken: str     # what was heard
    status: str     # "correct" | "wrong" | "missing" | "extra"
    score:  float   # 0.0 – 1.0


@dataclass
class PronunciationReport:
    target:        str
    transcript:    str
    overall_score: float
    grade:         str
    words:         list[WordResult]
    feedback:      str


def _clean(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    text = re.sub(r"[^\w\s]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _word_sim(a: str, b: str) -> float:
    if a == b: return 1.0
    return SequenceMatcher(None, a, b).ratio()


def _grade(s: float) -> str:
    if s >= 90: return "A"
    if s >= 80: return "B"
    if s >= 65: return "C"
    if s >= 50: return "D"
    return "F"


THRESHOLD = 0.72


def score(target: str, transcript: str) -> dict:
    """Compare target text against transcript, return scoring report dict."""
    tw = _clean(target).split()
    sw = _clean(transcript).split()

    matcher = SequenceMatcher(None, tw, sw, autojunk=False)
    results: list[WordResult] = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for w in tw[i1:i2]:
                results.append(WordResult(w, w, "correct", 1.0))
        elif tag == "replace":
            for k, w in enumerate(tw[i1:i2]):
                if k < (j2 - j1):
                    s = sw[j1 + k]
                    sim = _word_sim(w, s)
                    results.append(WordResult(w, s, "correct" if sim >= THRESHOLD else "wrong", round(sim, 3)))
                else:
                    results.append(WordResult(w, "", "missing", 0.0))
            for s in sw[j1 + len(tw[i1:i2]):j2]:
                results.append(WordResult("", s, "extra", 0.0))
        elif tag == "delete":
            for w in tw[i1:i2]:
                results.append(WordResult(w, "", "missing", 0.0))
        elif tag == "insert":
            for s in sw[j1:j2]:
                results.append(WordResult("", s, "extra", 0.0))

    total = len(tw)
    if total == 0:
        overall = 0.0
    else:
        earned  = sum(r.score for r in results if r.status != "extra")
        overall = round(earned / total * 100, 1)

    wrong = [r for r in results if r.status in ("wrong", "missing")]
    if overall >= 95:
        fb = "Excellent pronunciation! 🎉"
    elif overall >= 80:
        missed = ", ".join(f'"{w.word}"' for w in wrong[:3])
        fb = f"Good! Watch: {missed}." if missed else "Good pronunciation."
    elif overall >= 60:
        missed = ", ".join(f'"{w.word}"' for w in wrong[:4])
        fb = f"Decent. Focus on: {missed}."
    else:
        missed = ", ".join(f'"{w.word}"' for w in wrong[:5])
        fb = f"Needs work: {missed}."

    return asdict(PronunciationReport(
        target        = target,
        transcript    = transcript,
        overall_score = overall,
        grade         = _grade(overall),
        words         = results,
        feedback      = fb,
    ))