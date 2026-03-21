import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.auth import get_password_hash
from backend.database import SessionLocal
from backend.models import User


def main() -> None:
    parser = argparse.ArgumentParser(description="Reset a local NeuroAI user password.")
    parser.add_argument("--email", required=True, help="User email to update")
    parser.add_argument("--password", required=True, help="New plaintext password")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == args.email.lower()).first()
        if user is None:
            raise SystemExit(f"User not found: {args.email}")

        user.password_hash = get_password_hash(args.password)
        db.add(user)
        db.commit()
        print(f"Password reset for {user.email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
