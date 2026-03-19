import uuid
from pathlib import Path
import zipfile
from xml.etree import ElementTree

from fastapi import UploadFile
from PyPDF2 import PdfReader

try:
    import fitz  # type: ignore
except ImportError:  # pragma: no cover - optional runtime dependency
    fitz = None

try:
    from docx import Document as DocxDocument
except ImportError:  # pragma: no cover - optional runtime dependency
    DocxDocument = None

try:
    from config import settings
except ImportError:  # pragma: no cover - package import fallback
    from ..config import settings

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}


def get_allowed_extensions() -> set[str]:
    return ALLOWED_EXTENSIONS


async def store_upload_file(file: UploadFile, user_id: int) -> tuple[Path, str]:
    original_name = Path(file.filename or "document.txt").name
    suffix = Path(original_name).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise ValueError("Only PDF, DOCX, and TXT files are supported.")

    contents = await file.read()
    if not contents:
        raise ValueError("Uploaded file is empty.")

    user_dir = settings.uploads_path / str(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)

    stored_name = f"{uuid.uuid4().hex}_{original_name}"
    stored_path = user_dir / stored_name
    stored_path.write_bytes(contents)
    return stored_path, original_name


def extract_text_from_file(file_path: Path, display_name: str) -> str:
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        text = _extract_pdf_text(file_path)
    elif suffix == ".docx":
        text = _extract_docx_text(file_path)
    elif suffix == ".txt":
        text = file_path.read_text(encoding="utf-8", errors="ignore")
    else:
        raise ValueError("Unsupported file type.")

    cleaned_text = text.strip()
    if not cleaned_text:
        raise ValueError(f"No readable text found in {display_name}.")
    return cleaned_text


def _extract_pdf_text(file_path: Path) -> str:
    if fitz is not None:
        with fitz.open(file_path) as pdf:
            return "\n\n".join(page.get_text("text") for page in pdf)

    reader = PdfReader(str(file_path))
    return "\n\n".join((page.extract_text() or "") for page in reader.pages)


def _extract_docx_text(file_path: Path) -> str:
    if DocxDocument is not None:
        document = DocxDocument(file_path)
        return "\n".join(paragraph.text for paragraph in document.paragraphs if paragraph.text.strip())

    try:
        with zipfile.ZipFile(file_path) as archive:
            document_xml = archive.read("word/document.xml")
    except (OSError, KeyError, zipfile.BadZipFile) as exc:
        raise ValueError("Could not read the DOCX file.") from exc

    root = ElementTree.fromstring(document_xml)
    text_nodes = [
        node.text.strip()
        for node in root.iter()
        if node.tag.endswith("}t") and node.text and node.text.strip()
    ]
    return "\n".join(text_nodes)
