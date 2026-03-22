from datetime import datetime

from fastapi import APIRouter, Depends, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import PublicSiteFeedback, PublicSiteReview, PublicSiteStats
from backend.schemas import (
    PublicSiteFeedbackRequest,
    PublicSiteFeedbackSummary,
    PublicSiteReviewRequest,
    PublicSiteReviewSummary,
    PublicSiteSnapshot,
)

router = APIRouter(prefix="/public", tags=["public-site"])


def get_or_create_site_stats(db: Session) -> PublicSiteStats:
    stats = db.query(PublicSiteStats).first()
    if stats is None:
        stats = PublicSiteStats(download_count=5)
        db.add(stats)
        db.commit()
        db.refresh(stats)
    return stats


def build_site_snapshot(db: Session) -> PublicSiteSnapshot:
    stats = get_or_create_site_stats(db)

    review_rows = (
        db.query(PublicSiteReview)
        .order_by(PublicSiteReview.created_at.desc())
        .limit(3)
        .all()
    )

    review_count, average_rating = db.query(
        func.count(PublicSiteReview.id),
        func.avg(PublicSiteReview.rating),
    ).one()

    grouped_ratings = dict(
        db.query(PublicSiteReview.rating, func.count(PublicSiteReview.id))
        .group_by(PublicSiteReview.rating)
        .all()
    )
    rating_breakdown = {str(rating): int(grouped_ratings.get(rating, 0)) for rating in range(1, 6)}

    feedback_count = db.query(func.count(PublicSiteFeedback.id)).scalar() or 0
    feature_request_count = (
        db.query(func.count(PublicSiteFeedback.id))
        .filter(PublicSiteFeedback.category == "feature")
        .scalar()
        or 0
    )
    bug_report_count = (
        db.query(func.count(PublicSiteFeedback.id))
        .filter(PublicSiteFeedback.category == "bug")
        .scalar()
        or 0
    )
    latest_feedback = (
        db.query(PublicSiteFeedback)
        .order_by(PublicSiteFeedback.created_at.desc())
        .first()
    )

    return PublicSiteSnapshot(
        download_count=stats.download_count,
        review_count=int(review_count or 0),
        average_rating=round(float(average_rating or 0), 1),
        rating_breakdown=rating_breakdown,
        feedback_count=int(feedback_count),
        feature_request_count=int(feature_request_count),
        bug_report_count=int(bug_report_count),
        latest_feedback=(
            PublicSiteFeedbackSummary(
                id=latest_feedback.id,
                name=latest_feedback.name,
                category=latest_feedback.category,
                priority=latest_feedback.priority,
                message=latest_feedback.message,
                created_at=latest_feedback.created_at,
            )
            if latest_feedback
            else None
        ),
        reviews=[
            PublicSiteReviewSummary(
                id=review.id,
                name=review.name,
                rating=review.rating,
                message=review.message,
                created_at=review.created_at,
            )
            for review in review_rows
        ],
    )


@router.get("/site-stats", response_model=PublicSiteSnapshot)
def site_stats(db: Session = Depends(get_db)):
    return build_site_snapshot(db)


@router.post("/site-download", response_model=PublicSiteSnapshot)
def record_site_download(db: Session = Depends(get_db)):
    stats = get_or_create_site_stats(db)
    stats.download_count += 1
    stats.updated_at = datetime.utcnow()
    db.add(stats)
    db.commit()
    return build_site_snapshot(db)


@router.post("/site-reviews", response_model=PublicSiteSnapshot, status_code=status.HTTP_201_CREATED)
def create_site_review(payload: PublicSiteReviewRequest, db: Session = Depends(get_db)):
    review = PublicSiteReview(
        name=payload.name,
        rating=payload.rating,
        message=payload.message,
    )
    db.add(review)
    db.commit()
    return build_site_snapshot(db)


@router.post("/site-feedback", response_model=PublicSiteSnapshot, status_code=status.HTTP_201_CREATED)
def create_site_feedback(payload: PublicSiteFeedbackRequest, db: Session = Depends(get_db)):
    feedback = PublicSiteFeedback(
        name=payload.name,
        contact=payload.contact or None,
        category=payload.category,
        priority=payload.priority,
        message=payload.message,
    )
    db.add(feedback)
    db.commit()
    return build_site_snapshot(db)
