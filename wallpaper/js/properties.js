(function () {
  "use strict";

  var NS = window.MineradioOriginal = window.MineradioOriginal || {};
  var presets = { emily: 0, tunnel: 1, orbit: 2, void: 3, vinyl: 4, galaxy: 5, skull: 6, classicplane: 7 };
  var defaults = {
    preset: "classicplane",
    presetIndex: 7,
    intensity: 0.85,
    cinemaShake: 0.5,
    depth: 1,
    coverResolution: 1.55,
    point: 1,
    speed: 1,
    twist: 0,
    colorBoost: 1.1,
    scatter: 0,
    galaxyDensity: 1.55,
    galaxyDepth: 1.32,
    bgFade: 0.2,
    bloomStrength: 0.62,
    visualTintMode: "auto",
    visualTintColor: "#9db8cf",
    backgroundColorMode: "black",
    backgroundColor: "#000000",
    backgroundOpacity: 1,
    voidBackgroundMode: "black",
    voidBackgroundFile: "",
    voidBackgroundOpacity: 0.82,
    voidBackgroundBlur: 0,
    lyricsEnabled: true,
    lyricsFallback: "estimated",
    lyricOffset: 0,
    lyricScale: 1,
    lyricOffsetX: 0,
    lyricOffsetY: 0,
    lyricOffsetZ: 0,
    lyricTiltX: 0,
    lyricTiltY: 0,
    lyricCameraLock: false,
    lyricFont: "hei",
    lyricWeight: 900,
    lyricLetterSpacing: 0,
    lyricLineHeight: 1,
    lyricColorMode: "auto",
    lyricColor: "#a9b8c8",
    lyricHighlightMode: "auto",
    lyricHighlightColor: "#fac900",
    lyricGlow: true,
    lyricGlowStrength: 0.28,
    lyricGlowLinked: true,
    lyricGlowColor: "#008aff",
    lyricGlowBeat: true,
    lyricGlowParticles: false,
    lyricSafeArea: true,
    floatLayer: false,
    cinema: true,
    edge: false,
    aiDepth: false,
    bloom: false,
    backCover: false,
    shelf: "side",
    shelfCameraMode: "static",
    shelfPresence: "always",
    shelfSize: 0.92,
    shelfOffsetX: 0,
    shelfOffsetY: 0,
    shelfOffsetZ: 0,
    shelfAngleY: -15,
    shelfOpacity: 1,
    shelfBgOpacity: 0.9,
    shelfAccentColor: "#ffffff",
    performanceQuality: "high",
    cameraDistance: 8.6,
    cameraTargetX: 0,
    cameraTargetY: 0.38,
    cameraTargetZ: 0,
    cameraPitchBias: -8,
    cameraSensitivity: 1,
    cameraInertia: true,
    adaptiveIdle: true,
    diagnosticsEnabled: false,
    diagnosticsOverlay: false,
    diagnosticsExport: false
  };

  function clamp(value, min, max) {
    value = Number(value);
    return isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
  }

  function valueOf(properties, key, fallback) {
    if (!properties || !Object.prototype.hasOwnProperty.call(properties, key)) return fallback;
    var item = properties[key];
    return item && Object.prototype.hasOwnProperty.call(item, "value") ? item.value : item;
  }

  function boolOf(properties, key, fallback) {
    var value = valueOf(properties, key, fallback);
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    return !/^(0|false|off|no)$/i.test(String(value).trim());
  }

  function colorOf(value, fallback) {
    if (typeof value !== "string") return fallback;
    var text = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
    var parts = text.split(/\s+/).map(Number);
    if (parts.length < 3 || parts.some(function (part) { return !isFinite(part); })) return fallback;
    return "#" + parts.slice(0, 3).map(function (part) {
      return Math.round(clamp(part, 0, 1) * 255).toString(16).padStart(2, "0");
    }).join("");
  }

  function enumOf(properties, key, fallback, pattern) {
    var value = String(valueOf(properties, key, fallback) || fallback).toLowerCase();
    return pattern.test(value) ? value : fallback;
  }

  function stringOf(properties, key, fallback) {
    var value = valueOf(properties, key, fallback);
    return value == null ? fallback : String(value);
  }

  function normalize(properties, base) {
    base = base || defaults;
    var preset = enumOf(properties, "visualpreset", base.preset, /^(emily|tunnel|orbit|void|vinyl|galaxy|skull|classicplane)$/);
    return {
      preset: preset,
      presetIndex: presets[preset],
      intensity: clamp(valueOf(properties, "intensity", base.intensity), 0.2, 1.6),
      cinemaShake: clamp(valueOf(properties, "cinemashake", base.cinemaShake), 0, 1.8),
      depth: clamp(valueOf(properties, "depth", base.depth), 0.2, 1.8),
      coverResolution: clamp(valueOf(properties, "coverresolution", base.coverResolution), 0.75, 1.55),
      point: clamp(valueOf(properties, "point", base.point), 0.5, 2.2),
      speed: clamp(valueOf(properties, "speed", base.speed), 0.2, 2.5),
      twist: clamp(valueOf(properties, "twist", base.twist), 0, 0.6),
      colorBoost: clamp(valueOf(properties, "colorboost", base.colorBoost), 0.5, 2),
      scatter: clamp(valueOf(properties, "scatter", base.scatter), 0, 0.5),
      galaxyDensity: clamp(valueOf(properties, "galaxydensity", base.galaxyDensity), 0.6, 2.2),
      galaxyDepth: clamp(valueOf(properties, "galaxydepth", base.galaxyDepth), 0.7, 1.8),
      bgFade: clamp(valueOf(properties, "bgfade", base.bgFade), 0, 1.2),
      bloomStrength: clamp(valueOf(properties, "bloomstrength", base.bloomStrength), 0, 1.6),
      visualTintMode: enumOf(properties, "visualtintmode", base.visualTintMode, /^(auto|custom)$/),
      visualTintColor: colorOf(valueOf(properties, "visualtintcolor", base.visualTintColor), base.visualTintColor),
      backgroundColorMode: enumOf(properties, "backgroundcolormode", base.backgroundColorMode, /^(black|cover|custom)$/),
      backgroundColor: colorOf(valueOf(properties, "backgroundcolor", base.backgroundColor), base.backgroundColor),
      backgroundOpacity: clamp(valueOf(properties, "backgroundopacity", base.backgroundOpacity), 0, 1),
      voidBackgroundMode: enumOf(properties, "voidbackgroundmode", base.voidBackgroundMode, /^(black|image|video)$/),
      voidBackgroundFile: stringOf(properties, "voidbackgroundfile", base.voidBackgroundFile).trim(),
      voidBackgroundOpacity: clamp(valueOf(properties, "voidbackgroundopacity", base.voidBackgroundOpacity), 0, 1),
      voidBackgroundBlur: clamp(valueOf(properties, "voidbackgroundblur", base.voidBackgroundBlur), 0, 24),
      lyricsEnabled: boolOf(properties, "lyricsenabled", base.lyricsEnabled),
      lyricsFallback: enumOf(properties, "lyricsfallback", base.lyricsFallback, /^(estimated|static|hide)$/),
      lyricOffset: clamp(valueOf(properties, "lyricoffset", base.lyricOffset), -5, 5),
      lyricScale: clamp(valueOf(properties, "lyricscale", base.lyricScale), 0.35, 1.65),
      lyricOffsetX: clamp(valueOf(properties, "lyricsoffsetx", base.lyricOffsetX), -2, 2),
      lyricOffsetY: clamp(valueOf(properties, "lyricsoffsety", base.lyricOffsetY), -1.2, 1.35),
      lyricOffsetZ: clamp(valueOf(properties, "lyricsoffsetz", base.lyricOffsetZ), -1.6, 1.6),
      lyricTiltX: clamp(valueOf(properties, "lyricstiltx", base.lyricTiltX), -42, 42),
      lyricTiltY: clamp(valueOf(properties, "lyricstilty", base.lyricTiltY), -42, 42),
      lyricCameraLock: boolOf(properties, "lyricscameralock", base.lyricCameraLock),
      lyricFont: enumOf(properties, "lyricsfont", base.lyricFont, /^(sans|hei|song|gothic|editorial|humanist|mono|display)$/),
      lyricWeight: clamp(valueOf(properties, "lyricsweight", base.lyricWeight), 500, 900),
      lyricLetterSpacing: clamp(valueOf(properties, "lyricsletterspacing", base.lyricLetterSpacing), -0.04, 0.18),
      lyricLineHeight: clamp(valueOf(properties, "lyricslineheight", base.lyricLineHeight), 0.86, 1.35),
      lyricColorMode: enumOf(properties, "lyricscolormode", base.lyricColorMode, /^(auto|custom)$/),
      lyricColor: colorOf(valueOf(properties, "lyricscolor", base.lyricColor), base.lyricColor),
      lyricHighlightMode: enumOf(properties, "lyricshighlightmode", base.lyricHighlightMode, /^(auto|custom)$/),
      lyricHighlightColor: colorOf(valueOf(properties, "lyricshighlightcolor", base.lyricHighlightColor), base.lyricHighlightColor),
      lyricGlow: boolOf(properties, "lyricsglow", base.lyricGlow),
      lyricGlowStrength: clamp(valueOf(properties, "lyricsglowstrength", base.lyricGlowStrength), 0, 0.85),
      lyricGlowLinked: boolOf(properties, "lyricsglowlinked", base.lyricGlowLinked),
      lyricGlowColor: colorOf(valueOf(properties, "lyricsglowcolor", base.lyricGlowColor), base.lyricGlowColor),
      lyricGlowBeat: boolOf(properties, "lyricsglowbeat", base.lyricGlowBeat),
      lyricGlowParticles: boolOf(properties, "lyricsglowparticles", base.lyricGlowParticles),
      lyricSafeArea: boolOf(properties, "lyricssafearea", base.lyricSafeArea),
      floatLayer: boolOf(properties, "floatlayer", base.floatLayer),
      cinema: boolOf(properties, "cinema", base.cinema),
      edge: boolOf(properties, "edge", base.edge),
      aiDepth: boolOf(properties, "aidepth", base.aiDepth),
      bloom: boolOf(properties, "bloom", base.bloom),
      backCover: boolOf(properties, "backcover", base.backCover),
      shelf: enumOf(properties, "shelf", base.shelf, /^(off|side|stage)$/),
      shelfCameraMode: enumOf(properties, "shelfcameramode", base.shelfCameraMode, /^(dynamic|static)$/),
      shelfPresence: enumOf(properties, "shelfpresence", base.shelfPresence, /^(auto|always)$/),
      shelfSize: clamp(valueOf(properties, "shelfsize", base.shelfSize), 0.55, 1.45),
      shelfOffsetX: clamp(valueOf(properties, "shelfoffsetx", base.shelfOffsetX), -1.2, 1.2),
      shelfOffsetY: clamp(valueOf(properties, "shelfoffsety", base.shelfOffsetY), -0.9, 0.9),
      shelfOffsetZ: clamp(valueOf(properties, "shelfoffsetz", base.shelfOffsetZ), -0.9, 0.9),
      shelfAngleY: clamp(valueOf(properties, "shelfangle", base.shelfAngleY), -30, 30),
      shelfOpacity: clamp(valueOf(properties, "shelfopacity", base.shelfOpacity), 0.25, 1),
      shelfBgOpacity: clamp(valueOf(properties, "shelfbgopacity", base.shelfBgOpacity), 0.25, 0.98),
      shelfAccentColor: colorOf(valueOf(properties, "shelfaccentcolor", base.shelfAccentColor), base.shelfAccentColor),
      performanceQuality: enumOf(properties, "performancequality", base.performanceQuality, /^(eco|balanced|high|ultra)$/),
      cameraDistance: clamp(valueOf(properties, "cameradistance", base.cameraDistance), 4.8, 13),
      cameraTargetX: clamp(valueOf(properties, "cameratargetx", base.cameraTargetX), -3, 3),
      cameraTargetY: clamp(valueOf(properties, "cameratargety", base.cameraTargetY), -2, 2.8),
      cameraTargetZ: clamp(valueOf(properties, "cameratargetz", base.cameraTargetZ), -3, 3),
      cameraPitchBias: clamp(valueOf(properties, "camerapitchbias", base.cameraPitchBias), -28, 28),
      cameraSensitivity: clamp(valueOf(properties, "camerasensitivity", base.cameraSensitivity), 0.4, 1.8),
      cameraInertia: boolOf(properties, "camerainertia", base.cameraInertia),
      adaptiveIdle: boolOf(properties, "adaptiveidle", base.adaptiveIdle),
      diagnosticsEnabled: boolOf(properties, "diagnosticsenabled", base.diagnosticsEnabled),
      diagnosticsOverlay: boolOf(properties, "diagnosticsoverlay", base.diagnosticsOverlay),
      diagnosticsExport: boolOf(properties, "diagnosticsexport", base.diagnosticsExport)
    };
  }

  var state = Object.assign({}, defaults);
  var listeners = [];
  NS.PropertyStore = {
    get: function () { return Object.assign({}, state); },
    apply: function (properties) {
      state = Object.assign({}, state, normalize(properties, state));
      listeners.slice().forEach(function (listener) { listener(Object.assign({}, state)); });
    },
    subscribe: function (listener) {
      if (typeof listener !== "function") return function () {};
      listeners.push(listener);
      listener(Object.assign({}, state));
      return function () { listeners = listeners.filter(function (item) { return item !== listener; }); };
    }
  };
  NS.PropertyDefaults = defaults;
  NS.PropertyTools = { clamp: clamp, colorOf: colorOf, presets: presets };
}());
