(function () {
  "use strict";

  var NS = window.MineradioOriginal = window.MineradioOriginal || {};

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clamp01(value) {
    return clamp(value || 0, 0, 1);
  }

  function now() {
    return (window.performance && window.performance.now) ? window.performance.now() : Date.now();
  }

  function follow(current, target, speed, dt) {
    var t = 1 - Math.exp(-speed * dt);
    return current + (target - current) * t;
  }

  function envFrame(current, target, attack, release) {
    return current + (target - current) * (target > current ? attack : release);
  }

  function makeRealtimeBeatState(startSeconds) {
    var start = startSeconds || 0;
    return {
      subFast: 0,
      subSlow: 0,
      lowFast: 0,
      lowSlow: 0,
      bodyFast: 0,
      bodySlow: 0,
      vocalFast: 0,
      vocalSlow: 0,
      snapFast: 0,
      snapSlow: 0,
      prevLowFast: 0,
      prevBodyFast: 0,
      prevVocalFast: 0,
      prevSnapFast: 0,
      lowPeak: 0.08,
      bodyPeak: 0.08,
      snapPeak: 0.08,
      massPeak: 0.08,
      onsetAvg: 0.018,
      onsetPeak: 0.055,
      lastHitAt: -99,
      tempoGap: 0.54,
      tempoConfidence: 0,
      beatCount: 0,
      primedFrames: 0,
      warmupUntil: start + 0.48,
      pulse: 0,
      score: 0
    };
  }

  function AudioReactor() {
    this.sample = new Float32Array(64);
    this.rawSample = new Float32Array(64);
    this.lastUpdateAt = 0;
    this.lastTickAt = now();
    this.active = false;
    this.activeSince = 0;

    this.level = 0;
    this.bass = 0;
    this.lowMid = 0;
    this.mid = 0;
    this.vocal = 0;
    this.high = 0;
    this.beat = 0;
    this.pulse = 0;
    this.rhythm = 0;
    this.body = 0;

    this.smoothBass = 0;
    this.smoothMid = 0;
    this.smoothVocal = 0;
    this.smoothTreb = 0;
    this.smoothEnergy = 0;
    this.prevEnergy = 0;
    this.beatPulse = 0;
    this.vocalPulse = 0;
    this.rhythmPulse = 0;
    this.previewPulse = 0;

    this.bassPeak = 0.03;
    this.midPeak = 0.03;
    this.vocalPeak = 0.03;
    this.treblePeak = 0.03;
    this.energyPeak = 0.035;
    this.rtBeat = makeRealtimeBeatState(0);
    this.bandState = { sub: 0, kick: 0, body: 0, vocal: 0, snap: 0, low: 0, mid: 0, high: 0, energy: 0 };
    this.beatFrame = { hit: false, strength: 0, confidence: 0, low: 0, body: 0, snap: 0, mass: 0, sharpness: 0, tempoAssist: false, combo: 0, score: 0, lowDominance: 0, pulse: 0 };
    this.frameState = { level: 0, bass: 0, lowMid: 0, mid: 0, vocal: 0, high: 0, beat: 0, pulse: 0, rhythm: 0, sample: this.sample, rawSample: this.rawSample, smoothBass: 0, smoothMid: 0, smoothTreb: 0, smoothEnergy: 0, dt: 0 };
  }

  AudioReactor.prototype.averageRange = function (start, end, source) {
    var data = source || this.sample;
    var sum = 0;
    var count = 0;
    var to = clamp(end, 0, data.length - 1);
    for (var i = clamp(start, 0, data.length - 1); i <= to; i += 1) {
      sum += data[i] || 0;
      count += 1;
    }
    return count ? sum / count : 0;
  };

  AudioReactor.prototype.bandRms = function (start, end, source) {
    var data = source || this.sample;
    var sum = 0;
    var count = 0;
    var to = clamp(end, 0, data.length - 1);
    for (var i = clamp(start, 0, data.length - 1); i <= to; i += 1) {
      var value = data[i] || 0;
      sum += value * value;
      count += 1;
    }
    return count ? Math.sqrt(sum / count) : 0;
  };

  AudioReactor.prototype.resetRealtimeBeatEngine = function (startSeconds) {
    this.rtBeat = makeRealtimeBeatState(startSeconds || 0);
  };

  AudioReactor.prototype.update = function (audioArray) {
    if (!audioArray || audioArray.length < 64) {
      return;
    }

    var t = now();
    var half = Math.floor(audioArray.length / 2);
    var started = !this.active;
    this.active = true;
    this.lastUpdateAt = t;

    if (started) {
      this.activeSince = t * 0.001;
      this.resetRealtimeBeatEngine(this.activeSince);
    }

    for (var i = 0; i < 64; i += 1) {
      var left = audioArray[i] || 0;
      var right = audioArray[i + half] || left;
      var v = clamp01((left + right) * 0.5);
      this.rawSample[i] = v;
      this.sample[i] = follow(this.sample[i], v, 42, 1 / 60);
    }
  };

  AudioReactor.prototype.computeBands = function () {
    var source = this.rawSample;
    var kick = this.bandRms(1, 7, source);
    var sub = this.bandRms(0, 2, source);
    var body = this.bandRms(8, 15, source);
    var vocal = this.averageRange(10, 38, source);
    var snap = this.bandRms(40, 63, source);
    var energy = this.bandRms(0, 63, source);

    var bands = this.bandState;
    bands.sub = clamp01(sub);
    bands.kick = clamp01(kick);
    bands.body = clamp01(body);
    bands.vocal = clamp01(vocal);
    bands.snap = clamp01(snap);
    bands.low = clamp01(kick * 0.86 + sub * 0.42);
    bands.mid = clamp01(this.averageRange(16, 41, source));
    bands.high = clamp01(this.averageRange(42, 63, source));
    bands.energy = clamp01(energy);
    return bands;
  };

  AudioReactor.prototype.processRealtimeBeatEngine = function (dt, seconds, bands) {
    var s = this.rtBeat;
    var frame = clamp(dt * 60, 0.35, 2.2);
    var fast = 1 - Math.pow(0.52, frame);
    var mid = 1 - Math.pow(0.82, frame);
    var slow = 1 - Math.pow(0.965, frame);

    s.subFast = follow(s.subFast, bands.sub, 42, dt);
    s.subSlow = follow(s.subSlow, bands.sub, 3.8, dt);
    s.lowFast = follow(s.lowFast, bands.low, 36, dt);
    s.lowSlow = follow(s.lowSlow, bands.low, 3.0, dt);
    s.bodyFast = follow(s.bodyFast, bands.body, 32, dt);
    s.bodySlow = follow(s.bodySlow, bands.body, 2.8, dt);
    s.vocalFast = follow(s.vocalFast, bands.vocal, 22, dt);
    s.vocalSlow = follow(s.vocalSlow, bands.vocal, 2.2, dt);
    s.snapFast = follow(s.snapFast, bands.snap, 40, dt);
    s.snapSlow = follow(s.snapSlow, bands.snap, 3.4, dt);

    var lowFlux = Math.max(0, s.lowFast - s.prevLowFast);
    var bodyFlux = Math.max(0, s.bodyFast - s.prevBodyFast);
    var vocalFlux = Math.max(0, s.vocalFast - s.prevVocalFast);
    var snapFlux = Math.max(0, s.snapFast - s.prevSnapFast);
    s.prevLowFast = s.lowFast;
    s.prevBodyFast = s.bodyFast;
    s.prevVocalFast = s.vocalFast;
    s.prevSnapFast = s.snapFast;

    var lowRise = Math.max(0, s.lowFast - s.lowSlow);
    var bodyRise = Math.max(0, s.bodyFast - s.bodySlow);
    var snapRise = Math.max(0, s.snapFast - s.snapSlow);
    var vocalRise = Math.max(0, s.vocalFast - s.vocalSlow);
    var drumOnset = lowRise * 1.42 + lowFlux * 1.92 + bodyRise * 0.44 + bodyFlux * 0.38 + snapFlux * 0.22;
    var musicalOnset = vocalRise * 0.58 + vocalFlux * 0.34 + snapRise * 0.28;
    var onset = drumOnset + musicalOnset;

    s.onsetAvg = s.onsetAvg + (onset - s.onsetAvg) * mid;
    s.onsetPeak = Math.max(s.onsetPeak * Math.pow(0.985, frame), onset, 0.045);
    s.lowPeak = Math.max(s.lowPeak * Math.pow(0.986, frame), s.lowFast, 0.06);
    s.bodyPeak = Math.max(s.bodyPeak * Math.pow(0.987, frame), s.bodyFast, 0.06);
    s.snapPeak = Math.max(s.snapPeak * Math.pow(0.986, frame), s.snapFast, 0.05);

    var mass = bands.energy * 0.55 + s.lowFast * 0.35 + s.bodyFast * 0.10;
    s.massPeak = Math.max(s.massPeak * Math.pow(0.989, frame), mass, 0.07);

    var lowNorm = clamp01(s.lowFast / (s.lowPeak + 0.025));
    var bodyNorm = clamp01(s.bodyFast / (s.bodyPeak + 0.025));
    var snapNorm = clamp01(s.snapFast / (s.snapPeak + 0.025));
    var onsetNorm = clamp01((onset - s.onsetAvg * 0.70) / (s.onsetPeak + 0.025));
    var massNorm = clamp01(mass / (s.massPeak + 0.035));

    var lowPresence = clamp01((s.lowFast - 0.055) / 0.31);
    var lowAttack = clamp01((lowRise * 2.2 + lowFlux * 4.0 - 0.028) / 0.22);
    var lowDominance = clamp01(s.lowFast / (s.vocalFast + s.bodyFast * 0.46 + 0.055));
    var voiceMask = clamp01((s.vocalFast - s.lowFast * 0.88) / 0.40);
    var drumGate = lowPresence * 0.52 + lowAttack * 0.34 + lowDominance * 0.28 - voiceMask * 0.22;
    drumGate = clamp01(drumGate);

    var score = clamp01(
      onsetNorm * 0.42 +
      lowNorm * 0.22 +
      lowAttack * 0.20 +
      massNorm * 0.11 +
      snapNorm * 0.05
    );

    var strongTransient = onset > Math.max(s.onsetAvg * 1.48 + 0.018, 0.050);
    var kickTransient = lowRise > Math.max(0.030, s.lowSlow * 0.16) || lowFlux > 0.035;
    var silenceGate = bands.energy > 0.035 && s.lowFast > 0.040;

    var gap = seconds - s.lastHitAt;
    var expected = s.tempoGap || 0.54;
    var nearTempo = Math.abs(gap - expected) < 0.125 || Math.abs(gap - expected * 2) < 0.16;
    var tempoAssist = s.tempoConfidence > 0.36 && nearTempo && gap > 0.30;
    var minGap = tempoAssist ? 0.28 : 0.40;
    var candidate = seconds > s.warmupUntil &&
      s.primedFrames > 8 &&
      gap > minGap &&
      silenceGate &&
      kickTransient &&
      (score > 0.56 || (tempoAssist && score > 0.45)) &&
      drumGate > 0.30 &&
      strongTransient;

    var hit = false;
    var strength = 0;
    if (candidate) {
      hit = true;
      var measuredGap = clamp(gap, 0.32, 1.15);
      if (s.lastHitAt > 0 && gap < 1.35) {
        s.tempoGap = s.tempoGap * 0.76 + measuredGap * 0.24;
        s.tempoConfidence = clamp01(s.tempoConfidence + (nearTempo ? 0.18 : 0.07));
      } else {
        s.tempoGap = measuredGap;
        s.tempoConfidence = Math.max(s.tempoConfidence * 0.72, 0.10);
      }
      s.lastHitAt = seconds;
      s.beatCount += 1;
      strength = clamp01(0.42 + score * 0.44 + lowAttack * 0.18 + lowDominance * 0.10);
      s.pulse = Math.max(s.pulse, strength);
    } else {
      s.tempoConfidence *= Math.pow(0.996, frame);
      s.pulse *= Math.pow(0.18, dt);
    }

    s.primedFrames += 1;
    s.score = s.score * (1 - slow) + score * slow;

    var result = this.beatFrame;
    result.hit = hit;
    result.strength = strength;
    result.confidence = clamp01(s.tempoConfidence * 0.45 + score * 0.40 + drumGate * 0.15);
    result.low = s.lowFast;
    result.body = s.bodyFast;
    result.snap = s.snapFast;
    result.mass = mass;
    result.sharpness = snapNorm;
    result.tempoAssist = tempoAssist;
    result.combo = s.beatCount;
    result.score = score;
    result.lowDominance = lowDominance;
    result.pulse = s.pulse;
    return result;
  };

  AudioReactor.prototype.tick = function () {
    var t = now();
    var dt = clamp((t - this.lastTickAt) / 1000, 1 / 120, 1 / 20);
    this.lastTickAt = t;

    var stale = t - this.lastUpdateAt > 420;
    if (stale && this.previewPulse <= 0.001) {
      this.active = false;
      var decayFrame = dt * 60;
      this.smoothBass *= Math.pow(0.91, decayFrame);
      this.smoothMid *= Math.pow(0.91, decayFrame);
      this.smoothVocal *= Math.pow(0.90, decayFrame);
      this.smoothTreb *= Math.pow(0.91, decayFrame);
      this.smoothEnergy *= Math.pow(0.90, decayFrame);
      this.beatPulse *= Math.pow(0.82, decayFrame);
      this.vocalPulse *= Math.pow(0.72, decayFrame);
      this.rhythmPulse *= Math.pow(0.78, decayFrame);
      this.previewPulse *= Math.pow(0.70, decayFrame);
      this.level = this.smoothEnergy;
      this.bass = this.smoothBass;
      this.lowMid = this.smoothMid * 0.72;
      this.mid = this.smoothMid;
      this.vocal = this.smoothVocal;
      this.high = this.smoothTreb;
      this.beat = this.beatPulse;
      this.pulse *= Math.pow(0.28, dt);
      this.rhythm = follow(this.rhythm, 0, 3.2, dt);
      return this.frameSnapshot(dt);
    }

    var bands = this.computeBands();
    if (this.previewPulse > 0.001) {
      bands.low = Math.max(bands.low, this.previewPulse * 0.95);
      bands.kick = Math.max(bands.kick, this.previewPulse * 0.88);
      bands.body = Math.max(bands.body, this.previewPulse * 0.54);
      bands.snap = Math.max(bands.snap, this.previewPulse * 0.22);
      bands.energy = Math.max(bands.energy, this.previewPulse * 0.72);
      this.previewPulse *= Math.pow(0.08, dt);
    }

    var frame = dt * 60;
    this.bassPeak = Math.max(this.bassPeak * Math.pow(0.994, frame), bands.low, 0.030);
    this.midPeak = Math.max(this.midPeak * Math.pow(0.993, frame), bands.mid, bands.body, 0.030);
    this.vocalPeak = Math.max(this.vocalPeak * Math.pow(0.993, frame), bands.vocal, 0.030);
    this.treblePeak = Math.max(this.treblePeak * Math.pow(0.992, frame), bands.high, bands.snap, 0.030);
    this.energyPeak = Math.max(this.energyPeak * Math.pow(0.995, frame), bands.energy, 0.035);

    var rb = Math.pow(clamp01(bands.low / (this.bassPeak + 0.018)), 0.78);
    var rm = Math.pow(clamp01(Math.max(bands.mid, bands.body * 0.85) / (this.midPeak + 0.020)), 0.86);
    var rv = Math.pow(clamp01(bands.vocal / (this.vocalPeak + 0.018)), 0.84);
    var rt = Math.pow(clamp01(Math.max(bands.high, bands.snap * 0.92) / (this.treblePeak + 0.020)), 0.92);
    var re = Math.pow(clamp01(bands.energy / (this.energyPeak + 0.020)), 0.82);

    var bassOnset = Math.max(0, rb - this.smoothBass);
    var vocalOnset = Math.max(0, rv - this.smoothVocal);
    var bodyOnset = Math.max(0, rm - this.smoothMid);
    var energyOnset = Math.max(0, re - this.prevEnergy);
    this.prevEnergy = this.prevEnergy * 0.88 + re * 0.12;

    var seconds = t * 0.001;
    var realtimeBeat = this.processRealtimeBeatEngine(dt, seconds, bands);
    var liveKickFrame = realtimeBeat.low > 0.48 && rb > 0.38 && bassOnset > 0.055 && energyOnset > 0.012;
    var liveStrongHit = realtimeBeat.confidence > 0.68 &&
      realtimeBeat.strength > 0.60 &&
      realtimeBeat.score > 0.50 &&
      liveKickFrame;
    var liveTempoHit = realtimeBeat.tempoAssist &&
      realtimeBeat.confidence > 0.72 &&
      realtimeBeat.strength > 0.58 &&
      realtimeBeat.low > 0.46 &&
      bassOnset > 0.044;

    if (liveStrongHit || liveTempoHit) {
      var rtPulse = clamp(realtimeBeat.strength * (realtimeBeat.tempoAssist ? 0.72 : 0.78), 0, 0.78);
      this.beatPulse = Math.max(this.beatPulse, rtPulse);
      this.pulse = Math.max(this.pulse, rtPulse);
    } else if (bassOnset > 0.13 && rb > 0.60 && energyOnset > 0.018) {
      this.beatPulse = Math.max(this.beatPulse, clamp(bassOnset * 1.45, 0, 0.52));
    }

    this.beatPulse *= Math.pow(0.36, dt);
    if (vocalOnset > 0.045 && bands.energy > 0.035) {
      this.vocalPulse = Math.max(this.vocalPulse, clamp(vocalOnset * 1.55, 0, 0.42));
    }
    this.vocalPulse *= Math.pow(0.16, dt);
    var broadOnset = clamp01(energyOnset * 2.20 + bassOnset * 1.05 + bodyOnset * 0.48);
    this.rhythmPulse = Math.max(this.rhythmPulse, this.beatPulse * 0.90, broadOnset * 0.58);
    this.rhythmPulse *= Math.exp(-dt * 3.15);
    this.smoothBass = envFrame(this.smoothBass, rb * 0.78 + re * 0.025, 0.28, 0.075);
    this.smoothMid = envFrame(this.smoothMid, rm * 0.64 + re * 0.025, 0.18, 0.060);
    this.smoothVocal = follow(this.smoothVocal, rv * 0.62 + re * 0.015, rv > this.smoothVocal ? 7.2 : 2.6, dt);
    this.smoothTreb = envFrame(this.smoothTreb, rt * 0.54, 0.18, 0.055);
    this.smoothEnergy = envFrame(this.smoothEnergy, re, 0.16, 0.055);
    this.body = envFrame(this.body, realtimeBeat.body, 0.20, 0.070);

    this.level = clamp01(Math.max(this.smoothEnergy, this.beatPulse * 0.30));
    this.bass = clamp(this.smoothBass * 1.18 + this.beatPulse * 0.30, 0, 1.05);
    this.lowMid = clamp(this.body * 0.44 + this.smoothMid * 0.46 + this.smoothBass * 0.10, 0, 0.72);
    this.mid = clamp(this.smoothMid * 1.12, 0, 0.72);
    this.vocal = clamp(this.smoothVocal * 0.86 + this.vocalPulse * 0.16, 0, 0.78);
    this.high = clamp(this.smoothTreb * 1.20, 0, 0.62);
    this.beat = clamp01(Math.max(this.beatPulse * 1.12, realtimeBeat.pulse * 0.76));
    this.pulse = Math.max(this.pulse * Math.pow(0.20, dt), this.beat);
    var rhythmBed = clamp(re * 0.18 + rb * 0.08 + rm * 0.07, 0, 0.28);
    var rhythmTarget = clamp01(rhythmBed + this.rhythmPulse * 0.82);
    this.rhythm = follow(this.rhythm, rhythmTarget, rhythmTarget > this.rhythm ? 8.4 : 3.2, dt);

    return this.frameSnapshot(dt);
  };

  AudioReactor.prototype.frameSnapshot = function (dt) {
    var frame = this.frameState;
    frame.level = this.level;
    frame.bass = this.bass;
    frame.lowMid = this.lowMid;
    frame.mid = this.mid;
    frame.vocal = this.vocal;
    frame.high = this.high;
    frame.beat = this.beat;
    frame.pulse = this.pulse;
    frame.rhythm = this.rhythm;
    frame.smoothBass = this.smoothBass;
    frame.smoothMid = this.smoothMid;
    frame.smoothTreb = this.smoothTreb;
    frame.smoothEnergy = this.smoothEnergy;
    frame.dt = dt || 0;
    return frame;
  };

  AudioReactor.prototype.snapshot = function (dt) {
    return Object.assign({}, this.frameSnapshot(dt));
  };

  AudioReactor.prototype.injectPreviewPulse = function (timeSeconds) {
    var phase = (timeSeconds % 1);
    var kick = phase < 0.08 ? 1 - phase / 0.08 : 0;
    this.previewPulse = Math.max(this.previewPulse, kick);
    for (var i = 0; i < this.sample.length; i += 1) {
      var bandShape = i < 8 ? 1 : (i < 24 ? 0.45 : 0.18);
      var noise = 0.45 + Math.sin(timeSeconds * 7.1 + i * 0.37) * 0.22;
      var v = clamp01(kick * bandShape + noise * 0.08);
      this.sample[i] = follow(this.sample[i], v, 18, 1 / 60);
    }
  };

  NS.AudioReactor = AudioReactor;
}());
