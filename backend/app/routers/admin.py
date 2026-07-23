import re
import secrets as pysecrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_user, hash_password, require_admin
from ..database import get_db
from ..models import PolicySuite, PromptLog, User, Violation, audit
from ..services import rbac

router = APIRouter(prefix="/api/admin", tags=["admin"])

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
USERNAME_RE = re.compile(r"^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$")


def generate_temp_password() -> str:
    return "Pn-" + pysecrets.token_urlsafe(9)


class UserCreate(BaseModel):
    name: str
    username: str
    email: str
    employee_id: str = ""
    department: str = "General"
    role: str = "General User"
    authority: str = "employee"
    policy_id: int | None = None
    password: str | None = None      # omit to auto-generate a temporary password
    status: str = "active"
    notes: str = ""

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Full name must be at least 2 characters")
        return v

    @field_validator("username")
    @classmethod
    def _username(cls, v: str) -> str:
        v = v.strip().lower()
        if not USERNAME_RE.match(v):
            raise ValueError(
                "Username must be 3-32 chars: lowercase letters, digits, . _ -")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("Enter a valid email address")
        return v

    @field_validator("authority")
    @classmethod
    def _authority(cls, v: str) -> str:
        v = rbac.normalize_authority(v)
        if v not in rbac.AUTHORITY_LEVELS:
            raise ValueError("Invalid authority level")
        return v

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        if v not in ("active", "disabled"):
            raise ValueError("Status must be 'active' or 'disabled'")
        return v

    @field_validator("password")
    @classmethod
    def _password(cls, v: str | None) -> str | None:
        if v is not None and len(v) < 8:
            raise ValueError("Temporary password must be at least 8 characters")
        return v


@router.post("/users", status_code=201)
def create_user(body: UserCreate, actor: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(409, "A user with this email already exists")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(409, "This username is already taken")

    policy = None
    if body.policy_id is not None:
        policy = db.get(PolicySuite, body.policy_id)
        if policy is None:
            raise HTTPException(404, "Selected policy suite does not exist")

    temp_password = body.password or generate_temp_password()
    user = User(
        name=body.name, username=body.username, email=body.email,
        employee_id=body.employee_id.strip(), department=body.department.strip(),
        role=body.role, authority=body.authority,
        policy_id=policy.id if policy else None,
        password_hash=hash_password(temp_password),
        status=body.status, notes=body.notes.strip(),
        must_change_password=body.password is None,
    )
    db.add(user)
    db.flush()

    audit(db, "user.created",
          f"{user.email} · {rbac.AUTHORITY_LABELS.get(user.authority, user.authority)}"
          f" · policy: {policy.name if policy else 'unassigned'}", actor=actor)
    audit(db, "user.welcome",
          f"Welcome event logged for {user.name} ({user.email})", actor=actor)
    db.commit()
    return {"user": user.to_dict(), "temp_password": temp_password}


@router.get("/authority-levels")
def authority_levels(_: User = Depends(require_admin)):
    return {"items": [{"value": v, "label": rbac.AUTHORITY_LABELS[v]}
                      for v in rbac.AUTHORITY_LEVELS]}


def _user_stats(db: Session, user_ids: list[int]) -> dict:
    prompts = dict(db.query(PromptLog.user_id, func.count(PromptLog.id))
                   .filter(PromptLog.user_id.in_(user_ids))
                   .group_by(PromptLog.user_id).all())
    tokens = dict(db.query(PromptLog.user_id,
                           func.sum(PromptLog.tokens_in + PromptLog.tokens_out))
                  .filter(PromptLog.user_id.in_(user_ids))
                  .group_by(PromptLog.user_id).all())
    violations = dict(db.query(Violation.user_id, func.count(Violation.id))
                      .filter(Violation.user_id.in_(user_ids))
                      .group_by(Violation.user_id).all())
    return {
        uid: {
            "prompts": prompts.get(uid, 0),
            "total_tokens": int(tokens.get(uid) or 0),
            "violations": violations.get(uid, 0),
        }
        for uid in user_ids
    }


@router.get("/users")
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.name).all()
    stats = _user_stats(db, [u.id for u in users])
    return {"items": [u.to_dict(stats.get(u.id)) for u in users]}


