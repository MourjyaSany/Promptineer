"""Token optimization service.

LLMLingua (LLMLingua-2) performs semantic prompt compression when installed;
policy suites choose a compression level (low/medium/high/maximum) that maps
to a target compression rate. The model loads lazily in a background thread
so the first request never blocks on a model download; until it is ready the
native heuristic engine (filler removal, rewrites, dedup) handles requests.

Every result reports: original tokens, optimized tokens, compression %,
estimated cost saved and estimated latency improvement — plus which engine
actually did the work.
"""
import logging
import os
import threading

from ..optimizer import estimate_tokens, optimize as native_optimize

log = logging.getLogger("promptineering.optimizer")

# level -> (LLMLingua target rate = kept fraction, native target % reduction)
LEVELS = {
    "low":     (0.85, 10),
    "medium":  (0.65, 20),
    "high":    (0.50, 30),
    "maximum": (0.35, 40),
}

# Blended $/M input tokens used for the cost-saved estimate
COST_PER_M_INPUT = float(os.environ.get("PROMPTINEERING_COST_PER_M", "3.0"))
# Rough serving throughput used for the latency-improvement estimate
_MS_PER_TOKEN = 0.35

LLMLINGUA_MODEL = os.environ.get(
    "LLMLINGUA_MODEL",
    "microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank",
)

_compressor = None
_state = "cold"     # cold | loading | ready | unavailable
_lock = threading.Lock()


def _load_compressor():
    global _compressor, _state
    try:
        from llmlingua import PromptCompressor
        _compressor = PromptCompressor(
            model_name=LLMLINGUA_MODEL,
            use_llmlingua2=True,
            device_map=os.environ.get("LLMLINGUA_DEVICE", "cpu"),
        )
        _state = "ready"
        log.info("LLMLingua-2 compressor ready (%s)", LLMLINGUA_MODEL)
    except Exception as exc:  # pragma: no cover - environment dependent
        _state = "unavailable"
        log.warning("LLMLingua unavailable, using native optimizer: %s", exc)


def warm_up():
    """Kick off the background model load once (called at startup)."""
    global _state
    if os.environ.get("PROMPTINEERING_DISABLE_LLMLINGUA") == "1":
        _state = "unavailable"
        return
    with _lock:
        if _state != "cold":
            return
        _state = "loading"
    threading.Thread(target=_load_compressor, daemon=True).start()


def engine_info() -> dict:
    return {"engine": "llmlingua-2" if _state == "ready" else "native-heuristic",
            "llmlingua_state": _state, "model": LLMLINGUA_MODEL}


def _finalize(original: str, optimized: str, removed: list, level: str,
              engine: str) -> dict:
    tokens_before = estimate_tokens(original)
    tokens_after = estimate_tokens(optimized)
    saved = max(0, tokens_before - tokens_after)
    pct = round(saved / tokens_before * 100, 1) if tokens_before else 0.0
    return {
        "original": original,
        "optimized": optimized or original,
        "removed": removed[:20],
        "tokens_before": tokens_before,
        "tokens_after": tokens_after,
        "tokens_saved": saved,
        "compression_pct": pct,
        "compression_level": level,
        "engine": engine,
        "est_cost_saved_usd": round(saved / 1_000_000 * COST_PER_M_INPUT, 6),
        "est_latency_saved_ms": round(saved * _MS_PER_TOKEN, 1),
    }


def compress(text: str, level: str = "medium") -> dict:
    """Compress a prompt at the policy's compression level."""
    level = level if level in LEVELS else "medium"
    rate, native_target = LEVELS[level]

    if _state == "ready" and _compressor is not None:
        try:
            result = _compressor.compress_prompt(
                text, rate=rate, force_tokens=["\n", "?", ".", "!", ","],
            )
            compressed = result.get("compressed_prompt") or text
            # LLMLingua drops low-information tokens; surface a diff-style
            # sample of removed words for the intelligence panel
            removed = [w for w in text.split() if w not in compressed.split()][:20]
            return _finalize(text, compressed, removed, level, "llmlingua-2")
        except Exception as exc:  # pragma: no cover
            log.warning("LLMLingua compression failed, falling back: %s", exc)

    native = native_optimize(text, native_target)
    return _finalize(text, native["optimized"], native["removed"], level,
                     "native-heuristic")
