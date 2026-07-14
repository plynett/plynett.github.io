from pathlib import Path
import csv
import json
import shutil

import numpy as np
import pandas as pd
from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
RUNS = ROOT / "runs"
REPORT = ROOT / "report"
FIGURES = REPORT / "figures"


def crop_copy(src, dst):
    img = Image.open(src).convert("RGB")
    bg = Image.new("RGB", img.size, "white")
    bbox = ImageChops.difference(img, bg).getbbox()
    if bbox:
        pad = 18
        left = max(0, bbox[0] - pad)
        top = max(0, bbox[1] - pad)
        right = min(img.size[0], bbox[2] + pad)
        bottom = min(img.size[1], bbox[3] + pad)
        img = img.crop((left, top, right, bottom))
    img.save(dst, dpi=(300, 300))


def remove_top_title(path, pixels=70):
    img = Image.open(path).convert("RGB")
    img = img.crop((0, pixels, img.size[0], img.size[1]))
    img.save(path, dpi=(300, 300))


def read_table(path):
    return pd.read_csv(path)


def parse_runup_text(path):
    text = Path(path).read_text().splitlines()
    out = {}
    for line in text:
        if ":" in line:
            key, value = line.split(":", 1)
            out[key.strip()] = value.strip()
    return out


def surface_times(output_dir):
    pairs = []
    for path in output_dir.glob("elev_*.bin"):
        frame = int(path.stem.split("_")[1])
        t = float((output_dir / f"time_{frame}.txt").read_text())
        pairs.append((frame, t, path))
    pairs.sort()
    return pairs


def bilinear(grid, x, y, dx, dy, xq, yq):
    ix = xq / dx
    iy = yq / dy
    i0 = int(np.floor(ix))
    j0 = int(np.floor(iy))
    i1 = min(i0 + 1, grid.shape[0] - 1)
    j1 = min(j0 + 1, grid.shape[1] - 1)
    ax = ix - i0
    ay = iy - j0
    return (
        (1 - ax) * (1 - ay) * grid[i0, j0]
        + ax * (1 - ay) * grid[i1, j0]
        + (1 - ax) * ay * grid[i0, j1]
        + ax * ay * grid[i1, j1]
    )


def bp06_aligned_metrics(case_dir, ref_file, shift, out_name):
    output_dir = case_dir / "output"
    analysis_dir = case_dir / "analysis"
    nx = int(float((output_dir / "nx.txt").read_text()))
    ny = int(float((output_dir / "ny.txt").read_text()))
    dx = float((output_dir / "dx.txt").read_text())
    dy = float((output_dir / "dy.txt").read_text())
    d = 0.32

    gauge_id = [9, 16, 22]
    gauge_x = [10.36, 12.96, 15.56]
    gauge_y = [13.80, 11.22, 13.80]
    gauge_col = [6, 7, 8]

    frames = surface_times(output_dir)
    model_time = np.array([t for _, t, _ in frames])
    model_eta = np.zeros((len(frames), 3))
    for k, (_, _, path) in enumerate(frames):
        eta = np.fromfile(path, dtype=np.float32).reshape((nx, ny), order="F")
        for n in range(3):
            model_eta[k, n] = bilinear(eta, None, None, dx, dy, gauge_x[n], gauge_y[n])

    ref = np.genfromtxt(ref_file, skip_header=7)
    ref_tstar = ref[:, 0] * np.sqrt(9.81 / d) - 155.0
    model_tstar = (model_time + shift) * np.sqrt(9.81 / d) - 160.0

    rows = []
    for n in range(3):
        ref_eta = np.interp(model_tstar, ref_tstar, ref[:, gauge_col[n]], left=np.nan, right=np.nan)
        err = model_eta[:, n] - ref_eta
        good = np.isfinite(err)
        rows.append({
            "gauge_id": gauge_id[n],
            "rmse_m": float(np.sqrt(np.mean(err[good] ** 2))),
            "mean_abs_error_m": float(np.mean(np.abs(err[good]))),
            "max_abs_error_m": float(np.max(np.abs(err[good]))),
            "sample_count": int(np.sum(good)),
        })

    out_path = analysis_dir / out_name
    with out_path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    return rows


