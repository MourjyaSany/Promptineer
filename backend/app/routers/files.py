import jwt
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..auth import JWT_ALG, JWT_SECRET, bearer as auth_bearer, get_current_user
from ..database import get_db
from ..models import UploadedFile, User
from ..services import file_service, policy_engine

router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("/upload")
async def upload(files: list[UploadFile] = File(...),
                 application: str = Form("general"),
                 user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    settings = policy_engine.effective_settings(user.policy)
    saved = []
    for f in files:
        record = await file_service.save(
            db, user, f, application,
            settings["allowed_file_types"], settings["upload_max_mb"])
        saved.append(record)
    db.commit()
    return {"items": [r.to_dict() for r in saved]}


@router.get("")
def list_files(application: str | None = None,
               user: User = Depends(get_current_user),
               db: Session = Depends(get_db)):
    q = (db.query(UploadedFile)
         .filter(UploadedFile.status == "stored"))
    if user.authority != "admin":
        q = q.filter(UploadedFile.user_id == user.id)
    if application:
        q = q.filter(UploadedFile.application == application)
    items = q.order_by(UploadedFile.created_at.desc()).limit(200).all()
    return {"items": [r.to_dict() for r in items]}


def _get_owned(db: Session, user: User, file_id: int) -> UploadedFile:
    record = db.get(UploadedFile, file_id)
    if record is None or record.status != "stored":
        raise HTTPException(404, "File not found")
    if record.user_id != user.id and user.authority != "admin":
        raise HTTPException(403, "Not your file")
    return record


def _user_from_header_or_token(
    token: str | None = None,
    creds=Depends(auth_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Browser <img>/<a> tags cannot send Authorization headers, so downloads
    also accept the JWT as a ?token= query parameter."""
    raw = creds.credentials if creds else token
    if not raw:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(raw, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    user = db.get(User, int(payload["sub"]))
    if user is None or user.status != "active":
        raise HTTPException(401, "Account unavailable")
    return user


@router.get("/{file_id}/download")
def download(file_id: int, user: User = Depends(_user_from_header_or_token),
             db: Session = Depends(get_db)):
    record = _get_owned(db, user, file_id)
    path = file_service.path_for(record)
    if not path.exists():
        raise HTTPException(410, "File contents no longer available")
    return FileResponse(path, filename=record.original_name,
                        media_type=record.mime_type)


@router.delete("/{file_id}")
def delete(file_id: int, user: User = Depends(get_current_user),
           db: Session = Depends(get_db)):
    record = _get_owned(db, user, file_id)
    file_service.remove(db, user, record)
    db.commit()
    return {"ok": True}
