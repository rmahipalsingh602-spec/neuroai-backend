from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.database import get_db
from backend.errors import api_error
from backend.models import Payment, User
from backend.schemas import CreateOrderResponse, PaymentVerifyRequest, PaymentVerifyResponse
from backend.services.payments import create_payment_order, verify_payment_signature
from backend.services.usage import build_user_summary

router = APIRouter()


@router.post("/create-order", response_model=CreateOrderResponse)
def create_order(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.is_pro:
        api_error(status.HTTP_409_CONFLICT, "PAYMENT_ERROR", "NeuroAI Pro is already active on this account.")
    _, payload = create_payment_order(db, current_user)
    return CreateOrderResponse(**payload)


@router.post("/verify-payment", response_model=PaymentVerifyResponse)
def verify_payment(
    payload: PaymentVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payment = (
        db.query(Payment)
        .filter(
            Payment.provider_order_id == payload.razorpay_order_id,
            Payment.user_id == current_user.id,
        )
        .first()
    )
    if payment is None:
        api_error(status.HTTP_404_NOT_FOUND, "PAYMENT_ERROR", "Payment order not found")

    verify_payment_signature(db, current_user, payment, payload)
    db.refresh(current_user)

    return PaymentVerifyResponse(
        message="Payment verified successfully",
        user=build_user_summary(
            current_user,
            document_count=len(current_user.documents),
            payment_count=len(current_user.payments),
        ),
    )
