"""Guardrail detection engine.

Each detector returns a result dict:
  {status: pass|warning|blocked, confidence, reason, recommendation,
   findings: [...], time_ms}
The pipeline aggregates detector results into a risk score and redacted prompt.
"""
import re
import time

INJECTION_PATTERNS = [
    (r"ignore\s+(all\s+|any\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)", 0.95),
    (r"disregard\s+(your|the|all)\s+(instructions?|guidelines?|rules?|system)", 0.9),
    (r"you\s+are\s+now\s+(a|an|in)\s+", 0.6),
    (r"pretend\s+(you\s+are|to\s+be)\s+", 0.55),
    (r"(reveal|show|print|output|repeat)\s+(your|the)\s+(system\s+prompt|instructions|initial\s+prompt)", 0.95),
    (r"developer\s+mode", 0.8),
    (r"\bDAN\b|do\s+anything\s+now", 0.85),
    (r"jailbreak", 0.85),
    (r"act\s+as\s+(if\s+you\s+have\s+)?no\s+(restrictions?|filters?|rules?)", 0.9),
    (r"bypass\s+(the\s+)?(safety|filter|guardrail|restriction)", 0.9),
    (r"<\s*(system|assistant)\s*>", 0.7),
    (r"\[\s*system\s*\]", 0.7),
]

JAILBREAK_PATTERNS = [
    (r"hypothetically.{0,40}(illegal|harmful|dangerous)", 0.7),
    (r"for\s+(educational|fictional)\s+purposes\s+only.{0,60}(hack|exploit|weapon)", 0.75),
    (r"roleplay\s+as\s+.{0,40}(without|no)\s+(limits|restrictions)", 0.85),
    (r"grandma\s+exploit", 0.8),
    (r"opposite\s+day", 0.6),
]

PII_PATTERNS = [
    ("EMAIL", r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),
    ("PHONE", r"(?<!\d)(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)"),
    ("SSN", r"(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)"),
    ("CREDIT_CARD", r"(?<!\d)(?:\d[ -]?){13,16}(?!\d)"),
    ("IP_ADDRESS", r"(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)"),
    ("AADHAAR", r"(?<!\d)\d{4}\s\d{4}\s\d{4}(?!\d)"),
    ("PASSPORT", r"\b[A-Z]{1,2}\d{7}\b"),
    ("DOB", r"\b(?:0?[1-9]|[12]\d|3[01])[/-](?:0?[1-9]|1[0-2])[/-](?:19|20)\d{2}\b"),
]

