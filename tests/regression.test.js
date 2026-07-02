"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "wallpaper");
let nowMs = 1000;
const registered = {};
const cssValues = {};
const storageValues = new Map();

class FakeImage {
  constructor() {
    this.complete = true;
    this.width = 512;
    this.height = 512;
    this.naturalWidth = 512;
    this.naturalHeight = 512;
    this.onload = null;
    this.onerror = null;
    this._src = "";
  }
  set src(value) {
    this._src = value;
    if (value && this.onload) this.onload();
  }
  get src() { return this._src; }
}

const documentStub = {
  documentElement: { style: { setProperty(name, value) { cssValues[name] = value; } } }
};
const windowStub = {
  MineradioOriginal: {},
  performance: { now: () => nowMs },
  localStorage: {
    getItem(key) { return storageValues.has(key) ? storageValues.get(key) : null; },
    setItem(key, value) { storageValues.set(key, String(value)); },
    removeItem(key) { storageValues.delete(key); }
  },
  wallpaperMediaIntegration: { PLAYBACK_PLAYING: 1, PLAYBACK_PAUSED: 2, PLAYBACK_STOPPED: 3 },
  wallpaperRegisterAudioListener(callback) { registered.audio = callback; },
  wallpaperRegisterMediaPropertiesListener(callback) { registered.properties = callback; },
  wallpaperRegisterMediaThumbnailListener(callback) { registered.thumbnail = callback; },
  wallpaperRegisterMediaPlaybackListener(callback) { registered.playback = callback; },
  wallpaperRegisterMediaTimelineListener(callback) { registered.timeline = callback; }
};
const context = vm.createContext({
  window: windowStub, document: documentStub, Image: FakeImage, performance: windowStub.performance,
  console, Date, Math, JSON, Object, Array, Number, String, Boolean, RegExp,
  Float32Array, Uint8ClampedArray, isFinite, setTimeout, clearTimeout
});

function load(file) {
  const filename = path.join(root, file);
  vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
}

load("js/properties.js");
load("js/operation-log.js");
load("js/media-history.js");
load("js/lyrics-engine.js");
load("js/audio-reactor.js");
load("js/visual-state.js");
load("js/we-adapter.js");
const NS = windowStub.MineradioOriginal;

function testProjectContract() {
  const project = JSON.parse(fs.readFileSync(path.join(root, "project.json"), "utf8"));
  assert.equal(project.title, "Mineradio Wallpaper 发布版 1.0");
  assert.equal(project.type, "web");
  assert.equal(project.file, "index.html");
  assert.ok(fs.existsSync(path.join(root, project.file)));
  assert.equal(project.general.properties.settingscategory.type, "combo");
  assert.deepEqual(project.general.properties.visualpreset.options.map((item) => item.value), ["classicplane", "emily", "tunnel", "orbit", "void", "vinyl", "galaxy", "skull"]);
  assert.equal(project.general.properties.galaxydensity.type, "slider");
  assert.equal(project.general.properties.voidbackgroundfile.type, "file");
  assert.ok(project.general.properties.visualpreset.condition);
  assert.ok(project.general.properties.settingscategory.options.some((item) => item.value === "lyrics"));
  assert.equal(project.general.properties.lyricsenabled.type, "bool");
  assert.equal(project.general.properties.diagnosticsenabled.value, false);
  assert.equal(project.general.properties.diagnosticsoverlay.value, false);
  assert.equal(project.general.properties.diagnosticsexport.value, false);
  assert.equal(project.general.properties.lyricsfallback.type, "combo");
  assert.equal(project.general.properties.cameratargety.value, 0.38);
  assert.equal(project.general.properties.camerapitchbias.value, -8);
  assert.equal(project.general.properties.lyricsoffsetx.condition.includes("settingscategory.value == 'lyrics'"), true);
}

function testRuntimePackageContract() {
  const projectText = fs.readFileSync(path.join(root, "project.json"), "utf8");
  const project = JSON.parse(projectText);
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const localReferences = Array.from(index.matchAll(/(?:src|href)="([^"]+)"/g), (match) => match[1]);
  localReferences.forEach((reference) => assert.ok(fs.existsSync(path.join(root, reference)), `missing runtime reference: ${reference}`));
  assert.ok(fs.existsSync(path.join(root, project.preview)), `missing preview: ${project.preview}`);

  const indexedScripts = localReferences.filter((reference) => reference.startsWith("js/")).sort();
  const runtimeScripts = fs.readdirSync(path.join(root, "js")).filter((file) => file.endsWith(".js")).map((file) => `js/${file}`).sort();
  assert.deepEqual(indexedScripts, runtimeScripts, "every runtime module must be loaded exactly once by index.html");

  const sourceFiles = ["index.html", "project.json"]
    .concat(fs.readdirSync(path.join(root, "js")).map((file) => `js/${file}`))
    .concat(fs.readdirSync(path.join(root, "css")).map((file) => `css/${file}`));
  const sourceText = sourceFiles.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  fs.readdirSync(path.join(root, "assets")).forEach((asset) => {
    const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(sourceText, new RegExp(`assets/${escaped}`), `unreferenced asset: ${asset}`);
  });

  const propertySource = fs.readFileSync(path.join(root, "js", "properties.js"), "utf8").toLowerCase();
  Object.keys(project.general.properties).filter((key) => key !== "settingscategory").forEach((key) => {
    assert.ok(propertySource.includes(key.toLowerCase()), `project property is not normalized: ${key}`);
  });
  const propertyConsumers = ["main.js", "visual-core.js", "lyrics-visual.js", "visual-state.js"]
    .map((file) => fs.readFileSync(path.join(root, "js", file), "utf8")).join("\n");
  Object.keys(NS.PropertyDefaults).forEach((key) => {
    assert.match(propertyConsumers, new RegExp(`\\b${key}\\b`), `normalized property is not consumed: ${key}`);
  });

  function filesUnder(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(target) : [target];
    });
  }
  const packageBytes = filesUnder(root).reduce((total, file) => total + fs.statSync(file).size, 0);
  assert.ok(packageBytes < 5 * 1024 * 1024, `wallpaper package exceeds 5 MiB budget: ${packageBytes}`);
  const startupFiles = Array.from(new Set(["index.html", "project.json", "assets/fallback-cover.svg"].concat(localReferences)));
  const startupBytes = startupFiles.reduce((total, file) => total + fs.statSync(path.join(root, file)).size, 0);
  assert.ok(startupBytes < 1.2 * 1024 * 1024, `default startup payload exceeds 1.2 MiB budget: ${startupBytes}`);
}

