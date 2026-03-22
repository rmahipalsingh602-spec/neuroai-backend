from datetime import date, datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from backend.database import Base


def current_usage_month() -> date:
    today = date.today()
    return today.replace(day=1)


class User(Base):
    __tablename__ = "neuroai_users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_pro = Column(Boolean, default=False, nullable=False)
    usage_count = Column(Integer, default=0, nullable=False)
    usage_month = Column(Date, default=current_usage_month, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    has_seen_onboarding = Column(Boolean, default=False, nullable=False)

    documents = relationship("Document", back_populates="owner", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="user", cascade="all, delete-orphan")
    chats = relationship("ChatMessage", back_populates="user", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "neuroai_documents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("neuroai_users.id"), nullable=False, index=True)
    file_name = Column(String(255), nullable=False)
    stored_path = Column(String(500), nullable=False)
    content_text = Column(Text, nullable=False)
    content_type = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    owner = relationship("User", back_populates="documents")


class Payment(Base):
    __tablename__ = "neuroai_payments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("neuroai_users.id"), nullable=False, index=True)
    amount = Column(Integer, nullable=False)
    status = Column(String(50), default="created", nullable=False, index=True)
    provider_order_id = Column(String(255), nullable=False, unique=True, index=True)
    provider_payment_id = Column(String(255), nullable=True, unique=True)
    provider_signature = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="payments")


class ChatMessage(Base):
    __tablename__ = "neuroai_chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("neuroai_users.id"), nullable=False, index=True)
    query = Column(Text, nullable=False)
    response = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="chats")


class PublicSiteStats(Base):
    __tablename__ = "neuroai_public_site_stats"

    id = Column(Integer, primary_key=True, index=True)
    download_count = Column(Integer, default=5, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class PublicSiteReview(Base):
    __tablename__ = "neuroai_public_site_reviews"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    rating = Column(Integer, nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class PublicSiteFeedback(Base):
    __tablename__ = "neuroai_public_site_feedback"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    contact = Column(String(255), nullable=True)
    category = Column(String(50), nullable=False, index=True)
    priority = Column(String(20), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
