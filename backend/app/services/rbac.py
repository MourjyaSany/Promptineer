"""RBAC service: authority hierarchy and policy-suite visibility."""
from sqlalchemy.orm import Session

from ..models import PolicySuite, User

AUTHORITY_LEVELS = ["intern", "employee", "senior", "manager", "director", "admin"]

AUTHORITY_LABELS = {
    "intern": "Intern",
    "employee": "Employee",
    "senior": "Senior Professional",
    "manager": "Manager",
    "director": "Director",
    "admin": "Administrator",
}

# Legacy authority values from schema v1
_LEGACY = {"member": "employee"}


def normalize_authority(value: str | None) -> str:
    value = (value or "employee").lower()
    value = _LEGACY.get(value, value)
    return value if value in AUTHORITY_LEVELS else "employee"


def accessible_policies(db: Session, user: User) -> list[PolicySuite]:
    """Policy suites this user may select, resolved dynamically from the DB."""
    authority = normalize_authority(user.authority)
    suites = (db.query(PolicySuite)
              .filter(PolicySuite.enabled == True)  # noqa: E712
              .order_by(PolicySuite.id).all())
    if authority == "admin":
        return suites
    return [s for s in suites if authority in (s.authority_levels or [])]


def can_use_policy(user: User, policy: PolicySuite) -> bool:
    authority = normalize_authority(user.authority)
    if authority == "admin":
        return True
    return authority in (policy.authority_levels or [])
