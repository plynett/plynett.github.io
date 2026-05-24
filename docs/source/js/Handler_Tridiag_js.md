# `js/Handler_Tridiag.js`

[Source](../../../js/Handler_Tridiag.js)

## What This File Owns

Creates the bind group for PCR tridiagonal solver shaders.

## Binding Contract

- `0`: tridiagonal uniform buffer containing `p`, `s`, dimensions, and variant-specific values.
- `1`: source coefficient texture for this direction; the active solver alternates this between the base matrix and the two mutable PCR coefficient textures.
- `2`: current state.
- `3`: current/intermediate UV-star state.
- `4`: temporary coefficient output, paired with binding `1` to implement the PCR ping-pong handoff.
- `5`: temporary solution output.
- `6`: `txBottom`, used by COULWAVE PCR variants.

## Pipeline Role

`Run_Tridiag_Solver.js` repeatedly dispatches this layout with x or y PCR shaders. The active path creates multiple bind groups from this one layout so each PCR iteration can hand coefficients from one texture to the other without a full copy-back pass.

## Change Notes

Standard PCR shaders do not use binding `6`, but the handler includes it so the same JavaScript path can support COULWAVE. Do not remove it without splitting the solver paths.
