import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from threading import Lock
from typing import Dict, List, Tuple

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI

load_dotenv()

_GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
_OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
_OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1")
_DEFAULT_PRIMARY_MODEL = os.getenv("AGENT_MODEL_DEFAULT", "llama-3.3-70b-versatile")
_DEFAULT_FALLBACK_MODEL = os.getenv("AGENT_MODEL_FALLBACK", "llama-3.1-8b-instant")

_MODEL_CACHE: Dict[str, ChatOpenAI] = {}
_MODEL_CACHE_LOCK = Lock()
_KNOWN_PROVIDERS = {"groq", "openai", "ollama"}


def _clean_model_list(models: List[str]) -> List[str]:
    seen = set()
    ordered: List[str] = []
    for model in models:
        candidate = (model or "").strip()
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        ordered.append(candidate)
    return ordered


def _models_from_env(env_name: str) -> List[str]:
    raw = os.getenv(env_name, "")
    if not raw:
        return []
    return _clean_model_list(raw.split(","))


def _get_profile_models(profile: str) -> List[str]:
    env_override = _models_from_env(f"AGENT_MODELS_{profile.upper()}")
    if env_override:
        return env_override

    heavy_profiles = {"diagnosis", "manufacturing"}
    if profile in heavy_profiles:
        defaults = [_DEFAULT_PRIMARY_MODEL, _DEFAULT_FALLBACK_MODEL]
    else:
        defaults = [_DEFAULT_FALLBACK_MODEL, _DEFAULT_PRIMARY_MODEL]

    return _clean_model_list(defaults)


def _parse_model_spec(model_spec: str) -> Tuple[str, str]:
    cleaned = (model_spec or "").strip()
    if not cleaned:
        raise RuntimeError("Empty model specification")

    if ":" in cleaned:
        provider, model_name = cleaned.split(":", 1)
        provider = provider.strip().lower()
        if provider in _KNOWN_PROVIDERS and model_name.strip():
            return provider, model_name.strip()

    # Backward-compatible behavior: plain model names are treated as Groq models.
    return "groq", cleaned


def _provider_config(provider: str) -> Tuple[str, str]:
    if provider == "groq":
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY is missing. Add it to your .env file.")
        return _GROQ_BASE_URL, api_key

    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is missing. Add it to your .env file.")
        return _OPENAI_BASE_URL, api_key

    if provider == "ollama":
        # Ollama OpenAI-compatible endpoint typically ignores api_key but client expects a non-empty string.
        api_key = os.getenv("OLLAMA_API_KEY", "ollama")
        return _OLLAMA_BASE_URL, api_key

    raise RuntimeError(f"Unsupported LLM provider '{provider}' in model spec")


def _cache_key(provider: str, model_name: str) -> str:
    return f"{provider}:{model_name}"


def _is_rate_limit_error(exc: Exception) -> bool:
    text = f"{exc.__class__.__name__}: {exc}".lower()
    markers = ("rate_limit_exceeded", "rate limit", "429", "tpd")
    return any(marker in text for marker in markers)


def _get_client(model_spec: str) -> ChatOpenAI:
    provider, model_name = _parse_model_spec(model_spec)
    cache_key = _cache_key(provider, model_name)

    with _MODEL_CACHE_LOCK:
        existing_client = _MODEL_CACHE.get(cache_key)
        if existing_client:
            return existing_client

        base_url, api_key = _provider_config(provider)

        client = ChatOpenAI(
            model=model_name,
            base_url=base_url,
            api_key=api_key,
        )
        _MODEL_CACHE[cache_key] = client
        return client


def _invoke_with_timeout(client: ChatOpenAI, prompt: str, timeout_seconds: int) -> str:
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(client.invoke, [HumanMessage(content=prompt)])
        try:
            response = future.result(timeout=timeout_seconds)
        except FutureTimeoutError as exc:
            future.cancel()
            raise TimeoutError(f"LLM request timed out after {timeout_seconds}s") from exc

    content = getattr(response, "content", "")
    return content if isinstance(content, str) else str(content)


def invoke_with_policy(prompt: str, profile: str = "default") -> Tuple[str, str]:
    """Invoke the LLM with per-profile model fallback and retry policy."""
    models = _get_profile_models(profile)
    retries = max(1, int(os.getenv("LLM_RETRIES_PER_MODEL", "2")))
    timeout_seconds = max(5, int(os.getenv("LLM_TIMEOUT_SECONDS", "25")))
    backoff_seconds = max(0.0, float(os.getenv("LLM_RETRY_BACKOFF_SECONDS", "1.0")))

    errors: List[str] = []

    for model_spec in models:
        client = _get_client(model_spec)
        for attempt in range(1, retries + 1):
            try:
                content = _invoke_with_timeout(client, prompt, timeout_seconds)
                return content, model_spec
            except Exception as exc:
                errors.append(f"{model_spec}[attempt {attempt}]: {exc.__class__.__name__}: {exc}")
                if _is_rate_limit_error(exc):
                    # Do not burn retries on strict provider quotas; fail over to next model/provider.
                    break
                if attempt < retries and backoff_seconds > 0:
                    time.sleep(backoff_seconds * attempt)

    error_summary = " | ".join(errors[-6:])
    raise RuntimeError(f"LLM invocation failed for profile '{profile}'. {error_summary}")