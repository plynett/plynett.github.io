from __future__ import annotations

import os
from typing import Any

import requests


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
ROLE_MODEL_ENV = {
    "orchestrator": "OPENAI_ORCHESTRATOR_MODEL",
    "specialist": "OPENAI_SPECIALIST_MODEL",
    "geographic": "OPENAI_GEOGRAPHIC_MODEL",
    "escalation": "OPENAI_ESCALATION_MODEL",
}
ROLE_MODEL_DEFAULT = {
    "orchestrator": "gpt-5.4",
    "specialist": "gpt-5.4",
    "geographic": "gpt-5.4",
    "escalation": "gpt-5.4",
}


def model_for(role: str, fallback: str = "gpt-5.4") -> str:
    env_name = ROLE_MODEL_ENV.get(role)
    if env_name:
        configured = os.environ.get(env_name)
        if configured:
            return configured.strip()
    if role in ROLE_MODEL_DEFAULT:
        return ROLE_MODEL_DEFAULT[role]
    return os.environ.get("OPENAI_MODEL", fallback).strip()


def model_candidates(role: str) -> list[str]:
    candidates = [model_for(role)]
    for candidate in (os.environ.get("OPENAI_MODEL"), model_for("escalation")):
        if candidate and candidate.strip() not in candidates:
            candidates.append(candidate.strip())
    return candidates


def call_openai(payload: dict[str, Any], api_key: str, timeout: int = 90) -> dict[str, Any]:
    response = requests.post(
        OPENAI_RESPONSES_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()


def call_openai_for_role(payload: dict[str, Any], api_key: str, role: str, timeout: int = 90) -> dict[str, Any]:
    last_error: Exception | None = None
    for model in model_candidates(role):
        candidate_payload = dict(payload)
        candidate_payload["model"] = model
        try:
            data = call_openai(candidate_payload, api_key, timeout=timeout)
            data["_celeris_model"] = model
            return data
        except requests.HTTPError as exc:
            last_error = exc
            status_code = exc.response.status_code if exc.response is not None else None
            if status_code not in {400, 403, 404}:
                raise
    if last_error:
        raise last_error
    raise ValueError(f"No OpenAI model candidates configured for role {role}.")


def extract_response_text(data: dict[str, Any]) -> str:
    if "output_text" in data:
        return data["output_text"]
    chunks: list[str] = []
    for item in data.get("output", []):
        for content in item.get("content", []):
            if "text" in content:
                chunks.append(content["text"])
    if not chunks:
        raise ValueError("No text returned by OpenAI response.")
    return "".join(chunks)
