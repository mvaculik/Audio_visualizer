// js/music-intelligence.js — Real-time music analysis: BPM, drops, energy, emotion, DNA

import { clamp, map, lerp } from './utils.js';

const HISTORY_SECONDS = 10;
const HISTORY_FPS = 20;
const HISTORY_LEN = HISTORY_SECONDS * HISTORY_FPS;

export class MusicIntelligence {
  constructor() {
    // BPM detection
    this._beatTimes = [];
    this.bpm = 0;
    this.beatConfidence = 0;
    this.timeSinceBeat = 0;
    this.beatPhase = 0;

    // Energy bands
    this.bass = 0;
    this.mid = 0;
    this.high = 0;
    this.totalEnergy = 0;
    this.bassPercent = 0;
    this.midPercent = 0;
    this.highPercent = 0;

    // Beat detection internals — multi-band
    this._prevBass = 0;
    this._prevEnergy = 0;
    this._bassAvg = new Float32Array(32);
    this._energyAvg = new Float32Array(32);
    this._avgIdx = 0;
    this._lastBeatTime = 0;
    this._beatInterval = 0.5;

    // Spectral brightness
    this.brightness = 0;
    this._smoothBrightness = 0;

    // Drop predictor — based on real EDM structure analysis
    this.dropCharge = 0;
    this.isDropping = false;
    this.dropTimer = 0;
    this._dropCooldown = 0;

    // Build-up tracking
    this._centroidHistory = new Float32Array(60); // ~3s at 20fps
    this._bassHistory60 = new Float32Array(60);
    this._energyHistory60 = new Float32Array(60);
    this._histIdx60 = 0;
    this._buildupScore = 0;    // how much we're in a build-up
    this._bassVacuum = false;  // bass has dropped out
    this._preSilence = false;  // brief silence before drop
    this._prevTotalEnergy = 0;

    // Emotion
    this.emotion = 'ANALYZING';
    this._emotionTimer = 0;

    // Music DNA
    this.dna = new Float32Array(HISTORY_LEN * 16);
    this._dnaWritePos = 0;

    // Energy history
    this.energyHistory = new Float32Array(HISTORY_LEN);
    this.bassHistory = new Float32Array(HISTORY_LEN);
    this.brightHistory = new Float32Array(HISTORY_LEN);
    this._historyTimer = 0;
    this._historyWritePos = 0;

    // Onset detection
    this._prevSpectrum = null;
    this.spectralFlux = 0;
    this.onsetDetected = false;

    this._time = 0;
  }

