# `js/Time_Series.js`

[Source](../../../js/Time_Series.js)

## What This File Owns

This module reads small GPU outputs back to JavaScript for tooltips and point time-series gauges. The GPU-side sampling is performed by `ExtractTimeSeries.wgsl`; this module maps the output texture and updates CPU/UI data structures.

## Main Functions

- `readToolTipTextureData()`: copies `txTimeSeries_Data` into a buffer and reads the first `NumberOfTimeSeries + 1` pixels. Pixel 0 is tooltip data. Later pixels append time, eta, P, and Q to `timeSeriesData`.
- `resetTimeSeriesData()`: clears stored series data.
- `downloadTimeSeriesData()`: writes recorded gauge data to a downloadable file.
- `readCornerPixelData()`: older utility for reading 8-bit corner data; not central to the current flow.

## Important Contracts

`ExtractTimeSeries.wgsl` reserves the first output pixel for tooltip values at the current mouse grid index. Time-series gauges start at pixel index 1. `timeSeriesData` is initialized in `constants_load_calc.js` and is indexed to match those gauge slots. Ordinary gauge timestamps use elapsed time since the most recent location/change or duration reset. Nested runs loaded from boundary type `5` files instead preserve the parent/global model clock. Readbacks carry a reset epoch so an asynchronous result issued before a reset cannot repopulate the cleared chart.

## Change Notes

Keep readback sizes tiny. This path is designed for a few pixels, not full-field data. For large exports, use `File_Writer.js`.
