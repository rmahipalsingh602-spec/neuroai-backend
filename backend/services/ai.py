import re
import logging
from functools import lru_cache

try:
    from groq import Groq
except ImportError:  # pragma: no cover
    Groq = None

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None

from ..config import settings
from ..models import Document

MAX_CONTEXT_CHUNKS = 4
MAX_CHUNK_WORDS = 180
MIN_SCORE = 1.0

logger = logging.getLogger(__name__)


def answer_question(question: str, documents: list[Document]) -> tuple[str, list[dict]]:
    ranked_context = _select_relevant_context(question, documents)
    if not ranked_context:
        return (
            "I could not find a matching answer in your uploaded documents yet. Try uploading a more relevant file or asking a more specific question.",
            [],
        )

    context_text = "\n\n".join(
        f"[{item['file_name']}]\n{item['excerpt']}" for item in ranked_context
    )
    response = _generate_ai_response(question, context_text, ranked_context)
    return response, ranked_context


def _select_relevant_context(question: str, documents: list[Document]) -> list[dict]:
    query_terms = set(re.findall(r"\w+", question.lower()))
    ranked = []
    lowered_question = question.lower().strip()

    for document in documents:
        for chunk_index, excerpt in enumerate(_chunk_text(document.content_text)):
            excerpt_terms = set(re.findall(r"\w+", excerpt.lower()))
            overlap = len(query_terms & excerpt_terms)
            phrase_boost = 2.0 if lowered_question and lowered_question in excerpt.lower() else 0.0
            coverage = (overlap / max(len(query_terms), 1)) if query_terms else 0.0
            score = overlap + phrase_boost + coverage
            if score < MIN_SCORE:
                continue
            ranked.append(
                {
                    "document_id": document.id,
                    "file_name": document.file_name,
                    "excerpt": excerpt[:600],
                    "chunk_index": chunk_index,
                    "score": score,
                }
            )

    ranked.sort(key=lambda item: (item["score"], -item["chunk_index"]), reverse=True)
    return ranked[:MAX_CONTEXT_CHUNKS]


def _chunk_text(text: str) -> list[str]:
    words = text.split()
    if not words:
        return []
    return [
        " ".join(words[index : index + MAX_CHUNK_WORDS])
        for index in range(0, len(words), MAX_CHUNK_WORDS)
    ]


@lru_cache(maxsize=1)
def _get_groq_client():
    if not settings.groq_api_key:
        logger.warning("[AI] GROQ_API_KEY is missing. Groq chat is disabled.")
        return None
    if Groq is None:
        logger.warning("[AI] Groq SDK is not installed. Groq chat is disabled.")
        return None
    try:
        return Groq(api_key=settings.groq_api_key)
    except Exception as exc:  # pragma: no cover - defensive runtime guard
        logger.exception("[AI] Groq client initialization failed: %s", exc)
        return None


@lru_cache(maxsize=1)
def _get_openai_client():
    if not settings.openai_api_key:
        logger.warning("[AI] OPENAI_API_KEY is missing. OpenAI fallback is disabled.")
        return None
    if OpenAI is None:
        logger.warning("[AI] OpenAI SDK is not installed. OpenAI fallback is disabled.")
        return None
    try:
        return OpenAI(api_key=settings.openai_api_key)
    except Exception as exc:  # pragma: no cover - defensive runtime guard
        logger.exception("[AI] OpenAI client initialization failed: %s", exc)
        return None


def _generate_ai_response(question: str, context: str, ranked_context: list[dict]) -> str:
    prompt = (
        "You are NeuroAI Pro, a document-grounded assistant. "
        "Answer only from the provided document context. "
        "If the answer is not present, say you could not find it in the uploaded documents.\n\n"
        f"Context:\n{context}\n\nQuestion:\n{question}"
    )

    groq_client = _get_groq_client()
    if groq_client is not None:
        try:
            response = groq_client.chat.completions.create(
                model=settings.groq_model,
                temperature=0.1,
                max_completion_tokens=300,
                messages=[
                    {
                        "role": "system",
                        "content": "Answer only from the provided document context. Be concise and honest if the answer is missing.",
                    },
                    {"role": "user", "content": prompt},
                ],
            )
            answer_text = (response.choices[0].message.content or "").strip()
            if answer_text:
                return answer_text
            logger.error("[AI] Groq returned an empty response for the current chat request.")
        except Exception as exc:
            logger.exception("[AI] Groq request failed, falling back: %s", exc)

    openai_client = _get_openai_client()
    if openai_client is not None:
        try:
            response = openai_client.responses.create(
                model=settings.openai_model,
                instructions="Be concise, factual, and cite the most relevant uploaded document names in natural language.",
                input=prompt,
            )
            answer_text = (response.output_text or "").strip()
            if answer_text:
                return answer_text
            logger.error("[AI] OpenAI returned an empty response for the current chat request.")
        except Exception as exc:
            logger.exception("[AI] OpenAI request failed, falling back: %s", exc)

    if not settings.groq_api_key and not settings.openai_api_key:
        logger.warning(
            "[AI] No AI API keys are configured in .env. Returning document-based fallback text."
        )

    source_names = ", ".join(dict.fromkeys(item["file_name"] for item in ranked_context))
    first_excerpt = ranked_context[0]["excerpt"]
    return (
        f"Mock AI answer based on {source_names}: {first_excerpt[:350]}"
        if first_excerpt
        else "Mock AI answer is ready, but no strong excerpt was found."
    )