@router.get("/users/{user_id}")
def user_detail(user_id: int, _: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    stats = _user_stats(db, [user.id]).get(user.id)
    logs = (db.query(PromptLog).filter(PromptLog.user_id == user_id)
            .order_by(PromptLog.created_at.desc()).limit(50).all())
    violations = (db.query(Violation).filter(Violation.user_id == user_id)
                  .order_by(Violation.created_at.desc()).limit(50).all())
    avg = db.query(func.avg(PromptLog.latency_ms)).filter(
        PromptLog.user_id == user_id).scalar()
    return {
        "user": user.to_dict(stats),
        "avg_latency_ms": round(avg or 0),
        "timeline": [l.to_dict() for l in logs],
        "violations": [v.to_dict() for v in violations],
    }


class UserPatch(BaseModel):
    name: str | None = None
    username: str | None = None
    employee_id: str | None = None
    role: str | None = None
    department: str | None = None
    authority: str | None = None
    policy_id: int | None = None
    status: str | None = None
    notes: str | None = None


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserPatch,
                actor: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    changes = body.model_dump(exclude_none=True)
    for field, value in changes.items():
        setattr(user, field, value)
    audit(db, "user.updated", f"{user.email}: {', '.join(changes)}", actor=actor)
    db.commit()
    return {"user": user.to_dict()}


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: int, actor: User = Depends(require_admin),
                   db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    import secrets
    new_password = "Pn-" + secrets.token_urlsafe(6)
    user.password_hash = hash_password(new_password)
    audit(db, "user.password_reset", user.email, actor=actor)
    db.commit()
    return {"password": new_password}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, actor: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == actor.id:
        raise HTTPException(400, "You cannot delete your own account")
    audit(db, "user.deleted", user.email, actor=actor)
    db.delete(user)
    db.commit()
    return {"ok": True}


# ---------- Policies ----------

class PolicyBody(BaseModel):
    name: str
    description: str = ""
    category: str = "general"
    risk_level: str = "medium"
    roles: list[str] = []
    authority_levels: list[str] = []
    applications: list[str] = []
    guardrails: dict = {}
    rails_config: dict = {}
    blocked_topics: list[str] = []
    compliance_tags: list[str] = []
    allowed_file_types: list[str] = []
    allowed_models: list[str] = []
    tool_permissions: list[str] = []
    max_tokens: int = 4096
    compression_level: str = "medium"
    compression_target: int = 20
    upload_max_mb: int = 25
    logging_level: str = "standard"
    response_strictness: str = "professional"
    temperature_limit: float = 0.7
    enabled: bool = True


@router.get("/policies")
def list_policies(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    policies = db.query(PolicySuite).order_by(PolicySuite.name).all()
    usage = dict(db.query(PromptLog.policy_id, func.count(PromptLog.id))
                 .group_by(PromptLog.policy_id).all())
    items = []
    for p in policies:
        d = p.to_dict()
        d["usage_count"] = usage.get(p.id, 0)
        items.append(d)
    return {"items": items}


@router.post("/policies")
def create_policy(body: PolicyBody, actor: User = Depends(require_admin),
                  db: Session = Depends(get_db)):
    if db.query(PolicySuite).filter(PolicySuite.name == body.name).first():
        raise HTTPException(409, "A policy with this name already exists")
    policy = PolicySuite(**body.model_dump())
    db.add(policy)
    audit(db, "policy.created", body.name, actor=actor)
    db.commit()
    return {"policy": policy.to_dict()}


@router.put("/policies/{policy_id}")
def update_policy(policy_id: int, body: PolicyBody,
                  actor: User = Depends(require_admin),
                  db: Session = Depends(get_db)):
    policy = db.get(PolicySuite, policy_id)
    if not policy:
        raise HTTPException(404, "Policy not found")
    for field, value in body.model_dump().items():
        setattr(policy, field, value)
    audit(db, "policy.updated", policy.name, actor=actor)
    db.commit()
    return {"policy": policy.to_dict()}


@router.post("/policies/{policy_id}/clone")
def clone_policy(policy_id: int, actor: User = Depends(require_admin),
                 db: Session = Depends(get_db)):
    policy = db.get(PolicySuite, policy_id)
    if not policy:
        raise HTTPException(404, "Policy not found")
    data = policy.to_dict()
    data.pop("id"), data.pop("created_at")
    data["name"] = f"{policy.name} (Copy)"
    suffix = 2
    while db.query(PolicySuite).filter(PolicySuite.name == data["name"]).first():
        data["name"] = f"{policy.name} (Copy {suffix})"
        suffix += 1
    clone = PolicySuite(**data)
    db.add(clone)
    audit(db, "policy.cloned", f"{policy.name} → {data['name']}", actor=actor)
    db.commit()
    return {"policy": clone.to_dict()}


@router.delete("/policies/{policy_id}")
def delete_policy(policy_id: int, actor: User = Depends(require_admin),
                  db: Session = Depends(get_db)):
    policy = db.get(PolicySuite, policy_id)
    if not policy:
        raise HTTPException(404, "Policy not found")
    db.query(User).filter(User.policy_id == policy_id).update({"policy_id": None})
    audit(db, "policy.deleted", policy.name, actor=actor)
    db.delete(policy)
    db.commit()
    return {"ok": True}
