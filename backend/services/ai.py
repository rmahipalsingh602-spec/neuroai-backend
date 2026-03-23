import logging
import math
import re
from collections import Counter
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

try:
    from groq import Groq
except ImportError:  # pragma: no cover
    Groq = None

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None

from backend.config import settings
from backend.models import Document

MAX_EXCERPT_CHARS = 900
MAX_SENTENCE_RESULTS = 4
MIN_SCORE = 1.4
SUMMARY_INTENTS = {"summary", "key_points", "explain"}
FOLLOW_UP_MARKERS = {
    "it",
    "this",
    "that",
    "these",
    "those",
    "they",
    "them",
    "he",
    "she",
    "his",
    "her",
    "their",
    "its",
    "more",
    "again",
    "continue",
    "above",
    "previous",
    "same",
    "simple",
    "simpler",
    "detail",
    "details",
    "elaborate",
    "isko",
    "isse",
    "isme",
    "ismein",
    "ye",
    "yeh",
    "vo",
    "woh",
    "usko",
    "usme",
    "aur",
    "phir",
}
STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "how",
    "in",
    "into",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "was",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "will",
    "with",
    "your",
    "you",
    "me",
    "my",
    "our",
    "we",
    "i",
    "do",
    "does",
    "did",
    "can",
    "could",
    "should",
    "would",
    "please",
    "tell",
    "about",
    "batao",
    "bata",
    "kya",
    "ka",
    "ki",
    "ke",
    "ko",
    "hai",
    "hain",
    "tha",
    "thi",
    "the",
    "me",
    "mai",
    "main",
    "aur",
    "ya",
    "yah",
    "ye",
    "yeh",
    "vo",
    "woh",
    "iska",
    "iski",
    "iske",
    "uska",
    "uski",
    "uske",
    "kar",
    "karo",
    "kr",
    "ok",
    "summary",
    "summarize",
    "summarise",
    "explain",
    "simple",
    "simply",
}

logger = logging.getLogger(__name__)


