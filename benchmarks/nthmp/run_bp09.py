#!/usr/bin/env python3
"""MATLAB-generate, browser-run, and MATLAB-process NTHMP BP09 nested Okushiri cases."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parents[1]

GRID_ORDER = [
    "grid_a",
    "grid_b",
    "grid_c_aonae",
    "grid_c_monai",
]
GRID_VARIANTS = {
    "grid_a": "gridA_okushiri",
    "grid_b": "gridB_south_okushiri",
    "grid_c_aonae": "gridC_aonae",
    "grid_c_monai": "gridC_monai",
}
PARENTS = {
    "grid_b": "grid_a",
    "grid_c_aonae": "grid_b",
    "grid_c_monai": "grid_b",
}
BOUNDARY_PREFIXES = {
    "grid_b": "gridB",
    "grid_c_aonae": "gridC_aonae",
    "grid_c_monai": "gridC_monai",
}
BOUNDARY_SIDES = ["west", "east", "south", "north"]


def run_dirs() -> dict[str, Path]:
    return {
        grid_key: ROOT / "runs" / "BP09" / variant
        for grid_key, variant in GRID_VARIANTS.items()
    }


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


def matlab_string(value: Path) -> str:
    return "'" + str(value).replace("\\", "/").replace("'", "''") + "'"


def generate_inputs(args: argparse.Namespace) -> None:
    matlab_expr = (
        f"addpath({matlab_string(ROOT / 'matlab')}); "
        "generate_bp09_inputs_matlab("
        f"{args.base_refinement},"
        f"{args.child_refinement},"
        f"{args.nested_dt:.15g},"
        f"{args.nested_eta_threshold:.15g},"
        f"{args.sim_duration:.15g}"
        ");"
    )
    run_command([matlab_executable(), "-batch", matlab_expr])


def selected_grids(region: str) -> list[str]:
    if region == "all":
        return GRID_ORDER
    return [region]


def automation_command(grid_key: str, args: argparse.Namespace, directories: dict[str, Path]) -> list[str]:
    run_dir = directories[grid_key]
    command = [
        sys.executable,
        str(REPO_ROOT / "automation" / "run_benchmark_case.py"),
        "--case-dir",
        str(run_dir),
        "--output-dir",
        str(run_dir / "output"),
        "--timeout-minutes",
        str(args.timeout_minutes),
        "--poll-interval",
        str(args.poll_interval),
    ]
    if args.headless:
        command.append("--headless")
    return command


def copy_boundary_files(grid_key: str, directories: dict[str, Path]) -> None:
    parent = PARENTS.get(grid_key)
    if parent is None:
        return

    prefix = BOUNDARY_PREFIXES[grid_key]
    source_dir = directories[parent] / "output"
    destination_dir = directories[grid_key]
    missing = []
    for side in BOUNDARY_SIDES:
        filename = f"{prefix}_time_series_bc_{side}.txt"
        source = source_dir / filename
        destination = destination_dir / filename
        if not source.exists():
            missing.append(str(source))
            continue
        shutil.copy2(source, destination)
        print(f"Copied {source} -> {destination}")

    if missing:
        raise FileNotFoundError(
            "Missing required nested boundary file(s):\n" + "\n".join(missing)
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--region", "--grid", dest="region", choices=["all", *GRID_ORDER], default="all")
    parser.add_argument("--skip-generate", action="store_true")
    parser.add_argument("--skip-run", action="store_true")
    parser.add_argument("--skip-process", action="store_true")
    parser.add_argument("--allow-missing", action="store_true", help="Allow post-processing to write reference-only outputs when model output is absent.")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--timeout-minutes", type=float, default=0.0, help="0 means no timeout.")
    parser.add_argument("--poll-interval", type=float, default=30.0)
    parser.add_argument("--base-refinement", "--refine-factor", dest="base_refinement", type=int, default=4, help="Refine the A-grid spacing relative to the original PMEL Region A spacing; default 4 gives about 112 m.")
    parser.add_argument("--child-refinement", type=int, default=4, help="Parent-child refinement factor. Must stay between 3 and 5; default 4 gives final grids near 7 m.")
    parser.add_argument("--nested-dt", type=float, default=10.0)
    parser.add_argument("--nested-eta-threshold", type=float, default=0.01)
    parser.add_argument("--sim-duration", type=float, default=1800.0)
    args = parser.parse_args()

    if not 3 <= args.base_refinement <= 5:
        parser.error("--base-refinement must be between 3 and 5")
    if not 3 <= args.child_refinement <= 5:
        parser.error("--child-refinement must be between 3 and 5")
    if args.nested_dt <= 0.0:
        parser.error("--nested-dt must be positive")
    if args.nested_eta_threshold < 0.0:
        parser.error("--nested-eta-threshold must be nonnegative")
    if args.sim_duration <= 0.0:
        parser.error("--sim-duration must be positive")

    grids = selected_grids(args.region)
    directories = run_dirs()

    if not args.skip_generate:
        generate_inputs(args)

    for grid_key in grids:
        run_dir = directories[grid_key]
        if not args.skip_run:
            copy_boundary_files(grid_key, directories)
            run_command(automation_command(grid_key, args, directories))
        if not args.skip_process:
            allow_missing = "true" if args.allow_missing else "false"
            expression = (
                f"addpath({matlab_string(ROOT / 'matlab')}); "
                f"nthmp_process('BP09', {matlab_string(run_dir)}, {allow_missing}); nthmp_summary;"
            )
            run_command([matlab_executable(), "-batch", expression])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
