# `js/display_parameters.js`

[Source](../../../js/display_parameters.js)

## What This File Owns

This module updates DOM panels that show simulation parameters, status, time-series locations, sediment/design volume information, and console output. It does not alter the numerical model directly.

## Main Functions

- `displayCalcConstants()`: writes selected config values into the parameter display.
- `displaySimStatus()`: updates timestep, frame, timing, and run-status information.
- `displayTimeSeriesLocations()`: lists active point gauges.
- `displaySlideVolume()`: reports disturbance/slide volume information.
- `ConsoleLogRedirection()`: monkey-patches `console.log` so messages also appear in the in-page console panel.

Boundary type labels include type `5`, displayed as time-series forcing from a loaded file.

## Important Contracts

This file is tightly coupled to DOM element IDs. It assumes the HTML contains specific containers and text fields. The console redirection keeps only a bounded number of entries so the page does not grow without limit.

## Change Notes

Because this module only affects display, avoid adding simulation side effects here. If a UI control should change model behavior, update `calc_constants` or an explicit flag in `main.js`, then let the frame loop apply the change through the normal GPU path.
