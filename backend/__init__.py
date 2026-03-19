"""Backend package for NeuroAI Platform."""

from pathlib import Path

from dotenv import load_dotenv

# Load environment variables from the project root before other backend
# modules read config values.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
