(function () {
  "use strict";

  var NS = window.MineradioOriginal = window.MineradioOriginal || {};
  var THREE = window.THREE;
  var PLANE_SIZE = 4.8;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function follow(current, target, speed, dt) {
    return current + (target - current) * (1 - Math.exp(-speed * dt));
  }

  function smoothstep01(value) {
    value = clamp(value, 0, 1);
    return value * value * (3 - 2 * value);
  }

  function setThreeColor(target, color) {
    target.setRGB((color.r || 0) / 255, (color.g || 0) / 255, (color.b || 0) / 255);
  }

  function hexToRgb(hex) {
    hex = String(hex || "").trim();
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  function rgba(hex, alpha, fallback) {
    var rgb = hexToRgb(hex);
    if (!rgb) return fallback || "rgba(157,184,207," + alpha + ")";
    return "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + alpha + ")";
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function ellipsize(ctx, text, maxWidth) {
    text = String(text || "");
    if (ctx.measureText(text).width <= maxWidth) return text;
    var out = text;
    while (out.length > 1 && ctx.measureText(out + "...").width > maxWidth) out = out.slice(0, -1);
    return out + "...";
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var chars = String(text || "").split("");
    var line = "";
    var lines = [];
    for (var i = 0; i < chars.length; i += 1) {
      var test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = chars[i];
        if (lines.length >= maxLines - 1) break;
      } else {
        line = test;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    for (var j = 0; j < lines.length; j += 1) ctx.fillText(lines[j], x, y + j * lineHeight);
  }

  function itemSignature(item, index) {
    item = item || {};
    var imageSrc = item.image && (item.image.currentSrc || item.image.src) || "";
    return [
      index,
      item.key || "",
      item.title || "",
      item.artist || "",
      item.album || "",
      item.thumbnail || "",
      imageSrc,
      item.changedAt || 0
    ].join("\x1f");
  }

  function historySignature(items) {
    return (items || []).slice(0, 9).map(itemSignature).join("\x1e");
  }

  function makeDotTexture() {
    var canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    var ctx = canvas.getContext("2d");
    var gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.24, "rgba(255,255,255,.96)");
    gradient.addColorStop(0.38, "rgba(255,255,255,.34)");
    gradient.addColorStop(0.58, "rgba(255,255,255,.055)");
    gradient.addColorStop(0.78, "rgba(255,255,255,.012)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    var texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  function makeFallbackCover() {
    var canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    var ctx = canvas.getContext("2d");
    var gradient = ctx.createLinearGradient(0, 0, 512, 512);
    gradient.addColorStop(0, "#07171b");
    gradient.addColorStop(0.48, "#0d5260");
    gradient.addColorStop(1, "#401f48");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.font = "900 154px Segoe UI,Arial,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("MR", 256, 252);
    return canvas;
  }

  function coverCanvasFromImage(image) {
    var canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#030405";
    ctx.fillRect(0, 0, 512, 512);
    var iw = image.naturalWidth || image.width || 1;
    var ih = image.naturalHeight || image.height || 1;
    var scale = Math.max(512 / iw, 512 / ih);
    var dw = iw * scale;
    var dh = ih * scale;
    ctx.drawImage(image, (512 - dw) * 0.5, (512 - dh) * 0.5, dw, dh);
    return canvas;
  }

  function buildEdgeAndDepth(srcCanvas) {
    var width = 256;
    var height = 256;
    var count = width * height;
    var normalized = document.createElement("canvas");
    normalized.width = width;
    normalized.height = height;
    var sourceCtx = normalized.getContext("2d", { willReadFrequently: true });
    sourceCtx.drawImage(srcCanvas, 0, 0, width, height);
    var source = sourceCtx.getImageData(0, 0, width, height).data;
    var luminance = new Float32Array(count);
    var blur = new Float32Array(count);
    var temp = new Float32Array(count);
    var i;

    for (i = 0; i < count; i++) {
      var offset = i * 4;
      luminance[i] = (source[offset] * 0.299 + source[offset + 1] * 0.587 + source[offset + 2] * 0.114) / 255;
    }

    function blurHorizontal(input, output, radius) {
      for (var y = 0; y < height; y++) {
        var sum = 0;
        for (var sx = -radius; sx <= radius; sx++) sum += input[y * width + clamp(sx, 0, width - 1)];
        for (var x = 0; x < width; x++) {
          output[y * width + x] = sum / (radius * 2 + 1);
          sum += input[y * width + Math.min(width - 1, x + radius + 1)] - input[y * width + Math.max(0, x - radius)];
        }
      }
    }

    function blurVertical(input, output, radius) {
      for (var x = 0; x < width; x++) {
        var sum = 0;
        for (var sy = -radius; sy <= radius; sy++) sum += input[clamp(sy, 0, height - 1) * width + x];
        for (var y = 0; y < height; y++) {
          output[y * width + x] = sum / (radius * 2 + 1);
          sum += input[Math.min(height - 1, y + radius + 1) * width + x] - input[Math.max(0, y - radius) * width + x];
        }
      }
    }

    blurHorizontal(luminance, temp, 4);
    blurVertical(temp, blur, 4);
    var edge = new Float32Array(count);
    for (var y = 1; y < height - 1; y++) {
      for (var x = 1; x < width - 1; x++) {
        var gx = -blur[(y - 1) * width + x - 1] - 2 * blur[y * width + x - 1] - blur[(y + 1) * width + x - 1]
          + blur[(y - 1) * width + x + 1] + 2 * blur[y * width + x + 1] + blur[(y + 1) * width + x + 1];
        var gy = -blur[(y - 1) * width + x - 1] - 2 * blur[(y - 1) * width + x] - blur[(y - 1) * width + x + 1]
          + blur[(y + 1) * width + x - 1] + 2 * blur[(y + 1) * width + x] + blur[(y + 1) * width + x + 1];
        edge[y * width + x] = Math.min(1, Math.sqrt(gx * gx + gy * gy) * 1.4);
      }
    }

    var depth = new Float32Array(count);
    var foreground = new Float32Array(count);
    for (y = 0; y < height; y++) {
      for (x = 0; x < width; x++) {
        i = y * width + x;
        var nx = (x / (width - 1) - 0.5) * 2;
        var ny = (y / (height - 1) - 0.5) * 2;
        var centerBias = 1 - Math.min(1, Math.sqrt(nx * nx + ny * ny) * 0.75);
        depth[i] = Math.min(1, blur[i] * 0.45 + centerBias * 0.55);
        foreground[i] = Math.min(1, depth[i] * 0.6 + edge[i] * 0.5);
      }
    }

    var output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    var outputCtx = output.getContext("2d");
    var image = outputCtx.createImageData(width, height);
    for (i = 0; i < count; i++) {
      offset = i * 4;
      image.data[offset] = Math.round(depth[i] * 255);
      image.data[offset + 1] = Math.round(edge[i] * 255);
      image.data[offset + 2] = Math.round(foreground[i] * 255);
      image.data[offset + 3] = Math.round(luminance[i] * 255);
    }
    outputCtx.putImageData(image, 0, 0);
    return output;
  }

  function particleVertexShader() {
    return [
      "precision highp float;",
      "uniform float uTime,uBass,uMid,uVocal,uTreble,uBeat,uEnergy,uRhythm,uGather;",
      "uniform float uPreset,uIntensity,uDepth,uPointScale,uSpeed,uTwist,uColorBoost,uScatter,uCoverRes,uBgFade,uVinylSpin,uEdgeEnabled,uGalaxyDepth;",
      "uniform float uHasCover,uHasDepth,uAiBoost,uPixel,uColorMixT,uMouseActive,uBloomSize,uReveal,uTransitionPulse,uLoading,uTransitionSeed;",
      "uniform vec4 uWave;",
      "uniform sampler2D uCoverTex,uPrevCoverTex,uEdgeTex;",
      "uniform vec2 uMouseXY;",
      "attribute vec2 aUv; attribute float aRand;",
      "varying vec3 vColor; varying float vBright,vEdgeBoost,vAlpha,vSourceLum;",
      "#define PI 3.14159265359",
      "vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}",
      "vec4 mod289v(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}",
      "vec4 perm(vec4 x){return mod289v(((x*34.0)+1.0)*x);}",
      "float snoise(vec3 v){",
      " const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);",
      " vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);",
      " vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);",
      " vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod289(i);",
      " vec4 p=perm(perm(perm(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));",
      " float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx; vec4 j=p-49.0*floor(p*ns.z*ns.z);",
      " vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_); vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy;",
      " vec4 h=1.0-abs(x)-abs(y); vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);",
      " vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));",
      " vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;",
      " vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);",
      " vec4 norm=inversesqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));",
      " p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w; vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;",
      " return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));",
      "}",
      "float hash11(float p){return fract(sin(p)*43758.5453123);}",
      "void main(){",
      " float t=uTime*uSpeed; vec2 uv=clamp(aUv,vec2(.0012),vec2(.9988));",
      " vec3 newCol=texture2D(uCoverTex,uv).rgb; vec3 oldCol=texture2D(uPrevCoverTex,uv).rgb;",
      " vec3 coverColor=mix(oldCol,newCol,clamp(uColorMixT,0.0,1.0)); vec4 edge=texture2D(uEdgeTex,uv);",
      " float depthVal=edge.r,edgeVal=edge.g,fgMask=edge.b; vec3 pos; float K=uIntensity*1.6;",
      " vec3 fallback=mix(vec3(.36,.28,.72),mix(vec3(.85,.55,.95),vec3(.45,.78,.95),aUv.x),aUv.y);",
      " vColor=mix(fallback,coverColor,uHasCover); vAlpha=1.0;",
      " float reveal=smoothstep(0.0,1.0,uReveal); float trans=smoothstep(0.0,1.0,uTransitionPulse); float presetBright=-1.0;",
      " float particleSeed=hash11(aRand*941.17); vec2 edgeUv=abs(aUv-.5)*2.0; float planeEdge=max(edgeUv.x,edgeUv.y); float planePulse=0.0;",
      " if(uPreset<.5){",
      "   pos=position; float midN=snoise(vec3(pos.x*1.4,pos.y*1.4,t*.55))*.6+snoise(vec3(pos.x*2.8+5.0,pos.y*2.8-3.0,t*.85))*.4;",
      "   float midMask=.55+.45*snoise(vec3(pos.x*.4,pos.y*.4,t*.18));",
      "   float midDisp=midN*uMid*.55*midMask*K; float trebleJ=snoise(vec3(pos.x*6.5,pos.y*6.5,t*3.5+aRand*4.0))*uTreble*.18*K;",
      "   float bassBreath=snoise(vec3(pos.x*.35,pos.y*.35,t*.4))*uBass*.42*K;",
      "   float waveAge=uWave.z; float waveLife=clamp(waveAge/1.85,0.0,1.0); float waveDist=length(pos.xy-uWave.xy);",
      "   float waveRadius=max(0.0,waveAge)*2.15; float waveWidth=.26+max(0.0,waveAge)*.18; float waveQ=(waveDist-waveRadius)/waveWidth;",
      "   float waveActive=step(0.0,waveAge)*(1.0-step(1.85,waveAge))*step(.004,uWave.w);",
      "   float rippleZ=exp(-waveQ*waveQ)*sin((waveDist-waveRadius)*8.0+1.5708)*(1.0-smoothstep(.66,1.0,waveLife))*uWave.w*waveActive*.62*K;",
      "   float depthZ=(depthVal-.5)*uAiBoost*uDepth*1.40*uHasDepth; pos.z=rippleZ*1.30+midDisp+trebleJ+bassBreath+depthZ;",
      "   planePulse=clamp(abs(midDisp)*.52+abs(trebleJ)*1.18+abs(bassBreath)*.70+abs(rippleZ)*.30,0.0,1.0);",
      "   float loading=clamp(uLoading,0.0,1.0);",
      "   if(loading>.001){",
      "     float mistSeed=hash11(aRand*931.7+uTransitionSeed*71.0); float mistAngle=aRand*6.2831+t*(.13+mistSeed*.15)+uTransitionSeed*4.2;",
      "     float mistR=1.30+mistSeed*2.05; vec3 mistPos=vec3(cos(mistAngle)*mistR*1.18,sin(mistAngle*.84)*mistR*.62,(mistSeed-.5)*4.2);",
      "     float mistMix=smoothstep(0.0,.56,loading); pos=mix(pos,mistPos,mistMix); vAlpha*=mix(1.0,.18+mistSeed*.24,mistMix);",
      "   }",
      "   float revealDrop=(1.0-reveal); pos.z+=revealDrop*(.45+particleSeed*.75)+trans*snoise(vec3(pos.xy*1.25,t*.8+particleSeed))*0.36;",
      "   vAlpha*=mix(.12+particleSeed*.22,1.0,reveal);",
      "   if(uMouseActive>.5){float md=length(pos.xy-uMouseXY);if(md<1.0){float push=1.0-md;pos.z+=push*push*.55;}}",
      " }else if(uPreset<1.5){",
      "   float spin=t*.12;float angle=aUv.x*2.0*PI+spin;float flow=fract(aUv.y-t*.08*(1.0+uBass*.55));float zPos=(flow-.5)*9.0;",
      "   float baseR=2.0-uBass*.28*K;float ripG=sin(angle*5.0+zPos*1.4+t*2.2)*.10*(uMid+uTreble)*K;float r=baseR+ripG;",
      "   pos=vec3(cos(angle)*r,sin(angle)*r,zPos);vec2 tunnelUv=clamp(vec2(aUv.x,flow),vec2(.0012),vec2(.9988));",
      "   newCol=texture2D(uCoverTex,tunnelUv).rgb;oldCol=texture2D(uPrevCoverTex,tunnelUv).rgb;vColor=mix(fallback,mix(oldCol,newCol,clamp(uColorMixT,0.0,1.0)),uHasCover);",
      "   vColor*=.4+smoothstep(-4.5,4.5,zPos)*.7;",
      " }else if(uPreset<2.5){",
      "   float theta=aUv.x*2.0*PI;float phi=(aUv.y-.5)*PI;float r=2.2*(1.0+uBass*.35*K)+snoise(vec3(theta*1.5,phi*1.5,t*.7))*uTreble*.85*K;",
      "   pos=vec3(r*cos(phi)*cos(theta),r*sin(phi),r*cos(phi)*sin(theta));float yaw=t*.18;float cy=cos(yaw),sy=sin(yaw);pos.xz=mat2(cy,-sy,sy,cy)*pos.xz;",
      " }else if(uPreset<3.5){",
      "   pos=vec3((aUv.x-.5)*.01,(aUv.y-.5)*.01,-90.0);vAlpha=0.0;vColor=vec3(0.0);",
      " }else if(uPreset<4.5){",
      "   float bassDrive=smoothstep(.08,.78,uBass+uBeat*.82);float highDrive=smoothstep(.05,.46,uTreble);float hiResGuard=smoothstep(1.08,1.55,uCoverRes);",
      "   float edgeGuard=mix(1.0,.38,hiResGuard),depthGuard=mix(1.0,.44,hiResGuard),grooveGuard=mix(1.0,.48,hiResGuard),beatGuard=mix(1.0,.36,hiResGuard);",
      "   vec2 p=(aUv-.5)*5.12;float cs=cos(uVinylSpin),sn=sin(uVinylSpin);vec2 rp=mat2(cs,-sn,sn,cs)*p;float d=length(p);float angle0=atan(p.y,p.x);",
      "   float recordR=2.46,coverR=1.18;float recordAlpha=1.0-smoothstep(recordR-.02,recordR+.05,d);float coverMask=1.0-smoothstep(coverR-.012,coverR+.018,d);",
      "   float border=exp(-pow((d-coverR)/.064,2.0))*edgeGuard;float outerRim=exp(-pow((d-(recordR-.050))/.055,2.0))*edgeGuard;float vinylN=clamp((d-coverR)/(recordR-coverR),0.0,1.0);",
      "   pos=vec3(rp*(1.0+bassDrive*.012*beatGuard+uBeat*.026*beatGuard),0.0);vAlpha=recordAlpha;",
      "   if(coverMask>.02){vec2 coverUv=p/(coverR*2.0)+.5;newCol=texture2D(uCoverTex,clamp(coverUv,vec2(.0012),vec2(.9988))).rgb;oldCol=texture2D(uPrevCoverTex,clamp(coverUv,vec2(.0012),vec2(.9988))).rgb;",
      "     vColor=mix(fallback,mix(oldCol,newCol,clamp(uColorMixT,0.0,1.0)),uHasCover);vColor*=1.02+.10*(1.0-smoothstep(0.0,coverR,d));vColor=mix(vColor,vec3(1.0),border*.54);",
      "     pos.z=.040+border*.026*depthGuard+uBeat*.018*beatGuard;planePulse=max(planePulse,border*.30+bassDrive*.075*beatGuard+uBeat*.075*beatGuard);",
      "   }else{float groove=.5+.5*sin((d-coverR)*mix(98.0,58.0,hiResGuard));float fineGroove=.5+.5*sin((d-coverR)*mix(170.0,92.0,hiResGuard)+aRand*3.0);",
      "     float tick=smoothstep(.82,.995,hash11(floor((angle0+PI)*38.0)+floor(d*72.0)*2.1));vec3 vinyl=vec3(.052,.054,.058)+vec3(.052*grooveGuard)*groove+vec3(.026*grooveGuard)*fineGroove;",
      "     vinyl=mix(vinyl,coverColor*.32,.18*(1.0-vinylN));float whiteRing=max(border*.92,outerRim*.26);vColor=mix(vinyl,vec3(.92,.94,.94),whiteRing);",
      "     vColor=mix(vColor,vec3(1.0),tick*highDrive*(.06+border*.12)*grooveGuard);pos.z=groove*.010*grooveGuard+border*.024*depthGuard+bassDrive*vinylN*.016*K*beatGuard+tick*highDrive*.010*grooveGuard;",
      "     planePulse=max(planePulse,border*.32+outerRim*.12+bassDrive*vinylN*.11*beatGuard+tick*highDrive*.10*grooveGuard+uBeat*vinylN*.08*beatGuard);}",
      " }else if(uPreset<5.5){",
      "   float bassGlow=smoothstep(.07,.78,uBass)*.34+uBeat*.014; float midGlow=smoothstep(.07,.62,uMid)*.42; float highGlow=smoothstep(.04,.46,uTreble)*.46;",
      "   float lane=aUv.y; float transition=trans; float flowBright=0.0;",
      "   if(lane<.80){",
      "     float laneWarp=snoise(vec3(aUv.x*.42,lane*1.7,t*.026))*.11+(hash11(aRand*73.1)-.5)*.045;",
      "     float warpedLane=clamp(lane+laneWarp,0.0,.80); float bandCoord=warpedLane/.80*5.65+snoise(vec3(aUv.x*.82,lane*2.25,t*.032))*.62;",
      "     float band=floor(bandCoord); float local=fract(bandCoord+hash11(band*9.13+aRand*2.4)*.18); float bandN=clamp((band+.5)/5.65,0.0,1.0);",
      "     float seed=hash11(band*19.17+aRand*31.0); float flow=fract(aUv.x+t*(.0034+bandN*.0038+seed*.0022)+seed*.53);",
      "     float arc=(flow-.5)*PI*(1.35+bandN*.72+seed*.24); float armCurve=sin(arc+bandN*2.2+seed*5.3);",
      "     float spiralRadius=9.2+bandN*11.8+seed*6.0+local*2.9; float x=cos(arc*.72+bandN*.92+seed*1.3)*spiralRadius+(flow-.5)*(13.5+bandN*9.5);",
      "     float ribbonPhase=flow*PI*2.0*(.55+bandN*.24+seed*.10)+t*(.010+bandN*.007)+seed*5.7;",
      "     float broadWave=sin(ribbonPhase)*.92; float fineWave=sin(ribbonPhase*(1.36+seed*.62)-t*.044+seed*5.0)*.045;",
      "     float yBase=(bandN-.5)*13.2+armCurve*(2.3+bandN*1.6)+(seed-.5)*1.85+snoise(vec3(bandN*2.0,flow*.62,seed))*.92;",
      "     float ridgeCenter=.43+(seed-.5)*.18; float ridgeQ=(local-ridgeCenter)/(.25+seed*.04); float ridge=exp(-ridgeQ*ridgeQ);",
      "     float softMask=smoothstep(.010,.12,lane)*(1.0-smoothstep(.72,.81,lane)); float ribbonNoise=snoise(vec3(flow*1.18+seed,bandN*2.0,t*.018))*.74;",
      "     float depthScale=clamp(uGalaxyDepth,.70,1.80); float zLayer=(mix(-23.5,15.5,bandN)+(seed-.5)*6.0)*depthScale; pos.x=x+ribbonNoise*1.40+sin(t*.012+seed*8.0)*.22;",
      "     pos.y=yBase+broadWave+fineWave+(local-.5)*(.58+ridge*.14); pos.z=zLayer+(broadWave*1.35+ribbonNoise*1.85)*depthScale;",
      "     float pulseLine=.5+.5*sin(ribbonPhase*(1.7+seed*.9)-t*.32+seed*6.0); vec3 aurora=mix(vec3(.52,.86,1.0),vec3(.70,.58,1.0),bandN);",
      "     aurora=mix(aurora,vec3(.96,.98,.92),bassGlow*.06); vAlpha=(.24+ridge*.98+pulseLine*highGlow*.052+bassGlow*.034+midGlow*.026)*softMask*(1.02+transition*.04);",
      "     vColor=mix(coverColor,aurora,.68+ridge*.24)*(.88+ridge*1.06+pulseLine*highGlow*.075+bassGlow*.055+midGlow*.032);",
      "     flowBright=max(flowBright,ridge*(.18+midGlow*.072)+pulseLine*highGlow*.060+bassGlow*.044);",
      "   }else{",
      "     float depthScale=clamp(uGalaxyDepth,.70,1.80); float q=(lane-.80)/.20; float seed=hash11(aRand*917.0+floor(q*130.0)); float depth=mix(-32.0,18.0,seed)*depthScale;",
      "     float drift=fract(aUv.x+t*(.0014+seed*.0048)+seed*.63); float cluster=snoise(vec3(seed*2.0,q*3.2,t*.007));",
      "     float x=(drift-.5)*(45.0+seed*22.0)+cluster*3.4; float y=(hash11(aRand*331.0+seed*5.0)-.5)*22.0+sin(t*(.018+seed*.028)+seed*7.0)*.86;",
      "     float z=depth+sin(t*(.020+seed*.032)+aRand*8.0)*1.05*depthScale; float twinkle=pow(.5+.5*sin(t*(.24+seed*.42)+aRand*17.0),5.0);",
      "     float dust=smoothstep(.10,.90,hash11(aRand*661.0+floor(q*160.0))); pos=vec3(x,y,z);",
      "     vAlpha=dust*(.24+twinkle*.62+highGlow*.040+bassGlow*.030)*(1.0-q*.04);",
      "     vColor=mix(coverColor,vec3(.92,.97,1.0),.66+twinkle*.18)*(.82+twinkle*.72+bassGlow*.040);",
      "     flowBright=max(flowBright,twinkle*highGlow*.075+dust*bassGlow*.044);",
      "   }",
      "   if(transition>.001){float bloom=smoothstep(0.0,1.0,transition);vec2 burstVec=pos.xy+vec2(hash11(aRand*31.0)-.5,hash11(aRand*47.0)-.5)*.75;",
      "     vec2 burstDir=burstVec/max(length(burstVec),.001);pos.xy+=burstDir*bloom*.026;pos.xy+=vec2(snoise(vec3(aRand,t*.014,1.0)),snoise(vec3(aRand,t*.014,5.0)))*bloom*.06;",
      "     pos.xy*=1.0+bloom*.014;pos.z+=(hash11(aRand*123.0)-.5)*bloom*.18;vAlpha*=.86+bloom*.22;flowBright=max(flowBright,bloom*.10);}",
      "   presetBright=.94+flowBright*.34+uBass*.020+uEnergy*.026+transition*.025;",
      " }else if(uPreset<6.5){",
      "   pos=vec3(0.0,0.0,-90.0);vAlpha=0.0;vColor=vec3(0.0);",
      " }else{",
      "   pos=position; float midN=snoise(vec3(pos.x*1.4,pos.y*1.4,t*.55))*.6+snoise(vec3(pos.x*2.8+5.0,pos.y*2.8-3.0,t*.85))*.4;",
      "   float midMask=.55+.45*snoise(vec3(pos.x*.4,pos.y*.4,t*.18));",
      "   float midDisp=midN*uMid*.55*midMask*K; float trebleJ=snoise(vec3(pos.x*6.5,pos.y*6.5,t*3.5+aRand*4.0))*uTreble*.18*K;",
      "   float bassBreath=snoise(vec3(pos.x*.35,pos.y*.35,t*.4))*uBass*.42*K; float beatLift=snoise(vec3(pos.x*.72+3.1,pos.y*.62-1.7,t*.24))*uBeat*.10*K;",
      "   float waveAge=uWave.z; float waveLife=clamp(waveAge/1.85,0.0,1.0); float waveDist=length(pos.xy-uWave.xy);",
      "   float waveRadius=max(0.0,waveAge)*2.15; float waveWidth=.26+max(0.0,waveAge)*.18; float waveQ=(waveDist-waveRadius)/waveWidth;",
      "   float waveActive=step(0.0,waveAge)*(1.0-step(1.85,waveAge))*step(.004,uWave.w);",
      "   float rippleZ=exp(-waveQ*waveQ)*sin((waveDist-waveRadius)*8.0+1.5708)*(1.0-smoothstep(.66,1.0,waveLife))*uWave.w*waveActive*.62*K;",
      "   float depthZ=(depthVal-.5)*uAiBoost*uDepth*1.40*uHasDepth; pos.z=rippleZ*1.30+midDisp+trebleJ+bassBreath+beatLift+depthZ;",
      "   planePulse=clamp(abs(midDisp)*.52+abs(trebleJ)*1.18+abs(bassBreath)*.70+abs(rippleZ)*.30+uBeat*.18+uVocal*.055,0.0,1.0);",
      "   float loading=clamp(uLoading,0.0,1.0);",
      "   if(loading>.001){",
      "     float mistSeed=hash11(aRand*931.7+uTransitionSeed*71.0); float mistAngle=aRand*6.2831+t*(.13+mistSeed*.15)+uTransitionSeed*4.2;",
      "     float mistR=1.30+mistSeed*2.05; vec3 mistPos=vec3(cos(mistAngle)*mistR*1.18,sin(mistAngle*.84)*mistR*.62,(mistSeed-.5)*4.2);",
      "     float mistMix=smoothstep(0.0,.56,loading); pos=mix(pos,mistPos,mistMix); vAlpha*=mix(1.0,.18+mistSeed*.24,mistMix);",
      "   }",
      "   float gather=clamp(uGather,0.0,1.0); float wander=sin(t*.34+particleSeed*18.0+aUv.x*8.0)*cos(t*.21+aUv.y*7.0-particleSeed*11.0);",
      "   vec2 driftDir=normalize(vec2(hash11(aRand*337.1)-.5,hash11(aRand*719.3)-.5)+vec2(.001));",
      "   float loose=(1.0-gather)*(.10+planeEdge*.25)+planeEdge*(.012+.030*(1.0-gather));",
      "   pos.xy+=driftDir*loose*(.42+.58*abs(wander)); pos.z+=(1.0-gather)*wander*(.12+planeEdge*.20);",
      "   float edgeNoise=(particleSeed-.5)*2.0; float edgeFade=1.0-smoothstep(.84+edgeNoise*.055,1.015,planeEdge);",
      "   vAlpha*=mix(.16,1.0,edgeFade)*mix(.62+.22*particleSeed,1.0,gather)*(1.0+planePulse*.16+uBeat*.08);",
      "   float revealDrop=(1.0-reveal); pos.z+=revealDrop*(.45+particleSeed*.75)+trans*snoise(vec3(pos.xy*1.25,t*.8+particleSeed))*0.36;",
      "   vAlpha*=mix(.12+particleSeed*.22,1.0,reveal);",
      "   if(uMouseActive>.5){float md=length(pos.xy-uMouseXY);if(md<1.0){float push=1.0-md;pos.z+=push*push*.55;}}",
      " }",
      " if(uScatter>.001){vec2 jdir=vec2(cos(aRand*6.2831),sin(aRand*6.2831));pos.xy+=jdir*uScatter*(.05+uTreble*.10);}",
      " if(uTwist>.001&&(uPreset<.5||uPreset>6.5)){float ta=uTwist*pos.z*.6;float tc=cos(ta),ts=sin(ta);pos.xy=mat2(tc,-ts,ts,tc)*pos.xy;}",
      " float sourceLum=dot(max(vColor,vec3(0.0)),vec3(.299,.587,.114)); float blackGuard=1.0-smoothstep(.025,.115,sourceLum);",
      " float planeLike=clamp(1.0-step(.5,uPreset)+step(6.5,uPreset),0.0,1.0);",
      " vEdgeBoost=uEdgeEnabled*edgeVal*(planeLike>.5?1.0:(uPreset>3.5?.22:1.0))*(1.0-blackGuard); vColor=pow(max(vColor,vec3(0.0)),vec3(1.0/max(.35,uColorBoost)));",
      " vColor=mix(vColor,vColor+vec3(.20),vEdgeBoost*(planeLike>.5?.62:(uPreset>3.5 ? .20 : .50))); vSourceLum=sourceLum;",
      " float coverAlpha=mix(1.0,.56+smoothstep(.018,.13,sourceLum)*.44,uHasCover*clamp(1.0-step(4.5,uPreset)+step(6.5,uPreset),0.0,1.0)); vAlpha*=coverAlpha;",
      " vBright=(presetBright>=0.0?presetBright:.88+planePulse*.46+uBeat*.10+uBass*.07+uVocal*.06+vEdgeBoost*.46+uEnergy*.04+trans*.12);",
      " if(uHasDepth>.5&&planeLike>.5)vBright*=mix(1.0,.55,uBgFade*(1.0-fgMask));",
      " vec4 mvPos=modelViewMatrix*vec4(pos,1.0); float depthSize=36.0/max(.5,-mvPos.z);",
      " float audioBoost=1.0+uRhythm*.10+uVocal*.045+vEdgeBoost*.38+trans*.10; float size=clamp(depthSize*audioBoost,0.92,3.80);",
      " if(planeLike>.5){size=clamp(depthSize*(.98+planePulse*.34+uBeat*.18+uBass*.08+uVocal*.035+vEdgeBoost*.24+trans*.08),1.05,4.75);}",
      " if(uPreset>4.5&&uPreset<6.5){float flowDrive=uBass*.070+uMid*.046+uTreble*.060+uBeat*.055; size=clamp(depthSize*(1.05+flowDrive),1.00,5.45);}",
      " gl_PointSize=size*uPixel*uPointScale; gl_Position=projectionMatrix*mvPos;",
      "}"
    ].join("\n");
  }

  function particleFragmentShader() {
    return [
      "precision highp float;",
      "uniform sampler2D uDotTex; uniform float uAlpha,uParticleDim;",
      "varying vec3 vColor; varying float vBright,vEdgeBoost,vAlpha,vSourceLum;",
      "void main(){",
      " vec4 tex=texture2D(uDotTex,gl_PointCoord); if(tex.a<.02)discard;",
      " vec3 col=vColor*vBright; col=mix(col,col*1.3+vec3(.05),vEdgeBoost*.35);",
      " float keepBlack=1.0-smoothstep(.025,.115,vSourceLum);",
      " float d=length(gl_PointCoord-vec2(.5))*2.0;float rim=smoothstep(.44,.94,d)*(1.0-smoothstep(.94,1.08,d))*tex.a;float lum=dot(col,vec3(.299,.587,.114));float light=smoothstep(.5,.82,lum)*(1.0-keepBlack);float dark=(1.0-smoothstep(.2,.5,lum))*(1.0-keepBlack);col=mix(col,vec3(0.0),rim*light*.38);col=mix(col,vec3(1.0),rim*dark*.20);gl_FragColor=vec4(clamp(col,vec3(0.0),vec3(1.6)),tex.a*uAlpha*uParticleDim*vAlpha);",
      "}"
    ].join("\n");
  }

  function particleBloomFragmentShader() {
    return [
      "precision highp float;",
      "uniform sampler2D uDotTex; uniform float uAlpha,uParticleDim,uBloomStrength;",
      "varying vec3 vColor; varying float vBright,vEdgeBoost,vAlpha,vSourceLum;",
      "void main(){",
      " vec4 tex=texture2D(uDotTex,gl_PointCoord); if(tex.a<.01)discard;",
      " float soft=tex.a*tex.a; vec3 col=vColor*(.55+vBright*.62);",
      " col=mix(col,col+vec3(.22,.18,.10),vEdgeBoost*.35);",
      " float keepBlack=1.0-smoothstep(.025,.115,vSourceLum); float bloomKeep=1.0-keepBlack*.92;",
      " gl_FragColor=vec4(clamp(col,vec3(0.0),vec3(1.8)),soft*uAlpha*uBloomStrength*uParticleDim*.55*vAlpha*bloomKeep);",
      "}"
    ].join("\n");
  }

  function floatVertexShader() {
    return [
      "precision highp float;",
      "uniform float uTime,uRhythm,uEnergy,uPixel; uniform vec3 uAmbientA,uAmbientB;",
      "attribute vec3 aColor,aPhase; attribute float aRand,aAmp;",
      "varying vec3 vC; varying float vA;",
      "void main(){",
      " vec3 pos=position; float orbit=uTime*(.030+aRand*.034); float cs=cos(orbit),sn=sin(orbit); pos.xy=mat2(cs,-sn,sn,cs)*pos.xy;",
      " float breathe=1.0+sin(uTime*.34+aPhase.x)*.045; pos.xy*=breathe;",
      " pos.x+=sin(uTime*(.18+aRand*.05)+aPhase.x)*aAmp*.34;",
      " pos.y+=cos(uTime*(.15+aRand*.06)+aPhase.y)*aAmp*.30;",
      " pos.z+=sin(uTime*(.11+aRand*.04)+aPhase.z)*aAmp*.68+uRhythm*.055*sin(aRand*12.0);",
      " vec3 starTint=mix(uAmbientA,uAmbientB,.18+aRand*.72); vC=mix(vec3(.76,.82,.90),starTint,.52)*aColor;",
      " vec4 mvPos=modelViewMatrix*vec4(pos,1.0); float dist=max(.5,-mvPos.z);",
      " float twinkle=.68+.32*sin(uTime*(.36+aRand*.30)+aPhase.z); vA=clamp(.13+(8.0-dist)*.025,.045,.34)*twinkle*(.88+uEnergy*.15);",
      " float sz=clamp(20.0/dist,.72,2.25)*(.72+aRand*.52)*(1.0+uRhythm*.055); gl_PointSize=sz*uPixel; gl_Position=projectionMatrix*mvPos;",
      "}"
    ].join("\n");
  }

  function floatFragmentShader() {
    return [
      "precision highp float;",
      "uniform sampler2D uDotTex; uniform float uFloatAlpha;",
      "varying vec3 vC; varying float vA;",
      "void main(){vec4 tex=texture2D(uDotTex,gl_PointCoord); if(tex.a<.02)discard; gl_FragColor=vec4(vC,tex.a*vA*uFloatAlpha);}"
    ].join("\n");
  }

  function StageCanvas(canvas, mediaState, audioReactor, visualState) {
    this.canvas = canvas;
    this.media = mediaState;
    this.audio = audioReactor;
    this.visual = visualState;
    this.started = false;
    this.frameCount = 0;
    this.lastFrameAt = 0;
    this.fpsLimit = 0;
    this.lastCover = null;
    this.coverMix = 1;
    this.coverReveal = 0;
    this.transitionPulse = 0;
    this.gather = 0;
    this.loadingAmount = 0;
    this.transitionWaiting = false;
    this.transitionStartedAt = -99;
    this.transitionSeed = Math.random();
    this.waves = [{ x: 0, y: 0, age: -10, strength: 0 }];
    this.waveIndex = 0;
    this.grid = 0;
    this.lastPulse = 0;
    this.cameraState = {
      theta: 0, phi: 0, radius: 8.6,
      userTheta: 0, userPhi: 0, userRadius: 8.6,
      targetX: 0, targetY: 0.38, targetZ: 0,
      spinTheta: 0, spinPhi: 0,
      thetaKick: 0, phiKick: 0, radiusKick: 0, rollKick: 0, zoomPulse: 0,
      autoBlend: 1
    };
    this.cameraAudio = { level: 0, bass: 0, lowMid: 0, mid: 0, vocal: 0, high: 0, beat: 0, pulse: 0 };
    this.lastCameraDistance = 8.6;
    this.pointer = { active: false, hover: false, id: -1, x: 0, y: 0, at: 0 };
    this.floatAlpha = 0;
    this.historyItems = [];
    this.shelfCards = [];
    this.shelfHover = null;
    this.shelfHistorySignature = "";
    this.shelfTextureSignature = "";
    this.shelfClickCandidate = null;
    this.shelfCenterTarget = 0;
    this.shelfCenterSmooth = 0;
    this.shelfOpenAt = performance.now() * 0.001;
    this.shelfPreviewItem = null;
    this.shelfPreviewUntil = 0;
    this.skullOpacity = 0;
    this.skullFlash = 0;
    this.skullJaw = 0;
    this.skullShelfMix = 0;
    this.skullLoading = false;
    this.lyricsVisual = null;
    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onContextLost = this.onContextLost.bind(this);
    this.resetCamera = this.resetCamera.bind(this);

    if (!THREE) {
      this.disabled = true;
      return;
    }

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.raycaster = new THREE.Raycaster();
    this.mouseNdc = new THREE.Vector2();
    this.pointerPlane = new THREE.Plane();
    this.pointerPlaneNormal = new THREE.Vector3();
    this.pointerPlaneOrigin = new THREE.Vector3();
    this.pointerHit = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
    } catch (err) {
      console.error("Mineradio WE WebGL initialization failed:", err);
      this.disabled = true;
      return;
    }
    this.renderer.setClearColor(0x000000, 0);
    this.dotTexture = makeDotTexture();
    this.coverTexture = new THREE.CanvasTexture(makeFallbackCover());
    this.previousCoverTexture = new THREE.CanvasTexture(makeFallbackCover());
    this.edgeTexture = new THREE.CanvasTexture(buildEdgeAndDepth(this.coverTexture.image));
    this.coverTexture.minFilter = this.previousCoverTexture.minFilter = THREE.LinearFilter;
    this.edgeTexture.minFilter = THREE.LinearFilter;
    try {
      this.createParticleSystem();
      this.createBackCoverLayer();
      this.createShelf();
    } catch (err) {
      console.error("Mineradio WE stage initialization failed:", err);
      this.disabled = true;
      if (this.renderer) this.renderer.dispose();
      return;
    }
    this.bindInteractions();
    this.canvas.addEventListener("webglcontextlost", this.onContextLost, false);
    window.addEventListener("resize", this.resize);
    this.resize();
  }

  StageCanvas.prototype.buildGeometry = function (force) {
    var props = this.visual.properties || NS.PropertyDefaults;
    var galaxyBoost = props.presetIndex === 5 ? Math.sqrt(clamp(props.galaxyDensity || 1.35, 0.6, 2.2)) : 1;
    var maxGrid = props.presetIndex === 5 ? 257 : 183;
    var grid = Math.round(118 * clamp(props.coverResolution || 1.55, 0.75, 1.55) * galaxyBoost);
    grid = clamp(grid, 89, maxGrid);
    if (grid % 2 === 0) grid++;
    if (!force && grid === this.grid) return;
    this.grid = grid;
    var count = grid * grid;
    var positions = new Float32Array(count * 3);
    var uvs = new Float32Array(count * 2);
    var random = new Float32Array(count);
    var texel = 1 / grid;
    for (var i = 0; i < count; i++) {
      var x = i % grid;
      var y = Math.floor(i / grid);
      positions[i * 3] = (x / (grid - 1) - 0.5) * PLANE_SIZE;
      positions[i * 3 + 1] = (y / (grid - 1) - 0.5) * PLANE_SIZE;
      positions[i * 3 + 2] = 0;
      uvs[i * 2] = (x + 0.5) * texel;
      uvs[i * 2 + 1] = (y + 0.5) * texel;
      random[i] = Math.random();
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aUv", new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute("aRand", new THREE.BufferAttribute(random, 1));
    if (this.geometry) this.geometry.dispose();
    this.geometry = geometry;
    if (this.particles) this.particles.geometry = geometry;
    if (this.bloomParticles) this.bloomParticles.geometry = geometry;
  };

  StageCanvas.prototype.createParticleSystem = function () {
    this.buildGeometry(true);
    var shared = {
      uTime: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uVocal: { value: 0 }, uTreble: { value: 0 }, uBeat: { value: 0 }, uEnergy: { value: 0 }, uRhythm: { value: 0 }, uGather: { value: 0 },
      uPreset: { value: 0 }, uIntensity: { value: 0.85 }, uDepth: { value: 1 }, uPointScale: { value: 1 }, uSpeed: { value: 1 }, uTwist: { value: 0 }, uColorBoost: { value: 1.1 }, uScatter: { value: 0 }, uCoverRes: { value: 1.55 }, uBgFade: { value: 0.2 }, uVinylSpin: { value: 0 }, uEdgeEnabled: { value: 0 }, uGalaxyDepth: { value: 1.18 },
      uHasCover: { value: 0 }, uHasDepth: { value: 1 }, uAiBoost: { value: 0.55 }, uPixel: { value: 1 }, uColorMixT: { value: 1 },
      uBloomStrength: { value: 0.24 }, uBloomSize: { value: 1.75 }, uFloatAlpha: { value: 0 }, uReveal: { value: 0 }, uTransitionPulse: { value: 0 },
      uLoading: { value: 0 }, uTransitionSeed: { value: this.transitionSeed },
      uWave: { value: new THREE.Vector4(0, 0, -10, 0) },
      uAmbientA: { value: new THREE.Color("#9db8cf") }, uAmbientB: { value: new THREE.Color("#7fd8ff") },
      uMouseXY: { value: new THREE.Vector2(-999, -999) }, uMouseActive: { value: 0 },
      uCoverTex: { value: this.coverTexture }, uPrevCoverTex: { value: this.previousCoverTexture }, uEdgeTex: { value: this.edgeTexture }, uDotTex: { value: this.dotTexture },
      uAlpha: { value: 0 }, uParticleDim: { value: 1 }
    };
    this.uniforms = shared;
    var vertex = particleVertexShader();
    var fragment = particleFragmentShader();
    var bloomVertex = vertex.replace("gl_PointSize=size*uPixel*uPointScale;", "gl_PointSize=size*uPixel*uPointScale*uBloomSize;");
    this.bloomMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: bloomVertex,
      fragmentShader: particleBloomFragmentShader(),
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });
    this.bloomParticles = new THREE.Points(this.geometry, this.bloomMaterial);
    this.bloomParticles.frustumCulled = false;
    this.bloomParticles.renderOrder = 0;
    this.scene.add(this.bloomParticles);
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, blending: THREE.NormalBlending });
    this.particles = new THREE.Points(this.geometry, this.material);
    this.particles.frustumCulled = false;
    this.particles.renderOrder = 1;
    this.scene.add(this.particles);
    this.createFloatLayer();
  };

  StageCanvas.prototype.createFloatLayer = function () {
    var count = 2600;
    var positions = new Float32Array(count * 3);
    var colors = new Float32Array(count * 3);
    var phases = new Float32Array(count * 3);
    var random = new Float32Array(count);
    var amp = new Float32Array(count);
    for (var i = 0; i < count; i += 1) {
      var outer = i < count * 0.72;
      var bx;
      var by;
      var bz;
      if (outer) {
        bx = (Math.random() - 0.5) * 15.8;
        by = (Math.random() - 0.5) * 9.6;
        if (Math.abs(bx) < 3.25 && Math.abs(by) < 2.65) {
          if (Math.random() < 0.58) bx = (bx < 0 ? -1 : 1) * (3.25 + Math.random() * 3.9);
          else by = (by < 0 ? -1 : 1) * (2.65 + Math.random() * 1.75);
        }
        bz = (Math.random() - 0.5) * 5.2 - 0.45;
      } else {
        var angle = Math.random() * Math.PI * 2;
        var radius = 2.55 + Math.pow(Math.random(), 0.72) * 2.45;
        var lane = (Math.random() - 0.5) * 0.78;
        bx = Math.cos(angle) * radius;
        by = Math.sin(angle) * radius * 0.72 + lane;
        bz = (Math.random() - 0.5) * 3.6 - 0.35;
      }
      positions[i * 3] = bx;
      positions[i * 3 + 1] = by;
      positions[i * 3 + 2] = bz;
      phases[i * 3] = Math.random() * Math.PI * 2;
      phases[i * 3 + 1] = Math.random() * Math.PI * 2;
      phases[i * 3 + 2] = Math.random() * Math.PI * 2;
      amp[i] = 0.15 + Math.random() * 0.35;
      random[i] = Math.random();
      var white = 0.88 + Math.random() * 0.12;
      colors[i * 3] = white;
      colors[i * 3 + 1] = white;
      colors[i * 3 + 2] = white;
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 3));
    geometry.setAttribute("aRand", new THREE.BufferAttribute(random, 1));
    geometry.setAttribute("aAmp", new THREE.BufferAttribute(amp, 1));
    this.floatMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: floatVertexShader(),
      fragmentShader: floatFragmentShader(),
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending
    });
    this.floatGroup = new THREE.Points(geometry, this.floatMaterial);
    this.floatGroup.frustumCulled = false;
    this.floatGroup.renderOrder = 0;
    this.floatGroup.visible = false;
    this.scene.add(this.floatGroup);
  };

  StageCanvas.prototype.createBackCoverLayer = function () {
    var count = 3000;
    var positions = new Float32Array(count * 3);
    var uvs = new Float32Array(count * 2);
    var random = new Float32Array(count);
    for (var i = 0; i < count; i += 1) {
      var u = Math.random();
      var v = Math.random();
      positions[i * 3] = (u - 0.5) * PLANE_SIZE;
      positions[i * 3 + 1] = (v - 0.5) * PLANE_SIZE;
      positions[i * 3 + 2] = -1.5 - Math.random() * 0.4;
      uvs[i * 2] = 1 - u;
      uvs[i * 2 + 1] = v;
      random[i] = Math.random();
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aUv", new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute("aRand", new THREE.BufferAttribute(random, 1));
    var vertex = [
      "precision highp float;uniform float uTime,uBass,uPixel;attribute vec2 aUv;attribute float aRand;varying vec2 vUv;varying float vA;",
      "void main(){vec3 pos=position;pos.z+=sin(uTime*.12+aRand*5.0)*.18+uBass*.12*sin(aRand*11.0);vUv=aUv;vA=.24+aRand*.28;vec4 mv=modelViewMatrix*vec4(pos,1.0);gl_PointSize=clamp(18.0/max(.5,-mv.z),.8,2.6)*uPixel;gl_Position=projectionMatrix*mv;}"
    ].join("\n");
    var fragment = [
      "precision highp float;uniform sampler2D uMap,uCoverTex;uniform float uAlpha;varying vec2 vUv;varying float vA;",
      "void main(){vec4 dot=texture2D(uMap,gl_PointCoord);if(dot.a<.02)discard;vec3 color=texture2D(uCoverTex,clamp(vUv,vec2(.0012),vec2(.9988))).rgb;gl_FragColor=vec4(color*(.72+vA),dot.a*uAlpha*vA);}"
    ].join("\n");
    this.backCoverUniforms = { uTime: this.uniforms.uTime, uBass: this.uniforms.uBass, uPixel: this.uniforms.uPixel, uMap: this.uniforms.uDotTex, uCoverTex: this.uniforms.uCoverTex, uAlpha: { value: 0 } };
    this.backCoverMaterial = new THREE.ShaderMaterial({ uniforms: this.backCoverUniforms, vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, blending: THREE.NormalBlending });
    this.backCoverGroup = new THREE.Points(geometry, this.backCoverMaterial);
    this.backCoverGroup.frustumCulled = false;
    this.backCoverGroup.visible = false;
    this.backCoverGroup.renderOrder = -1;
    this.scene.add(this.backCoverGroup);
  };

  StageCanvas.prototype.createShelf = function () {
    this.shelfGroup = new THREE.Group();
    this.shelfGroup.visible = false;
    this.shelfGroup.renderOrder = 20;
    this.shelfBackdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(7.2, 1.6),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
    );
    this.shelfBackdrop.position.set(0, -2.58, 0.32);
    this.shelfBackdrop.rotation.x = -Math.PI / 2;
    this.shelfBackdrop.renderOrder = 20;
    this.shelfGroup.add(this.shelfBackdrop);
    this.scene.add(this.shelfGroup);
  };

  StageCanvas.prototype.cardCanvas = function (item, index) {
    var canvas = document.createElement("canvas");
    canvas.width = 740;
    canvas.height = 300;
    var ctx = canvas.getContext("2d");
    var W = canvas.width;
    var H = canvas.height;
    var props = this.visual.properties || NS.PropertyDefaults;
    var accent = props.shelfAccentColor || "#ffffff";
    var pad = 16;
    var selected = index === Math.round(this.shelfCenterTarget || 0);
    var isNow = index === 0;
    var tag = isNow ? "正在播放" : ("#" + String(index + 1).padStart(2, "0"));
    var title = String(item && item.title || "Untitled");
    var sub = String(item && (item.artist || item.album) || "Wallpaper 媒体历史");
    ctx.clearRect(0, 0, W, H);
    roundRectPath(ctx, pad, pad, W - pad * 2, H - pad * 2, 32);
    ctx.fillStyle = "rgba(0,0,0," + clamp(props.shelfBgOpacity || 0.9, 0.25, 0.98).toFixed(3) + ")";
    ctx.fill();
    var shell = ctx.createLinearGradient(0, 0, W, H);
    shell.addColorStop(0, "rgba(255,255,255,0.105)");
    shell.addColorStop(0.55, "rgba(255,255,255,0.030)");
    shell.addColorStop(1, rgba(accent, 0.070, "rgba(157,184,207,0.070)"));
    ctx.fillStyle = shell;
    ctx.fill();
    ctx.strokeStyle = isNow || selected ? rgba(accent, selected ? 0.84 : 0.72, "rgba(255,255,255,0.72)") : "rgba(255,255,255,0.14)";
    ctx.lineWidth = isNow || selected ? 2.0 : 1.1;
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = rgba(accent, isNow ? 0.35 : 0.10, "rgba(157,184,207,0.16)");
    ctx.shadowBlur = isNow ? 22 : 10;
    ctx.strokeStyle = rgba(accent, isNow ? 0.30 : 0.10, "rgba(157,184,207,0.10)");
    ctx.lineWidth = 1;
    roundRectPath(ctx, pad + 5, pad + 5, W - pad * 2 - 10, H - pad * 2 - 10, 28);
    ctx.stroke();
    ctx.restore();
    var coverSize = H - pad * 2 - 8;
    var cx = pad + 6;
    var cy = pad + 4;
    roundRectPath(ctx, cx, cy, coverSize, coverSize, 26);
    var cg = ctx.createLinearGradient(cx, cy, cx + coverSize, cy + coverSize);
    cg.addColorStop(0, rgba(accent, 0.20, "rgba(157,184,207,0.20)"));
    cg.addColorStop(1, "rgba(255,255,255,0.035)");
    ctx.fillStyle = cg;
    ctx.fill();
    if (item && item.image) {
      var size = Math.min(item.image.naturalWidth || item.image.width || 1, item.image.naturalHeight || item.image.height || 1);
      var sx = ((item.image.naturalWidth || item.image.width) - size) * 0.5;
      var sy = ((item.image.naturalHeight || item.image.height) - size) * 0.5;
      try {
        ctx.save();
        roundRectPath(ctx, cx, cy, coverSize, coverSize, 26);
        ctx.clip();
        ctx.drawImage(item.image, sx, sy, size, size, cx, cy, coverSize, coverSize);
        ctx.restore();
      } catch (ignore) {}
    } else {
      ctx.save();
      roundRectPath(ctx, cx, cy, coverSize, coverSize, 26);
      ctx.clip();
      var fallback = ctx.createLinearGradient(cx, cy, cx + coverSize, cy + coverSize);
      fallback.addColorStop(0, "#16252b");
      fallback.addColorStop(0.52, "#081114");
      fallback.addColorStop(1, "#1b1530");
      ctx.fillStyle = fallback;
      ctx.fillRect(cx, cy, coverSize, coverSize);
      ctx.fillStyle = "rgba(255,255,255,.86)";
      ctx.font = "900 86px Segoe UI, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("MR", cx + coverSize * 0.5, cy + coverSize * 0.50);
      ctx.restore();
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    var tx = pad + coverSize + 28;
    ctx.font = "700 15px Inter, Segoe UI, Microsoft YaHei, Arial, sans-serif";
    ctx.fillStyle = isNow ? rgba(accent, 0.92, "rgba(255,255,255,0.92)") : "rgba(255,255,255,0.72)";
    ctx.fillText(tag, tx, pad + 32);
    ctx.font = "800 25px Inter, Segoe UI, Microsoft YaHei, Arial, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    wrapText(ctx, title, tx, pad + 70, W - tx - pad - 14, 30, 2);
    ctx.font = "500 15px Inter, Segoe UI, Microsoft YaHei, Arial, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.54)";
    wrapText(ctx, sub, tx, pad + 132, W - tx - pad - 14, 21, 2);
    ctx.strokeStyle = isNow ? rgba(accent, 0.90, "rgba(255,255,255,0.90)") : "rgba(255,255,255,0.30)";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(tx, H - pad - 22);
    ctx.lineTo(tx + Math.min(260, 92 + (isNow ? 170 : 60)), H - pad - 22);
    ctx.stroke();
    if (isNow) {
      var actionY = H - pad - 64;
      roundRectPath(ctx, tx, actionY, 112, 32, 16);
      var ag = ctx.createLinearGradient(tx, actionY, tx + 112, actionY + 32);
      ag.addColorStop(0, "rgba(255,255,255,0.92)");
      ag.addColorStop(0.55, rgba(accent, 0.94, "rgba(157,184,207,0.94)"));
      ag.addColorStop(1, rgba(accent, 0.58, "rgba(157,184,207,0.58)"));
      ctx.fillStyle = ag;
      ctx.fill();
      ctx.font = "800 13px Inter, Segoe UI, Microsoft YaHei, Arial, sans-serif";
      ctx.fillStyle = "#071015";
      ctx.fillText("媒体监听", tx + 27, actionY + 21);
    }
    return canvas;
  };

  StageCanvas.prototype.shelfCardStyleSignature = function () {
    var props = this.visual.properties || NS.PropertyDefaults;
    return [
      props.shelfAccentColor || "#ffffff",
      Math.round((props.shelfBgOpacity || 0.9) * 1000),
      Math.round(this.shelfCenterTarget || 0),
      this.shelfPreviewItem && this.shelfPreviewItem.key || ""
    ].join("|");
  };

  StageCanvas.prototype.disposeShelfCard = function (card) {
    if (!card) return;
    this.shelfGroup.remove(card);
    if (card.geometry) card.geometry.dispose();
    if (card.material) {
      if (card.material.map) card.material.map.dispose();
      card.material.dispose();
    }
  };

  StageCanvas.prototype.redrawShelfCards = function (force) {
    var signature = this.shelfCardStyleSignature();
    if (!force && signature === this.shelfTextureSignature) return;
    this.shelfTextureSignature = signature;
    for (var i = 0; i < this.shelfCards.length; i += 1) {
      var card = this.shelfCards[i];
      var canvas = this.cardCanvas(this.historyItems[i], i);
      if (card.material && card.material.map) {
        card.material.map.image = canvas;
        card.material.map.needsUpdate = true;
      }
    }
  };

  StageCanvas.prototype.setHistory = function (items) {
    var nextItems = (items || []).slice(0, 9);
    var nextSignature = historySignature(nextItems);
    var styleSignature = this.shelfCardStyleSignature();
    if (nextSignature === this.shelfHistorySignature && styleSignature === this.shelfTextureSignature) return;
    this.historyItems = nextItems;
    this.shelfHistorySignature = nextSignature;
    if (!this.shelfGroup) return;
    while (this.shelfCards.length > this.historyItems.length) {
      this.disposeShelfCard(this.shelfCards.pop());
    }
    for (var i = 0; i < this.historyItems.length; i += 1) {
      var card = this.shelfCards[i];
      if (!card) {
        var texture = new THREE.CanvasTexture(this.cardCanvas(this.historyItems[i], i));
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        var material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
        card = new THREE.Mesh(new THREE.PlaneGeometry(1.92, 0.78), material);
        card.userData.floatMix = 0;
        this.shelfCards.push(card);
        this.shelfGroup.add(card);
      }
      card.userData.index = i;
      card.userData.key = this.historyItems[i] && this.historyItems[i].key || "";
      card.renderOrder = 60 + i;
    }
    this.shelfCenterTarget = clamp(this.shelfCenterTarget, 0, Math.max(0, this.shelfCards.length - 1));
    this.shelfCenterSmooth = clamp(this.shelfCenterSmooth, 0, Math.max(0, this.shelfCards.length - 1));
    this.redrawShelfCards(true);
  };

  StageCanvas.prototype.updateShelfHover = function () {
    if (!this.shelfGroup || !this.shelfGroup.visible || !this.pointer.hover) {
      this.shelfHover = null;
      return;
    }
    this.shelfHover = this.pickShelfCard();
  };

  StageCanvas.prototype.pickShelfCard = function () {
    if (!this.shelfGroup || !this.shelfGroup.visible || !this.shelfCards.length) return null;
    this.raycaster.setFromCamera(this.mouseNdc, this.camera);
    var hits = this.raycaster.intersectObjects(this.shelfCards, false);
    return hits.length ? hits[0].object : null;
  };

  StageCanvas.prototype.activateShelfCard = function (card) {
    if (!card) return;
    var index = clamp(card.userData.index || 0, 0, Math.max(0, this.shelfCards.length - 1));
    this.shelfCenterTarget = index;
    this.shelfOpenAt = performance.now() * 0.001;
    var item = this.historyItems[index];
    if (item && item.image) {
      this.shelfPreviewItem = item;
      this.shelfPreviewUntil = performance.now() * 0.001 + (index === 0 ? 0.5 : 7.5);
      this.lastCover = null;
      this.coverMix = Math.min(this.coverMix, 0.25);
      this.transitionPulse = Math.max(this.transitionPulse, 0.42);
      this.cameraState.zoomPulse = Math.max(this.cameraState.zoomPulse || 0, 0.18);
    }
    this.redrawShelfCards(true);
  };

  StageCanvas.prototype.updateShelf = function (props, dt, time) {
    if (!this.shelfGroup) return;
    var visible = props.shelf !== "off" && this.shelfCards.length > 0;
    if (props.shelfPresence === "auto") visible = visible && (this.pointer.hover || this.media.isPlaying());
    this.shelfGroup.visible = visible;
    if (!visible) return;
    this.updateShelfHover();
    var stage = props.shelf === "stage";
    var portrait = window.innerHeight > window.innerWidth * 1.08;
    var narrow = !portrait && window.innerWidth < 980;
    var shelfSize = props.shelfSize || 1;
    var sideScale = (portrait ? 0.70 : (narrow ? 0.86 : 1.0)) * shelfSize;
    var stageScale = (portrait ? 0.72 : (narrow ? 0.86 : 1.0)) * shelfSize;
    var dynamicShelfCamera = props.shelfCameraMode === "dynamic";
    var sideX = (portrait ? 1.56 : (narrow ? 2.48 : 3.18)) + props.shelfOffsetX;
    var sideY = props.shelfOffsetY;
    var sideZ = (portrait ? 0.78 : 0.86) + props.shelfOffsetZ;
    var sideRotY = (portrait ? 0.12 : 0.28) + (props.shelfAngleY || -15) * Math.PI / 180;
    var sideRotX = portrait ? 0.022 : 0.042;
    var stageXStep = portrait ? 0.92 : (narrow ? 1.22 : 1.55);
    var stageY = (portrait ? -2.46 : -2.20) + props.shelfOffsetY;
    var stageZ = (portrait ? 0.84 : 1.0) + props.shelfOffsetZ;
    this.shelfCenterTarget = clamp(this.shelfCenterTarget, 0, Math.max(0, this.shelfCards.length - 1));
    this.shelfCenterSmooth = follow(this.shelfCenterSmooth, this.shelfCenterTarget, 8.5, dt);
    this.shelfGroup.position.set(0, 0, 0);
    if (this.particles) this.shelfGroup.rotation.copy(this.particles.rotation);
    this.shelfGroup.rotation.z = 0;
    this.shelfGroup.scale.setScalar(1);
    if (dynamicShelfCamera) this.shelfGroup.position.z = Math.sin(time * 0.42) * 0.018;
    if (this.shelfBackdrop) {
      this.shelfBackdrop.material.color.set(props.shelfAccentColor || "#ffffff");
      this.shelfBackdrop.material.opacity = stage ? (props.shelfBgOpacity || 0.9) * 0.055 : 0;
      this.shelfBackdrop.scale.set(Math.max(1, this.shelfCards.length * 0.28), 1, 1);
    }
    for (var i = 0; i < this.shelfCards.length; i += 1) {
      var card = this.shelfCards[i];
      var delta = i - this.shelfCenterSmooth;
      var absD = Math.abs(delta);
      var parWeight = Math.max(0, 1 - absD * 0.16);
      var hover = card === this.shelfHover;
      var liftTarget = hover ? 1 : 0;
      card.userData.floatMix = follow(card.userData.floatMix || 0, liftTarget, liftTarget ? 12 : 5, dt);
      var lift = card.userData.floatMix || 0;
      var targetX;
      var targetY;
      var targetZ;
      var rotX;
      var rotY;
      var cardScale;
      if (stage) {
        targetX = props.shelfOffsetX + delta * stageXStep;
        targetY = stageY;
        targetZ = absD < 0.5 ? stageZ : (stageZ - Math.min(2.0, absD) * 0.55);
        rotY = -delta * 0.22 + lift * 0.055;
        rotX = 0.10 - absD * 0.04;
        cardScale = (absD < 0.5 ? 1.20 : Math.max(0.45, 1.0 - absD * 0.22)) * stageScale * (1 + lift * 0.07);
      } else {
        targetX = sideX + absD * 0.040 - lift * 0.145;
        targetY = sideY - delta * (portrait ? 0.40 : 0.50) + lift * 0.090;
        targetZ = sideZ - absD * 0.145 + lift * 0.200;
        targetY += Math.sin(time * 0.92 + i * 0.64) * 0.025 * Math.max(0.20, parWeight);
        targetZ += Math.cos(time * 0.78 + i * 0.52) * 0.018 * parWeight;
        rotY = sideRotY + lift * 0.035;
        rotX = -delta * sideRotX;
        cardScale = (absD < 0.5 ? 1.12 : Math.max(0.55, 1.04 - absD * 0.14)) * sideScale * (1 + lift * 0.075);
      }
      card.position.x = follow(card.position.x, targetX, 6.5, dt);
      card.position.y = follow(card.position.y, targetY, 6.5, dt);
      card.position.z = follow(card.position.z, targetZ, 6.5, dt);
      card.scale.x = follow(card.scale.x, cardScale, hover ? 12 : 7, dt);
      card.scale.y = card.scale.x;
      card.scale.z = card.scale.x;
      card.rotation.x = follow(card.rotation.x, rotX, 6.5, dt);
      card.rotation.y = follow(card.rotation.y, rotY, 6.5, dt);
      card.rotation.z = follow(card.rotation.z, stage ? 0 : Math.sin(time * 0.22 + i * 0.72) * 0.010, 4, dt);
      card.renderOrder = 60 + Math.round((6 - Math.min(absD, 6)) * 10) + Math.round(lift * 70);
      var opacity = absD < 0.5 ? 1.0 : Math.max(0.22, 1.0 - absD * (stage ? 0.32 : 0.30));
      card.material.opacity = follow(card.material.opacity, Math.min(1, opacity + lift * 0.08) * (props.shelfOpacity || 1), 5, dt);
      card.material.color.setScalar(0.92 + Math.max(0, 1 - absD) * 0.08 + lift * 0.04);
    }
  };

  StageCanvas.prototype.loadSkullLayer = function () {
    var self = this;
    if (this.skullGroup || this.skullLoading || typeof fetch !== "function") return;
    this.skullLoading = true;
    fetch("assets/skull-decimation-points.bin", { cache: "force-cache" }).then(function (response) {
      if (!response.ok) throw new Error("skull asset " + response.status);
      return response.arrayBuffer();
    }).then(function (buffer) {
      if (!buffer || buffer.byteLength < 20 || buffer.byteLength % 20 !== 0) throw new Error("invalid skull asset");
      self.createSkullLayer(new Float32Array(buffer));
    }).catch(function (error) {
      console.warn("Mineradio skull asset unavailable:", error);
    }).finally(function () {
      self.skullLoading = false;
    });
  };

  StageCanvas.prototype.createSkullLayer = function (points) {
    var count = Math.floor(points.length / 5);
    var positions = new Float32Array(count * 3);
    var kinds = new Float32Array(count);
    var seeds = new Float32Array(count);
    for (var i = 0; i < count; i += 1) {
      positions[i * 3] = points[i * 5];
      positions[i * 3 + 1] = points[i * 5 + 1];
      positions[i * 3 + 2] = points[i * 5 + 2];
      kinds[i] = points[i * 5 + 3];
      seeds[i] = points[i * 5 + 4];
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("kind", new THREE.BufferAttribute(kinds, 1));
    geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
    var uniforms = {
      uMap: { value: this.dotTexture }, uTime: this.uniforms.uTime, uPixel: this.uniforms.uPixel,
      uBass: this.uniforms.uBass, uMid: this.uniforms.uMid, uTreble: this.uniforms.uTreble, uBeat: this.uniforms.uBeat,
      uJawOpen: { value: 0 }, uSkullFlash: { value: 0 }, uPointScale: this.uniforms.uPointScale,
      uBloomStrength: this.uniforms.uBloomStrength, uColorBoost: this.uniforms.uColorBoost, uOpacity: { value: 0 },
      uColorA: { value: new THREE.Color("#b8ae98") }, uColorB: { value: new THREE.Color("#fff4d8") },
      uShadow: { value: new THREE.Color("#100d0d") }, uLight: { value: new THREE.Color("#ffe3a0") }
    };
    var vertex = [
      "precision highp float;attribute float seed,kind;uniform float uTime,uPixel,uPointScale,uBloomStrength,uColorBoost,uBass,uMid,uTreble,uBeat,uJawOpen,uSkullFlash;varying float vKind,vLight,vRim,vAmp,vDensity,vFlash;",
      "void main(){vec3 pos=position;float jawGroup=step(1.0,kind);float boneKind=fract(kind);vKind=boneKind;vec3 n=normalize(vec3(position.x*.82,position.y*.68,position.z*1.22+.16));",
      "float jawSideAnchor=smoothstep(.36,.66,abs(position.x))*(1.0-smoothstep(.78,.98,abs(position.x)))*smoothstep(-.34,-.74,position.y)*(1.0-smoothstep(.62,.86,position.z));",
      "float jawMotion=jawGroup*(1.0-jawSideAnchor*.32);vec2 hinge=vec2(-.45,.18);float a=uJawOpen*.52*jawMotion;float c=cos(a),s=sin(a);vec2 jr=pos.yz-hinge;pos.yz=mix(pos.yz,vec2(jr.x*c-jr.y*s,jr.x*s+jr.y*c)+hinge,jawMotion);",
      "float jawDrop=jawMotion*smoothstep(-.32,-.88,position.y);pos.y-=jawDrop*(.038+clamp(uJawOpen,0.0,1.25)*.10);float ampDrive=smoothstep(.20,.82,uBass*.44+uMid*.22+uBeat*.72);",
      "float ampPhase=.5+.5*sin(uTime*(1.05+uMid*.30)+seed*6.2831);vFlash=clamp(uSkullFlash*(.68+ampPhase*.32),0.0,1.0);vAmp=clamp(ampDrive*.045+vFlash*.92+uTreble*.012,0.0,1.0);",
      "vec4 mv=modelViewMatrix*vec4(pos,1.0);float dist=max(.55,-mv.z);vec3 vn=normalize(normalMatrix*n);vec3 keyDir=normalize(vec3(-.48,.64,.60));vec3 rimDir=normalize(vec3(.88,.18,-.44));",
      "float key=pow(max(dot(vn,keyDir),0.0),1.18);vRim=pow(max(dot(vn,rimDir),0.0),2.5)*(.24+uBloomStrength*.08+vFlash*.62);float dust=fract(sin(seed*13.871+position.x*19.7+position.y*7.1)*43758.5453);",
      "vDensity=clamp(.30+key*.70+vRim*.24+dust*.025+vFlash*.08,.16,1.20);vLight=clamp(.115+key*1.02+boneKind*.070+vAmp*.56,.035,1.72);",
      "float size=(.035+boneKind*.026)*(.84+vDensity*.22+vLight*.13+uBloomStrength*.030+vFlash*.18);gl_PointSize=clamp(size*uPixel*clamp(uPointScale,.48,2.35)*128.0/dist,.95,7.60);gl_Position=projectionMatrix*mv;}"
    ].join("\n");
    var fragment = [
      "precision highp float;uniform sampler2D uMap;uniform vec3 uColorA,uColorB,uShadow,uLight;uniform float uOpacity,uBloomStrength,uColorBoost;varying float vKind,vLight,vRim,vAmp,vDensity,vFlash;",
      "void main(){vec4 tex=texture2D(uMap,gl_PointCoord);if(tex.a<.070)discard;float contrast=clamp(uColorBoost,.50,2.0);float lit=clamp(pow(vLight,mix(1.18,.74,(contrast-.50)/1.50)),0.0,1.28);",
      "vec3 bone=mix(uColorA,uColorB,clamp((vKind-.34)*2.0+lit*.18,0.0,1.0));vec3 col=mix(uShadow,bone,clamp(lit,0.0,1.0));col=mix(col,uLight,clamp(vRim*(.14+uBloomStrength*.035+vFlash*.40),0.0,.54));",
      "col=mix(col,uLight,clamp(vAmp*(.09+uBloomStrength*.025)+vFlash*.56,0.0,.68));float alpha=tex.a*uOpacity*clamp(.20+lit*.44+vDensity*.40+vRim*.10+vFlash*.46,.12,1.56);gl_FragColor=vec4(col,alpha);}"
    ].join("\n");
    var material = new THREE.ShaderMaterial({ uniforms: uniforms, vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending });
    this.skullGroup = new THREE.Points(geometry, material);
    this.skullGroup.position.set(0, 0.22, 0.10);
    this.skullGroup.rotation.x = -0.26;
    this.skullGroup.scale.setScalar(2.34);
    this.skullGroup.frustumCulled = false;
    this.skullGroup.visible = false;
    this.skullGroup.renderOrder = 32;
    this.scene.add(this.skullGroup);
  };

  StageCanvas.prototype.updateSkull = function (active, audio, props, dt, time) {
    if (active && !this.skullGroup) this.loadSkullLayer();
    if (!this.skullGroup) return;
    this.skullOpacity = follow(this.skullOpacity, active ? 1 : 0, active ? 3.2 : 2.4, dt);
    this.skullGroup.visible = this.skullOpacity > 0.006;
    if (!this.skullGroup.visible) return;
    var beatTransient = clamp(Math.max(0, audio.beat - 0.16) / 0.84, 0, 1.35);
    var flashTarget = clamp(Math.pow(beatTransient, 1.34) * 1.08 + Math.max(0, audio.bass - 0.60) * 0.18 * beatTransient, 0, 1);
    this.skullFlash = follow(this.skullFlash, flashTarget, flashTarget > this.skullFlash ? 24 : 6.2, dt);
    var jawTarget = clamp(0.60 + (0.5 + 0.5 * Math.sin(time * 0.50)) * 0.050 + audio.bass * 0.060 + this.skullFlash * 0.090, 0.52, 0.88);
    this.skullJaw = follow(this.skullJaw, jawTarget, jawTarget > this.skullJaw ? 7.8 : 3.4, dt);
    var u = this.skullGroup.material.uniforms;
    u.uOpacity.value = this.skullOpacity * clamp(0.78 + props.intensity * 0.18, 0.56, 1);
    u.uSkullFlash.value = this.skullFlash;
    u.uJawOpen.value = this.skullJaw;
    var tint = this.visual.palette.secondary;
    if (tint) {
      var color = new THREE.Color(tint.r / 255, tint.g / 255, tint.b / 255);
      u.uColorA.value.set("#b8ae98").lerp(color, props.visualTintMode === "custom" ? 0.92 : 0.30);
      u.uColorB.value.set("#fff4d8").lerp(color, props.visualTintMode === "custom" ? 0.72 : 0.18);
    }
    var shelfComposition = active && props.shelf !== "off" && this.shelfCards.length > 0;
    this.skullShelfMix = follow(this.skullShelfMix || 0, shelfComposition ? 1 : 0, shelfComposition ? 4.6 : 5.8, dt);
    var breath = {
      x: Math.sin(time * 0.33 + 1.7) * 0.028 + Math.sin(time * 0.61 + 0.4) * 0.010,
      y: Math.sin(time * 0.38 + 0.2) * 0.036 + Math.sin(time * 0.83 + 2.1) * 0.012,
      z: Math.sin(time * 0.24 + 2.6) * 0.026
    };
    var baseX = -1.05 * this.skullShelfMix;
    var baseY = 0.22 + 0.10 * this.skullShelfMix;
    var baseZ = 0.10;
    this.skullGroup.position.x = follow(this.skullGroup.position.x, baseX + breath.x * (1 - this.skullShelfMix * 0.30), 4.2, dt);
    this.skullGroup.position.y = follow(this.skullGroup.position.y, baseY + breath.y * (1 - this.skullShelfMix * 0.30), 4.8, dt);
    this.skullGroup.position.z = follow(this.skullGroup.position.z, baseZ + breath.z, 4.2, dt);
    var sourceRotX = this.particles ? this.particles.rotation.x : 0;
    var sourceRotY = this.particles ? this.particles.rotation.y : 0;
    this.skullGroup.rotation.x = follow(this.skullGroup.rotation.x, -0.26 + sourceRotX * 0.58, 7.4, dt);
    this.skullGroup.rotation.y = follow(this.skullGroup.rotation.y, sourceRotY * 0.72 + this.skullShelfMix * 0.10, 7.4, dt);
    this.skullGroup.rotation.z = follow(this.skullGroup.rotation.z, 0, 6.0, dt);
    var targetScale = (2.46 + (2.92 - 2.46) * this.skullShelfMix) * (1 + this.skullFlash * 0.045);
    this.skullGroup.scale.x = follow(this.skullGroup.scale.x, targetScale, 4.6, dt);
    this.skullGroup.scale.y = this.skullGroup.scale.x;
    this.skullGroup.scale.z = this.skullGroup.scale.x;
  };

  StageCanvas.prototype.onContextLost = function (event) {
    if (event && event.preventDefault) event.preventDefault();
    console.warn("Mineradio WE WebGL context lost.");
    this.disabled = true;
  };

  StageCanvas.prototype.bindInteractions = function () {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("mousewheel", this.onWheel, { passive: false });
    window.addEventListener("wheel", this.onWheel, { passive: false, capture: true });
    window.addEventListener("mousewheel", this.onWheel, { passive: false, capture: true });
    this.canvas.addEventListener("dblclick", this.resetCamera);
  };

  StageCanvas.prototype.onPointerDown = function (event) {
    if (event.button != null && event.button !== 0) return;
    this.updatePointerLocal(event);
    var hit = this.pickShelfCard();
    this.pointer.active = true;
    this.pointer.id = event.pointerId;
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    this.pointer.at = performance.now();
    this.pointer.mode = hit ? "shelf" : "camera";
    this.shelfClickCandidate = hit;
    if (hit) {
      this.shelfHover = hit;
      if (this.canvas.setPointerCapture && event.pointerId != null) {
        try { this.canvas.setPointerCapture(event.pointerId); } catch (_) {}
      }
      event.preventDefault();
      return;
    }
    this.cameraState.spinTheta = 0;
    this.cameraState.spinPhi = 0;
    if (this.canvas.setPointerCapture && event.pointerId != null) {
      try { this.canvas.setPointerCapture(event.pointerId); } catch (_) {}
    }
    document.body.classList.add("stage-dragging");
    event.preventDefault();
  };

  StageCanvas.prototype.onPointerMove = function (event) {
    this.updatePointerLocal(event);
    if (!this.pointer.active || (event.pointerId != null && event.pointerId !== this.pointer.id)) return;
    if (this.pointer.mode === "shelf") {
      var movedX = event.clientX - this.pointer.x;
      var movedY = event.clientY - this.pointer.y;
      if (movedX * movedX + movedY * movedY > 81) this.shelfClickCandidate = null;
      event.preventDefault();
      return;
    }
    var now = performance.now();
    var dt = clamp((now - this.pointer.at) / 1000, 1 / 120, 0.08);
    var dx = event.clientX - this.pointer.x;
    var dy = event.clientY - this.pointer.y;
    var props = this.visual.properties || NS.PropertyDefaults;
    var sensitivity = props.cameraSensitivity || 1;
    var thetaDelta = dx * 0.0034 * sensitivity;
    var phiDelta = dy * 0.0032 * sensitivity;
    var state = this.cameraState;
    state.userTheta += thetaDelta;
    state.userPhi = clamp(state.userPhi + phiDelta, -Math.PI * 0.49, Math.PI * 0.49);
    state.spinTheta = clamp(thetaDelta / dt * 0.46, -6.2, 6.2);
    state.spinPhi = clamp(phiDelta / dt * 0.46, -6.2, 6.2);
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    this.pointer.at = now;
    event.preventDefault();
  };

  StageCanvas.prototype.onPointerUp = function (event) {
    if (!this.pointer.active || (event.pointerId != null && event.pointerId !== this.pointer.id)) return;
    var wasShelf = this.pointer.mode === "shelf";
    this.pointer.active = false;
    this.pointer.mode = "";
    if (this.canvas.releasePointerCapture && event.pointerId != null) {
      try { this.canvas.releasePointerCapture(event.pointerId); } catch (_) {}
    }
    if (wasShelf) {
      this.updatePointerLocal(event);
      var hit = this.pickShelfCard();
      if (this.shelfClickCandidate && hit === this.shelfClickCandidate) this.activateShelfCard(hit);
      this.shelfClickCandidate = null;
      event.preventDefault();
      return;
    }
    var props = this.visual.properties || NS.PropertyDefaults;
    if (!props.cameraInertia) {
      this.cameraState.spinTheta = 0;
      this.cameraState.spinPhi = 0;
    }
    document.body.classList.remove("stage-dragging");
  };

  StageCanvas.prototype.onPointerLeave = function () {
    if (this.pointer.active) return;
    this.pointer.hover = false;
    this.uniforms.uMouseActive.value = 0;
  };

  StageCanvas.prototype.updatePointerLocal = function (event) {
    if (!this.particles || !this.raycaster) return;
    var rect = this.canvas.getBoundingClientRect();
    var width = Math.max(1, rect.width || this.canvas.clientWidth || window.innerWidth || 1);
    var height = Math.max(1, rect.height || this.canvas.clientHeight || window.innerHeight || 1);
    this.mouseNdc.set(((event.clientX - rect.left) / width) * 2 - 1, -(((event.clientY - rect.top) / height) * 2 - 1));
    this.pointer.hover = true;
    this.raycaster.setFromCamera(this.mouseNdc, this.camera);
    this.particles.updateMatrixWorld(true);
    this.pointerPlaneOrigin.setFromMatrixPosition(this.particles.matrixWorld);
    this.pointerPlaneNormal.set(0, 0, 1).transformDirection(this.particles.matrixWorld);
    this.pointerPlane.setFromNormalAndCoplanarPoint(this.pointerPlaneNormal, this.pointerPlaneOrigin);
    if (!this.raycaster.ray.intersectPlane(this.pointerPlane, this.pointerHit)) {
      this.uniforms.uMouseActive.value = 0;
      return;
    }
    this.particles.worldToLocal(this.pointerHit);
    if (Math.abs(this.pointerHit.x) > PLANE_SIZE * 0.62 || Math.abs(this.pointerHit.y) > PLANE_SIZE * 0.62) {
      this.uniforms.uMouseActive.value = 0;
      return;
    }
    this.pointer.hover = true;
    this.uniforms.uMouseXY.value.set(this.pointerHit.x, this.pointerHit.y);
    this.uniforms.uMouseActive.value = 1;
  };

  StageCanvas.prototype.onWheel = function (event) {
    if (event.__mineradioStageWheelHandled) return;
    event.__mineradioStageWheelHandled = true;
    var rawDelta = event.deltaY;
    if (!rawDelta && event.wheelDelta) rawDelta = -event.wheelDelta;
    if (!rawDelta && event.detail) rawDelta = event.detail * 40;
    var delta = clamp(rawDelta || 0, -240, 240);
    if (!delta) return;
    var props = this.visual.properties || NS.PropertyDefaults;
    if (props.shelf !== "off" && this.shelfCards.length > 1) {
      var x = event.clientX == null ? window.innerWidth : event.clientX;
      var y = event.clientY == null ? window.innerHeight : event.clientY;
      var shelfZone = props.shelf === "stage" ? y > window.innerHeight * 0.42 : x > window.innerWidth * 0.56;
      if (shelfZone) {
        var direction = delta > 0 ? 1 : -1;
        this.shelfCenterTarget = clamp(Math.round(this.shelfCenterTarget + direction), 0, this.shelfCards.length - 1);
        this.shelfOpenAt = performance.now() * 0.001;
        this.redrawShelfCards(true);
        if (event.cancelable) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
        return;
      }
    }
    var state = this.cameraState;
    state.userRadius = clamp(state.userRadius + delta * 0.0046, 2.4, 14);
    state.zoomPulse = Math.max(state.zoomPulse || 0, Math.min(1, Math.abs(delta) * 0.0032));
    if (event.cancelable) event.preventDefault();
    if (event.stopPropagation) event.stopPropagation();
  };

  StageCanvas.prototype.resetCamera = function (event) {
    if (event && event.preventDefault) event.preventDefault();
    this.cameraState.userTheta = 0;
    this.cameraState.userPhi = 0;
    var props = this.visual.properties || NS.PropertyDefaults;
    this.cameraState.userRadius = clamp(props.cameraDistance || 8.6, 4.8, 13);
    this.cameraState.spinTheta = 0;
    this.cameraState.spinPhi = 0;
    this.cameraState.zoomPulse = 0;
  };

  StageCanvas.prototype.beginTrackTransition = function (trackKey) {
    if (!this.lastCover) return;
    var text = String(trackKey || "track");
    var hash = 2166136261;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    this.transitionSeed = (hash >>> 0) / 4294967295;
    this.transitionWaiting = true;
    this.transitionStartedAt = performance.now() * 0.001;
    this.uniforms.uTransitionSeed.value = this.transitionSeed;
  };

  StageCanvas.prototype.triggerWave = function (x, y, strength) {
    var wave = this.waves[this.waveIndex];
    wave.x = x;
    wave.y = y;
    wave.age = 0;
    wave.strength = strength;
    this.waveIndex = (this.waveIndex + 1) % this.waves.length;
  };

  StageCanvas.prototype.triggerTransitionWaves = function () {
    var seed = this.transitionSeed;
    var mode = Math.floor(seed * 3) % 3;
    if (mode === 0) this.triggerWave(-0.45, 0.10, 0.40);
    else if (mode === 1) this.triggerWave(0.10, 0.18, 0.42);
    else this.triggerWave(0.70, -0.45, 0.40);
  };

  StageCanvas.prototype.completeTrackTransition = function () {
    if (!this.transitionWaiting) return;
    this.transitionWaiting = false;
    this.triggerTransitionWaves();
  };

  StageCanvas.prototype.currentVisualCover = function () {
    var now = performance.now() * 0.001;
    if (this.shelfPreviewItem && this.shelfPreviewUntil > now && this.shelfPreviewItem.image) {
      return { image: this.shelfPreviewItem.image, ready: true };
    }
    if (this.shelfPreviewItem && this.shelfPreviewUntil <= now) {
      this.shelfPreviewItem = null;
      this.redrawShelfCards(true);
    }
    if (this.media.current && this.media.current.thumbnail && !this.media.current.coverReady) return null;
    return { image: this.media.currentCover(), ready: !!(this.media.current && this.media.current.coverReady) };
  };

  StageCanvas.prototype.updateWaves = function (dt) {
    for (var w = 0; w < this.waves.length; w += 1) {
      var wave = this.waves[w];
      if (wave.strength > 0.004) {
        wave.age += dt;
        if (wave.age > 1.85) {
          wave.age = -10;
          wave.strength = 0;
        }
      }
      this.uniforms.uWave.value.set(wave.x, wave.y, wave.age, wave.strength);
    }
  };

  StageCanvas.prototype.updateCover = function () {
    var cover = this.currentVisualCover();
    if (!cover) return;
    var image = cover.image;
    if (!image || image === this.lastCover || !(image.complete || image.width)) return;
    var hadCover = !!this.lastCover;
    this.lastCover = image;
    var nextCanvas;
    try {
      nextCanvas = coverCanvasFromImage(image);
    } catch (_) {
      return;
    }
    var previous = document.createElement("canvas");
    previous.width = previous.height = 512;
    previous.getContext("2d").drawImage(this.coverTexture.image, 0, 0, 512, 512);
    this.previousCoverTexture.image = previous;
    this.previousCoverTexture.needsUpdate = true;
    this.coverTexture.image = nextCanvas;
    this.coverTexture.needsUpdate = true;
    this.edgeTexture.image = buildEdgeAndDepth(nextCanvas);
    this.edgeTexture.needsUpdate = true;
    this.uniforms.uHasCover.value = cover.ready ? 1 : 0.72;
    this.coverMix = 0;
    this.coverReveal = 0;
    this.transitionPulse = 1;
    this.uniforms.uReveal.value = 0;
    this.uniforms.uTransitionPulse.value = 1;
    this.cameraState.radiusKick = Math.max(this.cameraState.radiusKick, 0.12);
    if (hadCover) {
      if (this.transitionWaiting) this.completeTrackTransition();
    } else {
      this.loadingAmount = 0;
      this.transitionWaiting = false;
    }
  };

  StageCanvas.prototype.resize = function () {
    if (this.disabled) return;
    var width = Math.max(1, window.innerWidth || 1);
    var height = Math.max(1, window.innerHeight || 1);
    var device = window.devicePixelRatio || 1;
    var quality = (this.visual.properties || NS.PropertyDefaults).performanceQuality;
    var qualityCap = quality === "eco" ? 0.82 : (quality === "balanced" ? 1.0 : (quality === "ultra" ? 2.0 : 1.62));
    var pixelBudget = quality === "eco" ? 2400000 : (quality === "balanced" ? 3600000 : (quality === "ultra" ? 8000000 : 5200000));
    var budget = Math.sqrt(pixelBudget / Math.max(1, width * height));
    var dpr = Math.max(0.68, Math.min(qualityCap, device, budget));
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.uniforms.uPixel.value = dpr;
    this.buildGeometry(false);
  };

  StageCanvas.prototype.start = function () {
    if (this.started || this.disabled) return;
    this.started = true;
    requestAnimationFrame(this.loop);
  };

  StageCanvas.prototype.setFpsLimit = function (fps) {
    fps = Number(fps) || 0;
    this.fpsLimit = fps > 0 ? clamp(fps, 10, 144) : 0;
  };

  StageCanvas.prototype.loop = function (timeMs) {
    if (this.disabled) return;
    requestAnimationFrame(this.loop);
    var props = this.visual.properties || NS.PropertyDefaults;
    if (document.hidden && props.adaptiveIdle && timeMs - this.lastFrameAt < 100) return;
    if (this.fpsLimit > 0 && this.lastFrameAt && timeMs - this.lastFrameAt < (1000 / this.fpsLimit) - 1) return;
    var dt = clamp((timeMs - (this.lastFrameAt || timeMs - 16.7)) / 1000, 1 / 240, 0.05);
    this.lastFrameAt = timeMs;
    this.frameCount += 1;
    try {
      this.render(timeMs * 0.001, dt);
    } catch (err) {
      console.error("Mineradio WE render failed:", err);
      this.disabled = true;
    }
  };

  StageCanvas.prototype.updateCamera = function (time, audio, dt, intensity) {
    var state = this.cameraState;
    var props = this.visual.properties || NS.PropertyDefaults;
    var configuredDistance = clamp(props.cameraDistance || 8.6, 4.8, 13);
    if (Math.abs(configuredDistance - this.lastCameraDistance) > 0.001) {
      state.userRadius = configuredDistance;
      this.lastCameraDistance = configuredDistance;
    }
    if (!this.pointer.active && props.cameraInertia) {
      state.userTheta += state.spinTheta * dt;
      state.userPhi = clamp(state.userPhi + state.spinPhi * dt, -Math.PI * 0.49, Math.PI * 0.49);
      var inertiaDamping = Math.pow(0.90, dt * 60);
      state.spinTheta *= inertiaDamping;
      state.spinPhi *= inertiaDamping;
      if (Math.abs(state.spinTheta) < 0.002) state.spinTheta = 0;
      if (Math.abs(state.spinPhi) < 0.002) state.spinPhi = 0;
    }
    var manualCameraBlend = this.pointer.active ? 0.18 : 1;
    if (audio.pulse > this.lastPulse + 0.07) {
      var sign = Math.sin(time * 5.17) >= 0 ? 1 : -1;
      state.radiusKick = Math.max(state.radiusKick, audio.pulse * 0.28 * intensity * manualCameraBlend);
      state.thetaKick += sign * audio.pulse * 0.0062 * intensity * manualCameraBlend;
      state.phiKick -= audio.pulse * 0.0035 * intensity * manualCameraBlend;
      state.rollKick += sign * audio.pulse * 0.0055 * intensity * manualCameraBlend;
    }
    this.lastPulse = audio.pulse;
    state.thetaKick *= Math.exp(-dt * 7.5);
    state.phiKick *= Math.exp(-dt * 7.8);
    state.radiusKick *= Math.exp(-dt * 6.8);
    state.rollKick *= Math.exp(-dt * 8.2);
    state.zoomPulse *= Math.exp(-dt * 5.8);

    state.autoBlend = follow(state.autoBlend == null ? 1 : state.autoBlend, this.pointer.active ? 0.18 : 1, this.pointer.active ? 10 : 2.4, dt);
    var dragDamp = state.autoBlend;
    var galaxyView = props.presetIndex === 5;
    var orbitView = props.presetIndex === 2;
    var skullView = props.presetIndex === 6;
    var pitchBias = clamp(props.cameraPitchBias || 0, -28, 28) * Math.PI / 180;
    var targetX = clamp(props.cameraTargetX || 0, -3, 3);
    var targetY = clamp(props.cameraTargetY == null ? 0.38 : props.cameraTargetY, -2, 2.8);
    var targetZ = clamp(props.cameraTargetZ || 0, -3, 3);
    var thetaTarget = (galaxyView ? -0.52 : (skullView ? 0.18 : 0)) + Math.sin(time * 0.08) * 0.012 * dragDamp + state.thetaKick;
    var phiBase = galaxyView ? 0.28 : (orbitView ? 0.10 : (skullView ? 0.06 : 0.02));
    var phiTarget = clamp(phiBase + pitchBias + Math.sin(time * 0.06 + 1) * 0.010 * dragDamp + state.phiKick, -Math.PI * 0.48, Math.PI * 0.48);
    var baseRadius = galaxyView ? Math.max(state.userRadius, 9.4) : state.userRadius;
    var radiusTarget = baseRadius + (galaxyView ? 0.3 : (orbitView ? 1.25 : (skullView ? -0.85 : 0))) + Math.sin(time * 0.04 + 2) * 0.080 * dragDamp - state.radiusKick;
    state.theta = follow(state.theta, thetaTarget, 6.3, dt);
    state.phi = follow(state.phi, phiTarget, 6.3, dt);
    state.radius = follow(state.radius, radiusTarget, 4.4, dt);
    state.targetX = follow(state.targetX || 0, targetX, 5.5, dt);
    state.targetY = follow(state.targetY == null ? 0.38 : state.targetY, targetY, 5.5, dt);
    state.targetZ = follow(state.targetZ || 0, targetZ, 5.5, dt);
    var cosPhi = Math.cos(state.phi);
    this.cameraTarget.set(state.targetX, state.targetY, state.targetZ);
    this.camera.position.set(
      state.targetX + state.radius * cosPhi * Math.sin(state.theta),
      state.targetY + state.radius * Math.sin(state.phi),
      state.targetZ + state.radius * cosPhi * Math.cos(state.theta)
    );
    this.camera.lookAt(this.cameraTarget);
    this.camera.rotation.z += state.rollKick;
    this.camera.fov = follow(this.camera.fov, 45 - audio.beat * 1.75 - state.zoomPulse * 1.1, 7.5, dt);
    this.camera.updateProjectionMatrix();

    this.particles.rotation.y = follow(this.particles.rotation.y, state.userTheta, 3.4, dt);
    this.particles.rotation.x = follow(this.particles.rotation.x, state.userPhi, 3.4, dt);
    if (this.bloomParticles) this.bloomParticles.rotation.copy(this.particles.rotation);
    if (this.floatGroup) this.floatGroup.rotation.copy(this.particles.rotation);
  };

  StageCanvas.prototype.render = function (time, dt) {
    this.updateCover();
    this.buildGeometry(false);
    var audio = this.audio.tick();
    var props = this.visual.properties || NS.PropertyDefaults;
    var preset = props.presetIndex;
    var legacyPlane = preset === 7;
    var alphaTarget = preset === 3 || preset === 6 ? 0 : 1;
    var intensity = props.intensity || 0.85;
    var smoothBass = audio.smoothBass == null ? audio.bass : audio.smoothBass;
    var smoothMid = audio.smoothMid == null ? audio.mid : audio.smoothMid;
    var smoothTreb = audio.smoothTreb == null ? audio.high : audio.smoothTreb;
    var smoothEnergy = audio.smoothEnergy == null ? audio.level : audio.smoothEnergy;
    var beatDrive = audio.beat || 0;
    var bassDrive = Math.min(0.90, smoothBass * 1.05 + beatDrive * 0.18) * intensity;
    var midDrive = Math.min(0.72, smoothMid * 1.12) * intensity;
    var trebleDrive = Math.min(0.62, smoothTreb * 1.20) * intensity;
    if (preset === 1) {
      bassDrive = Math.min(0.40, smoothBass * 0.66 + beatDrive * 0.035) * intensity;
      midDrive = Math.min(0.48, smoothMid * 0.82 + audio.rhythm * 0.055) * intensity;
      trebleDrive = Math.min(0.34, smoothTreb * 0.74) * intensity;
      beatDrive *= 0.16;
    } else if (preset === 2) {
      bassDrive = Math.min(0.34, smoothBass * 0.48 + smoothMid * 0.10 + beatDrive * 0.020) * intensity;
      midDrive = Math.min(0.42, smoothMid * 0.62 + smoothBass * 0.08) * intensity;
      trebleDrive = Math.min(0.22, smoothTreb * 0.34 + smoothMid * 0.05) * intensity;
      beatDrive *= 0.08;
    }
    if (preset >= 4 && !legacyPlane) {
      var wallpaperAudio = preset === 5;
      var ringBass = smoothBass * (wallpaperAudio ? 1.10 : 1.58) + beatDrive * (wallpaperAudio ? 0.18 : 0.42) - smoothMid * 0.16 - smoothTreb * 0.06;
      var ringMid = smoothMid * (wallpaperAudio ? 1.16 : 1.82) - smoothBass * 0.14 - smoothTreb * 0.07;
      var ringTreble = smoothTreb * (wallpaperAudio ? 1.34 : 2.28) - smoothMid * 0.10 - smoothBass * 0.05;
      bassDrive = Math.pow(clamp((ringBass - 0.050) / 0.58, 0, 1), 0.72) * intensity;
      midDrive = Math.pow(clamp((ringMid - 0.045) / 0.46, 0, 1), 0.78) * intensity;
      trebleDrive = Math.pow(clamp((ringTreble - 0.030) / 0.34, 0, 1), 0.84) * intensity;
      if (wallpaperAudio) {
        bassDrive = Math.min(bassDrive, 0.46 * intensity);
        midDrive = Math.min(midDrive, 0.40 * intensity);
        trebleDrive = Math.min(trebleDrive, 0.36 * intensity);
        beatDrive *= 0.34;
      }
    }
    var vocalDrive = legacyPlane ? Math.min(0.78, ((audio.vocal || 0) * 0.86 + (audio.vocalPulse || 0) * 0.16) * intensity) : 0;
    var rhythmDrive = legacyPlane ? clamp(Math.max((audio.rhythm || 0) * (0.82 + intensity * 0.30), beatDrive * (0.44 + intensity * 0.10)), 0, 1.12) : 0;

    this.uniforms.uTime.value = time;
    this.uniforms.uBass.value = bassDrive;
    this.uniforms.uMid.value = midDrive;
    this.uniforms.uVocal.value = vocalDrive;
    this.uniforms.uTreble.value = trebleDrive;
    this.uniforms.uBeat.value = beatDrive;
    this.uniforms.uEnergy.value = audio.level;
    this.uniforms.uRhythm.value = rhythmDrive;
    this.uniforms.uPreset.value = preset;
    this.uniforms.uIntensity.value = intensity;
    this.uniforms.uDepth.value = props.depth;
    this.uniforms.uPointScale.value = props.point;
    this.uniforms.uSpeed.value = props.speed;
    this.uniforms.uTwist.value = props.twist;
    this.uniforms.uColorBoost.value = props.colorBoost;
    this.uniforms.uScatter.value = props.scatter;
    this.uniforms.uCoverRes.value = props.coverResolution;
    this.uniforms.uBgFade.value = props.bgFade;
    this.uniforms.uGalaxyDepth.value = props.galaxyDepth;
    this.uniforms.uEdgeEnabled.value = props.edge ? 1 : 0;
    this.uniforms.uAiBoost.value = props.aiDepth ? 1 : 0;
    this.uniforms.uVinylSpin.value = (this.uniforms.uVinylSpin.value + dt * (0.40 + smoothBass * 0.09) * Math.max(0.05, props.speed)) % (Math.PI * 2);
    this.uniforms.uAlpha.value = follow(this.uniforms.uAlpha.value, alphaTarget, alphaTarget > this.uniforms.uAlpha.value ? 5.2 : 4.2, dt);
    this.uniforms.uParticleDim.value = 1;
    if (this.transitionWaiting && time - this.transitionStartedAt > 3.2) {
      this.transitionWaiting = false;
    }
    var loadingTarget = this.transitionWaiting ? 0.56 : 0;
    this.loadingAmount = follow(this.loadingAmount, loadingTarget, loadingTarget > this.loadingAmount ? 18 : 3.4, dt);
    this.uniforms.uLoading.value = this.loadingAmount;
    this.uniforms.uTransitionSeed.value = this.transitionSeed;
    this.updateWaves(dt);
    this.uniforms.uGather.value = legacyPlane ? smoothstep01((audio.level * 0.48 + rhythmDrive * 0.82 - 0.06) / 0.78) : 1;
    this.coverMix = Math.min(1, this.coverMix + dt / 0.52);
    this.uniforms.uColorMixT.value = this.coverMix * this.coverMix * (3 - 2 * this.coverMix);
    this.coverReveal = Math.min(1, this.coverReveal + dt / (preset === 0 || legacyPlane ? 0.72 : 0.50));
    this.transitionPulse *= Math.exp(-dt * 3.8);
    this.uniforms.uReveal.value = smoothstep01(this.coverReveal);
    this.uniforms.uTransitionPulse.value = clamp(this.transitionPulse, 0, 1);
    this.uniforms.uBloomStrength.value = props.bloom && preset !== 5 ? props.bloomStrength : 0;
    this.uniforms.uBloomSize.value = 2.65;
    if (this.bloomParticles) this.bloomParticles.visible = alphaTarget > 0 && this.uniforms.uBloomStrength.value > 0.015;
    var ambientTarget = props.floatLayer && alphaTarget > 0 ? 1 : 0;
    this.floatAlpha = follow(this.floatAlpha, ambientTarget, ambientTarget > this.floatAlpha ? 2.6 : 3.8, dt);
    this.uniforms.uFloatAlpha.value = this.floatAlpha;
    if (this.floatGroup) this.floatGroup.visible = this.floatAlpha > 0.006;
    if (this.backCoverGroup) {
      var backTarget = props.backCover && preset !== 3 && preset !== 5 && preset !== 6 ? 0.72 : 0;
      this.backCoverUniforms.uAlpha.value = follow(this.backCoverUniforms.uAlpha.value, backTarget, backTarget > this.backCoverUniforms.uAlpha.value ? 3.2 : 4.4, dt);
      this.backCoverGroup.visible = this.backCoverUniforms.uAlpha.value > 0.006;
      this.backCoverGroup.rotation.copy(this.particles.rotation);
    }

    var palette = this.visual.palette;
    setThreeColor(this.uniforms.uAmbientA.value, palette.secondary);
    setThreeColor(this.uniforms.uAmbientB.value, palette.accent);

    var cameraPulse = props.cinema ? beatDrive * props.cinemaShake : 0;
    var cameraAudio = this.cameraAudio;
    cameraAudio.level = audio.level;
    cameraAudio.bass = cameraPulse;
    cameraAudio.lowMid = cameraPulse;
    cameraAudio.mid = cameraPulse;
    cameraAudio.vocal = 0;
    cameraAudio.high = trebleDrive;
    cameraAudio.beat = cameraPulse * 0.68;
    cameraAudio.pulse = cameraPulse;
    this.updateCamera(time, cameraAudio, dt, intensity);
    this.particles.visible = preset !== 6;
    if (this.bloomParticles) this.bloomParticles.visible = preset !== 6 && alphaTarget > 0 && this.uniforms.uBloomStrength.value > 0.015;
    this.updateSkull(preset === 6, { bass: bassDrive, mid: midDrive, beat: beatDrive }, props, dt, time);
    this.updateShelf(props, dt, time);
    if (this.lyricsVisual) this.lyricsVisual.update(time, dt, audio, props);
    this.renderer.render(this.scene, this.camera);
  };

  StageCanvas.prototype.setLyricsVisual = function (lyricsVisual) {
    this.lyricsVisual = lyricsVisual || null;
  };

  StageCanvas.prototype.destroy = function () {
    window.removeEventListener("resize", this.resize);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("mousewheel", this.onWheel);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost, false);
    window.removeEventListener("wheel", this.onWheel, true);
    window.removeEventListener("mousewheel", this.onWheel, true);
    this.canvas.removeEventListener("dblclick", this.resetCamera);
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.bloomMaterial) this.bloomMaterial.dispose();
    if (this.floatGroup && this.floatGroup.geometry) this.floatGroup.geometry.dispose();
    if (this.floatMaterial) this.floatMaterial.dispose();
    if (this.lyricsVisual && this.lyricsVisual.destroy) this.lyricsVisual.destroy();
    if (this.renderer) this.renderer.dispose();
  };

  NS.StageCanvas = StageCanvas;
  NS.VisualCore = StageCanvas;
}());
