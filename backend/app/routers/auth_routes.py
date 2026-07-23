from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import create_token, get_current_user, verify_password
from ..database import get_db
from ..models import Application, User, audit
from ..services import rbac

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(body: LoginBody, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower().strip()).first()
    if not user or not verify_password(body.password, user.password_hash):
        audit(db, "auth.login_failed", f"Failed login for {body.email}",
              ip=request.client.host if request.client else "")
        db.commit()
        raise HTTPException(401, "Invalid email or password")
    if user.status != "active":
        raise HTTPException(403, "Account disabled — contact your administrator")
    user.last_login = datetime.utcnow()
    audit(db, "auth.login", "Signed in", actor=user,
          ip=request.client.host if request.client else "")
    db.commit()
    return {"token": create_token(user), "user": user.to_dict()}


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"user": user.to_dict(),
            "policy": user.policy.to_dict() if user.policy else None}


@router.get("/bootstrap")
def bootstrap(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Everything the workspace shell needs after login. Policy suites are
    resolved dynamically from the RBAC service — users only see the suites
    their authority level grants."""
    apps = [a.to_dict() for a in db.query(Application).all()]
    policies = [p.to_dict() for p in rbac.accessible_policies(db, user)]
    return {
        "user": user.to_dict(),
        "applications": apps,
        "policies": policies,
        "active_policy": user.policy.to_dict() if user.policy else None,
        "authority_label": rbac.AUTHORITY_LABELS.get(
            rbac.normalize_authority(user.authority)),
    }
