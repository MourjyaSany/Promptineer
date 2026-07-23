"""Enterprise file service: validated, hashed, policy-limited uploads."""
import hashlib
import re
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..models import UploadedFile, User, audit

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"

KIND_BY_EXT = {
    # documents
    "pdf": "document", "docx": "document", "doc": "document", "txt": "document",
    "md": "document", "rtf": "document",
    # data
    "csv": "data", "xlsx": "data", "xls": "data", "json": "data", "xml": "data",
    "yaml": "data", "yml": "data",
    # archives
    "zip": "archive",
    # media
    "png": "image", "jpg": "image", "jpeg": "image", "gif": "image",
    "webp": "image", "svg": "image",
    "mp3": "audio", "wav": "audio", "m4a": "audio", "ogg": "audio",
    "mp4": "video", "mov": "video", "webm": "video", "avi": "video",
    # code
    "py": "code", "java": "code", "cpp": "code", "cc": "code", "c": "code",
    "h": "code", "hpp": "code", "js": "code", "jsx": "code", "ts": "code",
    "tsx": "code", "html": "code", "css": "code", "sql": "code", "sh": "code",
    "ps1": "code", "go": "code", "rs": "code", "rb": "code",
}

TEXT_KINDS = {"code", "data", "document"}
_TEXT_EXTS = {"txt", "md", "csv", "json", "xml", "yaml", "yml"} | {
    e for e, k in KIND_BY_EXT.items() if k == "code"}

CHUNK = 1024 * 1024


def _ext(filename: str) -> str:
    return Path(filename).suffix.lstrip(".").lower()


def validate(file: UploadFile, allowed_types: list[str], max_mb: int) -> str:
    ext = _ext(file.filename or "")
    if not ext or ext not in KIND_BY_EXT:
        raise HTTPException(415, f"File type '.{ext or '?'}' is not supported")
    if allowed_types and ext not in [t.lower().lstrip(".") for t in allowed_types]:
        raise HTTPException(
            415, f"Your policy suite does not allow '.{ext}' uploads")
    return ext


async def save(db: Session, user: User, file: UploadFile, application: str,
               allowed_types: list[str], max_mb: int) -> UploadedFile:
    ext = validate(file, allowed_types, max_mb)
    UPLOAD_DIR.mkdir(exist_ok=True)
    safe_original = re.sub(r"[^\w.\- ]", "_", file.filename or f"upload.{ext}")
    stored_name = f"{uuid.uuid4().hex}.{ext}"
    dest = UPLOAD_DIR / stored_name
    limit = max_mb * 1024 * 1024

    sha = hashlib.sha256()
    size = 0
    try:
        with dest.open("wb") as out:
            while chunk := await file.read(CHUNK):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(
                        413, f"File exceeds your policy's {max_mb} MB upload limit")
                sha.update(chunk)
                out.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise

    record = UploadedFile(
        user_id=user.id, application=application,
        original_name=safe_original, stored_name=stored_name,
        ext=ext, kind=KIND_BY_EXT[ext],
        mime_type=file.content_type or "application/octet-stream",
        size_bytes=size, sha256=sha.hexdigest(),
    )
    db.add(record)
    user.storage_used_mb = round((user.storage_used_mb or 0) + size / 1_048_576, 2)
    audit(db, "file.uploaded",
          f"{safe_original} ({size / 1024:.1f} KB, sha256:{record.sha256[:12]}…)",
          actor=user)
    return record


def path_for(record: UploadedFile) -> Path:
    return UPLOAD_DIR / record.stored_name


def remove(db: Session, actor: User, record: UploadedFile):
    path_for(record).unlink(missing_ok=True)
    record.status = "deleted"
    audit(db, "file.deleted", record.original_name, actor=actor)


def text_preview(record: UploadedFile, max_chars: int = 4000) -> str | None:
    """Readable content for text-like files, used as model context."""
    if record.ext not in _TEXT_EXTS:
        return None
    try:
        raw = path_for(record).read_text(encoding="utf-8", errors="replace")
        return raw[:max_chars]
    except OSError:
        return None


def build_context(records: list[UploadedFile]) -> str:
    """Attachment context injected ahead of the user prompt."""
    if not records:
        return ""
    parts = ["[Attached enterprise documents]"]
    for r in records:
        preview = text_preview(r)
        if preview:
            parts.append(f"--- {r.original_name} ({r.kind}) ---\n{preview}")
        else:
            parts.append(
                f"--- {r.original_name} ({r.kind}, {r.size_bytes / 1024:.0f} KB) "
                "— binary file; metadata only ---")
    return "\n".join(parts) + "\n[End of attachments]\n\n"
