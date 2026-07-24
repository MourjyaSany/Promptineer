import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import guardrails as g
from ..auth import get_current_user
from ..database import get_db
from ..models import Application, PromptLog, UploadedFile, User, Violation, audit
from ..optimizer import estimate_tokens
from ..services import (
    file_service, model_gateway, optimization, policy_engine, rails_engine,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatBody(BaseModel):
    message: str
    application: str = "general"
    policy_id: int | None = None
    temperature: float = 0.5
    file_ids: list[int] = []
    model: str | None = None   # explicit model choice; None ⇒ auto-route


@router.get("/models")
def models(user: User = Depends(get_current_user),
           db: Session = Depends(get_db)):
    """Models the current user may select, per their effective policy."""
    policy = policy_engine.resolve(db, user, None)
    settings = policy_engine.effective_settings(policy)
    return {
        "models": model_gateway.normalize_allowed(settings["allowed_models"]),
        "all_models": model_gateway.MODEL_TIERS,
        "default": model_gateway.DEFAULT_MODEL,
        "provider": model_gateway.active_provider(),
    }


@router.post("")
def chat(body: ChatBody, user: User = Depends(get_current_user),
         db: Session = Depends(get_db)):
    if not body.message.strip():
        raise HTTPException(400, "Empty prompt")

    policy = policy_engine.resolve(db, user, body.policy_id)
    settings = policy_engine.effective_settings(policy)
    workspace = (db.query(Application)
                 .filter(Application.key == body.application).first())

    attachments = []
    if body.file_ids:
        attachments = (db.query(UploadedFile)
                       .filter(UploadedFile.id.in_(body.file_ids),
                               UploadedFile.user_id == user.id,
                               UploadedFile.status == "stored").all())

    started = time.perf_counter()

    # 1. Input rails (NeMo Guardrails orchestration / native runtime)
    stages, blocked_reason, text = rails_engine.run_input_rails(
        body.message, settings)
    pii_findings = next(
        (s["result"]["findings"] for s in stages
         if s["name"].startswith("PII")), [])
    secret_findings = next(
        (s["result"]["findings"] for s in stages
         if s["name"].startswith("Secret")), [])
    financial_findings = next(
        (s["result"]["findings"] for s in stages
         if s["name"].startswith("Financial")), [])

    # 2. Token optimization (LLMLingua / native heuristic)
    opt = optimization.compress(text, settings["compression_level"])
    stages.append({
        "name": "Token Optimization", "engine": opt["engine"], "result": {
            "status": "pass", "confidence": 1.0,
            "reason": (f"{opt['engine']} compressed {opt['compression_pct']}% "
                       f"({opt['tokens_saved']} tokens, "
                       f"~${opt['est_cost_saved_usd']:.4f} saved)"),
            "findings": opt["removed"][:6],
            "recommendation": "Forward optimized prompt", "time_ms": 1.2,
        }})

    # 3. Model selection — user choice when permitted, else policy routing
    allowed = model_gateway.normalize_allowed(settings["allowed_models"])
    requested = model_gateway.normalize_model(body.model)
    if requested and requested in allowed:
        model = requested
        route_reason = f"User selected {model} (permitted by policy)"
    elif requested:
        model = model_gateway.route_model(opt["optimized"], allowed)
        route_reason = (f"Requested {requested} is not permitted by the "
                        f"active policy; routed to {model} instead")
    else:
        model = model_gateway.route_model(opt["optimized"], allowed)
        route_reason = f"Routed to {model} based on complexity and policy"
    stages.append({
        "name": "Model Router", "engine": model_gateway.active_provider(),
        "result": {
            "status": "pass", "confidence": 1.0,
            "reason": route_reason,
            "findings": [], "recommendation": model, "time_ms": 0.4,
        }})

    response_text, tokens_out = "", 0
    served_model = model
    explanation = None
    if blocked_reason:
        explanation = rails_engine.explain_block(stages, blocked_reason)
        stages.append({
            "name": "LLM Inference", "engine": "gateway", "result": {
                "status": "blocked", "confidence": 1.0,
                "reason": "Prompt rejected before model access", "findings": [],
                "recommendation": "Revise the request", "time_ms": 0.0,
            }})
    else:
        # 4. Gateway inference with the workspace's system prompt
        prompt = file_service.build_context(attachments) + opt["optimized"]
        llm_start = time.perf_counter()
        result = model_gateway.generate(
            prompt, model, body.application, settings["max_tokens"],
            workspace_prompt=workspace.system_prompt if workspace else "",
            strictness=settings["response_strictness"])
        llm_ms = round((time.perf_counter() - llm_start) * 1000)
        served_model = result["model"]
        tokens_out = result["tokens_out"]
        stages.append({
            "name": "LLM Inference", "engine": result["provider"], "result": {
                "status": "pass", "confidence": 1.0,
                "reason": f"{served_model} generated {tokens_out} tokens",
                "findings": [], "recommendation": "Validate output",
                "time_ms": llm_ms,
            }})

        # 5. Output rails
        out_stage, response_text = rails_engine.run_output_rails(
            result["text"], settings)
        if out_stage:
            stages.append(out_stage)

    risk_score, risk_level = g.risk_from_stages(stages)
    latency_ms = round((time.perf_counter() - started) * 1000)

    log = PromptLog(
        user_id=user.id, application=body.application,
        policy_id=policy.id if policy else None,
        original_prompt=body.message, optimized_prompt=opt["optimized"],
        response=response_text if settings["logging_level"] != "minimal" else "",
        model=served_model,
        tokens_in=estimate_tokens(body.message), tokens_out=tokens_out,
        tokens_saved=opt["tokens_saved"], compression_pct=opt["compression_pct"],
        risk_score=risk_score, risk_level=risk_level,
        latency_ms=latency_ms, blocked=bool(blocked_reason),
        stages=stages if settings["logging_level"] in ("verbose", "supervised",
                                                       "standard") else [],
    )
    db.add(log)
    db.flush()
    for f in attachments:
        f.prompt_log_id = log.id

    for finding_set, vtype, severity in (
        (pii_findings, "pii", "medium"),
        (secret_findings, "secret", "critical"),
        (financial_findings, "financial", "high"),
    ):
        if finding_set:
            db.add(Violation(
                user_id=user.id, prompt_log_id=log.id, vtype=vtype,
                severity=severity,
                detail=f"{len(finding_set)} {vtype.upper()} finding(s) redacted",
            ))
    if blocked_reason:
        db.add(Violation(user_id=user.id, prompt_log_id=log.id,
                         vtype="blocked", severity="high", detail=blocked_reason))
    audit(db, "prompt.processed",
          f"{body.application} · {risk_level} risk · "
          f"{'BLOCKED' if blocked_reason else 'delivered'}"
          + (f" · {len(attachments)} attachment(s)" if attachments else ""),
          actor=user)
    if settings["logging_level"] == "supervised":
        audit(db, "prompt.supervised",
              f"Supervision copy retained for {user.email} "
              f"({policy.name if policy else 'no policy'})", actor=user)
    db.commit()

    return {
        "id": log.id,
        "blocked": bool(blocked_reason),
        "blocked_reason": blocked_reason,
        "explanation": explanation,
        "response": response_text,
        "model": served_model,
        "stages": stages,
        "intelligence": {
            "original_prompt": body.message,
            "optimized_prompt": opt["optimized"],
            "removed": opt["removed"],
            "pii": pii_findings,
            "secrets": secret_findings,
            "financial": financial_findings,
            "tokens_in": estimate_tokens(body.message),
            "tokens_out": tokens_out,
            "tokens_saved": opt["tokens_saved"],
            "compression_pct": opt["compression_pct"],
            "compression_level": opt["compression_level"],
            "est_cost_saved_usd": opt["est_cost_saved_usd"],
            "est_latency_saved_ms": opt["est_latency_saved_ms"],
            "risk_score": risk_score,
            "risk_level": risk_level,
            "policy": policy.name if policy else "None",
            "latency_ms": latency_ms,
            "attachments": [f.original_name for f in attachments],
            "engines": {
                "rails": rails_engine.engine_info(),
                "optimizer": optimization.engine_info(),
                "provider": model_gateway.active_provider(),
            },
        },
    }


@router.get("/history")
def history(limit: int = 30, user: User = Depends(get_current_user),
            db: Session = Depends(get_db)):
    logs = (db.query(PromptLog).filter(PromptLog.user_id == user.id)
            .order_by(PromptLog.created_at.desc()).limit(limit).all())
    return {"items": [l.to_dict(full=True) for l in logs]}
