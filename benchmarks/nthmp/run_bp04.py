#!/usr/bin/env python3
"""MATLAB-generate, browser-run, and MATLAB-process NTHMP BP04 cases."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parents[1]
CASE_IDS = ["case_a", "case_c"]


def run_command(command: list[str]) -> None:
    print("+ " + " ".join(command), flush=True)
    subprocess.run(command, cwd=REPO_ROOT, check=True)


def matlab_executable() -> str:
    executable = shutil.which("matlab")
    if executable:
        return executable
    default_windows_path = Path("C:/Program Files/MATLAB/R2024b/bin/matlab.exe")
    if default_windows_path.exists():
        return str(default_windows_path)
    return "matlab"


def matlab_string(value: Path | str) -> str:
    return "'" + str(value).replace("\\", "/").replace("'", "''") + "'"


def run_matlab(expression: str) -> None:
    command = f"addpath({matlab_string(ROOT / 'matlab')}); {expression};"
    run_command([matlab_executable(), "-batch", command])


def selected_cases(case: str) -> list[str]:
    return CASE_IDS if case == "all" else [case]


def run_dir(case_id: str) -> Path:
    return ROOT / "runs" / "BP04" / f"{case_id}_solitary_disturbance"


def automation_command(case_dir: Path, args: argparse.Namespace) -> list[str]:
    command = [
        sys.executable,
        str(REPO_ROOT / "automation" / "run_benchmark_case.py"),
        "--case-dir",
        str(case_dir),
        "--output-dir",
        str(case_dir / "output"),
        "--timeout-minutes",
        str(args.timeout_minutes),
        "--poll-interval",
        str(args.poll_interval),
    ]
    if args.headless:
        command.append("--headless")
    return command


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=["all", *CASE_IDS], default="all")
    parser.add_argument("--skip-generate", action="store_true")
    parser.add_argument("--skip-run", action="store_true")
    parser.add_argument("--skip-process", action="store_true")
    parser.add_argument("--allow-missing", action="store_true", help="Allow post-processing to write reference-only outputs when model output is absent.")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--timeout-minutes", type=float, default=0.0, help="0 means no timeout.")
    parser.add_argument("--poll-interval", type=float, default=30.0)
    args = parser.parse_args()

    if not args.skip_generate:
        run_matlab(f"nthmp_generate('BP04', '{args.case}')")

    for case_id in selected_cases(args.case):
        case_dir = run_dir(case_id)
        if not args.skip_run:
            run_command(automation_command(case_dir, args))
        if not args.skip_process:
            allow_missing = "true" if args.allow_missing else "false"
            run_matlab(f"nthmp_process('BP04', {matlab_string(case_dir)}, {allow_missing}); nthmp_summary")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
