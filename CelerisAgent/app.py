from __future__ import annotations

import argparse

from agent.server import run


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the CelerisAgent chat prototype.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8765, type=int)
    args = parser.parse_args()
    run(args.host, args.port)


if __name__ == "__main__":
    main()