  update(freqData, timeData, dt) {
    this._time += dt;

    if (!freqData || freqData.length === 0) return;

    const len = freqData.length;
    const bassEnd = Math.floor(len * 0.08);
    const midEnd = Math.floor(len * 0.4);

    // ===== BAND ENERGIES =====
    let bSum = 0, mSum = 0, hSum = 0;
    for (let i = 0; i < len; i++) {
      if (i < bassEnd) bSum += freqData[i];
      else if (i < midEnd) mSum += freqData[i];
      else hSum += freqData[i];
    }

    this.bass = lerp(this.bass, bSum / bassEnd, 0.5);
    this.mid = lerp(this.mid, mSum / (midEnd - bassEnd), 0.4);
    this.high = lerp(this.high, hSum / (len - midEnd), 0.45);

    this.totalEnergy = (this.bass + this.mid + this.high) / 3;
    const eTotal = this.bass + this.mid + this.high;
    if (eTotal > 1) {
      this.bassPercent = this.bass / eTotal;
      this.midPercent = this.mid / eTotal;
      this.highPercent = this.high / eTotal;
    }

    // ===== SPECTRAL BRIGHTNESS =====
    let weightedSum = 0, totalMag = 0;
    for (let i = 0; i < len; i++) {
      weightedSum += i * freqData[i];
      totalMag += freqData[i];
    }
    const centroid = totalMag > 0 ? weightedSum / totalMag / len : 0;
    this._smoothBrightness = lerp(this._smoothBrightness, centroid, 0.1);
    this.brightness = clamp(this._smoothBrightness * 2.5, 0, 1);

    // ===== SPECTRAL FLUX =====
    if (this._prevSpectrum) {
      let flux = 0;
      for (let i = 0; i < len; i++) {
        const diff = freqData[i] - this._prevSpectrum[i];
        if (diff > 0) flux += diff;
      }
      this.spectralFlux = flux / len;
      this.onsetDetected = this.spectralFlux > 10;
    }
    if (!this._prevSpectrum) this._prevSpectrum = new Uint8Array(len);
    this._prevSpectrum.set(freqData);

    // ===== BEAT DETECTION — multi-signal, adaptive threshold =====
    const idx = this._avgIdx % 32;
    this._bassAvg[idx] = this.bass;
    this._energyAvg[idx] = this.totalEnergy;
    this._avgIdx++;

    // Compute rolling averages
    let avgBass = 0, avgEnergy = 0;
    const filled = Math.min(this._avgIdx, 32);
    for (let i = 0; i < filled; i++) {
      avgBass += this._bassAvg[i];
      avgEnergy += this._energyAvg[i];
    }
    avgBass /= filled;
    avgEnergy /= filled;

    // Adaptive threshold: lower when music is quieter
    const bassThreshMult = avgBass > 80 ? 1.1 : 1.05;
    const energyThreshMult = 1.08;

    const bassDelta = this.bass - this._prevBass;
    const energyDelta = this.totalEnergy - this._prevEnergy;
    const now = this._time;
    const timeSinceLastBeat = now - this._lastBeatTime;

    // Beat: bass spike OR energy spike OR spectral flux spike
    const bassBeat = this.bass > avgBass * bassThreshMult && bassDelta > 3;
    const energyBeat = this.totalEnergy > avgEnergy * energyThreshMult && energyDelta > 5;
    const fluxBeat = this.spectralFlux > 8;

    const isBeat = (bassBeat || energyBeat || fluxBeat) && timeSinceLastBeat > 0.15;

    this.timeSinceBeat += dt;

    if (isBeat) {
      this.timeSinceBeat = 0;
      this._beatTimes.push(now);
      while (this._beatTimes.length > 30) this._beatTimes.shift();

      // Calculate BPM — needs only 3 beats
      if (this._beatTimes.length >= 3) {
        const intervals = [];
        for (let i = 1; i < this._beatTimes.length; i++) {
          const interval = this._beatTimes[i] - this._beatTimes[i - 1];
          if (interval > 0.15 && interval < 2.5) intervals.push(interval);
        }
        if (intervals.length >= 2) {
          intervals.sort((a, b) => a - b);
          // Use median for robustness
          const median = intervals[Math.floor(intervals.length / 2)];
          let targetBpm = 60 / median;

          // Snap to reasonable BPM range
          while (targetBpm < 55) targetBpm *= 2;
          while (targetBpm > 210) targetBpm /= 2;

          // Faster BPM convergence
          const bpmLerp = this.bpm === 0 ? 0.5 : 0.2;
          this.bpm = lerp(this.bpm, Math.round(targetBpm), bpmLerp);
          this._beatInterval = median;
          this.beatConfidence = clamp(intervals.length / 8, 0, 1);
        }
      }

      this._lastBeatTime = now;
    }

    this._prevBass = this.bass;
    this._prevEnergy = this.totalEnergy;

    // Beat phase
    if (this._beatInterval > 0) {
      this.beatPhase = clamp(this.timeSinceBeat / this._beatInterval, 0, 1);
    }

    // ===== DROP PREDICTOR — based on real EDM structure =====
    // A drop in EDM follows this pattern:
    // 1. BUILD-UP: brightness/centroid rises, energy rises, snare rolls
    // 2. BASS VACUUM: bass drops out while highs stay high
    // 3. PRE-DROP SILENCE: brief energy dip (0.1-0.5s)
    // 4. THE DROP: massive bass spike, centroid drops, energy explodes

    this._dropCooldown = Math.max(0, this._dropCooldown - dt);
    this.dropTimer = Math.max(0, this.dropTimer - dt);

    // Sample history at ~20fps
    this._histIdx60++;
    const hi = this._histIdx60 % 60;
    this._centroidHistory[hi] = this.brightness;
    this._bassHistory60[hi] = this.bass;
    this._energyHistory60[hi] = this.totalEnergy;

    // Compute trends over last ~2 seconds (40 samples)
    const lookback = 40;
    let centroidTrend = 0;  // positive = getting brighter
    let bassTrend = 0;      // negative = bass dropping out
    let energyTrend = 0;    // positive = getting louder
    let recentBassAvg = 0;
    let oldBassAvg = 0;

    for (let k = 0; k < lookback; k++) {
      const idx = ((this._histIdx60 - k) % 60 + 60) % 60;
      const oldIdx = ((this._histIdx60 - lookback + k) % 60 + 60) % 60;

      if (k < lookback / 2) {
        recentBassAvg += this._bassHistory60[idx];
      } else {
        oldBassAvg += this._bassHistory60[idx];
      }
    }
    recentBassAvg /= (lookback / 2);
    oldBassAvg /= (lookback / 2);

    // Centroid trend: compare recent vs old brightness
    let recentBright = 0, oldBright = 0;
    for (let k = 0; k < 15; k++) {
      const rIdx = ((this._histIdx60 - k) % 60 + 60) % 60;
      const oIdx = ((this._histIdx60 - 30 - k) % 60 + 60) % 60;
      recentBright += this._centroidHistory[rIdx];
      oldBright += this._centroidHistory[oIdx];
    }
    recentBright /= 15;
    oldBright /= 15;
    centroidTrend = recentBright - oldBright; // positive = brighter

    // Bass vacuum: bass is significantly lower than it was
    const bassDropRatio = oldBassAvg > 10 ? recentBassAvg / oldBassAvg : 1;
    this._bassVacuum = bassDropRatio < 0.5 && this.brightness > 0.3;

    // Pre-silence: sudden energy dip
    this._preSilence = this.totalEnergy < this._prevTotalEnergy * 0.6 && this._prevTotalEnergy > 40;

    // BUILD-UP SCORE: combines all signals
    let buildup = 0;

    // Signal 1: Brightness rising (risers, hi-hats, snare rolls)
    if (centroidTrend > 0.02) buildup += centroidTrend * 8;

    // Signal 2: Bass vacuum (bass drops out during build-up)
    if (this._bassVacuum) buildup += 0.3;

    // Signal 3: Overall energy still present (not just silence)
    if (this.totalEnergy > 40 && this.highPercent > 0.3) buildup += 0.15;

    // Signal 4: High spectral flux (lots of change = build-up texture)
    if (this.spectralFlux > 6) buildup += this.spectralFlux * 0.02;

    this._buildupScore = lerp(this._buildupScore, buildup, 0.08);

    // Charge = buildup score, but only if we're not in cooldown
    if (this._dropCooldown <= 0) {
      this.dropCharge = clamp(this._buildupScore, 0, 1);
    }

    // Decay charge when buildup signals fade
    if (buildup < 0.1) {
      this.dropCharge *= 0.96;
    }

    // === DROP TRIGGER ===
    // The drop happens when: bass suddenly SPIKES after a bass vacuum/buildup
    const bassSpike = bassDelta > 12 && this.bass > avgBass * 1.2;
    const bigBassReturn = this._bassVacuum && bassDelta > 8 && this.bass > 60;
    const postSilenceBoom = this._preSilence && this.totalEnergy > 60;

    const dropTriggered =
      this._dropCooldown <= 0 &&
      this.dropCharge > 0.08 &&
      (bassSpike || bigBassReturn || postSilenceBoom);

    if (dropTriggered) {
      this.isDropping = true;
      this.dropTimer = 1.8;
      this.dropCharge = 0;
      this._buildupScore = 0;
      this._dropCooldown = 3;
    } else {
      this.isDropping = this.dropTimer > 0;
    }

    this._prevTotalEnergy = this.totalEnergy;

    // ===== EMOTION =====
    this._emotionTimer += dt;
    if (this._emotionTimer > 0.4) {
      this._emotionTimer = 0;
      if (this.totalEnergy < 20) {
        this.emotion = 'SILENT';
      } else if (this.isDropping) {
        this.emotion = 'HARD DROP';
      } else if (this.dropCharge > 0.5) {
        this.emotion = 'BUILD UP';
      } else if (this.bassPercent > 0.5 && this.totalEnergy > 100) {
        this.emotion = 'AGGRESSIVE';
      } else if (this.highPercent > 0.4 && this.brightness > 0.5) {
        this.emotion = 'EUPHORIC';
      } else if (this.midPercent > 0.4) {
        this.emotion = 'MELODIC';
      } else if (this.totalEnergy > 80) {
        this.emotion = 'ENERGETIC';
      } else if (this.totalEnergy > 40) {
        this.emotion = 'FLOWING';
      } else {
        this.emotion = 'AMBIENT';
      }
    }

    // ===== HISTORY =====
    this._historyTimer += dt;
    if (this._historyTimer >= 1 / HISTORY_FPS) {
      this._historyTimer = 0;
      const wp = this._historyWritePos % HISTORY_LEN;

      this.energyHistory[wp] = this.totalEnergy;
      this.bassHistory[wp] = this.bass;
      this.brightHistory[wp] = this.brightness;

      const bandsPerSlice = Math.floor(len / 16);
      for (let b = 0; b < 16; b++) {
        let sum = 0;
        for (let i = b * bandsPerSlice; i < (b + 1) * bandsPerSlice && i < len; i++) {
          sum += freqData[i];
        }
        this.dna[wp * 16 + b] = sum / bandsPerSlice;
      }

      this._historyWritePos++;
    }
  }

