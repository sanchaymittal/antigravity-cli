'use strict';

// Minimal images.js — extractText only (no image fetch/save needed for CLI chat).

/** Extract text from OpenAI message content (string or content-parts array). */
function extractText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => !(p && typeof p === 'object' && p.type === 'image_url'))
      .map((p) => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object') {
          if (p.type === 'text' && p.text) return p.text;
          if (p.text) return p.text;
          try { return JSON.stringify(p); } catch { return ''; }
        }
        return String(p);
      })
      .filter((t) => t.length > 0)
      .join('\n');
  }
  if (typeof content === 'object') {
    if (content.text) return content.text;
    try { return JSON.stringify(content); } catch { return ''; }
  }
  return String(content || '');
}

module.exports = { extractText };
