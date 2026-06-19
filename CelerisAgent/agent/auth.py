from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import smtplib
import time
from email.message import EmailMessage
from http import cookies
from pathlib import Path
from typing import Any

from agent.chat_utils import now
from agent.config import WORKSPACE
from agent.io_utils import append_jsonl, read_json, write_json


AUTH_DIR = WORKSPACE / "auth"
USERS_FILE = AUTH_DIR / "users.json"
SESSIONS_FILE = AUTH_DIR / "sessions.json"
ACCESS_REQUESTS_FILE = AUTH_DIR / "access_requests.jsonl"
FEEDBACK_FILE = AUTH_DIR / "feedback.jsonl"
NOTIFICATIONS_FILE = AUTH_DIR / "notifications.jsonl"
AUTH_COOKIE = "celeris_session"
ADMIN_EMAIL = "plynett@usc.edu"
SESSION_SECONDS = 7 * 24 * 60 * 60
PBKDF2_ROUNDS = 200_000
DEFAULT_APPROVED_USER_PASSWORD = "celeristester2026!"


def ensure_auth_dirs() -> None:
    AUTH_DIR.mkdir(parents=True, exist_ok=True)


def auth_mode() -> str:
    mode = os.environ.get("CELERIS_AUTH_MODE", "").strip().lower()
    if mode in {"disabled", "off", "0", "false"}:
        return "disabled"
    if mode in {"required", "on", "1", "true"}:
        return "required"
    return "required" if USERS_FILE.exists() else "disabled"


def is_auth_required() -> bool:
    return auth_mode() == "required"


def load_users() -> dict[str, Any]:
    ensure_auth_dirs()
    if not USERS_FILE.exists():
        return {"users": []}
    data = read_json(USERS_FILE)
    if isinstance(data, dict) and isinstance(data.get("users"), list):
        return data
    return {"users": []}


def save_users(data: dict[str, Any]) -> None:
    ensure_auth_dirs()
    write_json(USERS_FILE, data)


def create_or_update_user(email: str, name: str, password: str, *, is_admin: bool = False, active: bool = True) -> dict[str, Any]:
    email = normalize_email(email)
    if not email:
        raise ValueError("email is required")
    if not password:
        raise ValueError("password is required")

    data = load_users()
    users = data.setdefault("users", [])
    user = next((item for item in users if item.get("email") == email), None)
    if user is None:
        user = {
            "id": secrets.token_hex(8),
            "email": email,
            "created_at": now(),
        }
        users.append(user)
    user.update(
        {
            "name": name.strip() or email,
            "password_hash": hash_password(password),
            "is_admin": bool(is_admin),
            "active": bool(active),
            "updated_at": now(),
        }
    )
    save_users(data)
    return public_user(user)


def authenticate(email: str, password: str) -> dict[str, Any] | None:
    email = normalize_email(email)
    for user in load_users().get("users", []):
        if user.get("email") != email or not user.get("active", False):
            continue
        if verify_password(password, user.get("password_hash", "")):
            return user
    return None


def public_user(user: dict[str, Any] | None) -> dict[str, Any] | None:
    if not user:
        return None
    return {
        "id": user.get("id"),
        "email": user.get("email"),
        "name": user.get("name") or user.get("email"),
        "is_admin": bool(user.get("is_admin", False)),
    }


def hash_password(password: str, *, salt: bytes | None = None, rounds: int = PBKDF2_ROUNDS) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, rounds)
    return "pbkdf2_sha256${}${}${}".format(
        rounds,
        base64.urlsafe_b64encode(salt).decode("ascii"),
        base64.urlsafe_b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, rounds_text, salt_text, digest_text = stored.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        rounds = int(rounds_text)
        salt = base64.urlsafe_b64decode(salt_text.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_text.encode("ascii"))
    except Exception:
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, rounds)
    return hmac.compare_digest(actual, expected)


def create_session(user: dict[str, Any]) -> str:
    ensure_auth_dirs()
    token = secrets.token_urlsafe(32)
    sessions = load_sessions()
    sessions = [item for item in sessions if not _session_expired(item)]
    sessions.append(
        {
            "token_hash": token_hash(token),
            "user_id": user.get("id"),
            "created_at": now(),
            "expires_at": time.time() + SESSION_SECONDS,
        }
    )
    save_sessions(sessions)
    return token


def current_user_from_cookie(header_value: str | None) -> dict[str, Any] | None:
    token = session_token_from_cookie(header_value)
    if not token:
        return None
    sessions = load_sessions()
    matched = next((item for item in sessions if item.get("token_hash") == token_hash(token) and not _session_expired(item)), None)
    if matched is None:
        return None
    user_id = matched.get("user_id")
    for user in load_users().get("users", []):
        if user.get("id") == user_id and user.get("active", False):
            return user
    return None


