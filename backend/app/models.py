from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, JSON, ForeignKey
)
from sqlalchemy.orm import relationship
from .database import Base

SCHEMA_VERSION = 2


class SchemaMeta(Base):
    __tablename__ = "schema_meta"
    id = Column(Integer, primary_key=True)
    version = Column(Integer, default=SCHEMA_VERSION)


class PolicySuite(Base):
    __tablename__ = "policy_suites"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(Text, default="")
    category = Column(String, default="general")   # general | client | finance | seniority | executive | admin
    risk_level = Column(String, default="medium")  # low | medium | high | critical
    roles = Column(JSON, default=list)             # departmental roles allowed to use this suite
    authority_levels = Column(JSON, default=list)  # intern | employee | senior | manager | director | admin
    applications = Column(JSON, default=list)
    guardrails = Column(JSON, default=dict)        # {injection, pii, secrets, jailbreak, compliance, toxicity, financial}
    rails_config = Column(JSON, default=dict)      # NeMo rails features: {input_rails, output_rails, dialog_rails, topical_rails, self_check}
    blocked_topics = Column(JSON, default=list)
    compliance_tags = Column(JSON, default=list)   # e.g. ["SOX", "PCI-DSS", "HIPAA"]
    allowed_file_types = Column(JSON, default=list)
    allowed_models = Column(JSON, default=list)
    tool_permissions = Column(JSON, default=list)
    max_tokens = Column(Integer, default=4096)
    compression_level = Column(String, default="medium")  # low | medium | high | maximum
    compression_target = Column(Integer, default=20)      # target % token reduction
    upload_max_mb = Column(Integer, default=25)
    logging_level = Column(String, default="standard")    # minimal | standard | verbose | supervised
    response_strictness = Column(String, default="professional")  # relaxed | professional | strict
    temperature_limit = Column(Float, default=0.7)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "description": self.description,
            "category": self.category,
            "risk_level": self.risk_level, "roles": self.roles,
            "authority_levels": self.authority_levels,
            "applications": self.applications, "guardrails": self.guardrails,
            "rails_config": self.rails_config,
            "blocked_topics": self.blocked_topics,
            "compliance_tags": self.compliance_tags,
            "allowed_file_types": self.allowed_file_types,
            "allowed_models": self.allowed_models,
            "tool_permissions": self.tool_permissions,
            "max_tokens": self.max_tokens,
            "compression_level": self.compression_level,
            "compression_target": self.compression_target,
            "upload_max_mb": self.upload_max_mb,
            "logging_level": self.logging_level,
            "response_strictness": self.response_strictness,
            "temperature_limit": self.temperature_limit,
            "enabled": self.enabled,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    username = Column(String, unique=True, nullable=True)
    email = Column(String, unique=True, nullable=False)
    employee_id = Column(String, default="")
    password_hash = Column(String, nullable=False)
    role = Column(String, default="General User")
    department = Column(String, default="General")
    authority = Column(String, default="employee")  # intern | employee | senior | manager | director | admin
    policy_id = Column(Integer, ForeignKey("policy_suites.id"), nullable=True)
    status = Column(String, default="active")       # active | disabled
    notes = Column(Text, default="")
    must_change_password = Column(Boolean, default=False)
    storage_used_mb = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    policy = relationship("PolicySuite", lazy="joined")

    def to_dict(self, stats=None):
        d = {
            "id": self.id, "name": self.name, "username": self.username,
            "email": self.email, "employee_id": self.employee_id,
            "role": self.role, "department": self.department,
            "authority": self.authority, "policy_id": self.policy_id,
            "policy_name": self.policy.name if self.policy else None,
            "status": self.status, "notes": self.notes,
            "must_change_password": self.must_change_password,
            "storage_used_mb": self.storage_used_mb,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login": self.last_login.isoformat() if self.last_login else None,
        }
        if stats:
            d.update(stats)
        return d


