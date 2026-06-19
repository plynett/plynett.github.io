from __future__ import annotations

import re


USER_AGENT = "CelerisAgentPrototype/0.1"


def normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()
