import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.database import get_db
from backend.errors import api_error
from backend.models import ChatMessage, Document, User
from backend.schemas import ChatRequest, ChatResponse, ChatSource
from backend.services.ai import answer_question
from backend.services.usage import build_user_summary, ensure_query_allowed, increment_usage, refresh_usage_if_needed

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/chat", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        refresh_usage_if_needed(db, current_user)
        ensure_query_allowed(current_user)

        documents = (
            db.query(Document)
            .filter(Document.user_id == current_user.id)
            .order_by(Document.created_at.desc())
            .all()
        )
        if not documents:
            api_error(
                status.HTTP_400_BAD_REQUEST,
                "FILE_ERROR",
                "Upload at least one document before starting AI chat.",
            )

        answer, sources = answer_question(payload.query, documents)
        increment_usage(db, current_user)

        chat_row = ChatMessage(user_id=current_user.id, query=payload.query, response=answer)
        db.add(chat_row)
        db.commit()
        db.refresh(current_user)

        return ChatResponse(
            response=answer,
            sources=[
                ChatSource(
                    document_id=source["document_id"],
                    file_name=source["file_name"],
                    excerpt=source["excerpt"],
                )
                for source in sources
            ],
            user=build_user_summary(
                current_user,
                document_count=len(documents),
                payment_count=len(current_user.payments),
            ),
        )
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception(
            "[CHAT] Database error while processing chat for user_id=%s: %s",
            current_user.id,
            exc,
        )
        api_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "DATABASE_ERROR",
            "Database error while processing chat request.",
        )
    except Exception as exc:
        db.rollback()
        logger.exception(
            "[CHAT] Unexpected error while processing chat for user_id=%s: %s",
            current_user.id,
            exc,
        )
        api_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "CHAT_ERROR",
            "Chat request failed. Check backend logs for the exact error.",
        )
