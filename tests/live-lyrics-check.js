"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

global.window = {
  MineradioOriginal: {},
  performance,
  fetch,
  localStorage: null
};

require(path.resolve(__dirname, "..", "wallpaper", "js", "lyrics-engine.js"));

(async function run() {
  const NS = window.MineradioOriginal;
  const service = new NS.LyricsService({ cache: new NS.LyricsCache(null), timeoutMs: 12000 });
  const cases = [
    { media: { title: "Die For You", artist: "The Weeknd", album: "Starboy", duration: 260 }, minLines: 40 },
    { media: { title: "Somebody To You", artist: "The Vamps", album: "Somebody To You EP", duration: 183.051 }, minLines: 30, id: "28845022" }
  ];
  for (const item of cases) {
    const result = await service.lookup(item.media, true);
    assert.equal(result.status, "ready");
    assert.equal(result.synced, true);
    assert.ok(result.lines.length >= item.minLines);
    assert.ok(result.lines[0].text.length > 3);
    if (item.id) assert.equal(String(result.match.id), item.id);
    console.log(`${item.media.title}: ${result.provider}, id ${result.match.id}, ${result.lines.length} lines, score ${result.score.toFixed(3)}, ${result.elapsedMs} ms`);
  }
}()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