function testProperties() {
  let latest;
  NS.PropertyStore.subscribe((value) => { latest = value; });
  assert.equal(latest.diagnosticsEnabled, false);
  windowStub.wallpaperPropertyListener.applyUserProperties({
    visualpreset: { value: "classicplane" }, intensity: { value: 9 }, coverresolution: { value: 0.1 },
    visualtintcolor: { value: "1 0.5 0" }, backgroundcolormode: { value: "cover" },
    galaxydensity: { value: 9 }, galaxydepth: { value: 0.1 }, voidbackgroundmode: { value: "video" },
    voidbackgroundfile: { value: "assets/bg.mp4" }, voidbackgroundopacity: { value: 2 }, voidbackgroundblur: { value: 99 },
    shelf: { value: "stage" }, shelfangle: { value: -99 }, cameradistance: { value: 99 },
    cameratargetx: { value: 9 }, cameratargety: { value: -9 }, cameratargetz: { value: 9 }, camerapitchbias: { value: 99 },
    lyricsenabled: { value: true }, lyricsfallback: { value: "static" }, lyricoffset: { value: 99 },
    lyricscale: { value: 9 }, lyricsoffsetx: { value: -9 }, lyricstiltx: { value: 99 },
    lyricsfont: { value: "gothic" }, lyricsweight: { value: 200 }, lyricsletterspacing: { value: 2 },
    lyricslineheight: { value: 9 },
    lyricsglowstrength: { value: 9 }, lyricshighlightcolor: { value: "1 0.5 0" },
    lyricsglowlinked: { value: false }, lyricsglowcolor: { value: "0 0.5 1" },
    diagnosticsenabled: { value: true }, diagnosticsoverlay: { value: true }, diagnosticsexport: { value: true }
  });
  assert.equal(latest.presetIndex, 7);
  assert.equal(latest.intensity, 1.6);
  assert.equal(latest.coverResolution, 0.75);
  assert.equal(latest.visualTintColor, "#ff8000");
  assert.equal(latest.backgroundColorMode, "cover");
  assert.equal(latest.galaxyDensity, 2.2);
  assert.equal(latest.galaxyDepth, 0.7);
  assert.equal(latest.voidBackgroundMode, "video");
  assert.equal(latest.voidBackgroundFile, "assets/bg.mp4");
  assert.equal(latest.voidBackgroundOpacity, 1);
  assert.equal(latest.voidBackgroundBlur, 24);
  assert.equal(latest.shelf, "stage");
  assert.equal(latest.shelfAngleY, -30);
  assert.equal(latest.cameraDistance, 13);
  assert.equal(latest.cameraTargetX, 3);
  assert.equal(latest.cameraTargetY, -2);
  assert.equal(latest.cameraTargetZ, 3);
  assert.equal(latest.cameraPitchBias, 28);
  assert.equal(latest.lyricsFallback, "static");
  assert.equal(latest.lyricOffset, 5);
  assert.equal(latest.lyricScale, 1.65);
  assert.equal(latest.lyricOffsetX, -2);
  assert.equal(latest.lyricTiltX, 42);
  assert.equal(latest.lyricFont, "gothic");
  assert.equal(latest.lyricWeight, 500);
  assert.equal(latest.lyricLetterSpacing, 0.18);
  assert.equal(latest.lyricLineHeight, 1.35);
  assert.equal(latest.lyricGlowStrength, 0.85);
  assert.equal(latest.lyricGlowLinked, false);
  assert.equal(latest.lyricGlowColor, "#0080ff");
  assert.equal(latest.diagnosticsEnabled, true);
  assert.equal(latest.diagnosticsOverlay, true);
  assert.equal(latest.diagnosticsExport, true);
  assert.equal(latest.lyricHighlightColor, "#ff8000");
  windowStub.wallpaperPropertyListener.applyUserProperties({ visualpreset: { value: "skull" } });
  assert.equal(latest.presetIndex, 6);
}

