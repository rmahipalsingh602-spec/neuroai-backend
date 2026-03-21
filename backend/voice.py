import logging
import re
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import APIRouter, status
from fastapi.responses import FileResponse
from googletrans import Translator
from gtts import gTTS
from langdetect import DetectorFactory, LangDetectException, detect
from starlette.background import BackgroundTask

from backend.config import settings
from backend.errors import api_error
from backend.schemas import VoiceRequest

SUPPORTED_LANGUAGES = {
    "hi": "Hindi",
    "en": "English",
    "fr": "French",
    "es": "Spanish",
}
MAX_TEXT_LENGTH = 3000

DetectorFactory.seed = 0

router = APIRouter()
translator = Translator()
logger = logging.getLogger(__name__)


class VoiceServiceError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


@dataclass(frozen=True)
class VoiceResult:
    audio_path: Path
    source_language: str
    output_language: str
    spoken_text: str


def detect_language(text: str) -> str:
    normalized_text = _normalize_text(text)
    if _contains_devanagari(normalized_text):
        return "hi"

    try:
        detected_language = _normalize_language_code(detect(normalized_text))
    except LangDetectException:
        logger.warning("[VOICE] Language detection was inconclusive. Falling back to English.")
        return "en"

    if detected_language in SUPPORTED_LANGUAGES:
        return detected_language

    if _contains_basic_latin(normalized_text):
        return "en"
    return detected_language or "en"


def translate_text(text: str, target_lang: str) -> str:
    normalized_text = _normalize_text(text)
    normalized_target_lang = _validate_target_language(target_lang)

    try:
        translated = translator.translate(normalized_text, dest=normalized_target_lang)
    except Exception as exc:
        logger.exception(
            "[VOICE] Translation failed for target_lang=%s: %s",
            normalized_target_lang,
            exc,
        )
        raise VoiceServiceError(
            502,
            "TRANSLATION_ERROR",
            f"Translation to {SUPPORTED_LANGUAGES[normalized_target_lang]} failed.",
        ) from exc

    translated_text = _normalize_text(translated.text)
    return translated_text


def text_to_speech(text: str, lang: str) -> Path:
    normalized_text = _normalize_text(text)
    normalized_lang = _validate_target_language(lang)

    settings.voice_temp_path.mkdir(parents=True, exist_ok=True)
    audio_path = settings.voice_temp_path / f"voice_{uuid.uuid4().hex}.mp3"

    try:
        gTTS(text=normalized_text, lang=normalized_lang).save(str(audio_path))
    except Exception as exc:
        audio_path.unlink(missing_ok=True)
        logger.exception("[VOICE] TTS generation failed for lang=%s: %s", normalized_lang, exc)
        raise VoiceServiceError(
            502,
            "TTS_ERROR",
            f"Voice generation for {SUPPORTED_LANGUAGES[normalized_lang]} failed.",
        ) from exc

    return audio_path


def build_voice_audio(text: str, target_lang: str | None = None) -> VoiceResult:
    normalized_text = _normalize_text(text)
    source_language = detect_language(normalized_text)
    output_language = _resolve_target_language(source_language, target_lang)
    spoken_text = (
        normalized_text
        if source_language == output_language
        else translate_text(normalized_text, output_language)
    )
    audio_path = text_to_speech(spoken_text, output_language)

    return VoiceResult(
        audio_path=audio_path,
        source_language=source_language,
        output_language=output_language,
        spoken_text=spoken_text,
    )


@router.post(
    "/voice",
    responses={
        200: {
            "content": {"audio/mpeg": {}},
            "description": "Generated MP3 audio response.",
        }
    },
)
def generate_voice(payload: VoiceRequest):
    try:
        voice_result = build_voice_audio(payload.text, payload.target_lang)
        logger.info(
            "[VOICE] Generated audio source_lang=%s output_lang=%s text_length=%s",
            voice_result.source_language,
            voice_result.output_language,
            len(voice_result.spoken_text),
        )

        return FileResponse(
            path=voice_result.audio_path,
            media_type="audio/mpeg",
            filename=voice_result.audio_path.name,
            headers={
                "Content-Disposition": f'inline; filename="{voice_result.audio_path.name}"',
                "X-Source-Language": voice_result.source_language,
                "X-Output-Language": voice_result.output_language,
            },
            background=BackgroundTask(_cleanup_file, voice_result.audio_path),
        )
    except VoiceServiceError as exc:
        log_method = logger.warning if exc.status_code < 500 else logger.exception
        log_method("[VOICE] Voice request failed with code=%s message=%s", exc.code, exc.message)
        api_error(exc.status_code, exc.code, exc.message)
    except Exception as exc:
        logger.exception("[VOICE] Unexpected error while generating audio: %s", exc)
        api_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "VOICE_ERROR",
            "Voice generation failed. Check backend logs for the exact error.",
        )


def _cleanup_file(audio_path: Path) -> None:
    audio_path.unlink(missing_ok=True)


def _resolve_target_language(source_language: str, target_lang: str | None) -> str:
    if target_lang:
        return _validate_target_language(target_lang)
    if source_language == "en":
        return "hi"
    if source_language in SUPPORTED_LANGUAGES:
        return source_language
    return "hi"


def _normalize_text(text: str) -> str:
    normalized_text = re.sub(r"\s+", " ", text or "").strip()
    if not normalized_text:
        raise VoiceServiceError(400, "VOICE_INPUT_ERROR", "Text is required.")
    if len(normalized_text) > MAX_TEXT_LENGTH:
        raise VoiceServiceError(
            413,
            "VOICE_INPUT_TOO_LARGE",
            f"Text must be {MAX_TEXT_LENGTH} characters or fewer.",
        )
    return normalized_text


def _validate_target_language(target_lang: str) -> str:
    normalized_target_lang = _normalize_language_code(target_lang)
    if normalized_target_lang not in SUPPORTED_LANGUAGES:
        supported_codes = ", ".join(sorted(SUPPORTED_LANGUAGES))
        raise VoiceServiceError(
            400,
            "VOICE_LANGUAGE_UNSUPPORTED",
            f"Supported target languages are: {supported_codes}.",
        )
    return normalized_target_lang


def _normalize_language_code(language_code: str | None) -> str:
    normalized_language_code = (language_code or "").strip().lower()
    if not normalized_language_code:
        return ""
    return normalized_language_code.split("-", 1)[0].split("_", 1)[0]


def _contains_devanagari(text: str) -> bool:
    return bool(re.search(r"[\u0900-\u097f]", text))


def _contains_basic_latin(text: str) -> bool:
    return bool(re.search(r"[A-Za-z]", text))
