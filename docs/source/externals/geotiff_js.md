# `externals/geotiff.js`

[Source](../../../externals/geotiff.js)

## What This File Is

Local GeoTIFF library script. It is intended to support GeoTIFF-style export or parsing workflows from browser code.

## Current Project Use

`File_Writer.js` contains a `downloadGeoTiffData()` path that references `GeoTIFF`, but that path appears stale relative to the current readback function signatures. The main active export paths are text/binary texture readbacks, JPEG, image slices, GIF, and JSON config.

## Change Notes

Treat this as vendored dependency code. Before relying on GeoTIFF export, audit `File_Writer.js` and confirm the library API, browser availability, and texture readback channel order.
