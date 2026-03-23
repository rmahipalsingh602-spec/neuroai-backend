import hashlib
import hmac
import uuid
from datetime import datetime
from decimal import Decimal

import requests
from fastapi import status
from sqlalchemy.orm import Session

from backend.config import settings
from backend.errors import api_error
from backend.models import Payment, User
from backend.schemas import PaymentVerifyRequest

RAZORPAY_API_BASE_URL = "https://api.razorpay.com/v1"
SUCCESSFUL_PAYMENT_STATUSES = {"authorized", "captured"}


def create_payment_order(db: Session, user: User) -> tuple[Payment, dict]:
    _ensure_razorpay_configured()

    order_payload = _razorpay_request(
        "POST",
        "/orders",
        json={
            "amount": settings.razorpay_plan_amount,
            "currency": settings.razorpay_currency,
            "receipt": _build_receipt(user.id),
            "notes": {
                "product": "NeuroAI Pro",
                "user_id": str(user.id),
            },
        },
    )

    payment = Payment(
        user_id=user.id,
        amount=settings.razorpay_plan_amount,
        status=(order_payload.get("status") or "created").lower(),
        provider_order_id=order_payload["id"],
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    return payment, {
        "order_id": payment.provider_order_id,
        "amount": payment.amount,
        "currency": settings.razorpay_currency,
        "key_id": settings.razorpay_key_id,
        "plan_name": _build_plan_name(payment.amount, settings.razorpay_currency),
        "is_mock": False,
    }


def verify_payment_signature(
    db: Session,
    user: User,
    payment: Payment,
    payload: PaymentVerifyRequest,
) -> Payment:
    _ensure_razorpay_configured()

    if payment.provider_payment_id and payment.provider_payment_id != payload.razorpay_payment_id:
        api_error(
            status.HTTP_409_CONFLICT,
            "PAYMENT_ERROR",
            "This order is already linked to a different payment.",
        )

    expected_signature = _expected_signature(
        payload.razorpay_order_id,
        payload.razorpay_payment_id,
    )
    if not hmac.compare_digest(payload.razorpay_signature, expected_signature):
        api_error(status.HTTP_400_BAD_REQUEST, "PAYMENT_ERROR", "Invalid payment signature")

    provider_payment = _razorpay_request(
        "GET",
        f"/payments/{payload.razorpay_payment_id}",
    )

    provider_order_id = provider_payment.get("order_id") or ""
    provider_currency = (provider_payment.get("currency") or "").upper()
    provider_amount = int(provider_payment.get("amount") or 0)
    provider_status = (provider_payment.get("status") or "").lower()
    provider_captured = bool(provider_payment.get("captured"))

    if provider_order_id != payload.razorpay_order_id:
        api_error(
            status.HTTP_400_BAD_REQUEST,
            "PAYMENT_ERROR",
            "Payment does not belong to this order.",
        )
    if provider_amount != payment.amount:
        api_error(
            status.HTTP_400_BAD_REQUEST,
            "PAYMENT_ERROR",
            "Payment amount mismatch.",
        )
    if provider_currency != settings.razorpay_currency.upper():
        api_error(
            status.HTTP_400_BAD_REQUEST,
            "PAYMENT_ERROR",
            "Payment currency mismatch.",
        )
    if provider_status not in SUCCESSFUL_PAYMENT_STATUSES and not provider_captured:
        api_error(
            status.HTTP_400_BAD_REQUEST,
            "PAYMENT_ERROR",
            "Payment is not successful yet.",
        )

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


def _ensure_razorpay_configured() -> None:
    if settings.razorpay_key_id and settings.razorpay_key_secret:
        return

    api_error(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "PAYMENT_ERROR",
        "Real Razorpay payment is not configured on the server yet.",
    )


def _razorpay_request(method: str, path: str, **kwargs) -> dict:
    try:
        response = requests.request(
            method=method,
            url=f"{RAZORPAY_API_BASE_URL}{path}",
            auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
            timeout=20,
            **kwargs,
        )
    except requests.RequestException as exc:
        api_error(
            status.HTTP_502_BAD_GATEWAY,
            "PAYMENT_ERROR",
            f"Could not reach Razorpay: {exc}",
        )

    if response.status_code >= 400:
        api_error(
            status.HTTP_502_BAD_GATEWAY,
            "PAYMENT_ERROR",
            "Razorpay request failed.",
            provider_status=response.status_code,
            provider_body=_truncate_provider_body(response.text),
        )

    try:
        return response.json()
    except ValueError:
        api_error(
            status.HTTP_502_BAD_GATEWAY,
            "PAYMENT_ERROR",
            "Razorpay returned an invalid response.",
        )


def _expected_signature(order_id: str, payment_id: str) -> str:
    body = f"{order_id}|{payment_id}".encode("utf-8")
    return hmac.new(
        settings.razorpay_key_secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()


def _build_receipt(user_id: int) -> str:
    return f"neuroai-{user_id}-{uuid.uuid4().hex[:10]}"


def _build_plan_name(amount_subunits: int, currency: str) -> str:
    normalized_currency = currency.upper()
    main_amount = Decimal(amount_subunits) / Decimal("100")
    if normalized_currency == "INR":
        return f"NeuroAI Pro - Rs. {main_amount:.2f}"
    return f"NeuroAI Pro - {normalized_currency} {main_amount:.2f}"


def _truncate_provider_body(text: str, limit: int = 300) -> str:
    collapsed = " ".join(text.split())
    if len(collapsed) <= limit:
        return collapsed
    return f"{collapsed[:limit].rstrip()}..."
