from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.database import get_db
from backend.errors import api_error
from backend.models import Document, User
from backend.schemas import DocumentListResponse, DocumentSummary, UploadResponse
from backend.services.documents import extract_text_from_file, get_allowed_extensions, store_upload_file

router = APIRouter()


@router.get("/documents", response_model=DocumentListResponse)
def list_documents(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    documents = (
        db.query(
            Document.id,
            Document.file_name,
            func.substr(Document.content_text, 1, 180).label("content_preview"),
            Document.created_at,
        )
        .filter(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
        .all()
    )
    return DocumentListResponse(
        documents=[
            DocumentSummary(
                id=document.id,
                file_name=document.file_name,
                content_preview=document.content_preview,
                created_at=document.created_at,
            )
            for document in documents
        ]
    )


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stored_path = None
    try:
        stored_path, safe_name = await store_upload_file(file, current_user.id)
        extracted_text = extract_text_from_file(stored_path, safe_name)
    except ValueError as exc:
        if stored_path and stored_path.exists():
            stored_path.unlink()
        api_error(status.HTTP_400_BAD_REQUEST, "FILE_ERROR", str(exc))

    document = Document(
        user_id=current_user.id,
        file_name=safe_name,
        stored_path=str(stored_path),
        content_text=extracted_text,
        content_type=stored_path.suffix.lower().lstrip("."),
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    return UploadResponse(
        message="File uploaded successfully",
        document=DocumentSummary(
            id=document.id,
            file_name=document.file_name,
            content_preview=document.content_text[:180],
            created_at=document.created_at,
        ),
        accepted_types=sorted(get_allowed_extensions()),
    )
