(function () {
  "use strict";

  var NS = window.MineradioOriginal = window.MineradioOriginal || {};
  var CACHE_KEY = "mineradio.we.lyrics.v2";
  var POSITIVE_TTL = 90 * 24 * 60 * 60 * 1000;
  var NEGATIVE_TTL = 10 * 60 * 1000;
  var CACHE_LIMIT = 96;
  var CACHE_CHAR_LIMIT = 1200000;

  function now() { return Date.now(); }
  function clock() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }
  function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
  function lyricText(value) { return String(value || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim(); }

  function operationLog(type, data) {
    if (NS.OperationLog && NS.OperationLog.add) NS.OperationLog.add(type, data);
  }

  function normalizedUnicode(value) {
    var text = clean(value);
    try { text = text.normalize("NFKC"); } catch (error) {}
    return text.toLowerCase();
  }

  function qualifier(value) {
    var text = normalizedUnicode(value);
    var tags = [];
    ["remix", "live", "acoustic", "instrumental", "karaoke", "cover", "demo", "remaster", "edit", "mix", "现场", "伴奏", "翻唱"].forEach(function (tag) {
      if (text.indexOf(tag) >= 0) tags.push(tag);
    });
    return tags.sort().join("|");
  }

  function normalized(value) {
    return normalizedUnicode(value)
      .replace(/[\[(（【][^\])）】]*(?:feat\.?|ft\.?|official|video|audio|mv|lyrics?|remaster(?:ed)?|live|version|edit|mix|伴奏|纯音乐|歌词|现场版|翻唱)[^\])）】]*[\])）】]/gi, " ")
      .replace(/\b(?:feat\.?|ft\.?)\s+.+$/i, " ")
      .replace(/(?:official\s*)?(?:music\s*)?(?:video|audio|lyrics?)$/i, " ")
      .replace(/[\s\-_.·•:：'"“”‘’，,。!！?？/\\|()[\]{}]+/g, "")
      .trim();
  }

  function grams(value) {
    value = normalized(value);
    if (!value) return [];
    if (value.length === 1) return [value];
    var result = [];
    for (var i = 0; i < value.length - 1; i += 1) result.push(value.slice(i, i + 2));
    return result;
  }

  function textSimilarity(a, b) {
    a = normalized(a);
    b = normalized(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.92;
    var left = grams(a);
    var right = grams(b);
    var counts = Object.create(null);
    left.forEach(function (item) { counts[item] = (counts[item] || 0) + 1; });
    var overlap = 0;
    right.forEach(function (item) {
      if (counts[item] > 0) { counts[item] -= 1; overlap += 1; }
    });
    return (2 * overlap) / Math.max(1, left.length + right.length);
  }

  function artistParts(value) {
    return normalizedUnicode(value)
      .replace(/\s+-\s+topic$/i, "")
      .split(/\s*(?:,|，|、|&|＆|\/|;|；|\bx\b|×|\bfeat\.?\b|\bft\.?\b)\s*/i)
      .map(normalized)
      .filter(Boolean);
  }

  function artistSimilarity(a, b) {
    var left = artistParts(a);
    var right = artistParts(b);
    if (!left.length || !right.length) return 0;
    var total = 0;
    left.forEach(function (name) {
      var best = 0;
      right.forEach(function (candidate) { best = Math.max(best, textSimilarity(name, candidate)); });
      total += best;
    });
    return total / left.length;
  }

  function durationSimilarity(a, b) {
    a = Number(a); b = Number(b);
    if (!(a > 0) || !(b > 0)) return 0;
    var diff = Math.abs(a - b);
    if (diff <= 2) return 1;
    if (diff <= 5) return 0.90;
    if (diff <= 12) return 0.66;
    if (diff <= 25) return 0.30;
    return 0;
  }

  function candidateMetadata(candidate) {
    candidate = candidate || {};
    return {
      id: candidate.id,
      title: clean(candidate.trackName || candidate.track_name || candidate.name),
      artist: clean(candidate.artistName || candidate.artist_name),
      album: clean(candidate.albumName || candidate.album_name),
      duration: Number(candidate.duration) || 0,
      instrumental: !!candidate.instrumental,
      syncedLyrics: lyricText(candidate.syncedLyrics || candidate.synced_lyrics),
      plainLyrics: lyricText(candidate.plainLyrics || candidate.plain_lyrics)
    };
  }

  function scoreCandidate(query, rawCandidate) {
    var candidate = candidateMetadata(rawCandidate);
    var titleScore = textSimilarity(query.title, candidate.title);
    var artistScore = artistSimilarity(query.artist, candidate.artist);
    var weights = { title: query.artist ? 0.60 : 0.84, artist: query.artist && candidate.artist ? 0.27 : 0, album: 0, duration: 0 };
    var albumScore = 0;
    var durationScore = 0;
    if (query.album && candidate.album) { weights.album = 0.05; albumScore = textSimilarity(query.album, candidate.album); }
    if (query.duration > 0 && candidate.duration > 0) { weights.duration = 0.08; durationScore = durationSimilarity(query.duration, candidate.duration); }
    var totalWeight = weights.title + weights.artist + weights.album + weights.duration;
    var score = (titleScore * weights.title + artistScore * weights.artist + albumScore * weights.album + durationScore * weights.duration) / totalWeight;
    var queryQualifier = qualifier(query.title);
    var candidateQualifier = qualifier(candidate.title);
    if (queryQualifier !== candidateQualifier && (queryQualifier || candidateQualifier)) score -= 0.10;
    return {
      score: clamp(score, 0, 1), titleScore: titleScore, artistScore: artistScore,
      durationScore: durationScore,
      durationDelta: query.duration > 0 && candidate.duration > 0 ? Math.abs(query.duration - candidate.duration) : 0,
      candidate: candidate
    };
  }

  function lyricTime(minute, second, fraction) {
    var value = (parseInt(minute, 10) || 0) * 60 + (parseInt(second, 10) || 0);
    if (fraction) value += (parseInt(fraction, 10) || 0) / Math.pow(10, Math.min(3, fraction.length));
    return value;
  }

  function finalizeLines(lines, totalDuration) {
    lines.sort(function (a, b) { return a.t - b.t; });
    for (var i = 0; i < lines.length; i += 1) {
      var next = lines[i + 1];
      var inferred = next && next.t > lines[i].t ? next.t - lines[i].t : Math.max(2.4, Math.min(8, (Number(totalDuration) || lines[i].t + 4.8) - lines[i].t));
      lines[i].duration = clamp(lines[i].duration || inferred, 0.45, 18);
      lines[i].charCount = Math.max(1, Array.from ? Array.from(lines[i].text).length : lines[i].text.length);
    }
    return lines;
  }

  function parseLrc(text, totalDuration) {
    text = String(text || "").replace(/^\uFEFF/, "");
    var offsetMatch = text.match(/^\s*\[offset:([+-]?\d+)\]/im);
    var offset = offsetMatch ? (parseInt(offsetMatch[1], 10) || 0) / 1000 : 0;
    var result = [];
    var timePattern = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    text.split(/\r?\n/).forEach(function (source) {
      var times = [];
      var match;
      timePattern.lastIndex = 0;
      while ((match = timePattern.exec(source))) times.push(Math.max(0, lyricTime(match[1], match[2], match[3]) + offset));
      if (!times.length) return;
      var value = clean(source.replace(timePattern, ""));
      if (!value) return;
      times.forEach(function (time) { result.push({ t: time, text: value, source: "lrc" }); });
    });
    return finalizeLines(result, totalDuration);
  }

  function parsePlain(text, totalDuration) {
    var values = String(text || "").split(/\r?\n/).map(clean).filter(Boolean);
    if (!values.length) return [];
    var duration = Number(totalDuration) || Math.max(4.8, values.length * 4.8);
    var span = Math.max(1.8, duration / values.length);
    return finalizeLines(values.map(function (value, index) {
      return { t: index * span, duration: span, text: value, source: "estimated" };
    }), duration);
  }

  function safeStorage() {
    try {
      var storage = window.localStorage;
      if (!storage) return null;
      var probe = "__mineradio_lyrics_probe__";
      storage.setItem(probe, "1"); storage.removeItem(probe);
      return storage;
    } catch (error) { return null; }
  }

  function LyricsCache(storage) {
    this.storage = storage === undefined ? safeStorage() : storage;
    this.memory = Object.create(null);
    this.loaded = false;
  }

  LyricsCache.prototype.readAll = function () {
    if (this.loaded) return this.memory;
    this.loaded = true;
    if (!this.storage) return this.memory;
    try {
      var value = JSON.parse(this.storage.getItem(CACHE_KEY) || "{}");
      this.memory = value && typeof value === "object" ? value : Object.create(null);
    } catch (error) { return {}; }
    return this.memory;
  };

  LyricsCache.prototype.get = function (key) {
    var all = this.readAll();
    var entry = all[key];
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < now()) {
      delete all[key];
      this.writeAll(all);
      return null;
    }
    return entry.value || null;
  };

  LyricsCache.prototype.writeAll = function (all) {
    this.loaded = true;
    this.memory = all || Object.create(null);
    if (!this.storage) return;
    try { this.storage.setItem(CACHE_KEY, JSON.stringify(all)); } catch (error) {}
  };

  LyricsCache.prototype.put = function (key, value, negative) {
    var all = this.readAll();
    all[key] = { savedAt: now(), expiresAt: now() + (negative ? NEGATIVE_TTL : POSITIVE_TTL), value: value };
    var entries = Object.keys(all).map(function (item) { return { key: item, data: all[item] }; });
    entries.sort(function (a, b) { return (b.data.savedAt || 0) - (a.data.savedAt || 0); });
    var next = {};
    var chars = 2;
    entries.slice(0, CACHE_LIMIT).forEach(function (entry) {
      var size = JSON.stringify(entry.data).length + entry.key.length;
      if (chars + size > CACHE_CHAR_LIMIT) return;
      next[entry.key] = entry.data;
      chars += size;
    });
    this.writeAll(next);
  };

  function queryFromMedia(media) {
    media = media || {};
    var title = clean(media.title);
    var artist = clean(media.artist || media.albumArtist || media.subTitle);
    var inferred = false;
    if (!artist) {
      var split = title.match(/^(.{1,80}?)\s+[-–—]\s+(.{1,160})$/);
      if (split) { artist = clean(split[1]); title = clean(split[2]); inferred = true; }
    }
    return {
      title: title,
      artist: artist,
      album: clean(media.album || media.albumTitle),
      duration: Number(media.duration) || 0,
      neteaseId: /^\d+$/.test(String(media.neteaseId || "")) ? String(media.neteaseId) : "",
      inferredArtist: inferred
    };
  }

  function queryKey(query) {
    return [query.neteaseId ? "ncm:" + query.neteaseId : "", normalized(query.title), normalized(query.artist), normalized(query.album), query.duration > 0 ? Math.round(query.duration / 2) * 2 : 0].join("|");
  }

  function encodeQuery(values) {
    return Object.keys(values).filter(function (key) { return values[key] !== "" && values[key] != null && values[key] !== 0; }).map(function (key) {
      return encodeURIComponent(key) + "=" + encodeURIComponent(values[key]);
    }).join("&");
  }

  function LyricsService(options) {
    options = options || {};
    this.fetchImpl = options.fetch || (window.fetch ? window.fetch.bind(window) : null);
    this.baseUrl = String(options.baseUrl || "https://lrclib.net/api").replace(/\/$/, "");
    this.neteaseBaseUrl = String(options.neteaseBaseUrl || "https://music.163.com").replace(/\/$/, "");
    this.neteaseEnabled = options.netease !== false;
    this.cache = options.cache || new LyricsCache();
    this.activeController = null;
    this.timeoutMs = Math.max(2500, Number(options.timeoutMs) || 8500);
    this.searchFallbackDelayMs = Math.max(80, Math.min(900, Number(options.searchFallbackDelayMs) || 180));
    this.neteaseTimeoutMs = Math.max(800, Math.min(4000, Number(options.neteaseTimeoutMs) || 1800));
  }

  LyricsService.prototype.keyForMedia = function (media) { return queryKey(queryFromMedia(media)); };

  LyricsService.prototype.cancel = function () {
    if (this.activeController) this.activeController.abort();
    this.activeController = null;
  };

  LyricsService.prototype.fetchJson = function (url, signal) {
    if (!this.fetchImpl) return Promise.reject(new Error("FETCH_UNAVAILABLE"));
    return this.fetchImpl(url, { method: "GET", mode: "cors", cache: "no-cache", signal: signal }).then(function (response) {
      if (!response || !response.ok) {
        var error = new Error("HTTP_" + (response && response.status || 0));
        error.status = response && response.status || 0;
        throw error;
      }
      return response.json();
    });
  };

  LyricsService.prototype.within = function (promise, timeoutMs) {
    var handle = 0;
    return Promise.race([
      promise,
      new Promise(function (resolve, reject) {
        handle = setTimeout(function () { reject(new Error("PROVIDER_TIMEOUT")); }, timeoutMs);
      })
    ]).finally(function () { if (handle) clearTimeout(handle); });
  };

  LyricsService.prototype.lookup = function (media, force) {
    var self = this;
    var startedAt = clock();
    var query = queryFromMedia(media);
    if (!query.title) return Promise.resolve({ status: "insufficient", query: query, lines: [] });
    var key = queryKey(query);
    var cached = !force && this.cache.get(key);
    if (cached) return Promise.resolve(Object.assign({}, cached, { cached: true }));
    if (this.activeController) this.activeController.abort();
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    this.activeController = controller;
    var signal = controller ? controller.signal : undefined;
    var timeout = controller ? setTimeout(function () { controller.abort(); }, this.timeoutMs) : 0;
    var exactUrl = this.baseUrl + "/get?" + encodeQuery({
      track_name: query.title, artist_name: query.artist, album_name: query.album, duration: query.duration > 0 ? Math.round(query.duration) : 0
    });
    var searchUrl = this.baseUrl + "/search?" + encodeQuery(query.artist ? { track_name: query.title, artist_name: query.artist, album_name: query.album } : { q: query.title });

    function neteaseCandidate(raw) {
      raw = raw || {};
      var artists = raw.artists || raw.ar || [];
      var album = raw.album || raw.al || {};
      return {
        id: String(raw.id || ""),
        trackName: clean(raw.name),
        artistName: artists.map(function (item) { return clean(item && item.name); }).filter(Boolean).join("/"),
        albumName: clean(album.name),
        duration: (Number(raw.duration || raw.dt) || 0) / 1000
      };
    }

    function neteaseRecord(id, metadata, payload, score) {
      payload = payload || {};
      var source = lyricText(payload.lrc && payload.lrc.lyric);
      var lines = parseLrc(source, metadata.duration || query.duration);
      if (!lines.length && (payload.nolyric || payload.uncollected)) {
        return { status: "instrumental", provider: "netease", query: query, match: metadata, score: score || 1, synced: false, estimated: false, lines: [] };
      }
      if (!lines.length) return null;
      metadata.id = String(id);
      return {
        status: "ready", provider: "netease", query: query, match: metadata, score: score || 1,
        synced: true, estimated: false, lines: lines
      };
    }

    function accepted(raw) {
      var scored = scoreCandidate(query, raw);
      var useful = scored.candidate.instrumental || scored.candidate.syncedLyrics || scored.candidate.plainLyrics;
      if (!useful) return null;
      var artistOkay = !query.artist || scored.artistScore >= 0.48;
      var titleFloor = query.artist ? 0.64 : 0.82;
      var scoreFloor = query.artist ? 0.70 : 0.82;
      return scored.titleScore >= titleFloor && artistOkay && scored.score >= scoreFloor ? scored : null;
    }

    function durationFits(scored) {
      if (!scored || !(query.duration > 0) || !(scored.candidate.duration > 0)) return true;
      var tolerance = Math.max(4, Math.min(10, query.duration * 0.035));
      return scored.durationDelta <= tolerance;
    }

    function select(results) {
      var best = null;
      (Array.isArray(results) ? results : []).forEach(function (raw) {
        var scored = accepted(raw);
        if (!scored) return;
        scored.selectionScore = scored.score + (durationFits(scored) ? 0.12 : -Math.min(0.12, scored.durationDelta / 180));
        if (!best || scored.selectionScore > best.selectionScore) best = scored;
      });
      return best;
    }

    function toRecord(scored) {
      if (!scored) return { status: "not-found", query: query, lines: [] };
      var item = scored.candidate;
      var lines = parseLrc(item.syncedLyrics, item.duration || query.duration);
      var synced = lines.length > 0;
      if (!lines.length) lines = parsePlain(item.plainLyrics, item.duration || query.duration);
      return {
        status: item.instrumental ? "instrumental" : (lines.length ? "ready" : "not-found"),
        provider: "lrclib", query: query, match: item, score: scored.score,
        synced: synced, estimated: !synced && lines.length > 0, lines: lines
      };
    }

    var pendingTimers = [];
    var requestErrors = [];
    var lrclibErrorCount = 0;
    var deferredExact = null;
    function clearPendingTimers() {
      pendingTimers.forEach(function (handle) { clearTimeout(handle); });
      pendingTimers = [];
    }
    function delay(ms, task) {
      return new Promise(function (resolve) {
        var handle = setTimeout(function () { resolve(task()); }, ms);
        pendingTimers.push(handle);
      }).then(function (value) { return value; });
    }
    function firstAccepted(tasks) {
      return new Promise(function (resolve, reject) {
        var pending = tasks.length;
        var settled = false;
        function miss() {
          pending -= 1;
          if (!settled && pending <= 0) { settled = true; resolve(null); }
        }
        tasks.forEach(function (task) {
          var promise;
          try { promise = task(); } catch (error) { promise = Promise.reject(error); }
          Promise.resolve(promise).then(function (scored) {
            if (settled) return;
            if (scored) { settled = true; clearPendingTimers(); resolve(scored); }
            else miss();
          }, function (error) {
            if (settled) return;
            if (error && error.name === "AbortError") { settled = true; clearPendingTimers(); reject(error); return; }
            settled = true;
            clearPendingTimers();
            reject(error);
          });
        });
      });
    }
    function exactTask() {
      return self.fetchJson(exactUrl, signal).then(function (raw) {
        var scored = accepted(raw);
        if (scored && !durationFits(scored)) deferredExact = scored;
        return durationFits(scored) ? scored : null;
      }).catch(function (error) {
        if (error && error.name === "AbortError") throw error;
        lrclibErrorCount += 1;
        requestErrors.push("exact:" + clean(error && error.message || "failed"));
        return null;
      });
    }
    function searchTask() {
      return self.fetchJson(searchUrl, signal).then(select).catch(function (error) {
        if (error && error.name === "AbortError") throw error;
        lrclibErrorCount += 1;
        requestErrors.push("search:" + clean(error && error.message || "failed"));
        return null;
      });
    }

    function neteaseTask() {
      if (!self.neteaseEnabled) return Promise.resolve(null);
      var directId = query.neteaseId;
      var metadata = { id: directId, title: query.title, artist: query.artist, album: query.album, duration: query.duration };
      var songTask;
      if (directId) songTask = Promise.resolve({ id: directId, metadata: metadata, score: 1 });
      else {
        var words = clean(query.title + " " + query.artist);
        var url = self.neteaseBaseUrl + "/api/search/get?" + encodeQuery({ type: 1, limit: 12, offset: 0, s: words });
        songTask = self.fetchJson(url, signal).then(function (payload) {
          var songs = payload && payload.result && payload.result.songs || [];
          var best = null;
          songs.forEach(function (raw) {
            var candidate = neteaseCandidate(raw);
            var scored = scoreCandidate(query, candidate);
            var artistOkay = !query.artist || scored.artistScore >= 0.48;
            if (!candidate.id || scored.titleScore < (query.artist ? 0.64 : 0.84) || !artistOkay || scored.score < (query.artist ? 0.70 : 0.84)) return;
            if (!best || scored.score > best.score) best = { id: candidate.id, metadata: scored.candidate, score: scored.score };
          });
          return best;
        });
      }
      var request = Promise.resolve(songTask).then(function (song) {
        if (!song) throw new Error("NETEASE_NOT_FOUND");
        var lyricUrl = self.neteaseBaseUrl + "/api/song/lyric?" + encodeQuery({ id: song.id, lv: -1, tv: -1, rv: -1, kv: -1 });
        return self.fetchJson(lyricUrl, signal).then(function (payload) {
          return neteaseRecord(song.id, song.metadata, payload, song.score);
        });
      });
      return self.within(request, self.neteaseTimeoutMs).catch(function (error) {
        if (error && error.name === "AbortError") throw error;
        requestErrors.push("netease:" + clean(error && error.message || "failed"));
        return null;
      });
    }
    function lrclibTask() {
      var exactRequest = query.artist ? firstAccepted([
        exactTask,
        function () { return delay(self.searchFallbackDelayMs, searchTask); }
      ]) : Promise.resolve(null);
      return (query.artist ? exactRequest : searchTask()).then(function (scored) {
        clearPendingTimers();
        if (!scored && deferredExact) scored = deferredExact;
        var record = toRecord(scored);
        var expectedRequests = query.artist ? 2 : 1;
        if (!scored && lrclibErrorCount >= expectedRequests) record.status = "offline";
        return record;
      });
    }
    return neteaseTask().then(function (record) {
      return record || lrclibTask();
    }).then(function (record) {
      record.elapsedMs = Math.max(0, Math.round(clock() - startedAt));
      if (requestErrors.length) record.providerErrors = requestErrors.slice();
      if (record.status === "offline" && requestErrors.length) record.error = requestErrors.join(" | ");
      if (record.status !== "offline") self.cache.put(key, record, record.status === "not-found");
      return record;
    }).catch(function (error) {
      clearPendingTimers();
      if (error && error.name === "AbortError") return { status: "cancelled", query: query, lines: [] };
      return { status: "offline", query: query, lines: [], error: clean(error && error.message) };
    }).finally(function () {
      clearPendingTimers();
      if (timeout) clearTimeout(timeout);
      if (self.activeController === controller) self.activeController = null;
    });
  };

  function LyricsEngine(media, options) {
    this.media = media;
    this.service = new LyricsService(options);
    this.listeners = [];
    this.requestId = 0;
    this.timer = 0;
    this.timerDueAt = 0;
    this.loadedKey = "";
    this.loadedWithoutDuration = false;
    this.retryAttempt = 0;
    this.enabled = true;
    this.offset = 0;
    this.fallbackMode = "estimated";
    this.fallbackPosition = 0;
    this.fallbackAt = clock();
    this.fallbackPlaying = false;
    this.state = { status: "idle", provider: "", synced: false, estimated: false, lines: [], query: null, match: null, score: 0, cached: false };
  }

  LyricsEngine.prototype.subscribe = function (listener) {
    if (typeof listener !== "function") return function () {};
    this.listeners.push(listener);
    listener(this.snapshot());
    var self = this;
    return function () { self.listeners = self.listeners.filter(function (item) { return item !== listener; }); };
  };

  LyricsEngine.prototype.notify = function () {
    var snapshot = this.snapshot();
    this.listeners.slice().forEach(function (listener) { listener(snapshot); });
  };

  LyricsEngine.prototype.reset = function (status) {
    this.requestId += 1;
    this.loadedKey = "";
    this.state = { status: status || "idle", provider: "", synced: false, estimated: false, lines: [], query: null, match: null, score: 0, cached: false };
    operationLog("lyrics.reset", { status: this.state.status });
    this.notify();
  };

  LyricsEngine.prototype.setOptions = function (options) {
    options = options || {};
    this.enabled = options.enabled !== false;
    this.offset = clamp(options.offset || 0, -5, 5);
    this.fallbackMode = /^(estimated|static|hide)$/.test(options.fallbackMode) ? options.fallbackMode : "estimated";
    if (!this.enabled) { this.service.cancel(); this.reset("disabled"); }
    else if (this.state.status === "disabled") this.scheduleCurrent(0);
  };

  LyricsEngine.prototype.alignFallbackToMedia = function () {
    var current = this.media && this.media.current || {};
    var value = NaN;
    if (this.timelineFresh() && typeof this.media.positionSeconds === "function") value = this.media.positionSeconds();
    else if (isFinite(Number(current.position))) value = Number(current.position);
    if (isFinite(value)) {
      this.fallbackPosition = Math.max(0, value);
      this.fallbackAt = clock();
    }
    this.fallbackPlaying = !!(this.media && this.media.isPlaying && this.media.isPlaying());
  };

  LyricsEngine.prototype.timelineFresh = function () {
    var current = this.media && this.media.current || {};
    return !!current.timelineAvailable;
  };

  LyricsEngine.prototype.loadCurrent = function (force) {
    var self = this;
    var current = this.media && this.media.current || {};
    var key = this.service.keyForMedia(current);
    if (!this.enabled) {
      operationLog("lyrics.loadSkipped", { reason: "disabled" });
      this.reset("disabled");
      return Promise.resolve(this.snapshot());
    }
    if (!current.title) {
      operationLog("lyrics.loadSkipped", { reason: "no-title" });
      this.reset("insufficient");
      return Promise.resolve(this.snapshot());
    }
    if (!force && key === this.loadedKey && this.state.status !== "offline") {
      operationLog("lyrics.loadSkipped", { reason: "same-key", status: this.state.status });
      return Promise.resolve(this.snapshot());
    }
    this.loadedKey = key;
    this.loadedWithoutDuration = !(Number(current.duration) > 0);
    var requestId = ++this.requestId;
    this.state = { status: "loading", provider: "pending", synced: false, estimated: false, lines: [], query: queryFromMedia(current), match: null, score: 0, cached: false };
    operationLog("lyrics.request", {
      requestId: requestId,
      title: this.state.query.title,
      artist: this.state.query.artist,
      album: this.state.query.album,
      duration: this.state.query.duration,
      force: !!force
    });
    this.notify();
    return this.service.lookup(current, force).then(function (record) {
      if (requestId !== self.requestId || record.status === "cancelled") return self.snapshot();
      self.state = record;
      if (record.status === "ready" || record.status === "instrumental" || record.status === "not-found") self.retryAttempt = 0;
      operationLog("lyrics.result", {
        requestId: requestId,
        status: record.status,
        provider: record.provider || "",
        elapsedMs: record.elapsedMs || 0,
        lines: record.lines && record.lines.length || 0,
        synced: !!record.synced,
        cached: !!record.cached,
        score: record.score || 0,
        queryDuration: record.query && record.query.duration,
        matchDuration: record.match && record.match.duration,
        matchTitle: record.match && record.match.title,
        providerErrors: record.providerErrors && record.providerErrors.join(" | ") || "",
        error: record.error || ""
      });
      if (record.status === "ready") {
        var readyLine = self.lineState();
        operationLog("lyrics.readyLine", {
          index: readyLine.index,
          position: readyLine.position,
          characters: readyLine.line && readyLine.line.text ? readyLine.line.text.length : 0
        });
      }
      self.notify();
      if (record.status === "offline" && self.retryAttempt < 2) {
        var retryDelays = [1200, 4000];
        var retryDelay = retryDelays[self.retryAttempt];
        self.retryAttempt += 1;
        operationLog("lyrics.retry", { requestId: requestId, attempt: self.retryAttempt, delayMs: retryDelay });
        self.scheduleCurrent(retryDelay);
      }
      return self.snapshot();
    });
  };

  LyricsEngine.prototype.scheduleCurrent = function (delay) {
    var self = this;
    var delayMs = delay == null ? 80 : Math.max(0, Number(delay) || 0);
    var dueAt = clock() + delayMs;
    if (this.timer && this.timerDueAt && this.timerDueAt <= dueAt) return;
    if (this.timer) clearTimeout(this.timer);
    this.timerDueAt = dueAt;
    operationLog("lyrics.schedule", { delayMs: delayMs, status: this.state.status, title: this.media && this.media.current && this.media.current.title || "" });
    this.timer = setTimeout(function () {
      self.timer = 0;
      self.timerDueAt = 0;
      operationLog("lyrics.timerFire", { status: self.state.status, title: self.media && self.media.current && self.media.current.title || "" });
      self.loadCurrent(false).catch(function (error) {
        operationLog("lyrics.error", { phase: "timer-load", message: error && error.message || String(error) });
      });
    }, delayMs);
  };

  LyricsEngine.prototype.handleMedia = function (type) {
    var current = this.media && this.media.current || {};
    if (!this.enabled) return;
    if (type === "track") {
      if (this.timer) clearTimeout(this.timer);
      this.timer = 0;
      this.timerDueAt = 0;
      this.retryAttempt = 0;
      this.fallbackPosition = 0;
      this.fallbackAt = clock();
      this.fallbackPlaying = !!(this.media && this.media.isPlaying && this.media.isPlaying());
      this.service.cancel();
      this.reset(current.title ? "waiting" : "insufficient");
      this.loadCurrent(false).catch(function (error) {
        operationLog("lyrics.error", { phase: "track-load", message: error && error.message || String(error) });
      });
    } else if (type === "playback") {
      var playing = !!(this.media && this.media.isPlaying && this.media.isPlaying());
      if (this.timelineFresh()) this.alignFallbackToMedia();
      else {
        if (playing && !this.fallbackPlaying) this.fallbackAt = clock();
        if (!playing && this.fallbackPlaying) this.fallbackPosition += Math.max(0, clock() - this.fallbackAt) / 1000;
        this.fallbackPlaying = playing;
      }
      this.fallbackPlaying = playing;
      if (this.state.status === "ready") this.notify();
    } else if (type === "timeline" || type === "seek" || type === "timelineUnavailable" || type === "timelineIgnored") {
      this.alignFallbackToMedia();
      if (type === "seek") {
        var seekLine = this.lineState();
        operationLog("lyrics.seekSync", { position: this.position(), revision: current.seekRevision || 0 });
        if (this.state.status === "ready") {
          operationLog("lyrics.seekLine", {
            index: seekLine.index,
            position: seekLine.position,
            revision: current.seekRevision || 0,
            characters: seekLine.line && seekLine.line.text ? seekLine.line.text.length : 0
          });
        }
      }
      if (this.state.status === "ready") this.notify();
      if (current.title) {
        if (!this.loadedKey) this.scheduleCurrent(60);
        else if (this.loadedWithoutDuration && current.duration > 0 && (this.state.status !== "ready" || this.state.estimated)) this.scheduleCurrent(40);
      }
    } else if (type === "properties" && current.title) {
      var currentKey = this.service.keyForMedia(current);
      if (!this.loadedKey || currentKey !== this.loadedKey) this.scheduleCurrent(60);
      else if (this.loadedWithoutDuration && current.duration > 0 && (this.state.status !== "ready" || this.state.estimated)) this.scheduleCurrent(80);
    }
  };

  LyricsEngine.prototype.position = function () {
    if (!this.media) return 0;
    var value;
    if (this.timelineFresh() && typeof this.media.positionSeconds === "function") value = this.media.positionSeconds();
    else if (this.fallbackMode === "estimated") value = this.fallbackPosition + (this.fallbackPlaying ? Math.max(0, clock() - this.fallbackAt) / 1000 : 0);
    else value = 0;
    return Math.max(0, value + this.offset);
  };

  LyricsEngine.prototype.lineState = function () {
    var lines = this.state.lines || [];
    var position = this.position();
    if (!lines.length) return { index: -1, line: null, next: null, progress: 0, position: position };
    var timingMissing = !this.timelineFresh();
    if ((timingMissing || this.state.estimated) && this.fallbackMode === "hide") return { index: -1, line: null, next: lines[0], progress: 0, position: position };
    if ((timingMissing || this.state.estimated) && this.fallbackMode === "static") return { index: 0, line: lines[0], next: lines[1] || null, progress: 0, position: position };
    var low = 0, high = lines.length - 1, index = -1;
    while (low <= high) {
      var mid = (low + high) >> 1;
      if (lines[mid].t <= position + 0.035) { index = mid; low = mid + 1; } else high = mid - 1;
    }
    if (index < 0) return { index: -1, line: null, next: lines[0], progress: 0, position: position };
    var line = lines[index];
    var next = lines[index + 1] || null;
    var end = next && next.t > line.t ? next.t : line.t + (line.duration || 4.8);
    var raw = clamp((position - line.t) / Math.max(0.45, end - line.t), 0, 1);
    var progress = raw * raw * (3 - 2 * raw);
    return {
      index: index, line: line, next: next, progress: progress, position: position,
      seekRevision: Number(this.media && this.media.current && this.media.current.seekRevision) || 0
    };
  };

  LyricsEngine.prototype.snapshot = function () {
    var line = this.lineState();
    return Object.assign({}, this.state, {
      lines: (this.state.lines || []).slice(), currentIndex: line.index, currentLine: line.line,
      nextLine: line.next, progress: line.progress, position: line.position,
      timingAvailable: this.timelineFresh()
    });
  };

  LyricsEngine.prototype.usePreview = function () {
    var text = "Stay with me tonight\nLet the city turn to light\nEvery color follows sound\nWe are weightless for a while";
    if (this.timer) { clearTimeout(this.timer); this.timer = 0; }
    this.requestId += 1;
    this.loadedKey = "preview";
    this.state = { status: "ready", provider: "preview", synced: true, estimated: false, lines: parsePlain(text, 30), query: { title: "Die For You", artist: "Mineradio", duration: 30 }, match: null, score: 1, cached: false };
    this.notify();
  };

  NS.LyricsTools = {
    parseLrc: parseLrc, parsePlain: parsePlain, normalize: normalized,
    textSimilarity: textSimilarity, artistSimilarity: artistSimilarity,
    scoreCandidate: scoreCandidate, queryFromMedia: queryFromMedia, queryKey: queryKey
  };
  NS.LyricsCache = LyricsCache;
  NS.LyricsService = LyricsService;
  NS.LyricsEngine = LyricsEngine;
}());
