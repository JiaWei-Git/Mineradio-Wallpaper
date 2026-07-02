(function () {
  "use strict";

  var NS = window.MineradioOriginal = window.MineradioOriginal || {};
  var THREE = window.THREE;
  var MASK_WIDTH = 2048;
  var MASK_HEIGHT = 384;
  var WORLD_WIDTH = 6.10;
  var WORLD_HEIGHT = WORLD_WIDTH * MASK_HEIGHT / MASK_WIDTH;
  var SPARK_COUNT = 132;
  var RIVER_COUNT = 420;

  function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }
  function follow(value, target, rate, dt) { return value + (target - value) * (1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt))); }
  function operationLog(type, data) { if (NS.OperationLog && NS.OperationLog.add) NS.OperationLog.add(type, data); }
  function operationLogEnabled() { return !!(NS.OperationLog && NS.OperationLog.enabled && NS.OperationLog.enabled()); }

  function colorToThree(source, fallback, floor) {
    source = source || fallback || { r: 214, g: 248, b: 255 };
    var color = new THREE.Color(clamp(source.r, 0, 255) / 255, clamp(source.g, 0, 255) / 255, clamp(source.b, 0, 255) / 255);
    var luminance = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
    floor = floor == null ? 0.34 : floor;
    if (luminance < floor) {
      var lift = floor - luminance;
      color.r = Math.min(1, color.r + lift);
      color.g = Math.min(1, color.g + lift);
      color.b = Math.min(1, color.b + lift);
    }
    return color;
  }

  function lyricPaletteFromColor(source, fallback) {
    var base = colorToThree(source, fallback || { r: 169, g: 184, b: 200 }, 0);
    var hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    var neutral = hsl.s < 0.035;
    var saturation = neutral ? 0 : clamp(hsl.s * 1.08, 0.14, 0.92);
    var lightness = hsl.l;
    if (lightness < 0.11) lightness = 0.15 + lightness * 1.18;
    else if (lightness < 0.28) lightness = 0.21 + (lightness - 0.11) * 1.18;
    else lightness = clamp(lightness, 0.30, 0.82);
    lightness = clamp(lightness, 0.14, 0.84);
    return {
      primary: new THREE.Color().setHSL(hsl.h, saturation, lightness),
      secondary: new THREE.Color().setHSL(
        (hsl.h + 0.055) % 1,
        neutral ? 0 : clamp(saturation * 0.88, 0.12, 0.78),
        clamp(lightness + (lightness < 0.38 ? 0.10 : -0.08), 0.18, 0.76)
      ),
      highlight: new THREE.Color().setHSL(
        (hsl.h + 0.018) % 1,
        neutral ? 0 : clamp(saturation * 0.72, 0.10, 0.70),
        clamp(lightness + 0.22, 0.38, 0.92)
      )
    };
  }

  function createCanvas(width, height) {
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function fontStack(key) {
    if (key === "hei") return '"Microsoft YaHei UI","HarmonyOS Sans SC","PingFang SC","Noto Sans SC",sans-serif';
    if (key === "song") return 'SimSun,"Songti SC","Noto Serif SC",serif';
    if (key === "gothic") return '"Old English Text MT","Cinzel Decorative","Noto Serif SC",serif';
    if (key === "editorial") return 'Didot,"Bodoni 72","Times New Roman","Noto Serif SC",serif';
    if (key === "humanist") return '"Avenir Next","Segoe UI",Inter,"Noto Sans SC",sans-serif';
    if (key === "mono") return '"JetBrains Mono",Consolas,"Noto Sans SC","Microsoft YaHei",monospace';
    if (key === "display") return '"Alibaba PuHuiTi","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif';
    return 'Inter,"Noto Sans SC","PingFang SC","Microsoft YaHei UI","Microsoft YaHei",Arial,sans-serif';
  }

  function textWidth(ctx, text, spacing) {
    var characters = Array.from ? Array.from(text) : text.split("");
    if (!spacing || characters.length < 2) return ctx.measureText(text).width;
    var width = 0;
    characters.forEach(function (character, index) { width += ctx.measureText(character).width + (index < characters.length - 1 ? spacing : 0); });
    return width;
  }

  function fitText(ctx, text, style) {
    var maxWidth = MASK_WIDTH - 190;
    var fontSize = 128;
    var measured = 1;
    for (; fontSize >= 42; fontSize -= 4) {
      ctx.font = style.weight + " " + fontSize + "px " + fontStack(style.font);
      measured = Math.max(1, textWidth(ctx, text, style.letterSpacing * fontSize));
      if (measured <= maxWidth) break;
    }
    var scaleX = measured > maxWidth ? Math.max(0.68, maxWidth / measured) : 1;
    return { fontSize: fontSize, measured: measured, width: Math.min(maxWidth, measured * scaleX), scaleX: scaleX };
  }

  function drawText(ctx, text, fit, style, stroke) {
    ctx.save();
    ctx.translate(MASK_WIDTH / 2, 0);
    ctx.scale(fit.scaleX, 1);
    var characters = Array.from ? Array.from(text) : text.split("");
    var spacing = style.letterSpacing * fit.fontSize;
    var y = MASK_HEIGHT / 2 + fit.fontSize * 0.32;
    if (!spacing || characters.length < 2) {
      if (stroke) ctx.strokeText(text, 0, y); else ctx.fillText(text, 0, y);
    } else {
      ctx.textAlign = "left";
      var cursor = -textWidth(ctx, text, spacing) / 2;
      characters.forEach(function (character, index) {
        if (stroke) ctx.strokeText(character, cursor, y); else ctx.fillText(character, cursor, y);
        cursor += ctx.measureText(character).width + (index < characters.length - 1 ? spacing : 0);
      });
    }
    ctx.restore();
  }

  function renderMask(slot, text) {
    var ctx = slot.maskContext;
    var style = slot.owner.style;
    ctx.clearRect(0, 0, MASK_WIDTH, MASK_HEIGHT);
    text = String(text || "").replace(/\s+/g, " ").trim();
    var fit = fitText(ctx, text, style);
    ctx.font = style.weight + " " + fit.fontSize + "px " + fontStack(style.font);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#fff";
    drawText(ctx, text, fit, style, false);
    slot.maskTexture.needsUpdate = true;
    slot.textWorldWidth = WORLD_WIDTH * fit.width / MASK_WIDTH;
    slot.textWorldHeight = WORLD_HEIGHT * fit.fontSize / MASK_HEIGHT;
    slot.textMaterial.uniforms.uTextMin.value = (MASK_WIDTH / 2 - fit.width / 2) / MASK_WIDTH;
    slot.textMaterial.uniforms.uTextMax.value = (MASK_WIDTH / 2 + fit.width / 2) / MASK_WIDTH;

    var glow = slot.glowContext;
    glow.clearRect(0, 0, MASK_WIDTH, MASK_HEIGHT);
    glow.font = ctx.font;
    glow.textAlign = "center";
    glow.textBaseline = "alphabetic";
    glow.fillStyle = "#fff";
    glow.strokeStyle = "#fff";
    [
      { blur: 14, alpha: 0.46, line: Math.max(10, fit.fontSize * 0.10) },
      { blur: 34, alpha: 0.34, line: Math.max(18, fit.fontSize * 0.18) },
      { blur: 78, alpha: 0.22, line: Math.max(28, fit.fontSize * 0.26) }
    ].forEach(function (pass) {
      glow.save();
      glow.filter = "blur(" + pass.blur + "px)";
      glow.globalAlpha = pass.alpha;
      glow.lineWidth = pass.line;
      drawText(glow, text, fit, style, true);
      drawText(glow, text, fit, style, false);
      glow.restore();
    });
    slot.glowTexture.needsUpdate = true;
    slot.text = text;
  }

  function createSunTexture() {
    var canvas = createCanvas(1024, 512);
    var ctx = canvas.getContext("2d");
    var cx = canvas.width * 0.5;
    var cy = canvas.height * 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(2.05, 1);
    var radial = ctx.createRadialGradient(0, 0, 0, 0, 0, canvas.height * 0.43);
    radial.addColorStop(0, "rgba(255,246,186,.92)");
    radial.addColorStop(0.18, "rgba(255,219,126,.44)");
    radial.addColorStop(0.46, "rgba(255,186,82,.15)");
    radial.addColorStop(1, "rgba(255,186,82,0)");
    ctx.fillStyle = radial;
    ctx.fillRect(-canvas.width, -canvas.height, canvas.width * 2, canvas.height * 2);
    ctx.restore();
    var texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }

  function createTextMaterial(texture) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uProgress: { value: 0 },
        uTextMin: { value: 0.1 },
        uTextMax: { value: 0.9 },
        uOpacity: { value: 0 },
        uReadability: { value: 0.86 },
        uSolar: { value: 0 },
        uFeather: { value: 0.050 },
        uTexel: { value: new THREE.Vector2(1 / MASK_WIDTH, 1 / MASK_HEIGHT) },
        uBaseColor: { value: new THREE.Color(0xd6f8ff) },
        uHiColor: { value: new THREE.Color(0xfff0b8) },
        uGlowColor: { value: new THREE.Color(0x9cffdf) },
        uSolarColor: { value: new THREE.Color(0xfff4cc) }
      },
      vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: [
        "precision highp float;",
        "uniform sampler2D uMap;",
        "uniform float uProgress,uTextMin,uTextMax,uOpacity,uReadability,uSolar,uFeather;",
        "uniform vec2 uTexel;",
        "uniform vec3 uBaseColor,uHiColor,uGlowColor,uSolarColor;",
        "varying vec2 vUv;",
        "void main(){",
        " vec2 uv=gl_FrontFacing?vUv:vec2(1.0-vUv.x,vUv.y);",
        " float mask=texture2D(uMap,uv).a;",
        " vec2 d=uTexel*vec2(3.2,4.0);",
        " float around=max(max(texture2D(uMap,uv+vec2(d.x,0.0)).a,texture2D(uMap,uv-vec2(d.x,0.0)).a),max(texture2D(uMap,uv+vec2(0.0,d.y)).a,texture2D(uMap,uv-vec2(0.0,d.y)).a));",
        " around=max(around,max(max(texture2D(uMap,uv+d).a,texture2D(uMap,uv-d).a),max(texture2D(uMap,uv+vec2(d.x,-d.y)).a,texture2D(uMap,uv+vec2(-d.x,d.y)).a)));",
        " float outline=max(0.0,around-mask);",
        " if(max(mask,outline)<0.008)discard;",
        " float denom=max(.001,uTextMax-uTextMin);",
        " float p=clamp((uv.x-uTextMin)/denom,0.0,1.0);",
        " float filled=1.0-smoothstep(uProgress,uProgress+uFeather,p);",
        " float edge=1.0-smoothstep(0.0,uFeather*2.8,abs(p-uProgress));",
        " vec3 color=mix(uBaseColor,uHiColor,filled*.88);",
        " color+=uGlowColor*edge*.14+uSolarColor*(uSolar*(.085+edge*.22));",
        " float lum=dot(color,vec3(.299,.587,.114));color+=vec3(max(0.0,.30-lum));",
        " vec3 outlineColor=mix(vec3(.015,.024,.032),uGlowColor,.16);",
        " float alpha=clamp(mask*uOpacity+outline*uReadability*uOpacity,0.0,1.0);",
        " gl_FragColor=vec4(mix(outlineColor,color,mask),alpha);",
        "}"
      ].join("\n"),
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    });
  }

  function createSparkMaterial(dotTexture, pixelUniform) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: dotTexture }, uSize: { value: 0.052 }, uOpacity: { value: 0 },
        uColor: { value: new THREE.Color(0xfff7d2) }, uPixel: pixelUniform
      },
      vertexShader: [
        "attribute float seed;uniform float uSize,uPixel;varying float vSeed;",
        "void main(){vSeed=seed;vec4 mv=modelViewMatrix*vec4(position,1.0);float jitter=.58+fract(sin(seed*19.17)*43758.5453)*1.18;float depth=clamp(2.2/max(.35,-mv.z),.54,1.55);gl_PointSize=uSize*jitter*depth*uPixel*120.0;gl_Position=projectionMatrix*mv;}"
      ].join("\n"),
      fragmentShader: [
        "precision highp float;uniform sampler2D uMap;uniform vec3 uColor;uniform float uOpacity;varying float vSeed;",
        "void main(){vec4 tex=texture2D(uMap,gl_PointCoord);float twinkle=.72+fract(sin(vSeed*7.31)*91.7)*.28;gl_FragColor=vec4(uColor*twinkle,tex.a*uOpacity);}"
      ].join("\n"),
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
  }

  function createSlot(owner, index) {
    var slot = { owner: owner, index: index, active: false, outgoing: false, age: 0, seed: Math.random() * 100, text: "", lineIndex: -1 };
    slot.group = new THREE.Group();
    slot.group.visible = false;
    slot.maskCanvas = createCanvas(MASK_WIDTH, MASK_HEIGHT);
    slot.maskContext = slot.maskCanvas.getContext("2d");
    slot.maskTexture = new THREE.CanvasTexture(slot.maskCanvas);
    slot.maskTexture.minFilter = slot.maskTexture.magFilter = THREE.LinearFilter;
    slot.maskTexture.generateMipmaps = false;
    slot.glowCanvas = createCanvas(MASK_WIDTH, MASK_HEIGHT);
    slot.glowContext = slot.glowCanvas.getContext("2d");
    slot.glowTexture = new THREE.CanvasTexture(slot.glowCanvas);
    slot.glowTexture.minFilter = slot.glowTexture.magFilter = THREE.LinearFilter;
    slot.glowTexture.generateMipmaps = false;

    slot.sunMaterial = new THREE.MeshBasicMaterial({ map: owner.sunTexture, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, color: 0xffe6a4 });
    slot.sun = new THREE.Mesh(owner.sunGeometry, slot.sunMaterial);
    slot.sun.renderOrder = 40;
    slot.sun.position.set(0, 0.02, -0.035);
    slot.group.add(slot.sun);

    slot.glowMaterial = new THREE.MeshBasicMaterial({ map: slot.glowTexture, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, color: 0x9cffdf });
    slot.glow = new THREE.Mesh(owner.planeGeometry, slot.glowMaterial);
    slot.glow.renderOrder = 41;
    slot.glow.scale.set(1.08, 1.18, 1);
    slot.group.add(slot.glow);

    slot.textMaterial = createTextMaterial(slot.maskTexture);
    slot.textMesh = new THREE.Mesh(owner.planeGeometry, slot.textMaterial);
    slot.textMesh.renderOrder = 43;
    slot.group.add(slot.textMesh);

    var geometry = new THREE.BufferGeometry();
    var positions = new Float32Array(SPARK_COUNT * 3);
    var base = new Float32Array(SPARK_COUNT * 3);
    var seeds = new Float32Array(SPARK_COUNT);
    for (var i = 0; i < SPARK_COUNT; i += 1) {
      var angle = Math.random() * Math.PI * 2;
      var ring = 0.78 + Math.pow(Math.random(), 1.45) * 0.58;
      positions[i * 3] = Math.cos(angle) * (2.2 + Math.random() * 1.1) * ring;
      positions[i * 3 + 1] = Math.sin(angle) * (0.46 + Math.random() * 0.22) * ring;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.24;
      base[i * 3] = positions[i * 3]; base[i * 3 + 1] = positions[i * 3 + 1]; base[i * 3 + 2] = positions[i * 3 + 2];
      seeds[i] = Math.random() * 1000;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
    slot.sparkBase = base;
    slot.sparkMaterial = createSparkMaterial(owner.stage.dotTexture, owner.pixelUniform);
    slot.sparks = new THREE.Points(geometry, slot.sparkMaterial);
    slot.sparks.renderOrder = 44;
    slot.group.add(slot.sparks);
    owner.root.add(slot.group);
    return slot;
  }

  function createRiver(owner) {
    var geometry = new THREE.BufferGeometry();
    var seeds = new Float32Array(RIVER_COUNT);
    var lanes = new Float32Array(RIVER_COUNT);
    var depths = new Float32Array(RIVER_COUNT);
    for (var i = 0; i < RIVER_COUNT; i += 1) { seeds[i] = Math.random() * 1000; lanes[i] = Math.random(); depths[i] = Math.random(); }
    geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute("lane", new THREE.BufferAttribute(lanes, 1));
    geometry.setAttribute("depthSeed", new THREE.BufferAttribute(depths, 1));
    var material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: owner.stage.dotTexture }, uTime: { value: 0 }, uPixel: owner.pixelUniform,
        uBass: { value: 0 }, uBeat: { value: 0 }, uWidth: { value: 4.2 }, uHeight: { value: 0.58 },
        uOpacity: { value: 0 }, uColorA: { value: new THREE.Color(0x9cffdf) }, uColorB: { value: new THREE.Color(0xfff7d2) }
      },
      vertexShader: [
        "precision highp float;attribute float seed,lane,depthSeed;uniform float uTime,uPixel,uBass,uBeat,uWidth,uHeight;varying float vSeed,vLane,vGlow;float hash(float n){return fract(sin(n)*43758.5453123);}",
        "void main(){float laneBand=floor(lane*5.0);float laneLocal=fract(lane*5.0);float speed=.030+hash(seed*1.71)*.055+laneBand*.005;float flow=fract(hash(seed*2.13)+uTime*speed);float x=(flow-.5)*uWidth*(1.08+hash(seed*5.1)*.18);float curve=sin(flow*6.2831853*(.92+hash(seed*4.0)*.46)+seed*.071+uTime*.34);float breath=sin(uTime*(.42+hash(seed*6.9)*.42)+seed*.093);float y=(laneBand-2.0)*uHeight*.135+curve*uHeight*(.20+hash(seed*9.0)*.18)+(laneLocal-.5)*uHeight*.16+breath*uHeight*.10;float z=-.08+(depthSeed-.5)*.44+sin(uTime*(.18+hash(seed)*.24)+seed)*.08;float edge=smoothstep(0.0,.18,flow)*(1.0-smoothstep(.82,1.0,flow));vSeed=seed;vLane=lane;vGlow=edge*(.62+.38*sin(uTime*(.9+hash(seed*8.0)*.7)+seed));vec4 mv=modelViewMatrix*vec4(x,y,z,1.0);float dist=max(.45,-mv.z);float size=(.030+hash(seed*12.0)*.040+vGlow*.024+uBeat*.010)*(1.0+uBass*.18);gl_PointSize=clamp(size*uPixel*120.0/dist,1.0,7.2);gl_Position=projectionMatrix*mv;}"
      ].join("\n"),
      fragmentShader: [
        "precision highp float;uniform sampler2D uMap;uniform vec3 uColorA,uColorB;uniform float uOpacity,uTime,uBeat;varying float vSeed,vLane,vGlow;",
        "void main(){vec4 tex=texture2D(uMap,gl_PointCoord);if(tex.a<.02)discard;float tw=pow(.5+.5*sin(uTime*(.55+fract(vSeed)*.35)+vSeed),4.0);vec3 col=mix(uColorA,uColorB,smoothstep(.12,.92,vLane)*.45+tw*.42+vGlow*.26);float alpha=tex.a*uOpacity*(.20+vGlow*.78+tw*.32+uBeat*.10);gl_FragColor=vec4(col*(.82+vGlow*.72+tw*.32),alpha);}"
      ].join("\n"),
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    var river = new THREE.Points(geometry, material);
    river.renderOrder = 45;
    river.frustumCulled = false;
    river.position.set(0, 0.2, 1.53);
    owner.root.add(river);
    return river;
  }

  function LyricsVisual(stage, engine, visual) {
    this.stage = stage;
    this.engine = engine;
    this.visual = visual;
    this.disabled = !THREE || !stage || stage.disabled || !stage.scene;
    if (this.disabled) return;
    this.root = new THREE.Group();
    this.root.renderOrder = 38;
    this.root.visible = false;
    this.stage.scene.add(this.root);
    this.planeGeometry = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT, 1, 1);
    this.sunGeometry = new THREE.PlaneGeometry(WORLD_WIDTH * 1.12, WORLD_HEIGHT * 1.36, 1, 1);
    this.sunTexture = createSunTexture();
    this.pixelUniform = stage.uniforms && stage.uniforms.uPixel || { value: Math.min(window.devicePixelRatio || 1, 2) };
    this.slots = [createSlot(this, 0), createSlot(this, 1)];
    this.river = createRiver(this);
    this.current = null;
    this.currentIndex = -1;
    this.lastSeekRevision = null;
    this.debugSignature = "";
    this.style = { font: "hei", weight: 900, letterSpacing: 0, lineHeight: 1 };
    this.paletteCache = {};
    this.highBloom = 0;
    this.beatGlow = 0;
    this.riverWidth = 4.2;
    this.riverHeight = 0.58;
    this.worldPosition = new THREE.Vector3();
    this.worldQuaternion = new THREE.Quaternion();
    this.viewDirection = new THREE.Vector3();
    this.viewRight = new THREE.Vector3();
    this.viewUp = new THREE.Vector3();
    this.layoutEuler = new THREE.Euler(0, 0, 0, "YXZ");
    this.layoutQuaternion = new THREE.Quaternion();
    this.mouthLocal = new THREE.Vector3(0.025, -0.72, 0.62);
    this.skullMode = false;
  }

  LyricsVisual.prototype.updateStyle = function (props) {
    var font = props.lyricFont || "hei";
    var weight = Math.round(clamp(props.lyricWeight || 900, 500, 900) / 50) * 50;
    var letterSpacing = clamp(props.lyricLetterSpacing || 0, -0.04, 0.18);
    var lineHeight = clamp(props.lyricLineHeight || 1, 0.86, 1.35);
    if (font === this.style.font && weight === this.style.weight && letterSpacing === this.style.letterSpacing && lineHeight === this.style.lineHeight) return;
    this.style.font = font;
    this.style.weight = weight;
    this.style.letterSpacing = letterSpacing;
    this.style.lineHeight = lineHeight;
    this.slots.forEach(function (slot) { if (slot.group.visible && slot.text) renderMask(slot, slot.text); });
  };

  LyricsVisual.prototype.setLine = function (index, text) {
    text = String(text || "").trim();
    if (!text) { this.clear(); return; }
    if (this.current && this.currentIndex === index && this.current.text === text) return;
    if (this.current) { this.current.outgoing = true; this.current.active = false; this.current.age = 0; }
    var next = this.slots[0] === this.current ? this.slots[1] : this.slots[0];
    next.outgoing = false; next.active = true; next.age = 0; next.lineIndex = index;
    next.group.visible = true;
    next.group.position.set(0, this.skullMode ? -0.070 : 0.2, this.skullMode ? 0.018 : 1.46);
    next.group.scale.setScalar(0.96);
    renderMask(next, text);
    this.current = next;
    this.currentIndex = index;
    this.root.visible = true;
    operationLog("lyrics.line", {
      index: index,
      position: this.engine && this.engine.position ? this.engine.position() : 0,
      characters: Array.from ? Array.from(text).length : text.length
    });
  };

  LyricsVisual.prototype.clear = function () {
    if (this.current) { this.current.active = false; this.current.outgoing = true; this.current.age = 0; }
    this.current = null;
    this.currentIndex = -1;
  };

  LyricsVisual.prototype.resetTransitions = function () {
    this.slots.forEach(function (slot) {
      slot.active = false;
      slot.outgoing = false;
      slot.age = 0;
      slot.group.visible = false;
      slot.textMaterial.uniforms.uOpacity.value = 0;
      slot.glowMaterial.opacity = 0;
      slot.sunMaterial.opacity = 0;
      slot.sparkMaterial.uniforms.uOpacity.value = 0;
    });
    this.current = null;
    this.currentIndex = -1;
    operationLog("lyrics.visualReset", { reason: "seek" });
  };

  LyricsVisual.prototype.updatePalette = function (props) {
    var palette = this.visual && this.visual.palette || {};
    var cache = this.paletteCache;
    if (cache.primary === palette.primary &&
        cache.secondary === palette.secondary &&
        cache.highlight === palette.highlight &&
        cache.colorMode === props.lyricColorMode &&
        cache.color === props.lyricColor &&
        cache.highlightMode === props.lyricHighlightMode &&
        cache.highlightColor === props.lyricHighlightColor &&
        cache.glowLinked === props.lyricGlowLinked &&
        cache.glowColor === props.lyricGlowColor) return;
    cache.primary = palette.primary;
    cache.secondary = palette.secondary;
    cache.highlight = palette.highlight;
    cache.colorMode = props.lyricColorMode;
    cache.color = props.lyricColor;
    cache.highlightMode = props.lyricHighlightMode;
    cache.highlightColor = props.lyricHighlightColor;
    cache.glowLinked = props.lyricGlowLinked;
    cache.glowColor = props.lyricGlowColor;
    var effective = {
      primary: colorToThree(palette.primary, { r: 214, g: 248, b: 255 }, 0.38),
      secondary: colorToThree(palette.secondary, { r: 156, g: 255, b: 223 }, 0.36),
      highlight: colorToThree(palette.highlight, { r: 255, g: 240, b: 184 }, 0.48)
    };
    if (props.lyricColorMode === "custom") {
      effective = lyricPaletteFromColor(NS.ColorTools.parseColor(props.lyricColor, "#a9b8c8"), { r: 169, g: 184, b: 200 });
    }
    var highlightPalette = null;
    if (props.lyricHighlightMode === "custom") {
      highlightPalette = lyricPaletteFromColor(NS.ColorTools.parseColor(props.lyricHighlightColor, "#fac900"), { r: 250, g: 201, b: 0 });
      effective.highlight = highlightPalette.primary;
    }
    var glowColor = highlightPalette && props.lyricGlowLinked !== false ? highlightPalette.secondary : effective.secondary;
    if (props.lyricGlowLinked === false) {
      glowColor = lyricPaletteFromColor(NS.ColorTools.parseColor(props.lyricGlowColor, "#008aff"), { r: 0, g: 138, b: 255 }).primary;
    }
    var base = colorToThree({ r: effective.primary.r * 255, g: effective.primary.g * 255, b: effective.primary.b * 255 }, null, 0.38);
    var highlight = colorToThree({ r: effective.highlight.r * 255, g: effective.highlight.g * 255, b: effective.highlight.b * 255 }, null, 0.48);
    glowColor = colorToThree({ r: glowColor.r * 255, g: glowColor.g * 255, b: glowColor.b * 255 }, null, 0.36);
    this.slots.forEach(function (slot) {
      slot.textMaterial.uniforms.uBaseColor.value.copy(base);
      slot.textMaterial.uniforms.uHiColor.value.copy(highlight);
      slot.textMaterial.uniforms.uGlowColor.value.copy(glowColor);
      slot.textMaterial.uniforms.uSolarColor.value.copy(highlight);
      slot.glowMaterial.color.copy(glowColor);
      slot.sunMaterial.color.copy(highlight);
      slot.sparkMaterial.uniforms.uColor.value.copy(highlight);
    });
    this.river.material.uniforms.uColorA.value.copy(glowColor);
    this.river.material.uniforms.uColorB.value.copy(highlight);
  };

  LyricsVisual.prototype.updateRootTransform = function (props) {
    var particles = this.stage.particles;
    var camera = this.stage.camera;
    var skull = this.stage.skullGroup;
    var scale = clamp(props.lyricScale || 1, 0.35, 1.65);
    var offsetX = clamp(props.lyricOffsetX || 0, -2, 2);
    var offsetY = clamp(props.lyricOffsetY || 0, -1.2, 1.35);
    var offsetZ = clamp(props.lyricOffsetZ || 0, -1.6, 1.6);
    this.skullMode = props.presetIndex === 6 && skull && skull.visible;

    if (this.skullMode) {
      skull.updateMatrixWorld(true);
      this.root.position.copy(this.mouthLocal).applyMatrix4(skull.matrixWorld);
      skull.getWorldQuaternion(this.worldQuaternion);
      this.root.quaternion.copy(this.worldQuaternion);
      scale *= props.shelf !== "off" && props.lyricSafeArea ? 0.56 : 0.66;
      if (props.shelf !== "off" && props.lyricSafeArea) offsetX -= 0.36;
    } else if (props.lyricCameraLock && camera) {
      camera.getWorldDirection(this.viewDirection).normalize();
      this.viewRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
      this.viewUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
      this.root.position.copy(camera.position).addScaledVector(this.viewDirection, 4.85 + offsetZ).addScaledVector(this.viewRight, offsetX).addScaledVector(this.viewUp, offsetY);
      this.root.quaternion.copy(camera.quaternion);
      offsetX = offsetY = offsetZ = 0;
      scale = Math.min(scale, 0.84);
    } else if (particles) {
      particles.updateMatrixWorld(true);
      particles.getWorldPosition(this.worldPosition);
      particles.getWorldQuaternion(this.worldQuaternion);
      this.root.position.copy(this.worldPosition);
      this.root.quaternion.copy(this.worldQuaternion);
    }

    if (!props.lyricCameraLock || this.skullMode) {
      this.viewRight.set(1, 0, 0).applyQuaternion(this.root.quaternion).normalize();
      this.viewUp.set(0, 1, 0).applyQuaternion(this.root.quaternion).normalize();
      this.viewDirection.set(0, 0, 1).applyQuaternion(this.root.quaternion).normalize();
      if (!this.skullMode && props.shelf !== "off" && props.lyricSafeArea) { offsetX -= 1.34; scale *= 0.72; }
      this.root.position.addScaledVector(this.viewRight, offsetX).addScaledVector(this.viewUp, offsetY).addScaledVector(this.viewDirection, offsetZ);
    }
    this.layoutEuler.set(clamp(props.lyricTiltX || 0, -42, 42) * Math.PI / 180, clamp(props.lyricTiltY || 0, -42, 42) * Math.PI / 180, 0, "YXZ");
    this.layoutQuaternion.setFromEuler(this.layoutEuler);
    this.root.quaternion.multiply(this.layoutQuaternion);
    this.root.scale.setScalar(scale);
  };

  LyricsVisual.prototype.updateSparks = function (slot, time, audioState) {
    var attr = slot.sparks.geometry.attributes.position;
    var values = attr.array;
    var base = slot.sparkBase;
    var beat = this.beatGlow;
    var bass = audioState.smoothBass == null ? audioState.bass || 0 : audioState.smoothBass;
    var mid = audioState.smoothMid == null ? audioState.mid || 0 : audioState.smoothMid;
    for (var i = 0; i < SPARK_COUNT; i += 1) {
      var seed = i * 12.989 + slot.seed;
      values[i * 3] = base[i * 3] + Math.sin(time * (0.18 + i % 5 * 0.025) + seed) * (0.045 + bass * 0.030 + beat * 0.052);
      values[i * 3 + 1] = base[i * 3 + 1] + Math.cos(time * (0.16 + i % 6 * 0.024) + seed) * (0.042 + mid * 0.026 + beat * 0.046);
      values[i * 3 + 2] = base[i * 3 + 2] + Math.sin(time * (0.24 + i % 4 * 0.035) + seed) * (0.036 + beat * 0.028);
    }
    attr.needsUpdate = true;
  };

  LyricsVisual.prototype.updateSlot = function (slot, isCurrent, time, dt, audioState, props) {
    if (!slot.group.visible) return;
    slot.age += dt;
    var bass = audioState.smoothBass == null ? audioState.bass || 0 : audioState.smoothBass;
    var glowDrive = props.lyricGlow ? clamp((props.lyricGlowStrength || 0) / 0.28, 0, 1.5) : 0;
    if (isCurrent) {
      var opacity = follow(slot.textMaterial.uniforms.uOpacity.value, 0.96, 10.5, dt);
      slot.textMaterial.uniforms.uOpacity.value = opacity;
      slot.textMaterial.uniforms.uReadability.value = 0.86;
      slot.textMaterial.uniforms.uSolar.value = follow(slot.textMaterial.uniforms.uSolar.value, this.highBloom * glowDrive, 7.2, dt);
      var glowTarget = Math.min(0.46, (0.075 + this.highBloom * 0.34 + this.beatGlow * 0.16) * glowDrive);
      slot.glowMaterial.opacity = follow(slot.glowMaterial.opacity, glowTarget, glowTarget > slot.glowMaterial.opacity ? 6.0 : 3.5, dt);
      slot.sunMaterial.opacity = follow(slot.sunMaterial.opacity, Math.min(0.72, (this.highBloom * 0.30 + this.beatGlow * 0.16) * glowDrive), 3.6, dt);
      var sparkTarget = props.lyricGlowParticles ? Math.min(0.42, (0.10 + this.highBloom * 0.14 + this.beatGlow * 0.10) * glowDrive) : 0;
      slot.sparkMaterial.uniforms.uOpacity.value = follow(slot.sparkMaterial.uniforms.uOpacity.value, sparkTarget, 7.0, dt);
      slot.sparkMaterial.uniforms.uSize.value = follow(slot.sparkMaterial.uniforms.uSize.value, 0.050 + this.highBloom * 0.016 + this.beatGlow * 0.026, 7.0, dt);
      var breathe = Math.sin(time * 0.92 + slot.seed) * 0.050 + Math.sin(time * 0.41 + slot.seed * 0.7) * 0.028;
      if (this.skullMode) {
        slot.group.scale.setScalar(1.08 + breathe * 0.12 + bass * 0.024);
        slot.group.position.y = follow(slot.group.position.y, -0.070 + Math.sin(time * 0.50 + slot.seed) * 0.018, 9.0, dt);
        slot.group.position.z = follow(slot.group.position.z, 0.018 + Math.cos(time * 0.46 + slot.seed) * 0.007, 9.0, dt);
        slot.group.rotation.z = Math.sin(time * 0.30 + slot.seed) * 0.010;
      } else {
        slot.group.scale.setScalar(1.015 + breathe + bass * 0.038);
        slot.group.position.y = follow(slot.group.position.y, 0.18 + Math.sin(time * 0.55 + slot.seed) * 0.055 + Math.sin(time * 1.35 + slot.seed) * 0.014, 4.7, dt);
        slot.group.position.z = follow(slot.group.position.z, 1.48 + Math.cos(time * 0.48 + slot.seed) * 0.080, 5.0, dt);
        slot.group.rotation.z = Math.sin(time * 0.34 + slot.seed) * 0.018;
      }
      slot.sun.scale.set(0.82 + this.highBloom * 0.36 + this.beatGlow * 0.24, 0.60 + this.highBloom * 0.34 + this.beatGlow * 0.17, 1);
      slot.sparks.rotation.z += (0.0009 + this.beatGlow * 0.0007) * dt * 60;
      slot.sparks.visible = props.lyricGlowParticles || slot.sparkMaterial.uniforms.uOpacity.value > 0.01;
      if (slot.sparks.visible) this.updateSparks(slot, time, audioState);
      return;
    }
    if (!slot.outgoing) { slot.group.visible = false; return; }
    var amount = clamp(slot.age / 0.38, 0, 1);
    amount = amount * amount * (3 - 2 * amount);
    var outgoingOpacity = (1 - amount) * 0.72;
    slot.textMaterial.uniforms.uOpacity.value = outgoingOpacity;
    slot.glowMaterial.opacity = outgoingOpacity * 0.08;
    slot.sunMaterial.opacity = outgoingOpacity * 0.08;
    slot.sparkMaterial.uniforms.uOpacity.value = outgoingOpacity * 0.18;
    slot.group.position.z -= dt * 0.26;
    slot.group.position.y += dt * 0.08;
    slot.group.scale.setScalar(0.98 - amount * 0.06);
    if (amount >= 1) { slot.outgoing = false; slot.group.visible = false; }
  };

  LyricsVisual.prototype.updateRiver = function (time, dt, audioState, visible, props) {
    var uniforms = this.river.material.uniforms;
    var bass = audioState.smoothBass == null ? audioState.bass || 0 : audioState.smoothBass;
    uniforms.uTime.value = time;
    uniforms.uBass.value = bass;
    uniforms.uBeat.value = this.beatGlow;
    var targetWidth = this.current ? clamp((this.current.textWorldWidth || 4.2) * 1.12 + 0.80, 2.25, 7.20) : 3.4;
    var targetHeight = this.current ? clamp((this.current.textWorldHeight || 0.58) * (this.style.lineHeight || 1) * 1.85 + 0.18, 0.52, 1.35) : 0.58;
    this.riverWidth = follow(this.riverWidth, targetWidth, 5.2, dt);
    this.riverHeight = follow(this.riverHeight, targetHeight, 4.6, dt);
    uniforms.uWidth.value = this.riverWidth;
    uniforms.uHeight.value = this.riverHeight;
    var targetOpacity = visible && props.presetIndex !== 6 && props.lyricGlow && props.lyricGlowParticles ? clamp(0.22 + this.highBloom * 0.16 + this.beatGlow * 0.12, 0.16, 0.68) : 0;
    uniforms.uOpacity.value = follow(uniforms.uOpacity.value, targetOpacity, targetOpacity > uniforms.uOpacity.value ? 6.3 : 3.4, dt);
    this.river.visible = uniforms.uOpacity.value > 0.01;
    this.river.position.y = follow(this.river.position.y, 0.18 + Math.sin(time * 0.44) * 0.035 + Math.sin(time * 0.91 + 1.7) * 0.018, 5.0, dt);
    this.river.position.z = follow(this.river.position.z, 1.54 + Math.cos(time * 0.31) * 0.060, 5.0, dt);
    this.river.rotation.z = Math.sin(time * 0.22) * 0.012;
  };

  LyricsVisual.prototype.update = function (time, dt, audioState, props) {
    if (this.disabled) return;
    audioState = audioState || {};
    props = props || {};
    this.updateStyle(props);
    this.updateRootTransform(props);
    var state = this.engine && this.engine.state || {};
    var lineState = this.engine && this.engine.lineState ? this.engine.lineState() : { index: -1, line: null, progress: 0 };
    var seekRevision = Number(this.engine && this.engine.media && this.engine.media.current && this.engine.media.current.seekRevision) || 0;
    if (this.lastSeekRevision == null) this.lastSeekRevision = seekRevision;
    else if (seekRevision !== this.lastSeekRevision) {
      this.lastSeekRevision = seekRevision;
      this.resetTransitions();
    }
    var show = props.lyricsEnabled !== false && state.status === "ready" && !!lineState.line;
    if (operationLogEnabled()) {
      var debugSignature = [
        state.status || "",
        lineState.index,
        show ? 1 : 0,
        props.lyricsEnabled !== false ? 1 : 0,
        seekRevision
      ].join("|");
      if (debugSignature !== this.debugSignature) {
        this.debugSignature = debugSignature;
        operationLog("lyrics.visualState", {
          disabled: !!this.disabled,
          show: !!show,
          status: state.status || "",
          index: lineState.index,
          hasLine: !!lineState.line,
          lyricsEnabled: props.lyricsEnabled !== false,
          preset: props.preset || "",
          position: lineState.position || 0
        });
      }
    } else {
      this.debugSignature = "";
    }
    if (show) this.setLine(lineState.index, lineState.line.text);
    else if (this.current) this.clear();
    if (this.current) this.current.textMaterial.uniforms.uProgress.value = clamp(lineState.progress, 0, 1);

    var beat = props.lyricGlowBeat ? audioState.beat || 0 : 0;
    var energy = audioState.smoothEnergy == null ? audioState.level || 0 : audioState.smoothEnergy;
    this.beatGlow = follow(this.beatGlow, Math.max(beat * 1.22, energy * 0.34), beat > this.beatGlow ? 12 : 4.2, dt);
    var solarTarget = props.lyricGlow ? clamp(0.18 + (0.5 + 0.5 * Math.sin(time * 1.05)) * 0.16 + energy * 0.90 + this.beatGlow * 1.18, 0, 1.45) : 0;
    this.highBloom = follow(this.highBloom, show ? solarTarget : 0, show && solarTarget > this.highBloom ? 4.8 : 3.1, dt);
    this.updatePalette(props);
    var anyVisible = false;
    for (var i = 0; i < this.slots.length; i += 1) {
      this.updateSlot(this.slots[i], this.slots[i] === this.current, time, dt, audioState, props);
      anyVisible = anyVisible || this.slots[i].group.visible;
    }
    this.updateRiver(time, dt, audioState, anyVisible, props);
    this.root.visible = anyVisible || this.river.visible;
  };

  LyricsVisual.prototype.destroy = function () {
    if (this.disabled) return;
    this.stage.scene.remove(this.root);
    this.slots.forEach(function (slot) {
      slot.maskTexture.dispose(); slot.glowTexture.dispose();
      slot.textMaterial.dispose(); slot.glowMaterial.dispose(); slot.sunMaterial.dispose(); slot.sparkMaterial.dispose();
      slot.sparks.geometry.dispose();
    });
    this.river.geometry.dispose(); this.river.material.dispose();
    this.planeGeometry.dispose(); this.sunGeometry.dispose(); this.sunTexture.dispose();
  };

  NS.LyricsVisual = LyricsVisual;
}());
