"""Token optimization engine: semantic cleanup, filler removal, dedup."""
import re

FILLER_PHRASES = [
    r"\bplease\b", r"\bkindly\b", r"\bcould you( please)?\b",
    r"\bwould you( please)?\b", r"\bi was wondering if( you could)?\b",
    r"\bif (it'?s|it is) not too much trouble,?\b",
    r"\bcan you help me( to)?\b", r"\bi (would|'d) like (you )?to\b",
    r"\bbasically\b", r"\bactually\b", r"\bjust\b", r"\breally\b",
    r"\bvery much\b", r"\bthank(s| you)( in advance)?[.!]?\b",
    r"\bhello[,.!]?\s", r"\bhi[,.!]?\s", r"\bhey[,.!]?\s",
    r"\bin order to\b",
]

REWRITES = [
    (r"\bin order to\b", "to"),
    (r"\bdue to the fact that\b", "because"),
    (r"\bat this point in time\b", "now"),
    (r"\bwith regards? to\b", "about"),
    (r"\bfor the purpose of\b", "for"),
    (r"\bas soon as possible\b", "ASAP"),
]


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, round(len(text) / 4))


def optimize(text: str, target_pct: int = 20) -> dict:
    original = text
    removed = []

    working = text
    for pattern in FILLER_PHRASES:
        for match in re.finditer(pattern, working, re.IGNORECASE):
            removed.append(match.group(0).strip())
        working = re.sub(pattern, " ", working, flags=re.IGNORECASE)

    for pattern, replacement in REWRITES:
        working = re.sub(pattern, replacement, working, flags=re.IGNORECASE)

    # duplicate sentence removal
    sentences = re.split(r"(?<=[.!?])\s+", working)
    seen, unique = set(), []
    for sentence in sentences:
        key = re.sub(r"\W+", "", sentence.lower())
        if key and key in seen:
            removed.append(sentence.strip())
            continue
        seen.add(key)
        unique.append(sentence)
    working = " ".join(unique)

    # whitespace normalization
    working = re.sub(r"\s{2,}", " ", working).strip()
    working = re.sub(r"\s+([,.!?;:])", r"\1", working)
    if working and working[0].islower():
        working = working[0].upper() + working[1:]

    tokens_before = estimate_tokens(original)
    tokens_after = estimate_tokens(working)
    saved = max(0, tokens_before - tokens_after)
    pct = round(saved / tokens_before * 100, 1) if tokens_before else 0.0

    return {
        "original": original,
        "optimized": working or original,
        "removed": [r for r in removed if r][:20],
        "tokens_before": tokens_before,
        "tokens_after": tokens_after,
        "tokens_saved": saved,
        "compression_pct": pct,
        "target_pct": target_pct,
    }
