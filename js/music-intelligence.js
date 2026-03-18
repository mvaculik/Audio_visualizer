// js/music-intelligence.js — Real-time music analysis: BPM, drops, energy, emotion, DNA

import { clamp, map, lerp } from './utils.js';

const HISTORY_SECONDS = 10;
const HISTORY_FPS = 20; // samples per second for history
const HISTORY_LEN = HISTORY_SECONDS * HISTORY_FPS;

export class MusicIntelligence {
  constructor() {
    // BPM detection
    this._beatTimes = [];       // timestamps of detected beats
    this.bpm = 0;
    this.beatConfidence = 0;
    this.timeSinceBeat = 0;
    this.beatPhase = 0;         // 0-1 cycle between beats

    // Energy bands
    this.bass = 0;
    this.mid = 0;
    this.high = 0;
    this.totalEnergy = 0;
    this.bassPercent = 0;
    this.midPercent = 0;
    this.highPercent = 0;

    // Beat detection internals
    this._prevBass = 0;
    this._bassAvg = new Float32Array(16);
    this._bassIdx = 0;
    this._lastBeatTime = 0;
    this._beatInterval = 0.5;

    // Spectral brightness (centroid)
    this.brightness = 0;        // 0=dark, 1=bright
    this._smoothBrightness = 0;

    // Drop predictor
    this.dropCharge = 0;        // 0-1, builds up before a drop
    this.isDropping = false;
    this._energyRiseCounter = 0;
    this._prevTotalEnergy = 0;
    this._dropCooldown = 0;

    // Emotion
    this.emotion = 'ANALYZING';
    this._emotionTimer = 0;

    // Music DNA (scrolling fingerprint)
    this.dna = new Float32Array(HISTORY_LEN * 16); // 16 freq bands × HISTORY_LEN
    this._dnaWritePos = 0;

    // Energy history (seismograph)
    this.energyHistory = new Float32Array(HISTORY_LEN);
    this.bassHistory = new Float32Array(HISTORY_LEN);
    this.brightHistory = new Float32Array(HISTORY_LEN);
    this._historyTimer = 0;
    this._historyWritePos = 0;

    // Onset detection (note attacks)
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

    // ===== SPECTRAL BRIGHTNESS (centroid) =====
    let weightedSum = 0, totalMag = 0;
    for (let i = 0; i < len; i++) {
      weightedSum += i * freqData[i];
      totalMag += freqData[i];
    }
    const centroid = totalMag > 0 ? weightedSum / totalMag / len : 0;
    this._smoothBrightness = lerp(this._smoothBrightness, centroid, 0.1);
    this.brightness = clamp(this._smoothBrightness * 2.5, 0, 1);

    // ===== SPECTRAL FLUX (onset detection) =====
    if (this._prevSpectrum) {
      let flux = 0;
      for (let i = 0; i < len; i++) {
        const diff = freqData[i] - this._prevSpectrum[i];
        if (diff > 0) flux += diff;
      }
      this.spectralFlux = flux / len;
      this.onsetDetected = this.spectralFlux > 15;
    }
    if (!this._prevSpectrum) this._prevSpectrum = new Uint8Array(len);
    this._prevSpectrum.set(freqData);

    // ===== BEAT DETECTION =====
    this._bassAvg[this._bassIdx % 16] = this.bass;
    this._bassIdx++;
    let avgBass = 0;
    for (let i = 0; i < 16; i++) avgBass += this._bassAvg[i];
    avgBass /= 16;

    const bassDelta = this.bass - this._prevBass;
    const now = this._time;
    const isBeat = this.bass > avgBass * 1.15 && bassDelta > 10 && (now - this._lastBeatTime) > 0.2;

    this.timeSinceBeat += dt;

    if (isBeat) {
      this.timeSinceBeat = 0;

      // Record beat time
      this._beatTimes.push(now);
      // Keep last 20 beats
      while (this._beatTimes.length > 20) this._beatTimes.shift();

      // Calculate BPM from beat intervals
      if (this._beatTimes.length >= 4) {
        const intervals = [];
        for (let i = 1; i < this._beatTimes.length; i++) {
          const interval = this._beatTimes[i] - this._beatTimes[i - 1];
          if (interval > 0.25 && interval < 2) intervals.push(interval);
        }
        if (intervals.length >= 3) {
          // Cluster intervals to find dominant tempo
          intervals.sort((a, b) => a - b);
          // Use median
          const median = intervals[Math.floor(intervals.length / 2)];
          const targetBpm = 60 / median;

          // Snap to reasonable BPM (60-200)
          let bpm = targetBpm;
          if (bpm < 60) bpm *= 2;
          if (bpm > 200) bpm /= 2;

          this.bpm = lerp(this.bpm, Math.round(bpm), 0.15);
          this._beatInterval = median;
          this.beatConfidence = clamp(intervals.length / 10, 0, 1);
        }
      }

      this._lastBeatTime = now;
    }
    this._prevBass = this.bass;

    // Beat phase (0-1 cycle)
    if (this._beatInterval > 0) {
      this.beatPhase = clamp(this.timeSinceBeat / this._beatInterval, 0, 1);
    }

    // ===== DROP PREDICTOR =====
    this._dropCooldown = Math.max(0, this._dropCooldown - dt);

    const energyDelta = this.totalEnergy - this._prevTotalEnergy;
    this._prevTotalEnergy = lerp(this._prevTotalEnergy, this.totalEnergy, 0.05);

    // Detect energy rising (build-up)
    if (energyDelta > 0.5 && this.brightness > 0.4) {
      this._energyRiseCounter += dt;
    } else {
      this._energyRiseCounter *= 0.95;
    }

    // Charge builds during build-up
    if (this._energyRiseCounter > 0.5 && this._dropCooldown <= 0) {
      this.dropCharge = clamp(this._energyRiseCounter / 3, 0, 1);
    }

    // Detect the actual drop (sudden bass spike after build-up)
    if (this.dropCharge > 0.3 && bassDelta > 25 && this.bass > 150) {
      this.isDropping = true;
      this.dropCharge = 0;
      this._energyRiseCounter = 0;
      this._dropCooldown = 4; // cooldown
    } else {
      this.isDropping = false;
    }

    // Decay charge if energy stops rising
    if (energyDelta < 0) {
      this.dropCharge *= 0.97;
    }

    // ===== EMOTION =====
    this._emotionTimer += dt;
    if (this._emotionTimer > 0.5) {
      this._emotionTimer = 0;
      if (this.totalEnergy < 30) {
        this.emotion = 'SILENT';
      } else if (this.bassPercent > 0.5 && this.totalEnergy > 120) {
        this.emotion = 'AGGRESSIVE';
      } else if (this.highPercent > 0.4 && this.brightness > 0.5) {
        this.emotion = 'EUPHORIC';
      } else if (this.midPercent > 0.4) {
        this.emotion = 'MELODIC';
      } else if (this.bass > 150 && this.bpm > 140) {
        this.emotion = 'HARD DROP';
      } else if (this.totalEnergy > 100) {
        this.emotion = 'ENERGETIC';
      } else if (this.totalEnergy > 50) {
        this.emotion = 'FLOWING';
      } else {
        this.emotion = 'AMBIENT';
      }
    }

    // ===== HISTORY (20fps sampling) =====
    this._historyTimer += dt;
    if (this._historyTimer >= 1 / HISTORY_FPS) {
      this._historyTimer = 0;
      const wp = this._historyWritePos % HISTORY_LEN;

      this.energyHistory[wp] = this.totalEnergy;
      this.bassHistory[wp] = this.bass;
      this.brightHistory[wp] = this.brightness;

      // DNA: 16 frequency bands snapshot
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

  // Get history arrays properly ordered (oldest first)
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
}
