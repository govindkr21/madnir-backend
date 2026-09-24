const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeRichText } = require("../Utils/SanitizeHtml");

test("sanitizes rich consultation HTML while preserving formatting", () => {
  const result = sanitizeRichText(
    '<p style="text-align:center"><strong>Advice</strong></p><script>alert(1)</script><img src=x onerror=alert(2)>'
  );
  assert.match(result, /<strong>Advice<\/strong>/);
  assert.doesNotMatch(result, /script|onerror|img/i);
});