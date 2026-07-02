"use strict";

const fs = require("fs");
const path = require("path");

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error("Usage: node tests/extract-operation-log.js <leveldb file-or-directory> [...]");
  process.exit(2);
}

function filesUnder(input) {
  const stat = fs.statSync(input);
  if (stat.isFile()) return [input];
  return fs.readdirSync(input)
    .filter((name) => /\.(?:log|ldb)$/i.test(name))
    .map((name) => path.join(input, name));
}

function jsonArrays(text) {
  const found = [];
  let offset = 0;
  while ((offset = text.indexOf('[{"at":"', offset)) >= 0) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let i = offset; i < text.length; i += 1) {
      const ch = text[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') quoted = false;
        continue;
      }
      if (ch === '"') quoted = true;
      else if (ch === "[" || ch === "{") depth += 1;
      else if (ch === "]" || ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = text.slice(offset, i + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (Array.isArray(parsed)) found.push(parsed);
          } catch (_) {}
          offset = i + 1;
          break;
        }
      }
    }
    offset += 1;
  }
  return found;
}

let candidates = [];
for (const input of inputs) {
  for (const file of filesUnder(input)) {
    const data = fs.readFileSync(file);
    const texts = [data.toString("utf8"), data.toString("utf16le")];
    if (data.length > 1) texts.push(data.subarray(1).toString("utf16le"));
    for (const text of texts) candidates = candidates.concat(jsonArrays(text));
  }
}

if (!candidates.length) {
  console.error("No complete Mineradio operation-log JSON value found.");
  process.exit(1);
}

candidates.sort((a, b) => {
  const aTime = Date.parse(a.length && a[a.length - 1].at || 0) || 0;
  const bTime = Date.parse(b.length && b[b.length - 1].at || 0) || 0;
  return bTime - aTime || b.length - a.length;
});

process.stdout.write(JSON.stringify(candidates[0], null, 2) + "\n");
