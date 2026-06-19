from __future__ import annotations

from pathlib import Path

import numpy as np
from scipy.special import gamma


def write_periodic_waves(
    path: Path,
    Hs_o: float,
    Tp: float,
    Thetap: float,
    depth: float,
    ds: float,
    boundary_length: float,
    boundary_angle: float,
    seed: int = 12345,
    fit_to_periodic_boundary: bool = False,
) -> dict:
    gamma_s = 3.3
    spread_o = 50.0
    del_f0 = 0.001
    del_t = 5.0
    g = 9.81
    f_peak = 1.0 / Tp
    Hs = min(float(Hs_o), float(depth) * 0.5)
    f_start = max(del_f0, 1.0 / 25.0)
    f_end = 1.0 / 5.0
    f = np.arange(f_start, f_end + del_f0 * 0.5, del_f0)

    beta = 0.0624 / (0.23 + 0.033 * gamma_s - 0.185 * (1.9 + gamma_s) ** -1)
    energy = np.zeros_like(f)
    for i, freq in enumerate(f):
        omega_h = 2.0 * np.pi * freq * np.sqrt(depth / g)
        if omega_h > 2:
            phi_k = 1.0
        elif omega_h < 1:
            phi_k = 0.5 * omega_h
        else:
            phi_k = 1.0 - 0.5 * (2.0 - omega_h) ** 2
        sigma = 0.07 if freq <= f_peak else 0.09
        frat = freq / f_peak
        energy[i] = beta * Hs**2 / (freq * frat**4) * np.exp(-1.25 / frat**4) * gamma_s ** (
            np.exp(-((frat - 1.0) ** 2) / (2.0 * sigma**2))
        )
        energy[i] *= phi_k

    theta = np.arange(-20.0 + Thetap, 20.0 + Thetap + del_t * 0.5, del_t)
    directional = np.zeros((f.size, theta.size), dtype=np.float64)
    for i, freq in enumerate(f):
        f_rat = freq / f_peak
        spread = spread_o * f_rat**5 if f_rat < 1 else spread_o * f_rat**-2.5
        beta_s = 2.0 ** (2.0 * spread - 1.0) / np.pi * gamma(spread + 1.0) ** 2 / gamma(2.0 * spread + 1.0)
        directional[i, :] = beta_s * np.cos(0.5 * ((theta - Thetap) * np.pi / 180.0)) ** (2.0 * spread)
        total = np.sum(directional[i, :])
        if total > 0:
            directional[i, :] /= total

    energy_directional = energy[:, None] * directional
    hmo_full = np.sqrt(np.sum(energy_directional * frequency_widths(f)[:, None])) * 4.004
    if hmo_full > 0:
        energy_directional *= (Hs_o / hmo_full) ** 2

    center_column = round(theta.size / 2) - 1
    max_energy = float(np.max(energy_directional[:, center_column]))
    keep = energy_directional[:, center_column] > 0.01 * max_energy
    f_num = f[keep]
    e_num = energy_directional[keep, :]
    if f_num.size == 0:
        f_num = np.array([f_peak], dtype=np.float64)
        e_num = np.zeros((1, theta.size), dtype=np.float64)

    rng = np.random.default_rng(seed)
    rows = []
    periodic_boundary_length = max(float(boundary_length) - 2.0 * float(ds), float(ds))
    widths = frequency_widths(f_num)
    max_periodic_phase_error = 0.0
    fitted_component_count = 0
    for i, freq in enumerate(f_num):
        for j, theta_o in enumerate(theta):
            omega = 2.0 * np.pi * freq
            k_c = omega * omega / (g * np.sqrt(np.tanh(omega * omega * depth / g)))
            if fit_to_periodic_boundary:
                relative_wave_angle = theta_o - boundary_angle
                wavelength = 2.0 * np.pi / k_c
                along_boundary_k = np.sin(np.deg2rad(relative_wave_angle)) * k_c
                waves_along_boundary = abs(along_boundary_k * periodic_boundary_length / (2.0 * np.pi))
                if waves_along_boundary < 0.5:
                    theta_c = 0.0
                else:
                    nearest = round(waves_along_boundary)
                    if nearest <= 0:
                        theta_c = 0.0
                    else:
                        l_y_nearest = periodic_boundary_length / nearest
                        if l_y_nearest < wavelength:
                            nearest -= 1
                        if nearest <= 0:
                            theta_c = 0.0
                        else:
                            along_boundary_k_nearest = np.sign(along_boundary_k) * 2.0 * np.pi * nearest / periodic_boundary_length
                            k_ratio = along_boundary_k_nearest / k_c
                            theta_c = np.rad2deg(np.arcsin(np.clip(k_ratio, -1.0, 1.0)))
                            phase_error = abs(along_boundary_k_nearest * periodic_boundary_length - np.sign(along_boundary_k) * 2.0 * np.pi * nearest)
                            max_periodic_phase_error = max(max_periodic_phase_error, float(phase_error))
                            fitted_component_count += 1
                theta_c += boundary_angle
            else:
                theta_c = theta_o
            amplitude = np.sqrt(max(0.0, 2.0 * e_num[i, j] * widths[i]))
            rows.append([amplitude, 1.0 / freq, theta_c * np.pi / 180.0, rng.random() * 2.0 * np.pi])

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as out:
        out.write("\n")
        out.write(f"[NumberOfWaves] {len(rows)}\n")
        out.write("=================================\n")
        for row in rows:
            out.write(" ".join(f"{value:.8g}" for value in row) + "\n")

    return {
        "wave_count": len(rows),
        "frequency_count": int(f_num.size),
        "direction_count": int(theta.size),
        "boundary_length_m": periodic_boundary_length,
        "periodic_boundary_length_m": periodic_boundary_length,
        "periodic_phase_fit_applied": fit_to_periodic_boundary,
        "periodic_fitted_component_count": fitted_component_count,
        "max_periodic_phase_error_rad": max_periodic_phase_error,
        "boundary_angle": boundary_angle,
        "seed": seed,
    }


def frequency_widths(f: np.ndarray) -> np.ndarray:
    if f.size == 1:
        return np.array([0.001], dtype=np.float64)
    widths = np.empty(f.size, dtype=np.float64)
    widths[0] = f[1] - f[0]
    widths[-1] = f[-1] - f[-2]
    widths[1:-1] = 0.5 * (f[2:] - f[:-2])
    return widths
