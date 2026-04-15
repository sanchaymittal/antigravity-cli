'use strict';

// Stripped utils — no VS Code deps.
// Set AG_DEBUG=1 for standard logs, AG_DEBUG=2 for verbose payload dumps.

function log(ctx, msg, isError = false) {
  if (!process.env.AG_DEBUG) return;
  if (typeof msg === 'object') {
    try { msg = JSON.stringify(msg); } catch { msg = String(msg); }
  }
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[${ts}] ${msg}`);
}

function verboseLog(ctx, msg, fullContent = null) {
  if (process.env.AG_DEBUG !== '2') return;
  log(ctx, msg);
  if (fullContent !== null) {
    try {
      const fmt = typeof fullContent === 'string'
        ? (() => { try { return JSON.stringify(JSON.parse(fullContent), null, 2); } catch { return fullContent; } })()
        : JSON.stringify(fullContent, null, 2);
      const ts = new Date().toISOString().slice(11, 23);
      console.error(`\n--- [${ts}] FULL PAYLOAD ---\n${fmt}\n--- [END] ---`);
    } catch { /* ignore */ }
  }
}

module.exports = { log, verboseLog };
