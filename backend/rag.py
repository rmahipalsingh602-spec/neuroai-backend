import math
import os
import re
import uuid
import zipfile
from pathlib import Path
from typing import Any, List, Optional
from xml.etree import ElementTree

import chromadb
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings
from groq import Groq
from PyPDF2 import PdfReader

CHUNK_SIZE = 400
CHUNK_OVERLAP = 75
EMBEDDING_DIMENSION = 256
COLLECTION_NAME = "documents"
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
TEXT_FILE_EXTENSIONS = {
    ".txt",
    ".md",
    ".csv",
    ".json",
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".html",
    ".css",
    ".xml",
    ".yml",
    ".yaml",
    ".svg",
}
IMAGE_FILE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".bmp",
}
PLACEHOLDER_FILE_EXTENSIONS = {
    ".doc",
}

NO_RELEVANT_DATA_MESSAGE = "No relevant data found in uploaded documents"

_groq_client: Optional[Groq] = None
_chroma_client = None


class SimpleEmbeddingFunction(EmbeddingFunction[Documents]):
    def __call__(self, input: Documents) -> Embeddings:
        print(f"[RAG] Creating embeddings for {len(input)} chunk(s)")
        return [self.embed_text(text) for text in input]

    @staticmethod
    def embed_text(text: str) -> List[float]:
        vector = [0.0] * EMBEDDING_DIMENSION
        words = re.findall(r"\w+", text.lower())

        if not words:
            return vector

        for word in words:
            index = hash(word) % EMBEDDING_DIMENSION
            vector[index] += 1.0

        magnitude = math.sqrt(sum(value * value for value in vector))
        if magnitude:
            vector = [value / magnitude for value in vector]

        return vector


def get_chroma_path() -> str:
    chroma_path = os.getenv("CHROMA_PATH", "./chroma_db")
    os.makedirs(chroma_path, exist_ok=True)
    return chroma_path


def get_chroma_client():
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=get_chroma_path())
    return _chroma_client


def get_collection():
    return get_chroma_client().get_or_create_collection(
        name=COLLECTION_NAME,
        embedding_function=SimpleEmbeddingFunction(),
        metadata={"description": "NeuroAI document chunks"},
    )


def get_uploads_path() -> str:
    uploads_path = os.getenv("UPLOADS_PATH", "./uploads")
    os.makedirs(uploads_path, exist_ok=True)
    return uploads_path


def get_groq_client() -> Groq:
    global _groq_client
    if _groq_client is not None:
        return _groq_client

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not set in .env")

    _groq_client = Groq(api_key=api_key)
    return _groq_client


def chunk_text(text: str) -> List[str]:
    words = text.split()
    chunks: List[str] = []

    if not words:
        return chunks

    step = max(1, CHUNK_SIZE - CHUNK_OVERLAP)
    for start in range(0, len(words), step):
        chunk = " ".join(words[start : start + CHUNK_SIZE]).strip()
        if chunk:
            chunks.append(chunk)

    return chunks


def tokenize_text(text: str) -> set[str]:
    return set(re.findall(r"\w+", text.lower()))


def extract_pdf_text(file_path: str) -> str:
    reader = PdfReader(file_path)
    parts: List[str] = []

    for page in reader.pages:
        page_text = page.extract_text() or ""
        if page_text.strip():
            parts.append(page_text)

    extracted_text = "\n\n".join(parts)
    print(
        f"[RAG] Extracted PDF text from '{Path(file_path).name}': "
        f"pages={len(reader.pages)} words={len(extracted_text.split())}"
    )
    return extracted_text


def extract_plain_text(file_path: str) -> str:
    with open(file_path, "r", encoding="utf-8", errors="ignore") as source_file:
        return source_file.read()


def extract_docx_text(file_path: str) -> str:
    try:
        with zipfile.ZipFile(file_path) as archive:
            document_xml = archive.read("word/document.xml")
    except (OSError, KeyError, zipfile.BadZipFile) as exc:
        raise RuntimeError("Could not read the DOCX file.") from exc

    root = ElementTree.fromstring(document_xml)
    text_nodes = [
        node.text.strip()
        for node in root.iter()
        if node.tag.endswith("}t") and node.text and node.text.strip()
    ]
    return "\n".join(text_nodes)


def build_image_placeholder(filename: str) -> str:
    return (
        f"Image uploaded: {filename}. OCR is not enabled yet, so only the file name "
        "and image type are searchable."
    )


def build_file_placeholder(filename: str, extension: str) -> str:
    return (
        f"File uploaded: {filename}. Full text extraction is not available for the "
        f"{extension or 'unknown'} format yet, but the file name is searchable."
    )


def extract_supported_file_text(file_path: str, filename: str) -> str:
    extension = Path(filename).suffix.lower()

    if extension == ".pdf":
        return extract_pdf_text(file_path)
    if extension == ".docx":
        return extract_docx_text(file_path)
    if extension in TEXT_FILE_EXTENSIONS:
        return extract_plain_text(file_path)
    if extension in IMAGE_FILE_EXTENSIONS:
        return build_image_placeholder(filename)
    if extension in PLACEHOLDER_FILE_EXTENSIONS:
        return build_file_placeholder(filename, extension)

    raise RuntimeError(
        "Unsupported file type. Use PDF, DOCX, TXT, MD, CSV, JSON, common code/text files, or images."
    )


