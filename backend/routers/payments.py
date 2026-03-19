from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..errors import api_error
from ..models import Payment, User
from ..schemas import CreateOrderResponse, PaymentVerifyRequest, PaymentVerifyResponse
from ..services.payments import create_payment_order, verify_payment_signature
from ..services.usage import build_user_summary

router = APIRouter()


@router.post("/create-order", response_model=CreateOrderResponse)
def create_order(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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
