from __future__ import annotations

import copy
import hashlib
import json
import os
from typing import Any

from agent.openai_client import call_openai_for_role, extract_response_text, model_for


def state_for_planning(message: str, state: dict[str, Any]) -> dict[str, Any]:
    """Return a planning copy of state with LLM-marked stale research hidden."""
    if state.get("last_research_hidden"):
        sanitized = copy.deepcopy(state)
        sanitized.pop("last_research", None)
        return sanitized
    assessment = state.get("last_research_context_assessment") or {}
    if assessment.get("message_key") != research_context_message_key(message):
        return state
    if assessment.get("relevant") is not False:
        return state
    sanitized = copy.deepcopy(state)
    sanitized.pop("last_research", None)
    sanitized["last_research_hidden"] = {
        "reason": assessment.get("reason") or "prior research is not relevant to the current user message",
        "assessed_by": assessment.get("model"),
    }
    return sanitized


def assess_and_record_research_context(message: str, state: dict[str, Any]) -> dict[str, Any] | None:
    research = state.get("last_research")
    if not research:
        return None
    message_key = research_context_message_key(message)
    current = state.get("last_research_context_assessment") or {}
    if current.get("message_key") == message_key:
        return current
    assessment = assess_research_relevance(message, research)
    if not assessment:
        return None
    assessment["message_key"] = message_key
    state["last_research_context_assessment"] = assessment
    if assessment.get("relevant") is False:
        state["last_research_hidden"] = {
            "reason": assessment.get("reason") or "prior research is not relevant to the current user message",
            "assessed_by": assessment.get("model"),
        }
    else:
        state.pop("last_research_hidden", None)
    return assessment


def assess_research_relevance(message: str, research: dict[str, Any]) -> dict[str, Any] | None:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    model = model_for("specialist")
    payload = {
        "model": model,
        "input": [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "You decide whether stored structured research should be used for the current CELERIS Agent turn. "
                            "Do not solve the user's task. Only compare the current user message to the prior research object. "
                            "Return relevant=true when the current user message refers to the same researched event/place/source, "
                            "asks to use that prior result, or is an immediate follow-up that depends on it. "
                            "Return relevant=false when the current user message names, describes, or implies a different event/place/source "
                            "than the stored research. If uncertain, choose false so a fresh research step can resolve the user's latest intent."
                        ),
                    }
                ],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": json.dumps(
                            {
                                "current_user_message": message,
                                "prior_structured_research": compact_research_for_relevance(research),
                            },
                            ensure_ascii=True,
                        ),
                    }
                ],
            },
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "research_context_relevance",
                "schema": research_relevance_schema(),
                "strict": True,
            }
        },
    }
    try:
        data = call_openai_for_role(payload, api_key, "specialist", timeout=45)
        assessment = json.loads(extract_response_text(data))
        assessment["model"] = data.get("_celeris_model", model)
        assessment["response_id"] = data.get("id")
        return assessment
    except Exception as exc:
        return {"relevant": True, "reason": f"Research relevance assessment failed: {exc}", "model": model, "response_id": None}


def research_relevance_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "relevant": {"type": "boolean"},
            "reason": {"type": "string"},
        },
        "required": ["relevant", "reason"],
        "additionalProperties": False,
    }


def compact_research_for_relevance(research: dict[str, Any]) -> dict[str, Any]:
    return {
        "summary": research.get("summary"),
        "extracted_parameters": research.get("extracted_parameters"),
        "proposed_patch": research.get("proposed_patch"),
        "sources": research.get("sources"),
    }


def research_context_message_key(message: str) -> str:
    return hashlib.sha256(str(message or "").encode("utf-8")).hexdigest()[:16]