def main():
    FIGURES.mkdir(parents=True, exist_ok=True)

    figure_sources = {
        "fig_bp01_gauges.png": RUNS / "BP01/pilot_solitary_disturbance/analysis/figures/bp01_time_series_comparison.png",
        "fig_bp01_profiles.png": RUNS / "BP01/pilot_solitary_disturbance/analysis/figures/bp01_reference_profiles.png",
        "fig_bp04_case_a_profiles.png": RUNS / "BP04/case_a_solitary_disturbance/analysis/figures/bp04_case_a_profile_comparison.png",
        "fig_bp04_case_c_profiles.png": RUNS / "BP04/case_c_solitary_disturbance/analysis/figures/bp04_case_c_profile_comparison.png",
        "fig_bp06_case_b_gauges.png": RUNS / "BP06/case_b_solitary_disturbance/analysis/figures/bp06_case_b_eta_surface_gauge_comparison.png",
        "fig_bp06_case_b_runup.png": RUNS / "BP06/case_b_solitary_disturbance/analysis/figures/bp06_case_b_runup_by_angle.png",
        "fig_bp06_case_c_gauges.png": RUNS / "BP06/case_c_solitary_disturbance/analysis/figures/bp06_case_c_time_series_comparison.png",
        "fig_bp06_case_c_runup.png": RUNS / "BP06/case_c_solitary_disturbance/analysis/figures/bp06_case_c_runup_by_angle.png",
        "fig_bp07_snapshots.png": RUNS / "BP07/monai_valley/analysis/figures/bp07_model_snapshots.png",
        "fig_bp07_gauges.png": RUNS / "BP07/monai_valley/analysis/figures/bp07_eta_surface_gauge_comparison.png",
        "fig_bp07_runup.png": RUNS / "BP07/monai_valley/analysis/figures/bp07_runup_comparison.png",
        "fig_bp09_extents.png": RUNS / "BP09/analysis/bp09_grid_extents.png",
        "fig_bp09_gauges.png": RUNS / "BP09/gridA_okushiri/analysis/bp09_gridA_eta_surface_tide_gauge_comparison.png",
        "fig_bp09_a_fsmax.png": RUNS / "BP09/gridA_okushiri/analysis/gridA_okushiri_FSmax.png",
        "fig_bp09_b_fsmax.png": RUNS / "BP09/gridB_south_okushiri/analysis/gridB_south_okushiri_FSmax.png",
        "fig_bp09_c_aonae_fsmax.png": RUNS / "BP09/gridC_aonae/analysis/gridC_aonae_FSmax.png",
        "fig_bp09_c_monai_fsmax.png": RUNS / "BP09/gridC_monai/analysis/gridC_monai_FSmax.png",
    }
    for name, src in figure_sources.items():
        if src.exists():
            crop_copy(src, FIGURES / name)
            if name in {
                "fig_bp09_a_fsmax.png",
                "fig_bp09_b_fsmax.png",
                "fig_bp09_c_aonae_fsmax.png",
                "fig_bp09_c_monai_fsmax.png",
            }:
                remove_top_title(FIGURES / name)

    bp06_b = bp06_aligned_metrics(
        RUNS / "BP06/case_b_solitary_disturbance",
        ROOT / "reference_data/BP06/ts2b.txt",
        27.6,
        "bp06_case_b_aligned_required_gauge_metrics.csv",
    )
    bp06_c = bp06_aligned_metrics(
        RUNS / "BP06/case_c_solitary_disturbance",
        ROOT / "reference_data/BP06/ts2cnew1.txt",
        26.7,
        "bp06_case_c_aligned_required_gauge_metrics.csv",
    )

    metrics = {
        "bp01": {
            "runup": parse_runup_text(RUNS / "BP01/pilot_solitary_disturbance/analysis/bp01_matlab_runup_metric.txt"),
            "gauges": read_table(RUNS / "BP01/pilot_solitary_disturbance/analysis/bp01_matlab_gauge_metrics.csv").to_dict("records"),
            "profiles": read_table(RUNS / "BP01/pilot_solitary_disturbance/analysis/bp01_matlab_profile_metrics.csv").to_dict("records"),
        },
        "bp04": {
            "case_a_runup": parse_runup_text(RUNS / "BP04/case_a_solitary_disturbance/analysis/bp04_case_a_matlab_runup_metric.txt"),
            "case_a_profiles": read_table(RUNS / "BP04/case_a_solitary_disturbance/analysis/bp04_case_a_matlab_profile_metrics.csv").to_dict("records"),
            "case_c_runup": parse_runup_text(RUNS / "BP04/case_c_solitary_disturbance/analysis/bp04_case_c_matlab_runup_metric.txt"),
            "case_c_profiles": read_table(RUNS / "BP04/case_c_solitary_disturbance/analysis/bp04_case_c_matlab_profile_metrics.csv").to_dict("records"),
        },
        "bp06": {
            "case_b_gauges_aligned": bp06_b,
            "case_b_runup": read_table(RUNS / "BP06/case_b_solitary_disturbance/analysis/bp06_case_b_matlab_runup_by_angle.csv").to_dict("records"),
            "case_c_gauges_aligned": bp06_c,
            "case_c_runup": read_table(RUNS / "BP06/case_c_solitary_disturbance/analysis/bp06_case_c_matlab_runup_by_angle.csv").to_dict("records"),
        },
        "bp07": {
            "gauges": read_table(RUNS / "BP07/monai_valley/analysis/bp07_matlab_gauge_metrics.csv").to_dict("records"),
            "runup": read_table(RUNS / "BP07/monai_valley/analysis/bp07_matlab_runup_metrics.csv").to_dict("records"),
        },
        "bp09": {
            "tide_gauges": read_table(RUNS / "BP09/gridA_okushiri/analysis/bp09_gridA_tide_gauge_metrics.csv").to_dict("records"),
            "runup_summary": read_table(RUNS / "BP09/bp09_matlab_runup_summary.csv").to_dict("records"),
        },
    }

    with (REPORT / "report_metrics.json").open("w") as f:
        json.dump(metrics, f, indent=2)


if __name__ == "__main__":
    main()