function testOperationLog() {
  NS.OperationLog.clear();
  NS.OperationLog.add("test.disabled", {});
  assert.equal(NS.OperationLog.snapshot().length, 0);
  NS.OperationLog.configure({ enabled: true, overlay: false });
  NS.OperationLog.add("test.event", { value: 1, text: "hello" });
  const enabledCount = NS.OperationLog.snapshot().length;
  assert.ok(enabledCount >= 1);
  assert.equal(NS.OperationLog.enabled(), true);
  assert.match(NS.OperationLog.exportText(), /test\.event/);
  assert.match(storageValues.get("mineradio.we.operationLog.v1"), /test\.event/);
  NS.OperationLog.configure({ enabled: false, overlay: false });
  NS.OperationLog.add("test.ignored", {});
  assert.equal(NS.OperationLog.snapshot().length, enabledCount);
  assert.equal(NS.OperationLog.enabled(), false);
  NS.OperationLog.setStatusProvider(() => ({ label: "ready", mode: "test", action: "none" }));
  NS.OperationLog.configure({ enabled: true, overlay: false });
}

function testAdapterAndHistory() {
  assert.deepEqual(Object.keys(registered).sort(), ["audio", "playback", "properties", "thumbnail", "timeline"]);
  registered.properties({ title: "Buffered Track", artist: "Buffered Artist" });
  registered.timeline({ position: 12, duration: 90 });
  let replayedProperties = null;
  let replayedTimeline = null;
  NS.WallpaperAdapter.on("mediaProperties", (event) => { replayedProperties = event; });
  NS.WallpaperAdapter.on("mediaTimeline", (event) => { replayedTimeline = event; });
  assert.equal(replayedProperties.title, "Buffered Track");
  assert.equal(Number(replayedTimeline.position), 12);
  let state = "";
  NS.WallpaperAdapter.on("mediaPlayback", (event) => { state = event.state; });
  registered.playback({ state: 1 });
  assert.equal(state, "playing");
  let timelineEvent = null;
  NS.WallpaperAdapter.on("mediaTimeline", (event) => { timelineEvent = event; });
  registered.timeline(42, 120, "playing");
  assert.equal(Number(timelineEvent.position), 42);
  assert.equal(Number(timelineEvent.duration), 120);
  assert.equal(timelineEvent.state, "playing");
  registered.timeline({ position: 9 }, 99);
  assert.equal(Number(timelineEvent.position), 9);
  assert.equal(Number(timelineEvent.duration), 99);

  const officialTimeline = new NS.MediaHistory(4);
  officialTimeline.applyProperties({ title: "Somebody To You", artist: "The Vamps", genres: "Pop,NCM-28845022" });
  assert.equal(officialTimeline.current.neteaseId, "28845022");
  assert.equal(officialTimeline.enhancementStatus().mode, "netease-id-only");
  officialTimeline.applyTimeline({ position: 0, duration: 0 });
  assert.equal(officialTimeline.current.timelineAvailable, false);
  assert.equal(officialTimeline.current.timelineIssue, "zero-zero");
  assert.equal(officialTimeline.enhancementStatus().mode, "netease-zero-zero");
  officialTimeline.applyTimeline({ position: 0, duration: 183.051 });
  assert.equal(officialTimeline.current.timelineAvailable, true);
  assert.equal(officialTimeline.current.timelineIssue, "");
  assert.equal(officialTimeline.enhancementStatus().mode, "netease-enhanced");
  assert.equal(officialTimeline.enhancementStatus().enabled, true);

  const media = new NS.MediaHistory(4);
  media.applyProperties({ title: " Track One ", artist: " Artist " });
  media.applyThumbnail({ thumbnail: "cover-a.png", primaryColor: "1 0 0" });
  media.applyProperties({ title: "Track Two", artist: "Artist" });
  media.applyThumbnail({ thumbnail: "cover-b.png" });
  assert.equal(media.items.length, 2);
  assert.equal(media.items[0].title, "Track Two");
  assert.equal(media.items[0].thumbnail, "cover-b.png");
  assert.equal(media.items[1].thumbnail, "cover-a.png");
  media.applyTimeline({ position: 12, duration: 120 });
  media.applyPlayback({ state: "playing" });
  nowMs += 1000;
  assert.ok(media.progress() > 0.10 && media.progress() < 0.12);
  media.applyTimeline({ currentPosition: 90000, duration: 180000 });
  assert.ok(media.positionSeconds() >= 90 && media.positionSeconds() < 91);
  media.applyTimeline({ currentTime: 20, totalDuration: 100, extrapolate: false });
  nowMs += 1000;
  assert.equal(media.positionSeconds(), 20);
  const seekBefore = media.current.seekRevision;
  media.applyTimeline({ position: 82, duration: 100 });
  assert.equal(media.current.seekRevision, seekBefore + 1);
  assert.equal(media.current.lastSeekTo, 82);
  media.applyTimeline({ position: 7, duration: 100 });
  assert.equal(media.current.seekRevision, seekBefore + 2);
  assert.equal(media.positionSeconds(), 7);
  media.applyTimeline({ progress: 50, duration: 100 });
  assert.equal(media.current.position, 50);

  const jitterMedia = new NS.MediaHistory(4);
  jitterMedia.applyProperties({ title: "Jitter Track", artist: "Artist" });
  jitterMedia.applyPlayback({ state: "playing" });
  jitterMedia.applyTimeline({ position: 30, duration: 180 });
  const jitterRevision = jitterMedia.current.seekRevision;
  nowMs += 1000;
  jitterMedia.applyTimeline({ position: 29, duration: 180 });
  assert.equal(jitterMedia.current.seekRevision, jitterRevision);
  jitterMedia.applyTimeline({ position: 90, duration: 180 });
  assert.equal(jitterMedia.current.seekRevision, jitterRevision + 1);

  const tickMedia = new NS.MediaHistory(4);
  tickMedia.applyProperties({ title: "Tick Track", artist: "Artist" });
  tickMedia.applyPlayback({ state: "playing" });
  tickMedia.applyTimeline({ position: 1965200000, duration: 2186530000 });
  assert.ok(Math.abs(tickMedia.current.position - 196.52) < 0.001);
  assert.ok(Math.abs(tickMedia.current.duration - 218.653) < 0.001);
  const tickSeekBefore = tickMedia.current.seekRevision;
  tickMedia.applyTimeline({ position: 0, duration: 0 });
  assert.equal(tickMedia.current.timelineAvailable, true);
  assert.equal(tickMedia.current.seekRevision, tickSeekBefore);
  assert.ok(tickMedia.positionSeconds() >= 196.52);

  const nestedMedia = new NS.MediaHistory(4);
  nestedMedia.applyProperties({ title: "Nested Track", artist: "Artist" });
  nestedMedia.applyTimeline({ timeline: { currentTime: 90000, totalDuration: 180000 } });
  assert.ok(Math.abs(nestedMedia.current.position - 90) < 0.001);
  assert.ok(Math.abs(nestedMedia.current.duration - 180) < 0.001);
  nestedMedia.applyTimeline({ Timeline: { PositionSeconds: 45, EndSeconds: 180 }, State: "playing" });
  assert.equal(nestedMedia.current.playbackState, "playing");
  assert.ok(Math.abs(nestedMedia.current.position - 45) < 0.001);

  const propertyTimeline = new NS.MediaHistory(4);
  propertyTimeline.applyProperties({ title: "Property Track", artist: "Artist", position: 48, duration: 180 });
  assert.ok(Math.abs(propertyTimeline.current.position - 48) < 0.001);
  assert.ok(Math.abs(propertyTimeline.current.duration - 180) < 0.001);
  const propertySeekRevision = propertyTimeline.current.seekRevision;
  propertyTimeline.applyProperties({ title: "Property Track", artist: "Artist", position: 112, duration: 180 });
  assert.equal(propertyTimeline.current.seekRevision, propertySeekRevision + 1);

  const playbackTimeline = new NS.MediaHistory(4);
  playbackTimeline.applyProperties({ title: "Playback Track", artist: "Artist" });
  playbackTimeline.applyPlayback({ state: "playing", raw: { position: 72, duration: 180 } });
  assert.equal(playbackTimeline.current.playbackState, "playing");
  assert.ok(Math.abs(playbackTimeline.current.position - 72) < 0.001);

  const metadataOnly = new NS.MediaHistory(4);
  metadataOnly.applyProperties({ title: "Plain Track", artist: "Artist", genres: "Pop,Electronic" });
  assert.equal(metadataOnly.current.timelineAvailable, false);
  assert.equal(metadataOnly.current.position, 0);
  assert.equal(metadataOnly.enhancementStatus().mode, "metadata-only");
}

