from __future__ import annotations

import argparse
import getpass
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agent.auth import create_or_update_user
from agent.config import ensure_dirs


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or update a local CelerisAgent user.")
    parser.add_argument("email")
    parser.add_argument("name")
    parser.add_argument("--password", default="")
    parser.add_argument("--admin", action="store_true")
    parser.add_argument("--inactive", action="store_true")
    args = parser.parse_args()

    ensure_dirs()
    password = args.password
    generated = False
    if not password:
        password = getpass.getpass("Password (blank to generate one): ")
    if not password:
        password = secrets.token_urlsafe(10)
        generated = True

    user = create_or_update_user(args.email, args.name, password, is_admin=args.admin, active=not args.inactive)
    print(f"Updated user {user['email']} (admin={user['is_admin']}).")
    if generated:
        print(f"Generated password: {password}")


if __name__ == "__main__":
    main()
