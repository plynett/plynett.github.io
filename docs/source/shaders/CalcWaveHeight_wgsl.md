# `shaders/CalcWaveHeight.wgsl`

[Source](../../../shaders/CalcWaveHeight.wgsl)

## What This Shader Does

Computes running wave-height statistics from eta variance relative to the mean eta field.

## Active Method

The active code accumulates squared deviations of new eta from mean eta. It computes standard deviation and estimates:

- RMS/mean wave height as `sigma * 2.829`.
- Significant wave height as `sigma * 4.0`.

The output texture stores accumulated variance, relative change, significant height, and mean/RMS height.

## Inactive Method

A zero-upcrossing method is present in comments but is not active.

## Change Notes

The current code divides by `n_time_steps_waveheight`, so reset behavior depends on that counter being reset externally. Also note the relative-change channel divides by the previous significant height; callers should avoid relying on it at initialization.
