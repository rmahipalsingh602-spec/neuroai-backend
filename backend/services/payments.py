import base64
import hashlib
import hmac
import uuid
from datetime import datetime

import requests
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..config import settings
from ..errors import api_error
from ..models import Payment, User
from ..schemas import PaymentVerifyRequest


def create_payment_order(db: Session, user: User) -> tuple[Payment, dict]:
    is_mock = not (settings.razorpay_key_id and settings.razorpay_key_secret)
    order_id = f"order_mock_{uuid.uuid4().hex[:14]}"

    if not is_mock:
        auth_bytes = f"{settings.razorpay_key_id}:{settings.razorpay_key_secret}".encode("utf-8")
        auth_header = base64.b64encode(auth_bytes).decode("utf-8")
        response = requests.post(
            "https://api.razorpay.com/v1/orders",
            headers={
                "Authorization": f"Basic {auth_header}",
                "Content-Type": "application/json",
            },
            json={
                "amount": settings.razorpay_plan_amount,
                "currency": settings.razorpay_currency,
                "receipt": f"neuroai-{user.id}-{uuid.uuid4().hex[:10]}",
                "payment_capture": 1,
            },
            timeout=15,
        )
        if response.status_code >= 400:
            api_error(
                status.HTTP_502_BAD_GATEWAY,
                "PAYMENT_ERROR",
                f"Razorpay order creation failed: {response.text}",
            )
        order_id = response.json()["id"]

    payment = Payment(
        user_id=user.id,
        amount=settings.razorpay_plan_amount,
        status="created",
        provider_order_id=order_id,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    return payment, {
        "order_id": payment.provider_order_id,
        "amount": payment.amount,
        "currency": settings.razorpay_currency,
        "key_id": settings.razorpay_key_id or "mock_key_id",
        "plan_name": "NeuroAI Pro - Rs. 199",
        "is_mock": is_mock,
    }


def verify_payment_signature(
    db: Session,
    user: User,
    payment: Payment,
    payload: PaymentVerifyRequest,
) -> Payment:
    if not settings.razorpay_key_secret and payload.razorpay_signature == "mock_signature":
        expected_signature = "mock_signature"
    else:
        expected_signature = _expected_signature(payload.razorpay_order_id, payload.razorpay_payment_id)

    if payload.razorpay_signature != expected_signature:
        api_error(status.HTTP_400_BAD_REQUEST, "PAYMENT_ERROR", "Invalid payment signature")

    payment.provider_payment_id = payload.razorpay_payment_id
    payment.provider_signature = payload.razorpay_signature
    payment.status = "paid"
    payment.updated_at = datetime.utcnow()

    user.is_pro = True

    db.add(payment)
    db.add(user)
    db.commit()
    db.refresh(payment)
    return payment


def _expected_signature(order_id: str, payment_id: str) -> str:
    secret = settings.razorpay_key_secret or "mock_razorpay_secret"
    body = f"{order_id}|{payment_id}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