function testAdapterDelayedRegistration() {
  const delayedRegistered = {};
  const timers = [];
  const delayedWindow = {
    MineradioOriginal: { OperationLog: { add() {} } },
    wallpaperMediaIntegration: { PLAYBACK_PLAYING: 1, PLAYBACK_PAUSED: 2, PLAYBACK_STOPPED: 3 },
    addEventListener(_name, callback) { timers.push(callback); }
  };
  const delayedDocument = { addEventListener(_name, callback) { timers.push(callback); } };
  const delayedContext = vm.createContext({
    window: delayedWindow,
    document: delayedDocument,
    console,
    Date,
    Math,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    isFinite,
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {}
  });
  vm.runInContext(fs.readFileSync(path.join(root, "js", "we-adapter.js"), "utf8"), delayedContext, { filename: "we-adapter-delayed.js" });
  assert.equal(Object.keys(delayedRegistered).length, 0);
  delayedWindow.wallpaperRegisterAudioListener = (callback) => { delayedRegistered.audio = callback; };
  delayedWindow.wallpaperRegisterMediaPropertiesListener = (callback) => { delayedRegistered.properties = callback; };
  delayedWindow.wallpaperRegisterMediaThumbnailListener = (callback) => { delayedRegistered.thumbnail = callback; };
  delayedWindow.wallpaperRegisterMediaPlaybackListener = (callback) => { delayedRegistered.playback = callback; };
  delayedWindow.wallpaperRegisterMediaTimelineListener = (callback) => { delayedRegistered.timeline = callback; };
  while (timers.length && Object.keys(delayedRegistered).length < 5) timers.shift()();
  assert.deepEqual(Object.keys(delayedRegistered).sort(), ["audio", "playback", "properties", "thumbnail", "timeline"]);
  delayedRegistered.properties({ title: "Late Track" });
  let replayed = null;
  delayedWindow.MineradioOriginal.WallpaperAdapter.on("mediaProperties", (event) => { replayed = event; });
  assert.equal(replayed.title, "Late Track");
}

