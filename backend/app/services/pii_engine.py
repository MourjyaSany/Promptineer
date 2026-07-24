"""PII detection & masking service.

Microsoft Presidio (analyzer + anonymizer over a spaCy NLP pipeline) is the
primary engine when installed — it adds NER-based entities (names, locations,
nationalities) and checksum-validated recognizers on top of pattern matching.
The platform's native regex detector always runs as a second pass over the
Presidio-redacted text, so formats Presidio misses are still masked and the
platform degrades gracefully to regex-only when Presidio is unavailable.

Result shape matches every other guardrail detector:
  {status, confidence, reason, findings: [{type, value}], redacted,
   recommendation, time_ms}
"""
import importlib.util
import logging
import threading
import time

from .. import guardrails as g

log = logging.getLogger("promptineering.pii")

PRESIDIO_AVAILABLE = (
    importlib.util.find_spec("presidio_analyzer") is not None
    and importlib.util.find_spec("presidio_anonymizer") is not None
)
_SPACY_MODEL = "en_core_web_sm"

# presidio entity -> platform finding label; unlisted entities are ignored
# (DATE_TIME / URL / NRP / LOCATION are too noisy for enterprise prompts —
# masking "France" in "capital of France?" breaks ordinary usage)
_ENTITIES = {
    "EMAIL_ADDRESS": "EMAIL",
    "PHONE_NUMBER": "PHONE",
    "US_SSN": "SSN",
    "CREDIT_CARD": "CREDIT_CARD",
    "IP_ADDRESS": "IP_ADDRESS",
    "PERSON": "PERSON",
    "US_PASSPORT": "PASSPORT",
    "IN_AADHAAR": "AADHAAR",
    "US_DRIVER_LICENSE": "DRIVER_LICENSE",
    "US_ITIN": "ITIN",
    "US_BANK_NUMBER": "BANK_ACCOUNT",
    "IBAN_CODE": "IBAN",
    "MEDICAL_LICENSE": "MEDICAL_LICENSE",
    "CRYPTO": "CRYPTO_WALLET",
}
_SCORE_THRESHOLD = 0.5

_analyzer = None
_anonymizer = None
_state = "untried"   # untried | ready | unavailable
_lock = threading.Lock()


def _get_engines():
    """Build the Presidio analyzer/anonymizer once; None when unavailable."""
    global _analyzer, _anonymizer, _state
    if _state != "untried":
        return _analyzer, _anonymizer
    with _lock:
        if _state != "untried":
            return _analyzer, _anonymizer
        if not PRESIDIO_AVAILABLE:
            _state = "unavailable"
            return None, None
        try:
            from presidio_analyzer import AnalyzerEngine
            from presidio_analyzer.nlp_engine import NlpEngineProvider
            from presidio_anonymizer import AnonymizerEngine

            provider = NlpEngineProvider(nlp_configuration={
                "nlp_engine_name": "spacy",
                "models": [{"lang_code": "en", "model_name": _SPACY_MODEL}],
            })
            _analyzer = AnalyzerEngine(nlp_engine=provider.create_engine(),
                                       supported_languages=["en"])
            _anonymizer = AnonymizerEngine()
            _state = "ready"
            log.info("Presidio PII engine initialised (%s)", _SPACY_MODEL)
        except Exception as exc:  # pragma: no cover - environment dependent
            log.warning("Presidio unavailable, using native regex: %s", exc)
            _state = "unavailable"
            _analyzer = _anonymizer = None
    return _analyzer, _anonymizer


def warm_up():
    """Load the spaCy pipeline in the background so the first prompt is fast."""
    threading.Thread(target=_get_engines, daemon=True).start()


def engine_tag() -> str:
    return "Presidio" if _state == "ready" else "Native rails runtime"


def engine_info() -> dict:
    return {
        "engine": "presidio" if _state == "ready" else "native-regex",
        "package_installed": PRESIDIO_AVAILABLE,
        "state": _state,
        "model": _SPACY_MODEL if _state == "ready" else None,
    }


def _presidio_pass(text: str) -> tuple[list[dict], str, float]:
    """Analyze + anonymize with Presidio. Returns (findings, redacted, confidence)."""
    from presidio_anonymizer.entities import OperatorConfig

    analyzer, anonymizer = _get_engines()
    results = [r for r in analyzer.analyze(text=text, language="en",
                                           entities=list(_ENTITIES),
                                           score_threshold=_SCORE_THRESHOLD)]
    if not results:
        return [], text, 0.0
    findings = [{"type": _ENTITIES[r.entity_type], "value": text[r.start:r.end]}
                for r in sorted(results, key=lambda r: r.start)]
    operators = {entity: OperatorConfig("replace", {"new_value": f"[{label}]"})
                 for entity, label in _ENTITIES.items()}
    redacted = anonymizer.anonymize(text=text, analyzer_results=results,
                                    operators=operators).text
    return findings, redacted, max(r.score for r in results)


def detect_pii(text: str) -> dict:
    """Presidio pass (when available) + native regex second pass, merged."""
    start = time.perf_counter()
    analyzer, _ = _get_engines()

    findings: list[dict] = []
    confidence = 0.0
    redacted = text
    if analyzer is not None:
        try:
            findings, redacted, confidence = _presidio_pass(text)
        except Exception as exc:  # pragma: no cover
            log.warning("Presidio analyze failed, native regex only: %s", exc)

    # native regex sweep over what Presidio left behind
    native = g.detect_pii(redacted)
    findings += native["findings"]
    redacted = native.get("redacted", redacted)
    confidence = max(confidence, native["confidence"] if findings else 0.0)

    elapsed = round((time.perf_counter() - start) * 1000, 2)
    if not findings:
        return {"status": "pass", "confidence": 0.0,
                "reason": "No personally identifiable information found",
                "findings": [], "redacted": text,
                "recommendation": "Proceed", "time_ms": elapsed}
    engine = "Presidio + native regex" if analyzer is not None else "native regex"
    return {"status": "warning", "confidence": round(max(confidence, 0.85), 2),
            "reason": (f"{len(findings)} PII entit"
                       f"{'y' if len(findings) == 1 else 'ies'} redacted "
                       f"({engine})"),
            "findings": findings, "redacted": redacted,
            "recommendation": "Forward redacted prompt only",
            "time_ms": elapsed}