def add_chunks_to_chroma(
    user_id: str,
    chunks: List[str],
    filename: str,
    metadatas: Optional[List[dict]] = None,
) -> None:
    if not chunks:
        return

    collection = get_collection()
    ids = [str(uuid.uuid4()) for _ in chunks]

    if metadatas is None:
        metadatas = []
        for index, _ in enumerate(chunks):
            metadatas.append(
                {
                    "user_id": user_id,
                    "filename": filename,
                    "chunk_index": index,
                }
            )
    else:
        metadatas = [
            {
                **metadata,
                "user_id": user_id,
                "filename": metadata.get("filename", filename),
            }
            for metadata in metadatas
        ]

    collection.add(
        ids=ids,
        documents=chunks,
        metadatas=metadatas,
    )
    print(
        f"[RAG] Stored {len(chunks)} chunk(s) in ChromaDB for user={user_id} filename='{filename}'"
    )


def retrieve_matches(user_id: str, query: str, n_results: int = 5) -> List[dict[str, Any]]:
    collection = get_collection()
    query_terms = tokenize_text(query)
    print(f"[RAG] Query user={user_id} top_k={n_results} text='{query}'")
    if not query_terms:
        print("[RAG] No query terms found after tokenization")
        return []

    existing_chunks = collection.get(where={"user_id": user_id}, include=[])
    indexed_chunk_count = len(existing_chunks.get("ids", []))
    print(f"[RAG] Indexed chunk count for user={user_id}: {indexed_chunk_count}")
    if indexed_chunk_count == 0:
        print("[RAG] No indexed chunks found for this user in ChromaDB")
        return []

    results = collection.query(
        query_texts=[query],
        n_results=max(n_results * 2, 10),
        where={"user_id": user_id},
        include=["documents", "metadatas", "distances"],
    )

    documents = results.get("documents", [[]])
    metadatas = results.get("metadatas", [[]])
    distances = results.get("distances", [[]])
    top_chunks = documents[0] if documents else []
    top_metadatas = metadatas[0] if metadatas else []
    top_distances = distances[0] if distances else []

    matches: List[dict[str, Any]] = []
    for index, document in enumerate(top_chunks):
        doc_terms = tokenize_text(document)
        overlap = len(query_terms & doc_terms)
        if overlap == 0:
            continue

        matches.append(
            {
                "document": document,
                "metadata": top_metadatas[index] if index < len(top_metadatas) else {},
                "distance": top_distances[index] if index < len(top_distances) else None,
                "overlap": overlap,
            }
        )

    if not top_chunks:
        print("[RAG] ChromaDB returned no candidate chunks for this query")
    elif not matches:
        print("[RAG] ChromaDB returned candidates, but none overlapped with query terms")
        for index, candidate in enumerate(top_chunks[:5], start=1):
            preview = candidate[:180].replace("\n", " ")
            print(f"[RAG] Candidate {index}: {preview}")

    matches.sort(
        key=lambda match: (
            match.get("overlap", 0),
            -float(match["distance"]) if match.get("distance") is not None else 0.0,
        ),
        reverse=True,
    )
    final_matches = matches[:n_results]
    print(f"[RAG] Retrieved {len(final_matches)} relevant chunk(s)")
    for index, match in enumerate(final_matches, start=1):
        preview = match["document"][:180].replace("\n", " ")
        print(
            f"[RAG] Match {index}: overlap={match.get('overlap')} "
            f"distance={match.get('distance')} preview={preview}"
        )

    return final_matches


def retrieve_chunks(user_id: str, query: str, n_results: int = 5) -> str:
    matches = retrieve_matches(user_id, query, n_results=n_results)
    return "\n\n".join(match["document"] for match in matches if match.get("document"))


def get_ai_response(query: str, context: str, image_paths: Optional[List[str]] = None) -> str:
    if not context.strip():
        return NO_RELEVANT_DATA_MESSAGE

    prompt = (
        "You are a company internal AI assistant.\n"
        "Answer ONLY from the given context.\n"
        "If answer is not in context, say you don't know.\n\n"
        f"Context:\n{context}\n\n"
        f"Question:\n{query}"
    )

    try:
        completion = get_groq_client().chat.completions.create(
            model=GROQ_MODEL,
            temperature=0.0,
            max_completion_tokens=120,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an internal company knowledge bot. "
                        "Keep answers short, precise, and grounded only in the provided context. "
                        "Do not add outside knowledge."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
        )
    except Exception as exc:
        raise RuntimeError(f"Groq request failed: {exc}") from exc

    answer = (completion.choices[0].message.content or "").strip()
    if not answer:
        raise RuntimeError("Groq returned an empty response.")

    if "don't know" in answer.lower() or "do not know" in answer.lower():
        return NO_RELEVANT_DATA_MESSAGE

    return answer
