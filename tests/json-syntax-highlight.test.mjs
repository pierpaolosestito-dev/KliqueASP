import assert from "node:assert/strict";
import test from "node:test";
import {
  highlightJson,
  MAX_JSON_HIGHLIGHT_LENGTH,
  shouldHighlightJson
} from "../src/lib/kliqueasp/graph/jsonSyntaxHighlight.ts";

test("JSON values, keys, numbers, literals, and punctuation receive separate tokens", () => {
  const html = highlightJson('{\n  "name": "Éva", "count": -12.5e2, "active": true, "extra": null\n}');

  assert.match(html, /class="json-token-key">"name"/);
  assert.match(html, /class="json-token-string">"Éva"/);
  assert.match(html, /class="json-token-number">-12\.5e2/);
  assert.match(html, /class="json-token-literal">true/);
  assert.match(html, /class="json-token-literal">null/);
  assert.match(html, /class="json-token-punctuation">\{/);
});

test("escaped strings and keyword-like identifiers stay in the correct token", () => {
  const html = highlightJson('{"trueish": "a \\\"quote\\\"", "flag": false, "empty": null}');

  assert.match(html, /class="json-token-key">"trueish"/);
  assert.match(html, /class="json-token-string">"a \\\"quote\\\""/);
  assert.match(html, /class="json-token-literal">false/);
  assert.doesNotMatch(highlightJson("trueValue"), /json-token-literal/);
});

test("HTML-looking graph data is escaped before insertion into the visual layer", () => {
  const html = highlightJson('{"payload":"</span><script>alert(1)</script>&"}');

  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /&lt;\/span&gt;&lt;script&gt;/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&amp;/);
});

test("incomplete JSON remains editable and still highlights the unfinished string", () => {
  const html = highlightJson('{"key": "unfinished');

  assert.match(html, /class="json-token-string">"unfinished/);
  assert.equal(html.replace(/<[^>]*>/g, ""), '{"key": "unfinished');
});

test("tokenization preserves every source character and Unicode whitespace", () => {
  const source = '{\r\n  "label": "Èva <R&S> 🧠",\n  "quote": "a \\\"b\\\"",\n  "value": null\n}\n';
  const html = highlightJson(source);
  const plainText = html
    .replace(/<span class="json-token-[^"]+">|<\/span>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

  assert.equal(plainText, source);
});

test("a trailing newline keeps the empty final editor line in the highlight layer", () => {
  assert.equal(highlightJson("{}\n"), '<span class="json-token-punctuation">{</span><span class="json-token-punctuation">}</span>\n');
});

test("large JSON switches to plain text instead of retokenizing the full dataset on each edit", () => {
  assert.equal(shouldHighlightJson("x".repeat(MAX_JSON_HIGHLIGHT_LENGTH)), true);
  assert.equal(shouldHighlightJson("x".repeat(MAX_JSON_HIGHLIGHT_LENGTH + 1)), false);
});
