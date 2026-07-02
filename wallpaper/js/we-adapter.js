(function () {
  "use strict";

  var NS = window.MineradioOriginal = window.MineradioOriginal || {};
  var listeners = Object.create(null);
  var lastPayloads = Object.create(null);
  var registered = Object.create(null);
  var registrationAttempts = 0;
  var registrationDoneLogged = false;
  var timelineCallbackCount = 0;

  function on(type, callback) {
    if (typeof callback !== "function") return function () {};
    listeners[type] = listeners[type] || [];
    listeners[type].push(callback);
    if (Object.prototype.hasOwnProperty.call(lastPayloads, type)) {
      try { callback(lastPayloads[type]); } catch (error) {
        if (NS.OperationLog && NS.OperationLog.add) NS.OperationLog.add("adapter.listenerError", { type: type, phase: "replay", message: error && error.message });
        console.error("Mineradio adapter replay failed:", error);
      }
    }
    return function () {
      listeners[type] = (listeners[type] || []).filter(function (item) { return item !== callback; });
    };
  }

  function emit(type, payload) {
    if (type !== "audio") lastPayloads[type] = payload;
    (listeners[type] || []).slice().forEach(function (callback) {
      try { callback(payload); } catch (error) {
        if (NS.OperationLog && NS.OperationLog.add) NS.OperationLog.add("adapter.listenerError", { type: type, message: error && error.message });
        console.error("Mineradio adapter listener failed:", error);
      }
    });
  }

  var integration = window.wallpaperMediaIntegration || {};
  var playback = integration.playback || {};

  function playbackState(event) {
    var state = event && event.state;
    if (state === integration.PLAYBACK_PLAYING || state === playback.PLAYING) return "playing";
    if (state === integration.PLAYBACK_PAUSED || state === playback.PAUSED) return "paused";
    if (state === integration.PLAYBACK_STOPPED || state === playback.STOPPED) return "stopped";
    return typeof state === "string" ? state.toLowerCase() : "unknown";
  }

  function timelinePayload(args) {
    var first = args[0];
    var second = args[1];
    var third = args[2];
    if (typeof first === "number" || typeof first === "string") {
      return { position: first, duration: second, state: third };
    }
    if (first && typeof first === "object") {
      var payload = Object.assign({}, first);
      if (args.length > 1 && payload.duration == null && isFinite(Number(second))) payload.duration = second;
      if (args.length > 2 && payload.state == null && third != null) payload.state = third;
      return payload;
    }
    return {};
  }

  var adapter = {
    on: on,
    emit: emit,
    isWallpaperEngine: function () {
      return typeof window.wallpaperRegisterAudioListener === "function" ||
        typeof window.wallpaperRegisterMediaPropertiesListener === "function";
    },
    registrationStatus: function () {
      return {
        attempts: registrationAttempts,
        audio: !!registered.audio,
        mediaProperties: !!registered.mediaProperties,
        mediaThumbnail: !!registered.mediaThumbnail,
        mediaPlayback: !!registered.mediaPlayback,
        mediaTimeline: !!registered.mediaTimeline,
        mediaIntegration: !!(registered.mediaProperties || registered.mediaPlayback || registered.mediaTimeline)
      };
    }
  };

  window.wallpaperPropertyListener = {
    applyUserProperties: function (properties) {
      NS.PropertyStore.apply(properties || {});
    },
    applyGeneralProperties: function (properties) {
      emit("generalProperties", properties || {});
    }
  };

  function logRegistration() {
    if (registrationDoneLogged || !NS.OperationLog || !NS.OperationLog.add) return;
    registrationDoneLogged = true;
    NS.OperationLog.add("adapter.register", {
      attempts: registrationAttempts,
      audio: !!registered.audio,
      mediaProperties: !!registered.mediaProperties,
      mediaThumbnail: !!registered.mediaThumbnail,
      mediaPlayback: !!registered.mediaPlayback,
      mediaTimeline: !!registered.mediaTimeline
    });
  }

  function registerAvailable() {
    registrationAttempts += 1;
    if (!registered.audio && typeof window.wallpaperRegisterAudioListener === "function") {
      registered.audio = true;
      window.wallpaperRegisterAudioListener(function (data) { emit("audio", data || []); });
    }
    if (!registered.mediaProperties && typeof window.wallpaperRegisterMediaPropertiesListener === "function") {
      registered.mediaProperties = true;
      window.wallpaperRegisterMediaPropertiesListener(function (event) { emit("mediaProperties", event || {}); });
    }
    if (!registered.mediaThumbnail && typeof window.wallpaperRegisterMediaThumbnailListener === "function") {
      registered.mediaThumbnail = true;
      window.wallpaperRegisterMediaThumbnailListener(function (event) { emit("mediaThumbnail", event || {}); });
    }
    if (!registered.mediaPlayback && typeof window.wallpaperRegisterMediaPlaybackListener === "function") {
      registered.mediaPlayback = true;
      window.wallpaperRegisterMediaPlaybackListener(function (event) {
        emit("mediaPlayback", { raw: event || {}, state: playbackState(event || {}) });
      });
    }
    if (!registered.mediaTimeline && typeof window.wallpaperRegisterMediaTimelineListener === "function") {
      registered.mediaTimeline = true;
      window.wallpaperRegisterMediaTimelineListener(function () {
        var payload = timelinePayload(arguments);
        timelineCallbackCount += 1;
        if (NS.OperationLog && NS.OperationLog.add && timelineCallbackCount <= 3) {
          NS.OperationLog.add("adapter.timelineCallback", {
            call: timelineCallbackCount,
            argc: arguments.length,
            arg0Type: typeof arguments[0],
            arg0Keys: arguments[0] && typeof arguments[0] === "object" ? Object.keys(arguments[0]).slice(0, 16) : [],
            position: payload.position,
            duration: payload.duration,
            state: payload.state
          });
        }
        emit("mediaTimeline", payload);
      });
    }

    if (registered.audio || registered.mediaProperties || registered.mediaThumbnail || registered.mediaPlayback || registered.mediaTimeline) {
      logRegistration();
    }

    if (registrationAttempts < 80 && (!registered.mediaProperties || !registered.mediaTimeline || !registered.mediaPlayback)) {
      setTimeout(registerAvailable, registrationAttempts < 20 ? 100 : 500);
    }
  }

  registerAvailable();
  if (window.addEventListener) {
    window.addEventListener("load", registerAvailable);
    if (document.addEventListener) document.addEventListener("DOMContentLoaded", registerAvailable);
  }

  /*
   * Wallpaper Engine normally exposes register functions before user scripts run,
   * but in real desktop reloads this can race with Web wallpaper boot. The retry
   * above keeps registration idempotent instead of permanently missing media
   * callbacks when the functions appear a little later.
   */

  NS.WallpaperAdapter = adapter;
}());
