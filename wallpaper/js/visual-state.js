(function () {
  "use strict";

  var NS = window.MineradioOriginal = window.MineradioOriginal || {};

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function parseColor(value, fallback) {
    if (typeof value !== "string") return parseColor(fallback || "#00f5d4");
    var text = value.trim();
    var shortHex = text.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    if (shortHex) {
      text = "#" + shortHex.slice(1).map(function (part) { return part + part; }).join("");
    }
    var hex = text.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      var raw = hex[1];
      return {
        r: parseInt(raw.slice(0, 2), 16),
        g: parseInt(raw.slice(2, 4), 16),
        b: parseInt(raw.slice(4, 6), 16)
      };
    }
    var rgb = text.match(/rgba?\(([^)]+)\)/i);
    if (rgb) {
      var parts = rgb[1].split(",").map(function (item) { return Number(item.trim()); });
      if (parts.length >= 3 && parts.every(function (item) { return isFinite(item); })) {
        return { r: clamp(parts[0], 0, 255), g: clamp(parts[1], 0, 255), b: clamp(parts[2], 0, 255) };
      }
    }
    var channels = text.split(/\s+/).map(Number);
    if (channels.length >= 3 && channels.slice(0, 3).every(function (item) { return isFinite(item); })) {
      var scale = Math.max(channels[0], channels[1], channels[2]) <= 1 ? 255 : 1;
      return { r: clamp(channels[0] * scale, 0, 255), g: clamp(channels[1] * scale, 0, 255), b: clamp(channels[2] * scale, 0, 255) };
    }
    return fallback ? parseColor(fallback) : { r: 0, g: 245, b: 212 };
  }

  function rgbToCss(color, alpha) {
    if (alpha == null) return "rgb(" + Math.round(color.r) + "," + Math.round(color.g) + "," + Math.round(color.b) + ")";
    return "rgba(" + Math.round(color.r) + "," + Math.round(color.g) + "," + Math.round(color.b) + "," + alpha + ")";
  }

  function mix(a, b, amount) {
    amount = clamp(amount, 0, 1);
    return {
      r: a.r + (b.r - a.r) * amount,
      g: a.g + (b.g - a.g) * amount,
      b: a.b + (b.b - a.b) * amount
    };
  }

  function brighten(color, amount) {
    return mix(color, { r: 255, g: 255, b: 255 }, amount);
  }

  function darken(color, amount) {
    return mix(color, { r: 5, g: 6, b: 8 }, amount);
  }

  function VisualState() {
    this.properties = Object.assign({}, NS.PropertyDefaults);
    this.palette = {
      accent: parseColor("#00f5d4"),
      primary: parseColor("#d6f8ff"),
      secondary: parseColor("#9cffdf"),
      highlight: parseColor("#fff0b8"),
      deep: parseColor("#050608")
    };
  }

  VisualState.prototype.setProperties = function (properties) {
    this.properties = Object.assign({}, this.properties, properties || {});
    this.palette.accent = parseColor(this.properties.visualTintColor, "#9db8cf");
  };

  VisualState.prototype.updatePalette = function (media) {
    var current = media && media.current ? media.current : media;
    var accent = parseColor(this.properties.visualTintColor, "#9db8cf");
    if (this.properties.visualTintMode === "auto" && current) {
      var p = parseColor(current.primaryColor, "");
      var s = parseColor(current.secondaryColor, "");
      var t = parseColor(current.tertiaryColor, "");
      if (current.primaryColor) accent = mix(accent, p, 0.62);
      this.palette.primary = current.primaryColor ? brighten(p, 0.30) : brighten(accent, 0.48);
      this.palette.secondary = current.secondaryColor ? brighten(s, 0.18) : brighten(accent, 0.22);
      this.palette.highlight = current.tertiaryColor ? brighten(t, 0.36) : parseColor("#fff0b8");
    } else {
      this.palette.primary = brighten(accent, 0.48);
      this.palette.secondary = brighten(accent, 0.18);
      this.palette.highlight = parseColor("#fff0b8");
    }
    this.palette.accent = accent;
    this.palette.deep = darken(accent, 0.91);

    document.documentElement.style.setProperty("--accent", rgbToCss(this.palette.accent));
  };

  VisualState.prototype.snapshot = function () {
    return {
      properties: Object.assign({}, this.properties),
      palette: {
        accent: this.palette.accent,
        primary: this.palette.primary,
        secondary: this.palette.secondary,
        highlight: this.palette.highlight,
        deep: this.palette.deep
      }
    };
  };

  NS.VisualState = VisualState;
  NS.ColorTools = {
    parseColor: parseColor,
    rgbToCss: rgbToCss,
    mix: mix,
    brighten: brighten,
    darken: darken
  };
}());