  getHistory(arr) {
    const wp = this._historyWritePos % HISTORY_LEN;
    const result = new Float32Array(HISTORY_LEN);
    for (let i = 0; i < HISTORY_LEN; i++) {
      result[i] = arr[(wp + i) % HISTORY_LEN];
    }
    return result;
  }

  getDnaSlice(index) {
    const wp = this._historyWritePos % HISTORY_LEN;
    const actualIdx = (wp + index) % HISTORY_LEN;
    const slice = new Float32Array(16);
    for (let b = 0; b < 16; b++) {
      slice[b] = this.dna[actualIdx * 16 + b];
    }
    return slice;
  }

  // ===== SPEECH RECOGNITION =====
  startSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { console.warn('SpeechRecognition not supported'); return; }

    this.recognizedWords = [];
    this._recognition = new SR();
    this._recognition.continuous = true;
    this._recognition.interimResults = true;
    this._recognition.lang = 'en-US';
    this._recognition.maxAlternatives = 1;

    this._recognition.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript.trim();
        if (transcript.length > 0) {
          // Split into individual words, push each
          const words = transcript.split(/\s+/);
          for (const word of words) {
            if (word.length > 1) {
              this.recognizedWords.push({
                text: word.toUpperCase(),
                time: this._time,
                final: e.results[i].isFinal,
              });
            }
          }
          // Keep last 30 words
          while (this.recognizedWords.length > 30) this.recognizedWords.shift();
        }
      }
    };

    this._recognition.onerror = () => { /* silent */ };
    this._recognition.onend = () => {
      // Auto-restart
      try { this._recognition.start(); } catch (e) { /* already running */ }
    };

    try { this._recognition.start(); } catch (e) { /* */ }
  }

  getRecentWords(maxAge = 4) {
    if (!this.recognizedWords) return [];
    const cutoff = this._time - maxAge;
    return this.recognizedWords.filter(w => w.time > cutoff);
  }
}
