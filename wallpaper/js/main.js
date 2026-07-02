(function () {
  "use strict";

  var NS = window.MineradioOriginal = window.MineradioOriginal || {};
  var media = new NS.MediaHistory(9);
  var lyrics = new NS.LyricsEngine(media);
  var audio = new NS.AudioReactor();
  var visual = new NS.VisualState();
  var canvas = document.getElementById("stage-canvas");
  var stageElement = document.getElementById("wallpaper-stage");
  var voidImage = document.getElementById("void-background-image");
  var voidVideo = document.getElementById("void-background-video");
  var stage = new NS.VisualCore(canvas, media, audio, visual);
  var lyricsVisual = new NS.LyricsVisual(stage, lyrics, visual);
  stage.setLyricsVisual(lyricsVisual);
  var adapter = NS.WallpaperAdapter;
  var lastDiagnosticsExport = false;
  var diagnosticsTitleEnabled = false;
  var diagnosticsWasEnabled = false;
  if (NS.OperationLog && NS.OperationLog.setStatusProvider) {
    NS.OperationLog.setStatusProvider(function () { return media.enhancementStatus ? media.enhancementStatus() : null; });
  }

  function publishDiagnosticsTitle() {
    if (!diagnosticsTitleEnabled) {
      document.title = "Mineradio 原版视觉";
      return;
    }
    var lyricState = lyrics.snapshot();
    var current = media.current || {};
    document.title = [
      "MR5.1",
      current.neteaseId || "no-id",
      Math.round((Number(lyricState.position) || 0) * 10) / 10,
      Math.round((Number(current.duration) || 0) * 10) / 10,
      Number(current.seekRevision) || 0,
      Number(lyricState.currentIndex),
      lyricState.timingAvailable ? "timeline" : "fallback"
    ].join("|");
  }

  function cssUrl(value) {
    return "url(\"" + String(value || "").replace(/["\\]/g, "\\$&") + "\")";
  }

  function wallpaperFileUrl(value) {
    var text = String(value || "").trim();
    if (!text) return "";
    if (/^(file|data|blob|https?):/i.test(text) || /^assets\//i.test(text)) return text;
    text = text.replace(/\\/g, "/");
    if (/^[a-z]:\//i.test(text)) return "file:///" + text;
    if (text.charAt(0) === "/") return "file://" + text;
    return text;
  }

  function rgba(color, alpha) {
    return NS.ColorTools.rgbToCss(color, alpha);
  }

  function ambientLayer(palette, opacity) {
    var accent = palette.accent || NS.ColorTools.parseColor("#9db8cf");
    var primary = palette.primary || NS.ColorTools.brighten(accent, 0.24);
    var secondary = palette.secondary || NS.ColorTools.darken(accent, 0.22);
    var deep = palette.deep || NS.ColorTools.darken(accent, 0.92);
    var warm = NS.ColorTools.mix(primary, { r: 244, g: 210, b: 138 }, 0.16);
    var cool = NS.ColorTools.mix(secondary, { r: 78, g: 148, b: 255 }, 0.18);
    var lift = Math.max(0.15, Math.min(0.55, Number(opacity) || 1));
    return [
      "radial-gradient(ellipse at 38% 45%, " + rgba(accent, 0.18 * lift) + " 0%, " + rgba(accent, 0.070 * lift) + " 28%, rgba(0,0,0,0) 58%)",
      "radial-gradient(ellipse at 68% 56%, " + rgba(cool, 0.13 * lift) + " 0%, " + rgba(cool, 0.050 * lift) + " 30%, rgba(0,0,0,0) 62%)",
      "radial-gradient(ellipse at 48% 76%, " + rgba(warm, 0.075 * lift) + " 0%, rgba(0,0,0,0) 52%)",
      "linear-gradient(118deg, " + rgba(deep, 0.94) + " 0%, rgba(0,0,0,.88) 42%, " + rgba(NS.ColorTools.darken(secondary, 0.86), 0.66) + " 100%)"
    ].join(",");
  }

  function applyVoidBackground(props) {
    if (!stageElement || !voidImage || !voidVideo) return;
    var file = wallpaperFileUrl(props.voidBackgroundFile || "");
    var activeImage = props.preset === "void" && props.voidBackgroundMode === "image" && !!file;
    var activeVideo = props.preset === "void" && props.voidBackgroundMode === "video" && !!file;
    stageElement.classList.toggle("void-background-image", activeImage);
    stageElement.classList.toggle("void-background-video", activeVideo);
    document.documentElement.style.setProperty("--void-background-opacity", String(props.voidBackgroundOpacity));
    document.documentElement.style.setProperty("--void-background-blur", String(props.voidBackgroundBlur) + "px");
    voidImage.style.backgroundImage = activeImage ? cssUrl(file) : "";
    if (activeVideo) {
      if (voidVideo.getAttribute("src") !== file) voidVideo.setAttribute("src", file);
      var play = voidVideo.play && voidVideo.play();
      if (play && play.catch) play.catch(function () {});
    } else {
      voidVideo.pause();
      voidVideo.removeAttribute("src");
      voidVideo.load();
    }
  }

  function applyBackground() {
    var props = visual.properties || NS.PropertyDefaults;
    var color = "#000000";
    var layer = "#000000";
    var opacity = props.backgroundOpacity;
    var blur = 0;
    var saturate = 1;
    var brightness = 1;
    var scale = 1;
    var vignette = 0.76;
    if (props.backgroundColorMode === "custom") {
      color = props.backgroundColor;
      var custom = NS.ColorTools.parseColor(color, "#000000");
      layer = ambientLayer({
        accent: custom,
        primary: NS.ColorTools.brighten(custom, 0.24),
        secondary: NS.ColorTools.darken(custom, 0.18),
        deep: NS.ColorTools.darken(custom, 0.92)
      }, props.backgroundOpacity * 0.78);
      blur = 34;
      saturate = 1.10;
      brightness = 0.82;
      scale = 1.10;
      vignette = 0.82;
    }
    if (props.backgroundColorMode === "cover") {
      var source = media.current.primaryColor || media.current.secondaryColor;
      color = source ? NS.ColorTools.rgbToCss(NS.ColorTools.parseColor(source, "#000000")) : "#000000";
      layer = ambientLayer(visual.palette || {}, props.backgroundOpacity);
      opacity = Math.min(0.92, props.backgroundOpacity * (props.preset === "classicplane" || props.preset === "emily" ? 0.72 : 0.84));
      blur = 48;
      saturate = 1.35;
      brightness = 0.78;
      scale = 1.16;
      vignette = props.preset === "classicplane" ? 0.90 : 0.80;
    }
    document.documentElement.style.setProperty("--wallpaper-background", color);
    document.documentElement.style.setProperty("--wallpaper-background-layer", layer);
    document.documentElement.style.setProperty("--wallpaper-background-opacity", String(opacity));
    document.documentElement.style.setProperty("--wallpaper-background-blur", String(blur) + "px");
    document.documentElement.style.setProperty("--wallpaper-background-saturate", String(saturate));
    document.documentElement.style.setProperty("--wallpaper-background-brightness", String(brightness));
    document.documentElement.style.setProperty("--wallpaper-background-scale", String(scale));
    document.documentElement.style.setProperty("--wallpaper-background-vignette", String(vignette));
    applyVoidBackground(props);
  }

  function syncVisualState(options) {
    options = options || {};
    visual.updatePalette(media);
    if (options.history !== false) stage.setHistory(media.items);
    if (options.background !== false) applyBackground();
  }

  NS.PropertyStore.subscribe(function (properties) {
    diagnosticsTitleEnabled = properties.diagnosticsEnabled;
    if (NS.OperationLog) {
      NS.OperationLog.configure({ enabled: properties.diagnosticsEnabled, overlay: properties.diagnosticsOverlay });
      if (properties.diagnosticsEnabled && !diagnosticsWasEnabled) {
        var diagnosticLyrics = lyrics.snapshot();
        NS.OperationLog.add("diagnostics.state", {
          mediaTitle: media.current && media.current.title || "",
          neteaseId: media.current && media.current.neteaseId || "",
          timelineAvailable: !!(media.current && media.current.timelineAvailable),
          enhancement: media.enhancementStatus ? media.enhancementStatus() : null,
          position: diagnosticLyrics.position,
          lyricStatus: diagnosticLyrics.status,
          lyricLines: diagnosticLyrics.lines && diagnosticLyrics.lines.length || 0,
          lyricIndex: diagnosticLyrics.currentIndex,
          stageDisabled: !!(stage && stage.disabled),
          stageStarted: !!(stage && stage.started),
          stageFrameCount: stage && stage.frameCount || 0,
          lyricsVisualDisabled: !!(lyricsVisual && lyricsVisual.disabled),
          adapter: adapter && adapter.registrationStatus ? adapter.registrationStatus() : null
        });
      }
      diagnosticsWasEnabled = properties.diagnosticsEnabled;
      NS.OperationLog.add("settings.apply", {
        preset: properties.presetName,
        lyrics: properties.lyricsEnabled,
        lyricOffset: properties.lyricOffset,
        diagnosticsOverlay: properties.diagnosticsOverlay
      });
      if (properties.diagnosticsExport && !lastDiagnosticsExport) {
        NS.OperationLog.add("log.export", { source: "wallpaper-property" });
        NS.OperationLog.copyText();
      }
      lastDiagnosticsExport = properties.diagnosticsExport;
    }
    lyrics.setOptions({
      enabled: properties.lyricsEnabled,
      offset: properties.lyricOffset,
      fallbackMode: properties.lyricsFallback
    });
    visual.setProperties(properties);
    syncVisualState();
    stage.resize();
    publishDiagnosticsTitle();
  });

  media.subscribe(function (type) {
    lyrics.handleMedia(type);
    publishDiagnosticsTitle();
    if (type === "timeline" || type === "seek" || type === "timelineUnavailable" || type === "timelineIgnored" || type === "playback") return;
    syncVisualState();
    if (type === "cover") stage.completeTrackTransition();
  });

  lyrics.subscribe(publishDiagnosticsTitle);

  if (adapter) {
    adapter.on("audio", function (data) { audio.update(data); });
    adapter.on("mediaProperties", function (event) {
      var oldKey = media.current.key;
      media.applyProperties(event);
      if (oldKey && media.current.key && oldKey !== media.current.key) stage.beginTrackTransition(media.current.key);
    });
    adapter.on("mediaThumbnail", function (event) { media.applyThumbnail(event); });
    adapter.on("mediaPlayback", function (event) { media.applyPlayback(event); });
    adapter.on("mediaTimeline", function (event) { media.applyTimeline(event); });
    adapter.on("generalProperties", function (event) {
      if (stage && stage.setFpsLimit) stage.setFpsLimit(event && event.fps);
      if (event && event.fps && Number(event.fps) <= 30) document.body.classList.add("low-fps");
      else document.body.classList.remove("low-fps");
    });
  }

  if (!adapter || !adapter.isWallpaperEngine()) {
    try {
      var previewParams = new URLSearchParams(window.location.search || "");
      var previewProperties = {};
      if (/^(classicplane|emily|tunnel|orbit|void|vinyl|galaxy|skull)$/.test(previewParams.get("preset") || "")) previewProperties.visualpreset = { value: previewParams.get("preset") };
      if (/^(off|side|stage)$/.test(previewParams.get("shelf") || "")) previewProperties.shelf = { value: previewParams.get("shelf") };
      if (previewParams.get("lyricslock") === "1") previewProperties.lyricscameralock = { value: true };
      if (Object.keys(previewProperties).length) NS.PropertyStore.apply(previewProperties);
    } catch (previewError) {}
    media.applyProperties({ title: "Die For You", artist: "Mineradio", albumTitle: "Local Preview" });
    media.applyPlayback({ state: "playing" });
    lyrics.usePreview();
    window.setInterval(function () {
      var time = performance.now() * 0.001;
      audio.injectPreviewPulse(time);
      media.applyTimeline({ position: time % 30, duration: 30 });
    }, 33);
  }

  if (stage.disabled) {
    document.getElementById("fallback-message").hidden = false;
  } else {
    stage.start();
  }

  NS.app = { media: media, lyrics: lyrics, lyricsVisual: lyricsVisual, audio: audio, visual: visual, stage: stage };
}());