SECRET_PATTERNS = [
    ("AWS_ACCESS_KEY", r"AKIA[0-9A-Z]{16}"),
    ("ANTHROPIC_KEY", r"sk-ant-[a-zA-Z0-9-_]{10,}"),
    ("OPENAI_KEY", r"sk-[a-zA-Z0-9]{20,}"),
    ("GITHUB_TOKEN", r"gh[pousr]_[A-Za-z0-9]{20,}"),
    ("SLACK_TOKEN", r"xox[baprs]-[A-Za-z0-9-]{10,}"),
    ("JWT", r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}"),
    ("PRIVATE_KEY", r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    ("BEARER_TOKEN", r"[Bb]earer\s+[A-Za-z0-9\-._~+/]{16,}"),
    ("PASSWORD_ASSIGNMENT", r"(?i)(password|passwd|pwd)\s*[:=]\s*\S{6,}"),
    ("API_KEY_ASSIGNMENT", r"(?i)(api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['\"]?[A-Za-z0-9\-._]{12,}"),
]

TOXICITY_WORDS = [
    "idiot", "stupid", "hate you", "kill", "moron", "worthless", "shut up",
]

FINANCIAL_PATTERNS = [
    ("IBAN", r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b"),
    ("SWIFT_BIC", r"\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b"),
    ("BANK_ACCOUNT", r"(?i)\b(?:account|acct)\.?\s*(?:no\.?|number|#)\s*[:=]?\s*\d{6,18}\b"),
    ("ROUTING_NUMBER", r"(?i)\brouting\s*(?:no\.?|number|#)?\s*[:=]?\s*\d{9}\b"),
    ("LARGE_AMOUNT", r"[$€£₹]\s?\d{1,3}(?:,\d{3}){1,}(?:\.\d{2})?"),
    ("INVOICE_REF", r"(?i)\binv(?:oice)?[-\s#]?\d{4,12}\b"),
    ("PO_NUMBER", r"(?i)\bP\.?O\.?[-\s#]?\d{4,12}\b"),
]


def _luhn_ok(digits: str) -> bool:
    digits = re.sub(r"\D", "", digits)
    if not 13 <= len(digits) <= 16:
        return False
    total, alt = 0, False
    for d in reversed(digits):
        n = int(d)
        if alt:
            n *= 2
            if n > 9:
                n -= 9
        total += n
        alt = not alt
    return total % 10 == 0


def _timed(fn):
    start = time.perf_counter()
    result = fn()
    result["time_ms"] = round((time.perf_counter() - start) * 1000, 2)
    return result


def detect_injection(text: str) -> dict:
    def run():
        hits = []
        confidence = 0.0
        for pattern, weight in INJECTION_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                hits.append(pattern)
                confidence = max(confidence, weight)
        if not hits:
            return {"status": "pass", "confidence": 0.0,
                    "reason": "No injection signatures detected", "findings": [],
                    "recommendation": "Proceed"}
        status = "blocked" if confidence >= 0.85 else "warning"
        return {"status": status, "confidence": confidence,
                "reason": f"{len(hits)} prompt-injection signature(s) matched",
                "findings": hits[:5],
                "recommendation": "Reject prompt" if status == "blocked" else "Sanitize and monitor"}
    return _timed(run)


def detect_jailbreak(text: str) -> dict:
    def run():
        hits, confidence = [], 0.0
        for pattern, weight in JAILBREAK_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                hits.append(pattern)
                confidence = max(confidence, weight)
        if not hits:
            return {"status": "pass", "confidence": 0.0,
                    "reason": "No jailbreak framing detected", "findings": [],
                    "recommendation": "Proceed"}
        status = "blocked" if confidence >= 0.85 else "warning"
        return {"status": status, "confidence": confidence,
                "reason": "Jailbreak framing patterns matched", "findings": hits[:5],
                "recommendation": "Escalate to review" if status == "warning" else "Reject prompt"}
    return _timed(run)


def detect_pii(text: str) -> dict:
    def run():
        findings = []
        redacted = text
        for label, pattern in PII_PATTERNS:
            for match in re.finditer(pattern, text):
                value = match.group(0)
                if label == "CREDIT_CARD" and not _luhn_ok(value):
                    continue
                findings.append({"type": label, "value": value})
                redacted = redacted.replace(value, f"[{label}]")
        if not findings:
            return {"status": "pass", "confidence": 0.0,
                    "reason": "No personally identifiable information found",
                    "findings": [], "redacted": text, "recommendation": "Proceed"}
        return {"status": "warning", "confidence": 0.92,
                "reason": f"{len(findings)} PII entit{'y' if len(findings)==1 else 'ies'} redacted",
                "findings": findings, "redacted": redacted,
                "recommendation": "Forward redacted prompt only"}
    return _timed(run)


def detect_secrets(text: str) -> dict:
    def run():
        findings = []
        redacted = text
        for label, pattern in SECRET_PATTERNS:
            for match in re.finditer(pattern, text):
                value = match.group(0)
                findings.append({"type": label, "value": value[:6] + "•••"})
                redacted = redacted.replace(value, f"[{label}_MASKED]")
        if not findings:
            return {"status": "pass", "confidence": 0.0,
                    "reason": "No credentials or secrets found", "findings": [],
                    "redacted": text, "recommendation": "Proceed"}
        return {"status": "warning", "confidence": 0.97,
                "reason": f"{len(findings)} secret(s) masked before model access",
                "findings": findings, "redacted": redacted,
                "recommendation": "Rotate exposed credentials"}
    return _timed(run)


def detect_compliance(text: str, blocked_topics: list) -> dict:
    def run():
        hits = [t for t in (blocked_topics or []) if t.lower() in text.lower()]
        if not hits:
            return {"status": "pass", "confidence": 0.0,
                    "reason": "No blocked topics under active policy",
                    "findings": [], "recommendation": "Proceed"}
        return {"status": "blocked", "confidence": 0.9,
                "reason": f"Blocked topic(s) under policy: {', '.join(hits)}",
                "findings": hits, "recommendation": "Reject prompt"}
    return _timed(run)


def detect_toxicity(text: str) -> dict:
    def run():
        hits = [w for w in TOXICITY_WORDS if w in text.lower()]
        if not hits:
            return {"status": "pass", "confidence": 0.0,
                    "reason": "No toxic language detected", "findings": [],
                    "recommendation": "Proceed"}
        return {"status": "warning", "confidence": 0.6,
                "reason": "Potentially toxic language detected", "findings": hits,
                "recommendation": "Soften phrasing"}
    return _timed(run)


def detect_financial(text: str) -> dict:
    """Sensitive financial number detection for finance/procurement policies."""
    def run():
        findings = []
        redacted = text
        for label, pattern in FINANCIAL_PATTERNS:
            for match in re.finditer(pattern, text):
                value = match.group(0)
                findings.append({"type": label, "value": value})
                if label in ("IBAN", "SWIFT_BIC", "BANK_ACCOUNT", "ROUTING_NUMBER"):
                    redacted = redacted.replace(value, f"[{label}]")
        if not findings:
            return {"status": "pass", "confidence": 0.0,
                    "reason": "No sensitive financial identifiers found",
                    "findings": [], "redacted": text, "recommendation": "Proceed"}
        masked = sum(1 for f in findings
                     if f["type"] in ("IBAN", "SWIFT_BIC", "BANK_ACCOUNT", "ROUTING_NUMBER"))
        return {"status": "warning", "confidence": 0.88,
                "reason": f"{len(findings)} financial identifier(s) flagged, {masked} masked",
                "findings": findings, "redacted": redacted,
                "recommendation": "Verify financial-compliance scope before sharing"}
    return _timed(run)


def validate_output(text: str) -> dict:
    def run():
        pii = detect_pii(text)
        if pii["status"] != "pass":
            return {"status": "warning", "confidence": pii["confidence"],
                    "reason": "PII detected in model output and redacted",
                    "findings": pii["findings"], "redacted": pii["redacted"],
                    "recommendation": "Deliver redacted output"}
        return {"status": "pass", "confidence": 0.0,
                "reason": "Output passed moderation and PII checks",
                "findings": [], "redacted": text, "recommendation": "Deliver"}
    return _timed(run)


def risk_from_stages(stages: list) -> tuple[float, str]:
    score = 0.0
    for stage in stages:
        result = stage["result"]
        if result["status"] == "blocked":
            score = max(score, 90 + result["confidence"] * 10)
        elif result["status"] == "warning":
            score = max(score, 35 + result["confidence"] * 40)
    score = min(round(score, 1), 100.0)
    level = ("critical" if score >= 90 else "high" if score >= 65
             else "medium" if score >= 35 else "low")
    return score, level
