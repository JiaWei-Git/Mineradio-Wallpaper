(function () {
  "use strict";

  var NS = window.MineradioOriginal = window.MineradioOriginal || {};

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function clock() {
    return window.performance && performance.now ? performance.now() : Date.now();
  }

  function firstFinite(values) {
    for (var i = 0; i < values.length; i += 1) {
      var value = Number(values[i]);
      if (isFinite(value)) return value;
    }
    return NaN;
  }

  function valueAt(source, path) {
    var current = source;
    var parts = String(path || "").split(".");
    for (var i = 0; i < parts.length; i += 1) {
      if (current == null) return undefined;
      if (Object.prototype.hasOwnProperty.call(current, parts[i])) {
        current = current[parts[i]];
        continue;
      }
      var lower = parts[i].toLowerCase();
      var matched = Object.keys(current).filter(function (key) { return key.toLowerCase() === lower; })[0];
      if (!matched) return undefined;
      current = current[matched];
    }
    return current;
  }

  function firstFinitePath(source, paths) {
    for (var i = 0; i < paths.length; i += 1) {
      var raw = valueAt(source, paths[i]);
      if (raw == null || raw === "") continue;
      var value = Number(raw);
      if (isFinite(value)) return value;
    }
    return NaN;
  }

  function hasFinitePath(source, paths) {
    return isFinite(firstFinitePath(source, paths));
  }

  function eventKeys(source) {
    var keys = [];
    Object.keys(source || {}).slice(0, 16).forEach(function (key) {
      keys.push(key);
      if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
        Object.keys(source[key]).slice(0, 8).forEach(function (child) { keys.push(key + "." + child); });
      }
    });
    return keys;
  }

  function normalizeSeconds(value, paired) {
    value = Number(value);
    paired = Number(paired);
    if (!isFinite(value)) return NaN;
    if (isFinite(paired) && paired > 0) {
      var divisors = [1, 1000, 10000000, 1000000, 10000];
      for (var i = 0; i < divisors.length; i += 1) {
        var divisor = divisors[i];
        var scaledPaired = paired / divisor;
        var scaledValue = value / divisor;
        if (scaledPaired > 0 && scaledPaired <= 86400 && scaledValue <= scaledPaired + 3) return scaledValue;
      }
      if (value <= paired + 3) return value;
    }
    if (value > 86400000 && value / 10000000 <= 86400) return value / 10000000;
    if (value > 36000) return value / 1000;
    return value;
  }

  function normalizeDuration(value, pairedPosition) {
    value = Number(value);
    pairedPosition = Number(pairedPosition);
    if (!isFinite(value)) return NaN;
    if (isFinite(pairedPosition) && pairedPosition >= 0) {
      var divisors = [1, 1000, 10000000, 1000000, 10000];
      for (var i = 0; i < divisors.length; i += 1) {
        var divisor = divisors[i];
        var scaledDuration = value / divisor;
        var scaledPosition = pairedPosition / divisor;
        if (scaledDuration > 0 && scaledDuration <= 86400 && scaledPosition <= scaledDuration + 3) return scaledDuration;
      }
    }
    if (value > 86400000 && value / 10000000 <= 86400) return value / 10000000;
    if (value > 36000) return value / 1000;
    return value;
  }

  function operationLog(type, data) {
    if (NS.OperationLog && NS.OperationLog.add) NS.OperationLog.add(type, data);
  }

  function logEnabled() {
    return !!(NS.OperationLog && NS.OperationLog.enabled && NS.OperationLog.enabled());
  }

  function neteaseIdFromGenres(value) {
    var text = Array.isArray(value) ? value.join(",") : String(value || "");
    var match = text.match(/(?:^|[,;\s])NCM-(\d+)(?:$|[,;\s])/i);
    return match ? match[1] : "";
  }

  function timelinePlaybackState(value) {
    var text = clean(value).toLowerCase();
    if (text === "1" || text === "play" || text === "playing") return "playing";
    if (text === "2" || text === "pause" || text === "paused") return "paused";
    if (text === "3" || text === "stop" || text === "stopped") return "stopped";
    return "";
  }

  function enhancementStatusFromCurrent(current) {
    current = current || {};
    var hasMedia = !!(current.title || current.artist || current.album || current.thumbnail);
    var hasNeteaseId = /^\d+$/.test(String(current.neteaseId || ""));
    var timelineAvailable = !!current.timelineAvailable;
    var issue = clean(current.timelineIssue);
    var status = {
      mode: "waiting",
      label: "等待媒体信息",
      enabled: false,
      hasMedia: hasMedia,
      hasNeteaseId: hasNeteaseId,
      timelineAvailable: timelineAvailable,
      timelineIssue: issue,
      title: clean(current.title),
      artist: clean(current.artist),
      neteaseId: hasNeteaseId ? String(current.neteaseId) : "",
      action: "none"
    };
    if (!hasMedia) return status;
    if (hasNeteaseId && timelineAvailable) {
      status.mode = "netease-enhanced";
      status.label = "已启用，歌词按网易云 ID 和真实时间轴同步";
      status.enabled = true;
      return status;
    }
    if (hasNeteaseId && issue === "zero-zero") {
      status.mode = "netease-zero-zero";
      status.label = "已识别网易云 ID，但当前时间轴是 0/0";
      status.action = "关闭网易云原生“开启 SMTC”，保留 InfLink-rs 增强会话后重启网易云";
      return status;
    }
    if (hasNeteaseId) {
      status.mode = "netease-id-only";
      status.label = "已识别网易云 ID，但还没有可用时间轴";
      status.action = "确认 InfLink-rs 已启用；若拖动歌词不跟随，检查网易云原生 SMTC 是否仍在覆盖";
      return status;
    }
    if (timelineAvailable) {
      status.mode = "timeline-only";
      status.label = "普通媒体时间轴模式";
      status.action = "可按播放器时间轴同步；如需网易云精确匹配，手动安装 InfLink-rs";
      return status;
    }
    status.mode = "metadata-only";
    status.label = "普通取词/估算滚动模式";
    status.action = "不安装插件也可显示歌词；拖动后精确跟随需要 InfLink-rs 提供真实时间轴";
    return status;
  }

  var POSITION_PATHS = [
    "position", "currentPosition", "currentTime", "time", "elapsed", "playbackPosition",
    "positionSeconds", "currentPositionSeconds", "currentTimeSeconds", "playbackPositionSeconds",
    "positionMs", "currentPositionMs", "currentTimeMs", "playbackPositionMs",
    "positionMillis", "currentPositionMillis", "currentTimeMillis", "playbackPositionMillis",
    "timeline.position", "timeline.currentPosition", "timeline.currentTime", "timeline.time", "timeline.elapsed", "timeline.playbackPosition",
    "timeline.positionSeconds", "timeline.currentPositionSeconds", "timeline.currentTimeSeconds", "timeline.playbackPositionSeconds",
    "timeline.positionMs", "timeline.currentPositionMs", "timeline.currentTimeMs", "timeline.playbackPositionMs",
    "timing.position", "timing.currentTime", "timing.positionSeconds", "timing.currentTimeSeconds",
    "timing.positionMs", "timing.currentTimeMs",
    "positionInfo.position", "positionInfo.currentTime", "media.position", "media.currentTime"
  ];

  var DURATION_PATHS = [
    "duration", "length", "totalDuration", "totalTime", "endTime", "end", "maxSeekTime", "maxSeek",
    "durationSeconds", "lengthSeconds", "totalDurationSeconds", "endSeconds", "maxSeekSeconds",
    "durationMs", "lengthMs", "totalDurationMs", "totalTimeMs", "endTimeMs", "endMs", "maxSeekTimeMs", "maxSeekMs",
    "durationMillis", "lengthMillis", "totalDurationMillis", "totalTimeMillis",
    "timeline.duration", "timeline.length", "timeline.totalDuration", "timeline.totalTime", "timeline.endTime", "timeline.end",
    "timeline.durationSeconds", "timeline.lengthSeconds", "timeline.totalDurationSeconds", "timeline.endSeconds",
    "timeline.durationMs", "timeline.lengthMs", "timeline.totalDurationMs", "timeline.totalTimeMs", "timeline.endTimeMs", "timeline.endMs",
    "timing.duration", "timing.totalDuration", "timing.durationSeconds", "timing.totalDurationSeconds",
    "timing.durationMs", "timing.totalDurationMs", "positionInfo.duration", "media.duration"
  ];

  function MediaHistory(limit) {
    this.limit = Math.max(3, Number(limit) || 9);
    this.current = {
      title: "", artist: "", album: "", albumArtist: "", subTitle: "", genres: "", neteaseId: "", contentType: "", key: "", thumbnail: "",
      image: null, coverReady: false, primaryColor: "", secondaryColor: "",
      tertiaryColor: "", playbackState: "unknown", position: 0, duration: 0,
      timelineAt: clock(), timelineAvailable: false, timelineSeenAt: 0, timelineExtrapolate: true,
      timelineIssue: "",
      timelineRevision: 0, seekRevision: 0, lastSeekFrom: 0, lastSeekTo: 0, lastSeekAt: 0,
      changedAt: Date.now()
    };
    this.items = [];
    this.listeners = [];
    this.lastTimelineLogAt = 0;
    this.lastIgnoredTimelineLogAt = 0;
    this.lastEnhancementLogKey = "";
    this.fallbackImage = new Image();
    this.fallbackImage.src = "assets/fallback-cover.svg";
  }

  MediaHistory.prototype.subscribe = function (listener) {
    if (typeof listener !== "function") return function () {};
    this.listeners.push(listener);
    var self = this;
    return function () { self.listeners = self.listeners.filter(function (item) { return item !== listener; }); };
  };

  MediaHistory.prototype.notify = function (type) {
    var snapshot = this.snapshot();
    this.listeners.slice().forEach(function (listener) { listener(type, snapshot); });
  };

  MediaHistory.prototype.snapshot = function () {
    return { current: this.current, history: this.items.slice() };
  };

  MediaHistory.prototype.enhancementStatus = function () {
    return enhancementStatusFromCurrent(this.current);
  };

  MediaHistory.prototype.reportEnhancement = function () {
    if (!logEnabled()) return;
    var status = this.enhancementStatus();
    var key = [status.mode, status.neteaseId, status.timelineAvailable, status.timelineIssue].join("|");
    if (key === this.lastEnhancementLogKey) return;
    this.lastEnhancementLogKey = key;
    operationLog("media.enhancement", status);
  };

  MediaHistory.prototype.currentCover = function () {
    if (this.current.coverReady && this.current.image) return this.current.image;
    return this.fallbackImage.complete ? this.fallbackImage : null;
  };

  MediaHistory.prototype.hasMedia = function () {
    return !!(this.current.title || this.current.artist || this.current.thumbnail);
  };

  MediaHistory.prototype.isPlaying = function () {
    return this.current.playbackState === "playing";
  };

  MediaHistory.prototype.progress = function () {
    var duration = this.current.duration;
    if (!isFinite(duration) || duration <= 0) return 0;
    return Math.max(0, Math.min(1, this.positionSeconds() / duration));
  };

  MediaHistory.prototype.positionSeconds = function () {
    var position = Number(this.current.position) || 0;
    if (this.isPlaying() && this.current.timelineAvailable && this.current.timelineExtrapolate !== false) position += Math.max(0, clock() - this.current.timelineAt) / 1000;
    var duration = Number(this.current.duration) || 0;
    return duration > 0 ? Math.max(0, Math.min(duration, position)) : Math.max(0, position);
  };

  MediaHistory.prototype.upsertCurrentHistory = function () {
    var current = this.current;
    if (!current.key) return;
    var entry = null;
    for (var i = 0; i < this.items.length; i += 1) {
      if (this.items[i].key === current.key) { entry = this.items.splice(i, 1)[0]; break; }
    }
    entry = entry || {};
    entry.key = current.key;
    entry.title = current.title || "Untitled";
    entry.artist = current.artist;
    entry.album = current.album;
    entry.thumbnail = current.thumbnail;
    entry.image = current.image;
    entry.changedAt = current.changedAt;
    this.items.unshift(entry);
    this.items.length = Math.min(this.items.length, this.limit);
  };

  MediaHistory.prototype.applyProperties = function (event) {
    event = event || {};
    var title = clean(event.title);
    var artist = clean(event.artist || event.albumArtist);
    var album = clean(event.albumTitle || event.album);
    var genres = clean(Array.isArray(event.genres) ? event.genres.join(",") : event.genres);
    var neteaseId = neteaseIdFromGenres(genres);
    var oldNeteaseId = this.current.neteaseId;
    var key = (title + "|" + artist + "|" + album).toLowerCase();
    var changed = !!key && key !== this.current.key;
    this.current.title = title;
    this.current.artist = artist;
    this.current.album = album;
    this.current.albumArtist = clean(event.albumArtist);
    this.current.subTitle = clean(event.subTitle);
    this.current.genres = genres;
    this.current.neteaseId = neteaseId;
    this.current.contentType = clean(event.contentType).toLowerCase();
    if (changed) {
      this.current.key = key;
      this.current.thumbnail = "";
      this.current.image = null;
      this.current.coverReady = false;
      this.current.position = 0;
      this.current.duration = 0;
      this.current.timelineAt = clock();
      this.current.timelineAvailable = false;
      this.current.timelineSeenAt = 0;
      this.current.timelineExtrapolate = true;
      this.current.timelineIssue = "";
      this.current.timelineRevision = 0;
      this.current.seekRevision = 0;
      this.current.lastSeekFrom = 0;
      this.current.lastSeekTo = 0;
      this.current.lastSeekAt = 0;
      this.current.changedAt = Date.now();
      this.upsertCurrentHistory();
      operationLog("media.track", { title: title, artist: artist, album: album, key: key, neteaseId: neteaseId });
    }
    if (changed || oldNeteaseId !== neteaseId) this.reportEnhancement();
    this.notify(changed ? "track" : "properties");
    if (hasFinitePath(event, POSITION_PATHS)) this.applyTimeline(event);
  };

  MediaHistory.prototype.applyThumbnail = function (event) {
    event = event || {};
    var src = clean(event.thumbnail);
    this.current.primaryColor = clean(event.primaryColor);
    this.current.secondaryColor = clean(event.secondaryColor);
    this.current.tertiaryColor = clean(event.tertiaryColor);
    if (!src || src === this.current.thumbnail) {
      this.notify("palette");
      return;
    }
    this.current.thumbnail = src;
    this.current.coverReady = false;
    var self = this;
    var expectedKey = this.current.key;
    var image = new Image();
    image.onload = function () {
      if (self.current.key !== expectedKey || self.current.thumbnail !== src) return;
      self.current.image = image;
      self.current.coverReady = true;
      self.upsertCurrentHistory();
      operationLog("media.cover", { status: "ready", key: expectedKey, width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
      self.notify("cover");
    };
    image.onerror = function () {
      if (self.current.key !== expectedKey || self.current.thumbnail !== src) return;
      self.current.image = null;
      self.current.coverReady = false;
      self.upsertCurrentHistory();
      operationLog("media.cover", { status: "error", key: expectedKey });
      self.notify("coverError");
    };
    image.src = src;
  };

  MediaHistory.prototype.applyPlayback = function (event) {
    event = event || {};
    if (this.current.playbackState === "playing" && this.current.timelineAvailable) this.current.position = this.positionSeconds();
    this.current.playbackState = event.state || "unknown";
    this.current.timelineAt = clock();
    operationLog("media.playback", { state: this.current.playbackState, position: this.current.position });
    this.notify("playback");
    var raw = event.raw && typeof event.raw === "object" ? event.raw : event;
    if (hasFinitePath(raw, POSITION_PATHS)) this.applyTimeline(raw);
  };

  MediaHistory.prototype.applyTimeline = function (event) {
    event = event || {};
    var receivedAt = clock();
    var timelineState = timelinePlaybackState(firstFinite([
      valueAt(event, "state"), valueAt(event, "playbackState"), valueAt(event, "status"),
      valueAt(event, "timeline.state"), valueAt(event, "timeline.playbackState")
    ]));
    if (!timelineState) timelineState = timelinePlaybackState(
      valueAt(event, "state") || valueAt(event, "playbackState") || valueAt(event, "status") ||
      valueAt(event, "timeline.state") || valueAt(event, "timeline.playbackState")
    );
    if (timelineState) this.current.playbackState = timelineState;
    var previousPosition = Number(this.current.position) || 0;
    var elapsed = Math.max(0, receivedAt - this.current.timelineAt) / 1000;
    var predictedPosition = previousPosition;
    if (this.current.timelineAvailable && this.current.playbackState === "playing" && this.current.timelineExtrapolate !== false) predictedPosition += elapsed;
    var rawPosition = firstFinitePath(event, POSITION_PATHS);
    var rawDuration = firstFinitePath(event, DURATION_PATHS);
    var rawStart = firstFinitePath(event, ["startTime", "start", "minSeekTime", "minSeek", "timeline.startTime", "timeline.start", "timeline.minSeekTime"]);
    var rawEnd = firstFinitePath(event, ["endTime", "end", "maxSeekTime", "maxSeek", "timeline.endTime", "timeline.end", "timeline.maxSeekTime"]);
    if (!isFinite(rawDuration) && isFinite(rawStart) && isFinite(rawEnd) && rawEnd > rawStart) rawDuration = rawEnd - rawStart;
    var duration = normalizeDuration(rawDuration, rawPosition);
    var position = normalizeSeconds(rawPosition, rawDuration);
    if (!isFinite(position) && isFinite(duration) && duration > 0 && event.progress != null) {
      var progress = Number(event.progress);
      if (isFinite(progress) && progress > 1 && progress <= 100) progress /= 100;
      position = Math.max(0, Math.min(duration, progress * duration));
    }
    var explicitZeroZero = rawPosition === 0 && rawDuration === 0;
    var timelineUsable = !explicitZeroZero && isFinite(position) && (position > 0 || (isFinite(duration) && duration > 0) || this.current.duration > 0);
    var rawData = null;
    function getRawData() {
      if (!rawData) {
        rawData = {
          rawPosition: isFinite(rawPosition) ? rawPosition : null,
          rawDuration: isFinite(rawDuration) ? rawDuration : null,
          rawKeys: eventKeys(event)
        };
      }
      return rawData;
    }
    if (!timelineUsable) {
      this.current.timelineIssue = explicitZeroZero ? "zero-zero" : "missing-position";
      if (isFinite(duration) && duration > 0) this.current.duration = Math.max(0, duration);
      if (this.current.timelineAvailable && explicitZeroZero) {
        this.reportEnhancement();
        if (logEnabled() && Date.now() - this.lastIgnoredTimelineLogAt >= 5000) {
          this.lastIgnoredTimelineLogAt = Date.now();
          operationLog("media.timelineIgnored", Object.assign({
            reason: "explicit-zero-zero",
            keptPosition: this.positionSeconds(),
            keptDuration: this.current.duration,
            state: this.current.playbackState
          }, getRawData()));
        }
        this.notify("timelineIgnored");
        return;
      }
      this.current.timelineAt = receivedAt;
      this.current.timelineAvailable = false;
      this.current.timelineSeenAt = 0;
      this.reportEnhancement();
      if (logEnabled() && Date.now() - this.lastTimelineLogAt >= 5000) {
        this.lastTimelineLogAt = Date.now();
        operationLog("media.timelineUnavailable", Object.assign({
          position: isFinite(position) ? position : null,
          duration: isFinite(duration) ? duration : null,
          state: this.current.playbackState
        }, getRawData()));
      }
      this.notify("timelineUnavailable");
      return;
    }
    var seek = false;
    if (timelineUsable && this.current.timelineAvailable) {
      var expected = predictedPosition;
      if (this.current.playbackState === "unknown") expected = previousPosition + elapsed;
      if (this.current.playbackState === "paused" || this.current.playbackState === "stopped") expected = previousPosition;
      var discontinuity = position - expected;
      var threshold = Math.max(3.5, Math.min(6, 1.5 + elapsed * 0.75));
      seek = Math.abs(discontinuity) > threshold;
      if (seek) {
        this.current.seekRevision += 1;
        this.current.lastSeekFrom = predictedPosition;
        this.current.lastSeekTo = position;
        this.current.lastSeekAt = Date.now();
      }
    } else if (timelineUsable && Math.abs(position - previousPosition) > 1.5) {
      seek = true;
      this.current.seekRevision += 1;
      this.current.lastSeekFrom = previousPosition;
      this.current.lastSeekTo = position;
      this.current.lastSeekAt = Date.now();
    }
    if (timelineUsable) this.current.position = Math.max(0, position);
    if (isFinite(duration) && duration > 0) this.current.duration = Math.max(0, duration);
    this.current.timelineAt = receivedAt;
    this.current.timelineAvailable = true;
    this.current.timelineExtrapolate = event.extrapolate === false ? false : true;
    this.current.timelineIssue = "";
    this.current.timelineRevision += 1;
    this.current.timelineSeenAt = Date.now();
    this.reportEnhancement();
    if (seek && logEnabled()) {
      operationLog("media.seek", Object.assign({
        from: this.current.lastSeekFrom,
        to: this.current.lastSeekTo,
        duration: this.current.duration,
        revision: this.current.seekRevision
      }, getRawData()));
    } else if (logEnabled() && Date.now() - this.lastTimelineLogAt >= 5000) {
      this.lastTimelineLogAt = Date.now();
      operationLog("media.timeline", Object.assign({
        position: isFinite(position) ? position : null,
        duration: isFinite(duration) ? duration : null,
        state: this.current.playbackState
      }, getRawData()));
    }
    this.notify(seek ? "seek" : "timeline");
  };

  NS.MediaHistory = MediaHistory;
}());
