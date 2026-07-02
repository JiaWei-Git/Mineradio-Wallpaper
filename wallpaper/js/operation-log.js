(function () {
  "use strict";

  var NS = window.MineradioOriginal = window.MineradioOriginal || {};
  var STORAGE_KEY = "mineradio.we.operationLog.v1";
  var MAX_ENTRIES = 240;
  var MAX_STORAGE_CHARS = 180000;
  var entries = [];
  var enabled = false;
  var overlayEnabled = false;
  var loaded = false;
  var panel = null;
  var statusBox = null;
  var output = null;
  var copyButton = null;
  var statusProvider = null;

  function safeStorage() {
    try {
      var storage = window.localStorage;
      if (!storage) return null;
      return storage;
    } catch (error) { return null; }
  }

  function cleanText(value, limit) {
    var text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    return text.length > limit ? text.slice(0, limit) + "..." : text;
  }

  function sanitize(value, depth) {
    depth = depth || 0;
    if (value == null || typeof value === "boolean") return value;
    if (typeof value === "number") return isFinite(value) ? Math.round(value * 1000) / 1000 : null;
    if (typeof value === "string") return cleanText(value, 180);
    if (depth >= 2) return cleanText(value, 120);
    if (Array.isArray(value)) return value.slice(0, 10).map(function (item) { return sanitize(item, depth + 1); });
    if (typeof value === "object") {
      var result = {};
      Object.keys(value).slice(0, 16).forEach(function (key) { result[cleanText(key, 40)] = sanitize(value[key], depth + 1); });
      return result;
    }
    return cleanText(value, 120);
  }

  function load() {
    if (loaded) return;
    loaded = true;
    var storage = safeStorage();
    if (!storage) return;
    try {
      var saved = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(saved)) entries = saved.slice(-MAX_ENTRIES);
    } catch (error) { entries = []; }
  }

  function persist() {
    var storage = safeStorage();
    if (!storage) return;
    try {
      var json = JSON.stringify(entries.slice(-MAX_ENTRIES));
      while (json.length > MAX_STORAGE_CHARS && entries.length > 20) {
        entries.splice(0, Math.min(20, entries.length - 20));
        json = JSON.stringify(entries);
      }
      storage.setItem(STORAGE_KEY, json);
    } catch (error) {}
  }

  function formatStatus(status) {
    if (!status || typeof status !== "object") return "";
    var lines = [];
    if (status.label) lines.push("网易云增强：" + cleanText(status.label, 80));
    if (status.title || status.artist) lines.push("当前媒体：" + cleanText([status.title, status.artist].filter(Boolean).join(" - "), 120));
    if (status.mode) lines.push("模式：" + cleanText(status.mode, 48));
    if (status.action && status.action !== "none") lines.push("处理建议：" + cleanText(status.action, 160));
    return lines.join("\n");
  }

  function lineFor(entry) {
    var time = String(entry.at || "").slice(11, 19);
    var data = entry.data && Object.keys(entry.data).length ? " " + JSON.stringify(entry.data) : "";
    return time + "  " + entry.type + data;
  }

  function exportText() {
    load();
    return entries.map(lineFor).join("\n");
  }

  function copyText() {
    var text = exportText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        if (copyButton) copyButton.textContent = "已复制";
      }, fallbackCopy);
      return;
    }
    fallbackCopy();

    function fallbackCopy() {
      if (!document.createElement || !document.body) return;
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "readonly");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      try { document.execCommand("copy"); } catch (error) {}
      document.body.removeChild(area);
      if (copyButton) copyButton.textContent = "已复制";
    }
  }

  function ensurePanel() {
    if (panel || !document.createElement || !document.body) return;
    panel = document.createElement("aside");
    panel.id = "operation-log-panel";
    panel.innerHTML = '<div class="operation-log-head"><span>MINERADIO 诊断日志</span><button type="button">复制日志</button></div><div class="operation-log-status"></div><pre></pre>';
    statusBox = panel.querySelector(".operation-log-status");
    output = panel.querySelector("pre");
    copyButton = panel.querySelector("button");
    copyButton.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      copyText();
    });
    document.body.appendChild(panel);
  }

  function render() {
    ensurePanel();
    if (!panel) return;
    panel.hidden = !overlayEnabled;
    if (!overlayEnabled || !output) return;
    if (statusBox) {
      var statusText = "";
      try { statusText = statusProvider ? formatStatus(statusProvider()) : ""; } catch (error) { statusText = ""; }
      statusBox.textContent = statusText;
      statusBox.hidden = !statusText;
    }
    output.textContent = entries.slice(-16).map(lineFor).join("\n") || "暂无日志";
    output.scrollTop = output.scrollHeight;
  }

  function add(type, data) {
    if (!enabled) return;
    entries.push({ at: new Date().toISOString(), type: cleanText(type || "event", 64), data: sanitize(data || {}, 0) });
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    persist();
    render();
  }

  function configure(options) {
    options = options || {};
    var wasEnabled = enabled;
    enabled = options.enabled === true;
    if (enabled) load();
    overlayEnabled = enabled && options.overlay === true;
    render();
    if (enabled && (!wasEnabled || options.recordConfiguration)) add("log.configure", { enabled: enabled, overlay: overlayEnabled });
  }

  function clear() {
    entries = [];
    loaded = true;
    var storage = safeStorage();
    try { if (storage) storage.removeItem(STORAGE_KEY); } catch (error) {}
    render();
  }

  NS.OperationLog = {
    add: add,
    clear: clear,
    configure: configure,
    copyText: copyText,
    exportText: exportText,
    enabled: function () { return enabled; },
    setStatusProvider: function (provider) {
      statusProvider = typeof provider === "function" ? provider : null;
      render();
    },
    snapshot: function () { if (!loaded && enabled) load(); return entries.slice(); }
  };

  if (window.addEventListener) {
    window.addEventListener("error", function (event) {
      add("runtime.error", { message: event && event.message, file: event && event.filename, line: event && event.lineno, column: event && event.colno });
    });
    window.addEventListener("unhandledrejection", function (event) {
      var reason = event && event.reason;
      add("runtime.rejection", { message: reason && reason.message || reason });
    });
  }
  add("session.start", { version: "5.1" });
}());
