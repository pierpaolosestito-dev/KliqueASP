export const MAX_JSON_HIGHLIGHT_LENGTH = 300_000;

export function shouldHighlightJson(source: string): boolean {
  return source.length <= MAX_JSON_HIGHLIGHT_LENGTH;
}

const JSON_NUMBER_PATTERN = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

/**
 * Produces escaped, tokenized HTML for the visual layer behind the JSON
 * textarea. It intentionally tokenizes incomplete input so highlighting does
 * not disappear while the user is editing invalid JSON.
 */
export function highlightJson(source: string): string {
  const htmlEscape = (value: string) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const token = (name: string, value: string) =>
    `<span class="json-token-${name}">${htmlEscape(value)}</span>`;

  let output = "";
  let index = 0;

  while (index < source.length) {
    const character = source[index];

    if (/\s/.test(character)) {
      output += character;
      index += 1;
      continue;
    }

    if (character === '"') {
      const start = index;
      index += 1;
      let closed = false;
      while (index < source.length) {
        if (source[index] === "\\") {
          index += 2;
          continue;
        }
        if (source[index] === '"') {
          index += 1;
          closed = true;
          break;
        }
        index += 1;
      }

      const value = source.slice(start, Math.min(index, source.length));
      let lookahead = index;
      while (lookahead < source.length && /\s/.test(source[lookahead])) lookahead += 1;
      const isKey = closed && source[lookahead] === ":";
      output += token(isKey ? "key" : "string", value);
      continue;
    }

    if ("{}[]:,".includes(character)) {
      output += token("punctuation", character);
      index += 1;
      continue;
    }

    JSON_NUMBER_PATTERN.lastIndex = index;
    const number = JSON_NUMBER_PATTERN.exec(source);
    if (number) {
      output += token("number", number[0]);
      index += number[0].length;
      continue;
    }

    const literal = ["true", "false", "null"].find((candidate) => {
      if (!source.startsWith(candidate, index)) return false;
      const before = source[index - 1] ?? "";
      const after = source[index + candidate.length] ?? "";
      return !/[\w$]/.test(before) && !/[\w$]/.test(after);
    });
    if (literal) {
      output += token("literal", literal);
      index += literal.length;
      continue;
    }

    output += htmlEscape(character);
    index += 1;
  }

  return output;
}
