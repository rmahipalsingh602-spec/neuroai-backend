from datetime import date, datetime
from typing import List

from pydantic import BaseModel, Field, field_validator


class AuthRequest(BaseModel):
    email: str
    password: str = Field(min_length=6, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        email = value.strip().lower()
        if "@" not in email or "." not in email.split("@")[-1]:
            raise ValueError("Enter a valid email address")
        return email


class UserSummary(BaseModel):
    id: int
    email: str
    is_pro: bool
    usage_count: int
    usage_limit: int
    remaining_queries: int
    usage_month: date
    created_at: datetime
    document_count: int
    payment_count: int
    is_admin: bool
    has_seen_onboarding: bool


class AuthResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserSummary


class DocumentSummary(BaseModel):
    id: int
    file_name: str
    content_preview: str
    created_at: datetime


class DocumentListResponse(BaseModel):
    documents: List[DocumentSummary]


class UploadResponse(BaseModel):
    message: str
    document: DocumentSummary
    accepted_types: List[str]


class ChatRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4000)


class VoiceRequest(BaseModel):
    text: str = Field(min_length=1, max_length=3000)
    target_lang: str = Field(default="hi")

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        text = " ".join(value.split()).strip()
        if not text:
            raise ValueError("Text is required")
        return text

    @field_validator("target_lang")
    @classmethod
    def validate_target_lang(cls, value: str) -> str:
        target_lang = value.strip().lower()
        if target_lang not in {"hi", "en", "fr", "es"}:
            raise ValueError("target_lang must be one of: hi, en, fr, es")
        return target_lang


class ChatSource(BaseModel):
    document_id: int
    file_name: str
    excerpt: str


class ChatResponse(BaseModel):
    response: str
    sources: List[ChatSource]
    user: UserSummary


class CreateOrderResponse(BaseModel):
    order_id: str
    amount: int
    currency: str
    key_id: str
    plan_name: str
    is_mock: bool


class PaymentVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class PaymentVerifyResponse(BaseModel):
    message: str
    user: UserSummary


class AdminUserSummary(BaseModel):
    id: int
    email: str
    is_pro: bool
    usage_count: int
    created_at: datetime


class PaymentSummary(BaseModel):
    id: int
    user_id: int
    amount: int
    status: str
    provider_order_id: str
    provider_payment_id: str | None = None
    created_at: datetime


class AdminOverview(BaseModel):
    total_users: int
    pro_users: int
    total_revenue: int
    users: List[AdminUserSummary]
    payments: List[PaymentSummary]


class PublicSiteReviewRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    rating: int = Field(ge=1, le=5)
    message: str = Field(min_length=8, max_length=600)

    @field_validator("name", "message")
    @classmethod
    def validate_public_review_text(cls, value: str) -> str:
        text = " ".join(value.split()).strip()
        if not text:
            raise ValueError("This field is required")
        return text


class PublicSiteFeedbackRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    contact: str = Field(default="", max_length=255)
    category: str = Field(min_length=3, max_length=50)
    priority: str = Field(min_length=3, max_length=20)
    message: str = Field(min_length=8, max_length=1000)

    @field_validator("name", "contact", "category", "priority", "message")
    @classmethod
    def validate_public_feedback_text(cls, value: str) -> str:
        return " ".join(value.split()).strip()

    @field_validator("category")
    @classmethod
    def validate_feedback_category(cls, value: str) -> str:
        allowed = {"bug", "feature", "improvement"}
        category = value.lower()
        if category not in allowed:
            raise ValueError(f"category must be one of: {', '.join(sorted(allowed))}")
        return category

    @field_validator("priority")
    @classmethod
    def validate_feedback_priority(cls, value: str) -> str:
        allowed = {"high", "medium", "low"}
        priority = value.lower()
        if priority not in allowed:
            raise ValueError(f"priority must be one of: {', '.join(sorted(allowed))}")
        return priority


class PublicSiteReviewSummary(BaseModel):
    id: int
    name: str
    rating: int
    message: str
    created_at: datetime


class PublicSiteFeedbackSummary(BaseModel):
    id: int
    name: str
    category: str
    priority: str
    message: str
    created_at: datetime


class PublicSiteSnapshot(BaseModel):
    download_count: int
    review_count: int
    average_rating: float
    rating_breakdown: dict[str, int]
    feedback_count: int
    feature_request_count: int
    bug_report_count: int
    latest_feedback: PublicSiteFeedbackSummary | None = None
    reviews: List[PublicSiteReviewSummary]