def clear_session_from_cookie(header_value: str | None) -> None:
    token = session_token_from_cookie(header_value)
    if not token:
        return
    expected = token_hash(token)
    save_sessions([item for item in load_sessions() if item.get("token_hash") != expected])


def session_token_from_cookie(header_value: str | None) -> str:
    if not header_value:
        return ""
    jar = cookies.SimpleCookie()
    try:
        jar.load(header_value)
    except cookies.CookieError:
        return ""
    morsel = jar.get(AUTH_COOKIE)
    return morsel.value if morsel else ""


def make_cookie_header(token: str) -> str:
    return f"{AUTH_COOKIE}={token}; Path=/CelerisAgent; HttpOnly; SameSite=Lax; Max-Age={SESSION_SECONDS}"


def make_clear_cookie_header() -> str:
    return f"{AUTH_COOKIE}=; Path=/CelerisAgent; HttpOnly; SameSite=Lax; Max-Age=0"


def submit_access_request(name: str, email: str, comment: str, *, ip: str = "", user_agent: str = "") -> dict[str, Any]:
    ensure_auth_dirs()
    request = {
        "id": secrets.token_hex(8),
        "created_at": now(),
        "status": "pending",
        "name": name.strip(),
        "email": normalize_email(email),
        "comment": comment.strip(),
        "ip": ip,
        "user_agent": user_agent[:240],
    }
    if not request["name"] or not request["email"]:
        raise ValueError("name and email are required")
    append_jsonl(ACCESS_REQUESTS_FILE, request)
    request["notification"] = notify_admin_access_request(request)
    return request


def pending_access_requests(limit: int = 50) -> list[dict[str, Any]]:
    rows = [item for item in load_access_requests() if item.get("status", "pending") == "pending"]
    return list(reversed(rows[-limit:]))


def approve_access_request(request_id: str, *, approved_by: dict[str, Any] | None = None) -> dict[str, Any]:
    request_id = (request_id or "").strip()
    requests = load_access_requests()
    request = next((item for item in requests if item.get("id") == request_id), None)
    if request is None:
        raise ValueError("access request not found")
    if request.get("status", "pending") != "pending":
        raise ValueError("access request is not pending")

    password = os.environ.get("CELERIS_APPROVED_USER_PASSWORD", DEFAULT_APPROVED_USER_PASSWORD)
    user = create_or_update_user(
        request.get("email", ""),
        request.get("name", "") or request.get("email", ""),
        password,
        is_admin=False,
        active=True,
    )
    request.update(
        {
            "status": "approved",
            "approved_at": now(),
            "approved_by": public_user(approved_by) if approved_by else None,
            "approved_user_id": user.get("id"),
        }
    )
    save_access_requests(requests)
    notification = notify_user_approval(request, password)
    return {
        "request": request,
        "user": user,
        "temporary_password": password,
        "notification": notification,
    }


def load_access_requests() -> list[dict[str, Any]]:
    ensure_auth_dirs()
    if not ACCESS_REQUESTS_FILE.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in ACCESS_REQUESTS_FILE.read_text(encoding="utf-8-sig").splitlines():
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        rows.append(item)
    return rows


def save_access_requests(requests: list[dict[str, Any]]) -> None:
    ensure_auth_dirs()
    with ACCESS_REQUESTS_FILE.open("w", encoding="utf-8") as fh:
        for request in requests:
            fh.write(json.dumps(request, sort_keys=True) + "\n")


def pending_access_count() -> int:
    return len(pending_access_requests(limit=10_000))


def submit_feedback(text: str, *, user: dict[str, Any] | None = None, ip: str = "", user_agent: str = "") -> dict[str, Any]:
    ensure_auth_dirs()
    feedback = {
        "id": secrets.token_hex(8),
        "created_at": now(),
        "text": text.strip(),
        "user": public_user(user),
        "ip": ip,
        "user_agent": user_agent[:240],
        "seen_at": None,
    }
    if not feedback["text"]:
        raise ValueError("feedback is required")
    append_jsonl(FEEDBACK_FILE, feedback)
    return feedback


def all_feedback(limit: int = 500) -> list[dict[str, Any]]:
    rows = load_feedback()
    return list(reversed(rows[-limit:]))


def unread_feedback_count() -> int:
    return sum(1 for item in load_feedback() if not item.get("seen_at"))


def mark_feedback_seen(*, seen_by: dict[str, Any] | None = None) -> None:
    rows = load_feedback()
    if not rows:
        return
    seen_at = now()
    changed = False
    for item in rows:
        if item.get("seen_at"):
            continue
        item["seen_at"] = seen_at
        item["seen_by"] = public_user(seen_by) if seen_by else None
        changed = True
    if changed:
        save_feedback(rows)


