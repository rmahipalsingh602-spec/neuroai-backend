from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.auth import require_admin
from backend.database import get_db
from backend.models import Payment, User
from backend.schemas import AdminOverview, AdminUserSummary, PaymentSummary

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/overview", response_model=AdminOverview)
def admin_overview(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    payments = db.query(Payment).order_by(Payment.created_at.desc()).limit(20).all()
    total_revenue = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(Payment.status == "paid")
        .scalar()
        or 0
    )

    return AdminOverview(
        total_users=len(users),
        pro_users=sum(1 for user in users if user.is_pro),
        total_revenue=total_revenue,
        users=[
            AdminUserSummary(
                id=user.id,
                email=user.email,
                is_pro=user.is_pro,
                usage_count=user.usage_count,
                created_at=user.created_at,
            )
            for user in users[:25]
        ],
        payments=[
            PaymentSummary(
                id=payment.id,
                user_id=payment.user_id,
                amount=payment.amount,
                status=payment.status,
                provider_order_id=payment.provider_order_id,
                provider_payment_id=payment.provider_payment_id,
                created_at=payment.created_at,
            )
            for payment in payments
        ],
    )