class Application(Base):
    __tablename__ = "applications"
    id = Column(Integer, primary_key=True)
    key = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    icon = Column(String, default="sparkles")
    accent = Column(String, default="#3987e5")
    system_prompt = Column(Text, default="")
    guardrail_profile = Column(JSON, default=dict)   # workspace-level guardrail emphasis
    suggested_policies = Column(JSON, default=list)  # policy suite names recommended here
    token_strategy = Column(String, default="balanced")
    example_prompts = Column(JSON, default=list)

    def to_dict(self):
        return {
            "id": self.id, "key": self.key, "name": self.name,
            "description": self.description, "icon": self.icon,
            "accent": self.accent, "system_prompt": self.system_prompt,
            "guardrail_profile": self.guardrail_profile,
            "suggested_policies": self.suggested_policies,
            "token_strategy": self.token_strategy,
            "example_prompts": self.example_prompts,
        }


class UploadedFile(Base):
    __tablename__ = "uploaded_files"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    application = Column(String, default="general")
    prompt_log_id = Column(Integer, ForeignKey("prompt_logs.id"), nullable=True)
    original_name = Column(String, nullable=False)
    stored_name = Column(String, nullable=False)
    ext = Column(String, default="")
    kind = Column(String, default="document")   # document | data | code | image | audio | video | archive
    mime_type = Column(String, default="application/octet-stream")
    size_bytes = Column(Integer, default=0)
    sha256 = Column(String, default="")
    status = Column(String, default="stored")   # stored | deleted
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id, "user_id": self.user_id,
            "user_name": self.user.name if self.user else None,
            "application": self.application,
            "prompt_log_id": self.prompt_log_id,
            "original_name": self.original_name,
            "ext": self.ext, "kind": self.kind,
            "mime_type": self.mime_type, "size_bytes": self.size_bytes,
            "sha256": self.sha256, "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PromptLog(Base):
    __tablename__ = "prompt_logs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    application = Column(String, default="general")
    policy_id = Column(Integer, ForeignKey("policy_suites.id"), nullable=True)
    original_prompt = Column(Text, default="")
    optimized_prompt = Column(Text, default="")
    response = Column(Text, default="")
    model = Column(String, default="")
    tokens_in = Column(Integer, default=0)
    tokens_out = Column(Integer, default=0)
    tokens_saved = Column(Integer, default=0)
    compression_pct = Column(Float, default=0.0)
    risk_score = Column(Float, default=0.0)
    risk_level = Column(String, default="low")
    latency_ms = Column(Integer, default=0)
    blocked = Column(Boolean, default=False)
    stages = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", lazy="joined")

    def to_dict(self, full=False):
        d = {
            "id": self.id, "user_id": self.user_id,
            "user_name": self.user.name if self.user else None,
            "application": self.application, "policy_id": self.policy_id,
            "model": self.model, "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out, "tokens_saved": self.tokens_saved,
            "compression_pct": self.compression_pct,
            "risk_score": self.risk_score, "risk_level": self.risk_level,
            "latency_ms": self.latency_ms, "blocked": self.blocked,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if full:
            d.update({
                "original_prompt": self.original_prompt,
                "optimized_prompt": self.optimized_prompt,
                "response": self.response, "stages": self.stages,
            })
        return d


class Violation(Base):
    __tablename__ = "violations"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    prompt_log_id = Column(Integer, ForeignKey("prompt_logs.id"), nullable=True)
    vtype = Column(String, default="policy")
    severity = Column(String, default="medium")
    detail = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id, "user_id": self.user_id,
            "user_name": self.user.name if self.user else None,
            "type": self.vtype, "severity": self.severity, "detail": self.detail,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True)
    actor_id = Column(Integer, nullable=True)
    actor_email = Column(String, default="system")
    event = Column(String, nullable=False)
    detail = Column(Text, default="")
    ip = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id, "actor_id": self.actor_id,
            "actor_email": self.actor_email, "event": self.event,
            "detail": self.detail, "ip": self.ip,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


def audit(db, event: str, detail: str = "", actor=None, ip: str = ""):
    entry = AuditLog(
        actor_id=actor.id if actor else None,
        actor_email=actor.email if actor else "system",
        event=event, detail=detail, ip=ip,
    )
    db.add(entry)
    return entry
