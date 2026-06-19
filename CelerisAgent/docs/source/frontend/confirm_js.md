# `js/confirm.js`

Owns the large-native-extraction confirmation overlay.

Current exports:

- `setLargeExtractionApprovalHandler(handler)`
- `resetLargeExtractionPrompt()`
- `renderLargeExtractionPrompt(state)`

The module reads workflow state and displays a Yes/No prompt only when the backend reports `needs_user_confirmation` for a large native DEM extraction. It should not decide whether an extraction is safe; that belongs to backend retrieval policy.
