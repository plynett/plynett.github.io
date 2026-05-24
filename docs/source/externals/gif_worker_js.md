# `externals/gif.worker.js`

[Source](../../../externals/gif.worker.js)

## What This File Is

Worker script used by the GIF export path. It is part of the browser-side GIF creation machinery rather than the numerical model.

## Current Project Use

`File_Writer.js` uses GIF export helpers to turn a 3D image texture into animation frames. This worker supports that encoding workflow.

## Change Notes

Treat this as vendored worker code. If GIF export breaks, first inspect the caller in `File_Writer.js`, texture readback format conversion, and worker loading path before editing this file.
