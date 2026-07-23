import csv
import io
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..database import get_db
from ..models import AuditLog, PolicySuite, PromptLog, User, Violation

router = APIRouter(prefix="/api", tags=["insights"])


@router.get("/analytics/overview")
def overview(days: int = 30, _: User = Depends(require_admin),
             db: Session = Depends(get_db)):
    since = datetime.utcnow() - timedelta(days=days)
    logs = db.query(PromptLog).filter(PromptLog.created_at >= since)

    totals = db.query(
        func.count(PromptLog.id),
        func.coalesce(func.sum(PromptLog.tokens_in + PromptLog.tokens_out), 0),
        func.coalesce(func.sum(PromptLog.tokens_saved), 0),
        func.coalesce(func.avg(PromptLog.latency_ms), 0),
        func.coalesce(func.avg(PromptLog.compression_pct), 0),
    ).filter(PromptLog.created_at >= since).one()
    prompt_count, total_tokens, tokens_saved, avg_latency, avg_compression = totals

    violation_count = db.query(func.count(Violation.id)).filter(
        Violation.created_at >= since).scalar()
    blocked_count = logs.filter(PromptLog.blocked == True).count()  # noqa: E712

    # daily prompt volume + savings
    daily = {}
    for log in logs.all():
        key = log.created_at.strftime("%Y-%m-%d")
        d = daily.setdefault(key, {"date": key, "prompts": 0, "tokens": 0,
                                   "saved": 0, "violations": 0})
        d["prompts"] += 1
        d["tokens"] += log.tokens_in + log.tokens_out
        d["saved"] += log.tokens_saved
    for v in db.query(Violation).filter(Violation.created_at >= since).all():
        key = v.created_at.strftime("%Y-%m-%d")
        if key in daily:
            daily[key]["violations"] += 1
    series = sorted(daily.values(), key=lambda d: d["date"])

    by_department = [
        {"label": dept or "Unknown", "value": count}
        for dept, count in db.query(User.department, func.count(PromptLog.id))
        .join(PromptLog, PromptLog.user_id == User.id)
        .filter(PromptLog.created_at >= since)
        .group_by(User.department).order_by(func.count(PromptLog.id).desc()).all()
    ]
    by_policy = [
        {"label": name, "value": count}
        for name, count in db.query(PolicySuite.name, func.count(PromptLog.id))
        .join(PromptLog, PromptLog.policy_id == PolicySuite.id)
        .filter(PromptLog.created_at >= since)
        .group_by(PolicySuite.name).order_by(func.count(PromptLog.id).desc()).all()
    ]
    by_application = [
        {"label": app, "value": count}
        for app, count in db.query(PromptLog.application, func.count(PromptLog.id))
        .filter(PromptLog.created_at >= since)
        .group_by(PromptLog.application)
        .order_by(func.count(PromptLog.id).desc()).limit(8).all()
    ]
    risk_distribution = [
        {"label": level, "value": count}
        for level, count in db.query(PromptLog.risk_level, func.count(PromptLog.id))
        .filter(PromptLog.created_at >= since)
        .group_by(PromptLog.risk_level).all()
    ]
    top_users = [
        {"label": name, "value": count}
        for name, count in db.query(User.name, func.count(PromptLog.id))
        .join(PromptLog, PromptLog.user_id == User.id)
        .filter(PromptLog.created_at >= since)
        .group_by(User.name).order_by(func.count(PromptLog.id).desc()).limit(6).all()
    ]

    # hour-of-day x weekday heatmap
    heatmap = [[0] * 24 for _ in range(7)]
    for log in logs.all():
        heatmap[log.created_at.weekday()][log.created_at.hour] += 1

    # cost estimate at blended $8/M tokens
    cost_saved = round(tokens_saved / 1_000_000 * 8, 2)

    return {
        "kpis": {
            "prompts": prompt_count,
            "total_tokens": int(total_tokens),
            "tokens_saved": int(tokens_saved),
            "cost_saved_usd": cost_saved,
            "avg_latency_ms": round(avg_latency),
            "avg_compression_pct": round(avg_compression, 1),
            "violations": violation_count,
            "blocked": blocked_count,
            "active_users": db.query(func.count(User.id))
                              .filter(User.status == "active").scalar(),
        },
        "series": series,
        "by_department": by_department,
        "by_policy": by_policy,
        "by_application": by_application,
        "risk_distribution": risk_distribution,
        "top_users": top_users,
        "heatmap": heatmap,
    }


@router.get("/audit")
def audit_logs(limit: int = 100, q: str = "", event: str = "",
               _: User = Depends(require_admin), db: Session = Depends(get_db)):
    query = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    if event:
        query = query.filter(AuditLog.event == event)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (AuditLog.actor_email.ilike(like)) | (AuditLog.detail.ilike(like))
            | (AuditLog.event.ilike(like)))
    items = query.limit(limit).all()
    events = [e for (e,) in db.query(AuditLog.event).distinct().all()]
    return {"items": [a.to_dict() for a in items], "events": sorted(events)}


@router.get("/audit/export")
def export_audit(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "timestamp", "actor", "event", "detail", "ip"])
    for a in db.query(AuditLog).order_by(AuditLog.created_at.desc()).all():
        writer.writerow([a.id, a.created_at.isoformat(), a.actor_email,
                         a.event, a.detail, a.ip])
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit-log.csv"})