function testAudioInputLatency() {
  const audio = new NS.AudioReactor();
  const transient = new Array(128).fill(0.02).map((value, index) => index % 64 < 8 ? 0.94 : value);
  nowMs += 1000 / 60;
  audio.update(transient);
  const first = audio.tick();
  assert.ok(audio.rawSample[1] > audio.sample[1] + 0.10);
  assert.ok(first.smoothBass > 0.10);
  ["smoothBass", "smoothMid", "smoothTreb", "smoothEnergy", "beat"].forEach((key) => assert.ok(Number.isFinite(first[key]), key));
  nowMs += 1000 / 60;
  const second = audio.tick();
  assert.strictEqual(second, first, "render frames should reuse the audio frame object");
  assert.notStrictEqual(audio.snapshot(), second, "public snapshots must remain stable copies");
}

function testVisualSourceBoundaries() {
  const source = fs.readFileSync(path.join(root, "js", "visual-core.js"), "utf8");
  const lyricVisual = fs.readFileSync(path.join(root, "js", "lyrics-visual.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "js", "main.js"), "utf8");
  const visualState = fs.readFileSync(path.join(root, "js", "visual-state.js"), "utf8");
  const mediaHistory = fs.readFileSync(path.join(root, "js", "media-history.js"), "utf8");
  const lyricsEngine = fs.readFileSync(path.join(root, "js", "lyrics-engine.js"), "utf8");
  const audioReactor = fs.readFileSync(path.join(root, "js", "audio-reactor.js"), "utf8");
  assert.match(source, /uPreset<1\.5/);
  assert.match(source, /uPreset<2\.5/);
  assert.match(source, /uPreset<3\.5/);
  assert.match(source, /uPreset<4\.5/);
  assert.match(source, /uPreset<5\.5/);
  assert.match(source, /uPreset<6\.5/);
  assert.match(source, /uPreset>6\.5/);
  assert.match(source, /skull-decimation-points\.bin/);
  assert.match(source, /skullLoading/);
  assert.match(source, /active && !this\.skullGroup/);
  assert.doesNotMatch(source, /createShelf\(\);\s*this\.loadSkullLayer\(\);/);
  assert.match(source, /setHistory/);
  assert.match(source, /setFpsLimit/);
  assert.match(source, /this\.cameraAudio/);
  assert.doesNotMatch(source, /var view = this\.visual\.snapshot\(\)/);
  assert.match(source, /autoBlend/);
  assert.match(source, /cameraTarget/);
  assert.match(source, /cameraPitchBias/);
  assert.match(main, /new NS\.LyricsEngine\(media\)/);
  assert.match(main, /new NS\.LyricsVisual\(stage, lyrics, visual\)/);
  assert.match(main, /timelineIgnored/);
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(index, /js\/operation-log\.js/);
  assert.match(index, /js\/lyrics-engine\.js/);
  assert.match(index, /js\/lyrics-visual\.js/);
  assert.match(source, /lyricsVisual\.update\(time, dt, audio, props\)/);
  assert.match(lyricVisual, /MASK_WIDTH = 2048/);
  assert.match(lyricVisual, /SPARK_COUNT = 132/);
  assert.match(lyricVisual, /RIVER_COUNT = 420/);
  assert.match(lyricVisual, /uProgress/);
  assert.match(lyricVisual, /createRiver/);
  assert.match(lyricVisual, /this\.slots = \[createSlot\(this, 0\), createSlot\(this, 1\)\]/);
  assert.match(lyricVisual, /mouthLocal = new THREE\.Vector3\(0\.025, -0\.72, 0\.62\)/);
  assert.match(lyricVisual, /props\.lyricSafeArea/);
  assert.match(lyricVisual, /props\.lyricCameraLock/);
  assert.match(lyricVisual, /this\.paletteCache/);
  assert.match(lyricVisual, /operationLogEnabled\(\)/);
  assert.match(audioReactor, /AudioReactor\.prototype\.frameSnapshot/);
  assert.match(mediaHistory, /media\.seek/);
  assert.match(lyricsEngine, /lyrics\.result/);
  assert.match(lyricVisual, /lyrics\.line/);
  ["intensity", "cinemaShake", "depth", "coverResolution", "point", "speed", "twist", "colorBoost", "scatter", "galaxyDensity", "galaxyDepth", "bgFade", "bloomStrength", "floatLayer", "cinema", "edge", "aiDepth", "bloom", "backCover", "shelf", "shelfCameraMode", "shelfPresence", "shelfSize", "shelfOffsetX", "shelfOffsetY", "shelfOffsetZ", "shelfAngleY", "shelfOpacity", "shelfBgOpacity", "shelfAccentColor", "performanceQuality", "cameraDistance", "cameraTargetX", "cameraTargetY", "cameraTargetZ", "cameraPitchBias", "cameraSensitivity", "cameraInertia", "adaptiveIdle"].forEach((property) => {
    assert.match(source, new RegExp("\\b" + property + "\\b"), property + " must be consumed by visual-core.js");
  });
  ["backgroundColorMode", "backgroundColor", "backgroundOpacity", "voidBackgroundMode", "voidBackgroundFile", "voidBackgroundOpacity", "voidBackgroundBlur"].forEach((property) => assert.match(main, new RegExp("\\b" + property + "\\b")));
  ["diagnosticsEnabled", "diagnosticsOverlay", "diagnosticsExport"].forEach((property) => assert.match(main, new RegExp("\\b" + property + "\\b")));
  assert.match(main, /publishDiagnosticsTitle/);
  assert.match(main, /enhancementStatus/);
  assert.match(mediaHistory, /enhancementStatusFromCurrent/);
  assert.match(fs.readFileSync(path.join(root, "js", "operation-log.js"), "utf8"), /setStatusProvider/);
  ["lyricsEnabled", "lyricsFallback", "lyricOffset", "lyricScale", "lyricOffsetX", "lyricOffsetY", "lyricOffsetZ", "lyricTiltX", "lyricTiltY", "lyricCameraLock", "lyricFont", "lyricWeight", "lyricLetterSpacing", "lyricLineHeight", "lyricColorMode", "lyricColor", "lyricHighlightMode", "lyricHighlightColor", "lyricGlow", "lyricGlowStrength", "lyricGlowLinked", "lyricGlowColor", "lyricGlowBeat", "lyricGlowParticles", "lyricSafeArea"].forEach((property) => {
    assert.match(lyricVisual + main, new RegExp("\\b" + property + "\\b"), property + " must be consumed by lyrics modules");
  });
  assert.match(main, /wallpaperFileUrl/);
  assert.match(main, /--wallpaper-background-layer/);
  assert.match(source, /skullShelfMix/);
  ["visualTintMode", "visualTintColor"].forEach((property) => assert.match(visualState + source, new RegExp("\\b" + property + "\\b")));
  assert.ok(fs.statSync(path.join(root, "assets", "skull-decimation-points.bin")).size > 1000000);
}

function testVisualPalette() {
  const visual = new NS.VisualState();
  visual.setProperties({ visualTintMode: "auto", visualTintColor: "#9db8cf" });
  visual.updatePalette({ current: { primaryColor: "1 0 0", secondaryColor: "0 1 0", tertiaryColor: "0 0 1" } });
  assert.ok(visual.palette.accent.r > visual.palette.accent.g);
  assert.match(cssValues["--accent"], /^rgb\(/);
}

function testLyricsCore() {
  const lines = NS.LyricsTools.parseLrc("[offset:100]\n[00:01.00]First line\n[00:04.50][00:06.00]Second line", 12);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].t, 1.1);
  assert.ok(Math.abs(lines[0].duration - 3.5) < 0.0001);
  assert.ok(NS.LyricsTools.textSimilarity("Die For You (Official Audio)", "Die For You") > 0.95);
  const scored = NS.LyricsTools.scoreCandidate(
    { title: "Die For You", artist: "The Weeknd", album: "Starboy", duration: 260 },
    { trackName: "Die For You", artistName: "The Weeknd", albumName: "Starboy", duration: 260 }
  );
  assert.ok(scored.score > 0.98);
  const inferred = NS.LyricsTools.queryFromMedia({ title: "The Weeknd - Die For You", artist: "" });
  assert.equal(inferred.artist, "The Weeknd");
  assert.equal(inferred.title, "Die For You");
  assert.equal(NS.LyricsTools.queryFromMedia({ title: "Track", neteaseId: "28845022" }).neteaseId, "28845022");

  const media = new NS.MediaHistory(4);
  media.applyProperties({ title: "Track", artist: "Artist" });
  media.applyTimeline({ position: 1, duration: 10 });
  media.applyPlayback({ state: "playing" });
  const engine = new NS.LyricsEngine(media, { cache: new NS.LyricsCache(null) });
  engine.usePreview();
  let lyricNotifies = 0;
  engine.subscribe(() => { lyricNotifies += 1; });
  media.applyTimeline({ position: 8, duration: 30 });
  engine.handleMedia("timeline");
  const state = engine.snapshot();
  assert.equal(state.status, "ready");
  assert.ok(state.currentIndex >= 0);
  assert.ok(state.progress >= 0 && state.progress <= 1);
  assert.equal(state.currentIndex, 1);
  const beforeSeekNotify = lyricNotifies;
  media.applyTimeline({ position: 24, duration: 30 });
  engine.handleMedia("seek");
  assert.equal(engine.snapshot().currentIndex, 3);
  assert.ok(lyricNotifies > beforeSeekNotify);
  media.applyTimeline({ position: 2, duration: 30 });
  engine.handleMedia("seek");
  assert.equal(engine.snapshot().currentIndex, 0);
  media.applyPlayback({ state: "paused" });
  engine.handleMedia("playback");
  assert.ok(Math.abs(engine.position() - media.positionSeconds()) < 0.001);

  const integratedMedia = new NS.MediaHistory(4);
  integratedMedia.applyProperties({ title: "Integrated Track", artist: "Artist" });
  const integratedEngine = new NS.LyricsEngine(integratedMedia, { cache: new NS.LyricsCache(null) });
  integratedEngine.usePreview();
  integratedMedia.subscribe((type) => integratedEngine.handleMedia(type));
  integratedMedia.applyPlayback({ state: "playing" });
  integratedMedia.applyTimeline({ position: 2, duration: 30 });
  assert.equal(integratedEngine.snapshot().currentIndex, 0);
  const integratedSeekBefore = integratedMedia.current.seekRevision;
  integratedMedia.applyTimeline({ position: 24, duration: 30 });
  assert.equal(integratedMedia.current.seekRevision, integratedSeekBefore + 1);
  assert.equal(integratedEngine.snapshot().currentIndex, 3);
  integratedMedia.applyTimeline({ position: 2, duration: 30 });
  assert.equal(integratedEngine.snapshot().currentIndex, 0);

  const immediateMedia = new NS.MediaHistory(4);
  const immediateEngine = new NS.LyricsEngine(immediateMedia, { cache: new NS.LyricsCache(null) });
  let immediateLoads = 0;
  immediateEngine.loadCurrent = function () { immediateLoads += 1; return Promise.resolve(); };
  immediateMedia.subscribe((type) => immediateEngine.handleMedia(type));
  immediateMedia.applyProperties({ title: "Immediate Track", artist: "Artist", genres: "NCM-28845022" });
  assert.equal(immediateLoads, 1);

  const noTimeline = new NS.MediaHistory(4);
  noTimeline.applyProperties({ title: "Track", artist: "Artist" });
  const fallbackEngine = new NS.LyricsEngine(noTimeline, { cache: new NS.LyricsCache(null) });
  fallbackEngine.usePreview();
  fallbackEngine.setOptions({ enabled: true, fallbackMode: "static", offset: 0 });
  assert.equal(fallbackEngine.snapshot().currentIndex, 0);
  fallbackEngine.setOptions({ enabled: true, fallbackMode: "hide", offset: 0 });
  assert.equal(fallbackEngine.snapshot().currentIndex, -1);

  const fallbackMedia = new NS.MediaHistory(4);
  fallbackMedia.applyProperties({ title: "Fallback Track", artist: "Artist" });
  fallbackMedia.applyPlayback({ state: "playing" });
  const fallbackClock = new NS.LyricsEngine(fallbackMedia, { cache: new NS.LyricsCache(null) });
  fallbackClock.usePreview();
  fallbackClock.setOptions({ enabled: true, fallbackMode: "estimated", offset: 0 });
  fallbackClock.handleMedia("playback");
  nowMs += 12000;
  assert.equal(fallbackClock.snapshot().currentIndex, 1);

  const sparseTimeline = new NS.MediaHistory(4);
  sparseTimeline.applyProperties({ title: "Sparse Timeline", artist: "Artist" });
  sparseTimeline.applyPlayback({ state: "playing" });
  sparseTimeline.applyTimeline({ position: 8, duration: 30, state: "playing" });
  const sparseEngine = new NS.LyricsEngine(sparseTimeline, { cache: new NS.LyricsCache(null) });
  sparseEngine.usePreview();
  nowMs += 12000;
  assert.equal(sparseEngine.timelineFresh(), true);
  assert.equal(sparseEngine.snapshot().currentIndex, 2);
}

async function testLyricsLookupAndCache() {
  let calls = 0;
  const fetchMock = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          id: 42, trackName: "Track", artistName: "Artist", albumName: "Album", duration: 20,
          instrumental: false, syncedLyrics: "[00:00.00]Alpha\n[00:05.00]Beta", plainLyrics: "Alpha\nBeta"
        };
      }
    };
  };
  const service = new NS.LyricsService({ fetch: fetchMock, cache: new NS.LyricsCache(null), timeoutMs: 2500, netease: false });
  const media = { title: "Track", artist: "Artist", album: "Album", duration: 20 };
  const first = await service.lookup(media);
  const second = await service.lookup(media);
  assert.equal(first.status, "ready");
  assert.equal(first.lines.length, 2);
  assert.equal(first.lines[0].text, "Alpha");
  assert.equal(first.lines[1].text, "Beta");
  assert.equal(second.cached, true);
  assert.equal(calls, 1);

  const staggeredUrls = [];
  const staggeredService = new NS.LyricsService({
    netease: false,
    cache: new NS.LyricsCache(null),
    timeoutMs: 2500,
    searchFallbackDelayMs: 20,
    async fetch(url) {
      staggeredUrls.push(url);
      if (url.includes("/get?")) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        return { ok: true, status: 200, async json() { return { trackName: "Wrong", artistName: "Other", duration: 20, syncedLyrics: "[00:00.00]Wrong" }; } };
      }
      return { ok: true, status: 200, async json() { return [{ trackName: "Track", artistName: "Artist", duration: 20, syncedLyrics: "[00:00.00]Fast" }]; } };
    }
  });
  const staggered = await staggeredService.lookup(media, true);
  assert.equal(staggered.status, "ready");
  assert.equal(staggered.lines[0].text, "Fast");
  assert.equal(staggeredUrls.some((url) => url.includes("/get?")), true);
  assert.equal(staggeredUrls.some((url) => url.includes("/search?")), true);

  const durationService = new NS.LyricsService({
    netease: false,
    cache: new NS.LyricsCache(null),
    async fetch(url) {
      const candidates = [
        { trackName: "Track", artistName: "Artist", duration: 42, syncedLyrics: "[00:00.00]Wrong version" },
        { trackName: "Track", artistName: "Artist", duration: 20, syncedLyrics: "[00:00.00]Right version" }
      ];
      return { ok: true, status: 200, async json() { return url.includes("/get?") ? candidates[0] : candidates; } };
    }
  });
  const durationMatched = await durationService.lookup(media, true);
  assert.equal(durationMatched.lines[0].text, "Right version");

  const durationFallbackService = new NS.LyricsService({
    netease: false,
    cache: new NS.LyricsCache(null),
    searchFallbackDelayMs: 20,
    async fetch(url) {
      const onlyCandidate = { trackName: "Track", artistName: "Artist", duration: 42, syncedLyrics: "[00:00.00]Only version" };
      return { ok: true, status: 200, async json() { return url.includes("/get?") ? onlyCandidate : [onlyCandidate]; } };
    }
  });
  const durationFallback = await durationFallbackService.lookup(media, true);
  assert.equal(durationFallback.status, "ready");
  assert.equal(durationFallback.lines[0].text, "Only version");

  const offlineService = new NS.LyricsService({
    netease: false,
    cache: new NS.LyricsCache(null),
    searchFallbackDelayMs: 20,
    async fetch() { throw new Error("NETWORK_BLOCKED"); }
  });
  const offline = await offlineService.lookup(media, true);
  assert.equal(offline.status, "offline");
  assert.match(offline.error, /NETWORK_BLOCKED/);

  let titleOnlyUrl = "";
  const titleOnlyService = new NS.LyricsService({
    netease: false,
    cache: new NS.LyricsCache(null),
    async fetch(url) {
      titleOnlyUrl = url;
      return { ok: true, status: 200, async json() { return [{ trackName: "Track", artistName: "Artist", duration: 20, syncedLyrics: "[00:00.00]Only" }]; } };
    }
  });
  const titleOnly = await titleOnlyService.lookup({ title: "Track", artist: "", duration: 20 });
  assert.match(titleOnlyUrl, /\/search\?q=Track/);
  assert.equal(titleOnly.status, "ready");

  const neteaseUrls = [];
  const neteaseService = new NS.LyricsService({
    cache: new NS.LyricsCache(null),
    async fetch(url) {
      neteaseUrls.push(url);
      if (url.includes("/api/search/get?")) {
        return { ok: true, status: 200, async json() { return { result: { songs: [{ id: 28845022, name: "Somebody To You", artists: [{ name: "The Vamps" }], album: { name: "Somebody To You EP" }, duration: 183051 }] } }; } };
      }
      if (url.includes("/api/song/lyric?")) {
        return { ok: true, status: 200, async json() { return { lrc: { lyric: "[00:00.06]yeah you yeah you\n[00:07.38]I used to want to be" } }; } };
      }
      throw new Error("unexpected fallback");
    }
  });
  const netease = await neteaseService.lookup({ title: "Somebody To You", artist: "The Vamps", album: "Somebody To You EP", duration: 183.051 }, true);
  assert.equal(netease.status, "ready");
  assert.equal(netease.provider, "netease");
  assert.equal(netease.match.id, "28845022");
  assert.equal(neteaseUrls.length, 2);

  const directUrls = [];
  const directService = new NS.LyricsService({
    cache: new NS.LyricsCache(null),
    async fetch(url) {
      directUrls.push(url);
      return { ok: true, status: 200, async json() { return { lrc: { lyric: "[00:01.00]Direct ID" } }; } };
    }
  });
  const direct = await directService.lookup({ title: "Somebody To You", artist: "The Vamps", duration: 183.051, neteaseId: "28845022" }, true);
  assert.equal(direct.provider, "netease");
  assert.equal(direct.lines[0].text, "Direct ID");
  assert.equal(directUrls.length, 1);
  assert.match(directUrls[0], /id=28845022/);

}

async function testLyricsScheduleCoalescing() {
  const media = new NS.MediaHistory(4);
  media.applyProperties({ title: "Timer Track", artist: "Artist" });
  const engine = new NS.LyricsEngine(media, { cache: new NS.LyricsCache(null) });
  let loads = 0;
  engine.loadCurrent = function () { loads += 1; return Promise.resolve(); };
  engine.scheduleCurrent(25);
  for (let i = 0; i < 20; i += 1) engine.scheduleCurrent(60);
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.equal(loads, 1);
}

(async function run() {
  testProjectContract();
  testRuntimePackageContract();
  testProperties();
  testOperationLog();
  testAdapterAndHistory();
  testAdapterDelayedRegistration();
  testAudioInputLatency();
  testVisualSourceBoundaries();
  testVisualPalette();
  testLyricsCore();
  await testLyricsScheduleCoalescing();
  await testLyricsLookupAndCache();
  console.log("Mineradio 5.1 lyrics regression tests passed");
}()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