def load_feedback() -> list[dict[str, Any]]:
    ensure_auth_dirs()
    if not FEEDBACK_FILE.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in FEEDBACK_FILE.read_text(encoding="utf-8-sig").splitlines():
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        rows.append(item)
    return rows


def save_feedback(rows: list[dict[str, Any]]) -> None:
    ensure_auth_dirs()
    with FEEDBACK_FILE.open("w", encoding="utf-8") as fh:
        for item in rows:
            fh.write(json.dumps(item, sort_keys=True) + "\n")


def notify_admin_access_request(request: dict[str, Any]) -> dict[str, str]:
    target = os.environ.get("CELERIS_ADMIN_EMAIL", ADMIN_EMAIL)
    host = os.environ.get("CELERIS_SMTP_HOST", "").strip()
    if not host:
        status = {"status": "smtp_not_configured", "target": target}
        append_jsonl(NOTIFICATIONS_FILE, {"created_at": now(), "kind": "access_request", "request_id": request["id"], **status})
        return status

    port = int(os.environ.get("CELERIS_SMTP_PORT", "587"))
    username = os.environ.get("CELERIS_SMTP_USER", "")
    password = os.environ.get("CELERIS_SMTP_PASSWORD", "")
    sender = os.environ.get("CELERIS_SMTP_FROM", username or target)

    msg = EmailMessage()
    msg["Subject"] = "CelerisAgent access request"
    msg["From"] = sender
    msg["To"] = target
    msg.set_content(
        "\n".join(
            [
                "A CelerisAgent access request was submitted.",
                "",
                f"Name: {request.get('name', '')}",
                f"Email: {request.get('email', '')}",
                f"Comment: {request.get('comment', '')}",
                f"Request ID: {request.get('id', '')}",
                f"Created: {request.get('created_at', '')}",
            ]
        )
    )
    try:
        with smtplib.SMTP(host, port, timeout=10) as smtp:
            smtp.starttls()
            if username:
                smtp.login(username, password)
            smtp.send_message(msg)
    except Exception as exc:
        status = {"status": "send_failed", "target": target, "error": str(exc)}
        append_jsonl(NOTIFICATIONS_FILE, {"created_at": now(), "kind": "access_request", "request_id": request["id"], **status})
        return status

    status = {"status": "sent", "target": target}
    append_jsonl(NOTIFICATIONS_FILE, {"created_at": now(), "kind": "access_request", "request_id": request["id"], **status})
    return status


def notify_user_approval(request: dict[str, Any], temporary_password: str) -> dict[str, str]:
    target = request.get("email", "")
    host = os.environ.get("CELERIS_SMTP_HOST", "").strip()
    if not host:
        status = {"status": "smtp_not_configured", "target": target}
        append_jsonl(NOTIFICATIONS_FILE, {"created_at": now(), "kind": "access_approved", "request_id": request["id"], **status})
        return status

    port = int(os.environ.get("CELERIS_SMTP_PORT", "587"))
    username = os.environ.get("CELERIS_SMTP_USER", "")
    password = os.environ.get("CELERIS_SMTP_PASSWORD", "")
    sender = os.environ.get("CELERIS_SMTP_FROM", username or os.environ.get("CELERIS_ADMIN_EMAIL", ADMIN_EMAIL))

    msg = EmailMessage()
    msg["Subject"] = "Access to CelerisAgent"
    msg["From"] = sender
    msg["To"] = target
    msg.set_content(
        "\n".join(
            [
                "Thank you for beta testing CelerisAgent.  Your login info is below:",
                "",
                f"username: {target}",
                f"password: {temporary_password}",
                "",
                "Feedback is welcome, either in the comment box on the agent page or directly to me through email.",
                "",
                "Thanks and good luck-",
            ]
        )
    )
    try:
        with smtplib.SMTP(host, port, timeout=10) as smtp:
            smtp.starttls()
            if username:
                smtp.login(username, password)
            smtp.send_message(msg)
    except Exception as exc:
        status = {"status": "send_failed", "target": target, "error": str(exc)}
        append_jsonl(NOTIFICATIONS_FILE, {"created_at": now(), "kind": "access_approved", "request_id": request["id"], **status})
        return status

    status = {"status": "sent", "target": target}
    append_jsonl(NOTIFICATIONS_FILE, {"created_at": now(), "kind": "access_approved", "request_id": request["id"], **status})
    return status


def load_sessions() -> list[dict[str, Any]]:
    ensure_auth_dirs()
    if not SESSIONS_FILE.exists():
        return []
    data = read_json(SESSIONS_FILE)
    return data if isinstance(data, list) else []


def save_sessions(sessions: list[dict[str, Any]]) -> None:
    ensure_auth_dirs()
    write_json(SESSIONS_FILE, sessions)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _session_expired(session: dict[str, Any]) -> bool:
    try:
        return float(session.get("expires_at", 0)) <= time.time()
    except (TypeError, ValueError):
        return True
