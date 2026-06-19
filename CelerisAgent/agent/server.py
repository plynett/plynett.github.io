from __future__ import annotations

import cgi
import json
import mimetypes
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from agent.auth import (
    clear_session_from_cookie,
    create_session,
    current_user_from_cookie,
    is_auth_required,
    make_clear_cookie_header,
    make_cookie_header,
    pending_access_count,
    pending_access_requests,
    public_user,
    submit_access_request,
    submit_feedback,
    authenticate,
    auth_mode,
    ensure_auth_dirs,
    approve_access_request,
    all_feedback,
    mark_feedback_seen,
    unread_feedback_count,
)
from agent.chat import handle_chat, make_job
from agent.chat_utils import now
from agent.config import AGENT_PREFIX, API_PREFIX, CORE_ROOT, JOBS, ROOT, ensure_dirs, load_local_env
from agent.io_utils import is_inside, read_json, safe_filename, write_json
from agent.job_queue import QueueUnavailable, enqueue_chat_job
from agent.progress import read_progress
from agent.registry import load_registry
from agent.thread_archive import build_thread_archive


class Handler(BaseHTTPRequestHandler):
    server_version = "CelerisAgentChat/0.1"

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path in {AGENT_PREFIX, f"{AGENT_PREFIX}/", f"{AGENT_PREFIX}/index.html"}:
            self.send_file(ROOT / "index.html")
        elif path == f"{AGENT_PREFIX}/ui.css":
            self.send_file(ROOT / "ui.css")
        elif path.startswith(f"{AGENT_PREFIX}/js/"):
            self.send_file(ROOT / path.removeprefix(f"{AGENT_PREFIX}/").lstrip("/"))
        elif path == f"{API_PREFIX}/state":
            self.send_json({"ok": True, "registry": load_registry(), "auth": self.auth_status()})
        elif path == f"{API_PREFIX}/me":
            self.send_json({"ok": True, "auth": self.auth_status()})
        elif path == f"{API_PREFIX}/admin/access-requests":
            self.handle_admin_access_requests_get()
        elif path == f"{API_PREFIX}/admin/pending-count":
            self.handle_admin_pending_count_get()
        elif path == f"{API_PREFIX}/admin/feedback":
            self.handle_admin_feedback_get()
        elif path == f"{API_PREFIX}/admin/feedback-count":
            self.handle_admin_feedback_count_get()
        elif path.startswith(f"{API_PREFIX}/jobs/") and path.endswith("/celeris-case"):
            self.send_celeris_case(path)
        elif path.startswith(f"{API_PREFIX}/jobs/") and path.endswith("/configuration-archive"):
            self.send_configuration_archive(path)
        elif path.startswith(f"{API_PREFIX}/jobs/") and path.endswith("/result"):
            self.send_job_result(path)
        elif path.startswith(f"{API_PREFIX}/jobs/") and path.endswith("/progress"):
            self.send_job_progress(path)
        elif path.startswith(f"{API_PREFIX}/jobs/") and "/files/" in path:
            self.send_job_file(path)
        elif path.startswith(f"{API_PREFIX}/jobs/"):
            self.send_job_state(path)
        elif path.startswith(f"{AGENT_PREFIX}/"):
            self.send_json({"error": "not_found"}, status=404)
        else:
            self.send_core_file(path)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == f"{API_PREFIX}/login":
            self.handle_login_post()
        elif path == f"{API_PREFIX}/logout":
            self.handle_logout_post()
        elif path == f"{API_PREFIX}/access-request":
            self.handle_access_request_post()
        elif path == f"{API_PREFIX}/feedback":
            self.handle_feedback_post()
        elif path.startswith(f"{API_PREFIX}/admin/access-requests/") and path.endswith("/approve"):
            self.handle_admin_approve_access_request_post(path)
        elif path == f"{API_PREFIX}/chat":
            self.handle_chat_post()
        elif path.startswith(f"{API_PREFIX}/jobs/") and path.endswith("/close-simulation"):
            self.handle_close_simulation_post(path)
        else:
            self.send_json({"error": "not_found"}, status=404)

    def handle_chat_post(self) -> None:
        user = self.require_user()
        if is_auth_required() and not user:
            return
        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": self.headers.get("Content-Type", "")},
        )
        job_id = _field(form, "job_id")
        message = _field(form, "message")
        job_dir = make_job(job_id)
        if not self.authorize_job_dir(job_dir, user):
            return
        self.ensure_job_owner(job_dir, user)
        attachments = []
        fields = form["attachments"] if "attachments" in form else []
        if not isinstance(fields, list):
            fields = [fields]
        for item in fields:
            if not getattr(item, "filename", None):
                continue
            dst = job_dir / "attachments" / safe_filename(item.filename)
            with dst.open("wb") as out:
                out.write(item.file.read())
            attachments.append(dst)
        (job_dir / "work" / "result.json").unlink(missing_ok=True)
        write_json(
            job_dir / "work" / "request.json",
            {
                "job_id": job_dir.name,
                "message": message,
                "attachments": [path.relative_to(job_dir).as_posix() for path in attachments],
                "queued_at": now(),
                "client": {
                    "ip": self.client_address[0] if self.client_address else "",
                    "user_agent": self.headers.get("User-Agent", ""),
                },
            },
        )
        write_json(
            job_dir / "logs" / "progress.json",
            {
                "job_id": job_dir.name,
                "status": "queued",
                "started_at": now(),
                "updated_at": now(),
                "events": [
                    {
                        "at": now(),
                        "stage": "queued",
                        "detail": "Queued chat request for a background worker.",
                        "data": {"attachments": [path.name for path in attachments], "has_message": bool(message.strip())},
                    }
                ],
            },
        )
        try:
            queue_info = enqueue_chat_job(job_dir.name)
        except QueueUnavailable as exc:
            self.send_json({"ok": False, "error": "queue_unavailable", "message": str(exc), "job_id": job_dir.name}, status=503)
            return
        if queue_info:
            self.send_json({"job_id": job_dir.name, "status": "queued", "queue": queue_info}, status=202)
            return
        result = handle_chat(job_dir.name, message, attachments)
        write_json(job_dir / "work" / "result.json", result)
        self.send_json(result)

    def handle_login_post(self) -> None:
        body = self.read_json_body()
        user = authenticate(body.get("email", ""), body.get("password", ""))
        if not user:
            self.send_json({"ok": False, "error": "invalid_login"}, status=401)
            return
        token = create_session(user)
        self.send_json(
            {"ok": True, "auth": self.auth_status(user)},
            headers=[("Set-Cookie", make_cookie_header(token))],
        )

    def handle_logout_post(self) -> None:
        clear_session_from_cookie(self.headers.get("Cookie"))
        self.send_json(
            {"ok": True, "auth": self.auth_status(None)},
            headers=[("Set-Cookie", make_clear_cookie_header())],
        )

    def handle_access_request_post(self) -> None:
        body = self.read_json_body()
        if body.get("website", "").strip():
            self.send_json({"ok": True, "status": "received"})
            return
        try:
            request = submit_access_request(
                body.get("name", ""),
                body.get("email", ""),
                body.get("comment", ""),
                ip=self.client_address[0] if self.client_address else "",
                user_agent=self.headers.get("User-Agent", ""),
            )
        except ValueError as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=400)
            return
        self.send_json(
            {
                "ok": True,
                "status": "received",
                "notification": request.get("notification", {}),
            }
        )

    def handle_admin_access_requests_get(self) -> None:
        user = self.require_admin()
        if not user:
            return
        self.send_json({"ok": True, "requests": pending_access_requests()})

    def handle_admin_pending_count_get(self) -> None:
        user = self.require_admin()
        if not user:
            return
        self.send_json({"ok": True, "pending": pending_access_count()})

    def handle_feedback_post(self) -> None:
        user = self.require_user()
        if is_auth_required() and not user:
            return
        body = self.read_json_body()
        try:
            feedback = submit_feedback(
                body.get("text", ""),
                user=user,
                ip=self.client_address[0] if self.client_address else "",
                user_agent=self.headers.get("User-Agent", ""),
            )
        except ValueError as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=400)
            return
        self.send_json({"ok": True, "feedback": feedback})

    def handle_admin_feedback_get(self) -> None:
        user = self.require_admin()
        if not user:
            return
        feedback = all_feedback()
        unread = unread_feedback_count()
        mark_feedback_seen(seen_by=user)
        self.send_json({"ok": True, "feedback": feedback, "unread": unread})

    def handle_admin_feedback_count_get(self) -> None:
        user = self.require_admin()
        if not user:
            return
        self.send_json({"ok": True, "unread": unread_feedback_count()})

    def handle_admin_approve_access_request_post(self, path: str) -> None:
        user = self.require_admin()
        if not user:
            return
        request_id = path.removeprefix(f"{API_PREFIX}/admin/access-requests/").removesuffix("/approve").strip("/")
        if not _valid_job_id(request_id):
            self.send_json({"ok": False, "error": "invalid_request_id"}, status=400)
            return
        try:
            result = approve_access_request(request_id, approved_by=user)
        except ValueError as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=400)
            return
        self.send_json({"ok": True, **result})

    def handle_close_simulation_post(self, path: str) -> None:
        user = self.require_user()
        if is_auth_required() and not user:
            return
        job_id = path.removeprefix(f"{API_PREFIX}/jobs/").removesuffix("/close-simulation").strip("/")
        if not _valid_job_id(job_id):
            self.send_json({"error": "invalid_job_id"}, status=400)
            return
        state_path = JOBS / job_id / "state.json"
        if not state_path.exists():
            self.send_json({"error": "job_not_found"}, status=404)
            return
        if not self.authorize_job_dir(JOBS / job_id, user):
            return
        state = read_json(state_path)
        state["celeris_run"] = None
        state["runtime_control"] = None
        state["workflow_state"] = "simulation_closed"
        state["last_intent"] = "stop_celeris_simulation"
        state["selected_path"] = ["close_embedded_celeris_runner_direct"]
        state["validation"] = {
            "status": "ok",
            "checks": [
                {
                    "level": "info",
                    "code": "CELERIS_RUNNER_CLOSED_DIRECT",
                    "message": "The embedded CELERIS simulation panel was cleared without invoking the chat planner.",
                    "details": {},
                }
            ],
        }
        write_json(state_path, state)
        self.send_json(state)

    def send_job_state(self, path: str) -> None:
        user = self.require_user()
        if is_auth_required() and not user:
            return
        job_id = path.removeprefix(f"{API_PREFIX}/jobs/").strip("/")
        if not _valid_job_id(job_id):
            self.send_json({"error": "invalid_job_id"}, status=400)
            return
        state_path = JOBS / job_id / "state.json"
        if not state_path.exists():
            self.send_json({"error": "job_not_found"}, status=404)
            return
        if not self.authorize_job_dir(JOBS / job_id, user):
            return
        self.send_json(read_json(state_path))

    def send_job_progress(self, path: str) -> None:
        user = self.require_user()
        if is_auth_required() and not user:
            return
        job_id = path.removeprefix(f"{API_PREFIX}/jobs/").removesuffix("/progress").strip("/")
        if not _valid_job_id(job_id):
            self.send_json({"error": "invalid_job_id"}, status=400)
            return
        job_dir = JOBS / job_id
        if not job_dir.exists():
            self.send_json({"error": "job_not_found"}, status=404)
            return
        if not self.authorize_job_dir(job_dir, user):
            return
        self.send_json(read_progress(job_dir))

    def send_job_result(self, path: str) -> None:
        user = self.require_user()
        if is_auth_required() and not user:
            return
        job_id = path.removeprefix(f"{API_PREFIX}/jobs/").removesuffix("/result").strip("/")
        if not _valid_job_id(job_id):
            self.send_json({"error": "invalid_job_id"}, status=400)
            return
        job_dir = JOBS / job_id
        if not job_dir.exists():
            self.send_json({"error": "job_not_found"}, status=404)
            return
        if not self.authorize_job_dir(job_dir, user):
            return
        result_path = job_dir / "work" / "result.json"
        if result_path.exists():
            try:
                self.send_json(read_json(result_path))
            except json.JSONDecodeError:
                self.send_json({"job_id": job_id, "status": "writing_result", "pending": True}, status=202)
            return
        progress = read_progress(job_dir)
        if progress.get("status") in {"queued", "running", "idle"}:
            self.send_json({"job_id": job_id, "status": progress.get("status", "running"), "pending": True}, status=202)
            return
        self.send_json({"job_id": job_id, "status": "missing_result", "progress": progress}, status=500)

    def send_job_file(self, path: str) -> None:
        user = self.require_user()
        if is_auth_required() and not user:
            return
        prefix, rel = path.split("/files/", 1)
        job_id = prefix.removeprefix(f"{API_PREFIX}/jobs/").strip("/")
        if not _valid_job_id(job_id):
            self.send_json({"error": "invalid_job_id"}, status=400)
            return
        job_dir = JOBS / job_id
        if not self.authorize_job_dir(job_dir, user):
            return
        target = job_dir / unquote(rel)
        if not is_inside(target, job_dir) or not target.exists() or not target.is_file():
            self.send_json({"error": "file_not_found"}, status=404)
            return
        self.send_file(target, attachment=True)

    def send_celeris_case(self, path: str) -> None:
        user = self.require_user()
        if is_auth_required() and not user:
            return
        job_id = path.removeprefix(f"{API_PREFIX}/jobs/").removesuffix("/celeris-case").strip("/")
        if not _valid_job_id(job_id):
            self.send_json({"error": "invalid_job_id"}, status=400)
            return
        job_dir = JOBS / job_id
        if not job_dir.exists():
            self.send_json({"error": "job_not_found"}, status=404)
            return
        if not self.authorize_job_dir(job_dir, user):
            return

        required = {
            "config": job_dir / "outputs" / "config.json",
            "bathy": job_dir / "outputs" / "bathy.txt",
            "waves": job_dir / "outputs" / "waves.txt",
        }
        missing = [name for name, file_path in required.items() if not file_path.exists()]
        if missing:
            self.send_json({"error": "missing_celeris_case_files", "missing": missing}, status=409)
            return

        origin = self.local_origin()
        file_urls = {
            name: f"{origin}{API_PREFIX}/jobs/{job_id}/files/{file_path.relative_to(job_dir).as_posix()}"
            for name, file_path in required.items()
        }
        overlay_path = job_dir / "outputs" / "overlay.jpg"
        if overlay_path.exists():
            file_urls["overlay"] = f"{origin}{API_PREFIX}/jobs/{job_id}/files/{overlay_path.relative_to(job_dir).as_posix()}"
        initial_eta_path = job_dir / "outputs" / "etaInitCond.txt"
        if initial_eta_path.exists():
            file_urls["initial_eta"] = f"{origin}{API_PREFIX}/jobs/{job_id}/files/{initial_eta_path.relative_to(job_dir).as_posix()}"
        state = read_json(job_dir / "state.json")
        self.send_json(
            {
                "schema_version": "0.1.0",
                "job_id": job_id,
                "files": file_urls,
                "state": {
                    "workflow_state": state.get("workflow_state"),
                    "last_intent": state.get("last_intent"),
                    "updated_at": state.get("updated_at"),
                },
            }
        )

    def send_configuration_archive(self, path: str) -> None:
        user = self.require_user()
        if is_auth_required() and not user:
            return
        job_id = path.removeprefix(f"{API_PREFIX}/jobs/").removesuffix("/configuration-archive").strip("/")
        if not _valid_job_id(job_id):
            self.send_json({"error": "invalid_job_id"}, status=400)
            return
        job_dir = JOBS / job_id
        if not job_dir.exists():
            self.send_json({"error": "job_not_found"}, status=404)
            return
        if not self.authorize_job_dir(job_dir, user):
            return
        try:
            archive_path = build_thread_archive(job_dir)
        except Exception as exc:
            self.send_json({"error": "archive_failed", "message": str(exc)}, status=500)
            return
        self.send_file(archive_path, attachment=True)

    def send_file(self, path: Path, attachment: bool = False) -> None:
        if not any(is_inside(path, base) for base in (ROOT, JOBS)) or not path.exists() or not path.is_file():
            self.send_json({"error": "file_not_found"}, status=404)
            return
        self._send_file_bytes(path, attachment=attachment)

    def send_core_file(self, path: str) -> None:
        rel = unquote(path).lstrip("/") or "index.html"
        target = CORE_ROOT / rel
        if target.is_dir():
            target = target / "index.html"
        if not is_inside(target, CORE_ROOT) or not target.exists() or not target.is_file():
            self.send_json({"error": "not_found"}, status=404)
            return
        self._send_file_bytes(target)

    def _send_file_bytes(self, path: Path, attachment: bool = False) -> None:
        data = path.read_bytes()
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        if attachment:
            self.send_header("Content-Disposition", f'attachment; filename="{path.name}"')
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, payload: dict, status: int = 200, headers: list[tuple[str, str]] | None = None) -> None:
        data = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        for name, value in headers or []:
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(data)

    def read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}
        return data if isinstance(data, dict) else {}

    def auth_status(self, user: dict | None = None) -> dict:
        if user is None:
            user = self.current_user()
        public = public_user(user)
        return {
            "mode": auth_mode(),
            "required": is_auth_required(),
            "authenticated": bool(public),
            "user": public,
            "pending_access_count": pending_access_count() if public and public.get("is_admin") else 0,
            "unread_feedback_count": unread_feedback_count() if public and public.get("is_admin") else 0,
        }

    def current_user(self) -> dict | None:
        return current_user_from_cookie(self.headers.get("Cookie"))

    def require_user(self) -> dict | None:
        if not is_auth_required():
            return None
        user = self.current_user()
        if not user:
            self.send_json({"error": "auth_required", "auth": self.auth_status(None)}, status=401)
            return None
        return user

    def require_admin(self) -> dict | None:
        user = self.require_user()
        if not user:
            return None
        if not user.get("is_admin", False):
            self.send_json({"error": "admin_required"}, status=403)
            return None
        return user

    def authorize_job_dir(self, job_dir: Path, user: dict | None) -> bool:
        if not is_auth_required():
            return True
        if user and user.get("is_admin", False):
            return True
        state_path = job_dir / "state.json"
        if not state_path.exists():
            self.send_json({"error": "job_not_found"}, status=404)
            return False
        owner = read_json(state_path).get("owner") or {}
        if not owner.get("user_id"):
            return True
        if owner.get("user_id") and user and owner.get("user_id") == user.get("id"):
            return True
        self.send_json({"error": "job_forbidden"}, status=403)
        return False

    def ensure_job_owner(self, job_dir: Path, user: dict | None) -> None:
        if not is_auth_required() or not user:
            return
        state_path = job_dir / "state.json"
        if not state_path.exists():
            return
        state = read_json(state_path)
        if state.get("owner"):
            return
        state["owner"] = {
            "user_id": user.get("id"),
            "email": user.get("email"),
            "name": user.get("name") or user.get("email"),
        }
        write_json(state_path, state)

    def end_headers(self) -> None:
        self.send_cors_headers()
        super().end_headers()

    def send_cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        if not origin or not _allowed_origin(origin):
            return
        requested_headers = self.headers.get("Access-Control-Request-Headers") or "Content-Type"
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", requested_headers)
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def local_origin(self) -> str:
        scheme = (self.headers.get("X-Forwarded-Proto") or "").split(",", 1)[0].strip().lower()
        if scheme not in {"http", "https"}:
            scheme = "http"
        host = (
            self.headers.get("X-Forwarded-Host")
            or self.headers.get("Host")
            or "127.0.0.1:8765"
        ).split(",", 1)[0].strip()
        return f"{scheme}://{host}"

    def log_message(self, fmt: str, *args) -> None:
        print(f"{self.address_string()} - {fmt % args}")


def run(host: str = "127.0.0.1", port: int = 8765) -> None:
    load_local_env()
    ensure_dirs()
    ensure_auth_dirs()
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"CelerisAgent chat running at http://{host}:{port}{AGENT_PREFIX}/")
    print(f"Root CELERIS core served at http://{host}:{port}/")
    server.serve_forever()


def _field(form: cgi.FieldStorage, key: str) -> str:
    value = form.getvalue(key, "")
    if isinstance(value, list):
        value = value[-1]
    return value or ""


def _valid_job_id(job_id: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9_-]+", job_id))


def _allowed_origin(origin: str) -> bool:
    parsed = urlparse(origin)
    if parsed.scheme not in {"http", "https"}:
        return False
    if origin == "https://plynett.github.io":
        return True
    return parsed.hostname in {"127.0.0.1", "localhost", "::1"}
