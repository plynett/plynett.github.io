# `js/browser_console.js`

[Source](../../../js/browser_console.js)

## What This File Owns

Captures new browser console activity for the CelerisAgent page and renders it as plain console text in the left-sidebar Browser Console panel.

The module wraps `console.log`, `console.info`, `console.warn`, and `console.error`, listens for `window.error` and `unhandledrejection`, and displays forwarded `celeris-agent-console` messages from the embedded root CELERIS runner. It keeps a bounded in-memory history so the sidebar remains compact.

Rows intentionally show message text only, matching the regular CELERIS Simulation Console style. Do not prepend timestamps or render runtime command-result JSON here.

Internal Agent status objects such as `Agent case status: {...}` are filtered out so the panel stays focused on human-readable CELERIS console messages.

This panel is diagnostic only. Do not route workflow state, chat responses, or simulation controls through this module.