def answer_question(
    question: str,
    documents: list[Document],
    chat_history: list[dict[str, str]] | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    ordered_documents = sorted(
        documents,
        key=lambda document: (document.created_at or datetime.min, document.id or 0),
        reverse=True,
    )
    history = _normalize_chat_history(chat_history)
    intent = _detect_intent(question)
    retrieval_query = _build_retrieval_query(question, history)
    prioritized_documents = _prioritize_documents(ordered_documents, retrieval_query, intent)
    ranked_context = _select_relevant_context(
        question=question,
        retrieval_query=retrieval_query,
        documents=prioritized_documents,
        chat_history=history,
        intent=intent,
    )

    if not ranked_context:
        return (
            "I could not find a matching answer in your uploaded documents yet. "
            "Try naming the file, asking a more specific question, or uploading a more relevant document.",
            [],
        )

    response = _generate_ai_response(
        question=question,
        retrieval_query=retrieval_query,
        ranked_context=ranked_context,
        chat_history=history,
        intent=intent,
    )
    return response, ranked_context


def _normalize_chat_history(chat_history: list[dict[str, str]] | None) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    for item in chat_history or []:
        role = (item.get("role") or "").strip().lower()
        content = _collapse_whitespace(item.get("content") or "")
        if role in {"user", "assistant"} and content:
            normalized.append({"role": role, "content": content})
    return normalized[-(settings.ai_history_turns * 2) :]


def _detect_intent(question: str) -> str:
    lowered_question = question.lower()

    if any(
        phrase in lowered_question
        for phrase in {
            "summarize",
            "summarise",
            "summary",
            "overview",
            "gist",
            "short summary",
            "saransh",
            "summery",
        }
    ):
        return "summary"
    if any(
        phrase in lowered_question
        for phrase in {
            "key points",
            "main points",
            "important points",
            "highlights",
            "takeaways",
        }
    ):
        return "key_points"
    if any(
        phrase in lowered_question
        for phrase in {
            "explain",
            "simple words",
            "easy words",
            "easy language",
            "simple language",
            "understand",
            "samjhao",
            "samjha",
            "simple batao",
        }
    ):
        return "explain"
    return "qa"


def _build_retrieval_query(question: str, chat_history: list[dict[str, str]]) -> str:
    clean_question = _collapse_whitespace(question)
    if not clean_question or not chat_history or not _looks_like_follow_up(clean_question):
        return clean_question

    recent_user_questions = [
        item["content"] for item in chat_history if item["role"] == "user"
    ][-2:]
    if not recent_user_questions:
        return clean_question

    return _collapse_whitespace(" ".join([*recent_user_questions, clean_question]))


def _looks_like_follow_up(question: str) -> bool:
    words = re.findall(r"\w+", question.lower())
    if len(words) <= 4:
        return True
    return any(word in FOLLOW_UP_MARKERS for word in words)


def _prioritize_documents(
    documents: list[Document],
    retrieval_query: str,
    intent: str,
) -> list[Document]:
    if not documents:
        return []

    query_tokens = _tokenize(retrieval_query)
    scored_documents: list[tuple[float, int, Document]] = []

    for position, document in enumerate(documents):
        file_name_tokens = _tokenize(Path(document.file_name).stem, keep_stopwords=True)
        overlap = len(query_tokens & file_name_tokens)
        exact_name_boost = 3.0 if document.file_name.lower() in retrieval_query.lower() else 0.0
        recency_boost = max(0.0, (len(documents) - position) * 0.08)
        score = overlap * 1.8 + exact_name_boost + recency_boost
        scored_documents.append((score, -position, document))

    scored_documents.sort(reverse=True)
    matched_documents = [item[2] for item in scored_documents if item[0] > 0]

    if matched_documents:
        if intent in SUMMARY_INTENTS:
            return matched_documents[:1]
        return matched_documents[: min(len(matched_documents), 4)]

    if intent in SUMMARY_INTENTS:
        return documents[:1]

    return documents


def _select_relevant_context(
    question: str,
    retrieval_query: str,
    documents: list[Document],
    chat_history: list[dict[str, str]],
    intent: str,
) -> list[dict[str, Any]]:
    if intent in SUMMARY_INTENTS:
        return _select_overview_context(documents)

    chunks = _build_chunks(documents)
    if not chunks:
        return []

    idf_scores = _build_idf_lookup(chunks)
    retrieval_tokens = _tokenize(retrieval_query)
    history_tokens = _tokenize(
        " ".join(item["content"] for item in chat_history[-4:] if item["role"] == "user")
    )
    lowered_question = question.lower()

    ranked: list[dict[str, Any]] = []
    for chunk in chunks:
        chunk_tokens = chunk["tokens"]
        overlap = retrieval_tokens & chunk_tokens
        query_coverage = len(overlap) / max(len(retrieval_tokens), 1)
        lexical_score = sum(idf_scores.get(token, 1.0) for token in overlap)
        filename_overlap = len(retrieval_tokens & chunk["file_name_tokens"]) * 0.6
        history_overlap = len(history_tokens & chunk_tokens) * 0.18
        phrase_boost = 2.2 if lowered_question and lowered_question in chunk["text"].lower() else 0.0
        substring_boost = 1.4 if _has_partial_phrase_match(question, chunk["text"]) else 0.0
        heading_boost = 0.4 if chunk["chunk_index"] == 0 else 0.0
        score = (
            lexical_score * 2.0
            + query_coverage * 2.4
            + filename_overlap
            + history_overlap
            + phrase_boost
            + substring_boost
            + heading_boost
        )

        if score < MIN_SCORE:
            continue

        ranked.append(
            {
                "document_id": chunk["document_id"],
                "file_name": chunk["file_name"],
                "excerpt": chunk["excerpt"],
                "chunk_index": chunk["chunk_index"],
                "score": score,
            }
        )

    ranked.sort(key=lambda item: (item["score"], -item["chunk_index"]), reverse=True)
    return _limit_and_diversify_context(ranked)


def _select_overview_context(documents: list[Document]) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []

    for document in documents[:2]:
        raw_chunks = _chunk_text(document.content_text)
        if not raw_chunks:
            continue

        candidate_indexes = {0}
        if len(raw_chunks) > 1:
            candidate_indexes.add(1)
        if len(raw_chunks) > 2:
            candidate_indexes.add(len(raw_chunks) // 2)
        if len(raw_chunks) > 3:
            candidate_indexes.add(len(raw_chunks) - 1)

        for chunk_index in sorted(candidate_indexes):
            excerpt = raw_chunks[chunk_index][:MAX_EXCERPT_CHARS]
            selected.append(
                {
                    "document_id": document.id,
                    "file_name": document.file_name,
                    "excerpt": excerpt,
                    "chunk_index": chunk_index,
                    "score": 10.0 - chunk_index,
                }
            )

    return selected[: settings.ai_context_chunks]


def _build_chunks(documents: list[Document]) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []

    for document in documents:
        file_name_tokens = _tokenize(Path(document.file_name).stem, keep_stopwords=True)
        for chunk_index, excerpt in enumerate(_chunk_text(document.content_text)):
            tokens = _tokenize(excerpt)
            if not tokens:
                continue

            chunks.append(
                {
                    "document_id": document.id,
                    "file_name": document.file_name,
                    "file_name_tokens": file_name_tokens,
                    "chunk_index": chunk_index,
                    "text": excerpt,
                    "excerpt": excerpt[:MAX_EXCERPT_CHARS],
                    "tokens": tokens,
                }
            )

    return chunks


def _build_idf_lookup(chunks: list[dict[str, Any]]) -> dict[str, float]:
    document_frequency: Counter[str] = Counter()
    for chunk in chunks:
        document_frequency.update(chunk["tokens"])

    total_chunks = max(len(chunks), 1)
    return {
        token: math.log((1 + total_chunks) / (1 + frequency)) + 1.0
        for token, frequency in document_frequency.items()
    }


def _limit_and_diversify_context(ranked_context: list[dict[str, Any]]) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    seen_excerpts: set[str] = set()
    per_document_counts: Counter[int] = Counter()

    for item in ranked_context:
        excerpt_key = item["excerpt"][:160]
        if excerpt_key in seen_excerpts:
            continue
        if per_document_counts[item["document_id"]] >= 2:
            continue

        selected.append(item)
        seen_excerpts.add(excerpt_key)
        per_document_counts[item["document_id"]] += 1

        if len(selected) >= settings.ai_context_chunks:
            break

    return selected


def _chunk_text(text: str) -> list[str]:
    paragraphs = [
        _collapse_whitespace(paragraph)
        for paragraph in re.split(r"\n{2,}", text)
        if paragraph and paragraph.strip()
    ]
    if not paragraphs:
        paragraphs = [_collapse_whitespace(text)]

    chunks: list[str] = []
    step = max(1, settings.ai_chunk_words - settings.ai_chunk_overlap_words)
    for paragraph in paragraphs:
        words = paragraph.split()
        if not words:
            continue

        if len(words) <= settings.ai_chunk_words:
            chunks.append(" ".join(words))
            continue

        for start in range(0, len(words), step):
            chunk = " ".join(words[start : start + settings.ai_chunk_words]).strip()
            if chunk:
                chunks.append(chunk)

    return chunks


def _tokenize(text: str, keep_stopwords: bool = False) -> set[str]:
    tokens = set()
    for token in re.findall(r"\w+", text.lower(), flags=re.UNICODE):
        if not keep_stopwords and token in STOPWORDS:
            continue
        if len(token) == 1 and not token.isdigit():
            continue
        tokens.add(token)
    return tokens


def _has_partial_phrase_match(question: str, text: str) -> bool:
    question_words = [word for word in re.findall(r"\w+", question.lower()) if word not in STOPWORDS]
    if len(question_words) < 2:
        return False

    text_lower = text.lower()
    for index in range(len(question_words) - 1):
        phrase = " ".join(question_words[index : index + 2])
        if phrase in text_lower:
            return True
    return False


def _generate_ai_response(
    question: str,
    retrieval_query: str,
    ranked_context: list[dict[str, Any]],
    chat_history: list[dict[str, str]],
    intent: str,
) -> str:
    context_text = "\n\n".join(
        f"[Source {index} | {item['file_name']} | chunk {item['chunk_index'] + 1}]\n{item['excerpt']}"
        for index, item in enumerate(ranked_context, start=1)
    )
    conversation_text = "\n".join(
        f"{item['role'].title()}: {item['content']}" for item in chat_history[-(settings.ai_history_turns * 2) :]
    )
    style_instruction = _build_style_instruction(intent)
    instructions = (
        "You are NeuroAI Ultra, a conversation-aware assistant for user-uploaded knowledge. "
        "Use the conversation history only for continuity, but treat the provided source excerpts as the factual ground truth. "
        "Answer directly, mention the most relevant file names naturally when helpful, and never invent facts that are not supported. "
        "If the sources are partial, explain what is confirmed and what is missing. "
        "If the answer is not available, clearly say you could not find it in the uploaded documents."
    )
    prompt = (
        f"Conversation history:\n{conversation_text or 'No prior conversation.'}\n\n"
        f"Resolved user intent: {intent}\n"
        f"Resolved retrieval query: {retrieval_query}\n\n"
        f"Retrieved document context:\n{context_text}\n\n"
        f"Current user question:\n{question}\n\n"
        f"Response style:\n{style_instruction}"
    )

    answer = _generate_with_openai(instructions, prompt)
    if answer:
        return answer

    answer = _generate_with_groq(instructions, prompt)
    if answer:
        return answer

    if not settings.groq_api_key and not settings.openai_api_key:
        logger.warning(
            "[AI] No AI API keys are configured in .env. Returning deterministic grounded fallback."
        )

    return _generate_local_fallback(question, ranked_context, intent)


def _build_style_instruction(intent: str) -> str:
    if intent == "summary":
        return "Provide a crisp summary in 4 to 6 short bullet points."
    if intent == "key_points":
        return "List the most important points as short bullets."
    if intent == "explain":
        return "Explain the answer in simple, easy-to-understand language."
    return "Answer clearly and concisely. Use bullets only when they improve readability."


@lru_cache(maxsize=1)
def _get_openai_client():
    if not settings.openai_api_key:
        logger.warning("[AI] OPENAI_API_KEY is missing. OpenAI generation is disabled.")
        return None
    if OpenAI is None:
        logger.warning("[AI] OpenAI SDK is not installed. OpenAI generation is disabled.")
        return None
    try:
        return OpenAI(api_key=settings.openai_api_key)
    except Exception as exc:  # pragma: no cover - defensive runtime guard
        logger.exception("[AI] OpenAI client initialization failed: %s", exc)
        return None


@lru_cache(maxsize=1)
def _get_groq_client():
    if not settings.groq_api_key:
        logger.warning("[AI] GROQ_API_KEY is missing. Groq generation is disabled.")
        return None
    if Groq is None:
        logger.warning("[AI] Groq SDK is not installed. Groq generation is disabled.")
        return None
    try:
        return Groq(api_key=settings.groq_api_key)
    except Exception as exc:  # pragma: no cover - defensive runtime guard
        logger.exception("[AI] Groq client initialization failed: %s", exc)
        return None


def _generate_with_openai(instructions: str, prompt: str) -> str:
    openai_client = _get_openai_client()
    if openai_client is None:
        return ""

    try:
        response = openai_client.responses.create(
            model=settings.openai_model,
            instructions=instructions,
            input=prompt,
        )
    except Exception as exc:
        logger.exception("[AI] OpenAI request failed, falling back: %s", exc)
        return ""

    answer_text = _collapse_whitespace(getattr(response, "output_text", "") or "")
    if not answer_text:
        logger.error("[AI] OpenAI returned an empty response for the current chat request.")
        return ""

    return answer_text


def _generate_with_groq(instructions: str, prompt: str) -> str:
    groq_client = _get_groq_client()
    if groq_client is None:
        return ""

    try:
        response = groq_client.chat.completions.create(
            model=settings.groq_model,
            temperature=0.1,
            max_completion_tokens=500,
            messages=[
                {"role": "system", "content": instructions},
                {"role": "user", "content": prompt},
            ],
        )
    except Exception as exc:
        logger.exception("[AI] Groq request failed, falling back: %s", exc)
        return ""

    answer_text = _collapse_whitespace(response.choices[0].message.content or "")
    if not answer_text:
        logger.error("[AI] Groq returned an empty response for the current chat request.")
        return ""

    return answer_text


def _generate_local_fallback(
    question: str,
    ranked_context: list[dict[str, Any]],
    intent: str,
) -> str:
    source_names = ", ".join(dict.fromkeys(item["file_name"] for item in ranked_context))
    ranked_sentences = _rank_sentences(question, ranked_context, intent)
    if not ranked_sentences:
        return (
            f"I found relevant text in {source_names}, but I could not assemble a confident answer "
            "from the uploaded excerpts alone."
        )

    if intent in SUMMARY_INTENTS:
        bullet_lines = "\n".join(f"- {sentence}" for sentence in ranked_sentences[:MAX_SENTENCE_RESULTS])
        return f"Based on {source_names}, here are the main points:\n{bullet_lines}"

    best_sentence = ranked_sentences[0]
    supporting = " ".join(ranked_sentences[1:3])
    return _collapse_whitespace(
        f"Based on {source_names}, the closest answer is: {best_sentence} {supporting}".strip()
    )


def _rank_sentences(
    question: str,
    ranked_context: list[dict[str, Any]],
    intent: str,
) -> list[str]:
    sentence_entries: list[dict[str, Any]] = []
    global_frequency: Counter[str] = Counter()

    for item in ranked_context:
        for sentence in _split_sentences(item["excerpt"]):
            tokens = _tokenize(sentence)
            if not tokens:
                continue

            entry = {
                "sentence": sentence,
                "tokens": tokens,
                "file_name": item["file_name"],
            }
            sentence_entries.append(entry)
            global_frequency.update(tokens)

    if not sentence_entries:
        return []

    query_tokens = _tokenize(question)
    ranked: list[tuple[float, str]] = []
    for entry in sentence_entries:
        token_score = sum(global_frequency[token] for token in entry["tokens"])
        if intent in SUMMARY_INTENTS:
            score = token_score / math.sqrt(len(entry["tokens"]))
        else:
            overlap = query_tokens & entry["tokens"]
            if not overlap:
                continue
            score = token_score / math.sqrt(len(entry["tokens"])) + len(overlap) * 4

        ranked.append((score, entry["sentence"]))

    ranked.sort(reverse=True)
    unique_sentences: list[str] = []
    seen: set[str] = set()
    for _, sentence in ranked:
        cleaned = _collapse_whitespace(sentence)
        if cleaned in seen:
            continue
        seen.add(cleaned)
        unique_sentences.append(cleaned)
        if len(unique_sentences) >= MAX_SENTENCE_RESULTS:
            break
    return unique_sentences


def _split_sentences(text: str) -> list[str]:
    candidates = re.split(r"(?<=[.!?])\s+|\n+", text)
    sentences: list[str] = []
    for candidate in candidates:
        cleaned = _collapse_whitespace(candidate)
        if 30 <= len(cleaned) <= 320:
            sentences.append(cleaned)
    return sentences


def _collapse_whitespace(text: str) -> str:
    return " ".join(text.split()).strip()
