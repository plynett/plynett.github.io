# `shaders/SedTrans_UpdateBottom_testing.wgsl`

[Source](../../../shaders/SedTrans_UpdateBottom_testing.wgsl)

## What This Shader Does

Experimental bottom-update variant for sediment transport. It computes cumulative bottom change but largely keeps the bottom at the initial value in the active code path.

## Active Status

This file is not the active bottom-update shader. The active path uses `SedTrans_UpdateBottom.wgsl`.

## Differences From Active Shader

It includes fields such as `n_sim` and `sedUpdateInt` for interval-based updates and a recent-change texture path, but much of that logic is commented out. It also has a different binding layout from the active handler.

## Change Notes

Treat this as a testing scratch shader. Do not rely on it for production sediment behavior without rebuilding the handler and JavaScript dispatch path.
