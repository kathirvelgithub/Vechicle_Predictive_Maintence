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
_DEFAULT_PRIMARY_MODEL = os.getenv("AGENT_MODEL_DEFAULT", "llama-3.3-70b-versatile")
_DEFAULT_FALLBACK_MODEL = os.getenv("AGENT_MODEL_FALLBACK", "llama-3.1-8b-instant")

_MODEL_CACHE: Dict[str, ChatOpenAI] = {}
_MODEL_CACHE_LOCK = Lock()


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


def _get_client(model: str) -> ChatOpenAI:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is missing. Add it to your .env file.")

    with _MODEL_CACHE_LOCK:
        existing_client = _MODEL_CACHE.get(model)
        if existing_client:
            return existing_client

        client = ChatOpenAI(
            model=model,
            base_url=_GROQ_BASE_URL,
            api_key=api_key,
        )
        _MODEL_CACHE[model] = client
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

    for model in models:
        client = _get_client(model)
        for attempt in range(1, retries + 1):
            try:
                content = _invoke_with_timeout(client, prompt, timeout_seconds)
                return content, model
            except Exception as exc:
                errors.append(f"{model}[attempt {attempt}]: {exc.__class__.__name__}: {exc}")
                if attempt < retries and backoff_seconds > 0:
                    time.sleep(backoff_seconds * attempt)

    error_summary = " | ".join(errors[-6:])
    raise RuntimeError(f"LLM invocation failed for profile '{profile}'. {error_summary}")