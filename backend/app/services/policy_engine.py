"""Policy engine: resolves the effective policy suite for a request and
enforces role/authority access before any prompt processing begins."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import PolicySuite, User
from . import rbac

COMPRESSION_LEVELS = ("low", "medium", "high", "maximum")
LOGGING_LEVELS = ("minimal", "standard", "verbose", "supervised")
STRICTNESS = ("relaxed", "professional", "strict")


def resolve(db: Session, user: User, policy_id: int | None) -> PolicySuite | None:
    """Pick the policy for a request: explicit selection > user default."""
    policy = db.get(PolicySuite, policy_id) if policy_id else None
    policy = policy or user.policy
    if policy is None:
        return None
    if not policy.enabled:
        raise HTTPException(403, f"Policy suite '{policy.name}' is disabled")
    if not rbac.can_use_policy(user, policy):
        raise HTTPException(
            403, f"Your authority level cannot use the '{policy.name}' policy suite")
    return policy


def effective_settings(policy: PolicySuite | None) -> dict:
    """Flattened, defaulted view of what a policy allows — one place to read."""
    if policy is None:
        return {
            "guardrails": {}, "rails_config": {}, "blocked_topics": [],
            "compression_level": "medium", "compression_target": 20,
            "max_tokens": 2048, "upload_max_mb": 25,
            "allowed_models": [], "allowed_file_types": [],
            "logging_level": "standard", "response_strictness": "professional",
            "compliance_tags": [], "tool_permissions": [],
        }
    return {
        "guardrails": policy.guardrails or {},
        "rails_config": policy.rails_config or {},
        "blocked_topics": policy.blocked_topics or [],
        "compression_level": policy.compression_level or "medium",
        "compression_target": policy.compression_target or 20,
        "max_tokens": policy.max_tokens or 2048,
        "upload_max_mb": policy.upload_max_mb or 25,
        "allowed_models": policy.allowed_models or [],
        "allowed_file_types": policy.allowed_file_types or [],
        "logging_level": policy.logging_level or "standard",
        "response_strictness": policy.response_strictness or "professional",
        "compliance_tags": policy.compliance_tags or [],
        "tool_permissions": policy.tool_permissions or [],
    }
