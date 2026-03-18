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

    // Drop predictor
    this.dropCharge = 0;
    this.isDropping = false;
    this.dropTimer = 0; // how long the DROP text stays visible
    this._energyRiseCounter = 0;
    this._prevTotalEnergy = 0;
    this._dropCooldown = 0;
    this._recentEnergySlope = 0;

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

    // ===== DROP PREDICTOR — much more sensitive =====
    this._dropCooldown = Math.max(0, this._dropCooldown - dt);
    this.dropTimer = Math.max(0, this.dropTimer - dt);

    // Track energy slope over last ~1 second
    const energySlope = this.totalEnergy - this._prevTotalEnergy;
    this._recentEnergySlope = lerp(this._recentEnergySlope, energySlope, 0.1);
    this._prevTotalEnergy = lerp(this._prevTotalEnergy, this.totalEnergy, 0.03);

    // Build-up detection: energy rising OR brightness rising OR flux increasing
    const isRising = this._recentEnergySlope > 0.1 || (this.brightness > 0.3 && energySlope > 0);
    const isHighEnergy = this.totalEnergy > avgEnergy * 0.6;

    if (isRising && isHighEnergy) {
      this._energyRiseCounter += dt * 1.5;
    } else {
      this._energyRiseCounter *= 0.92;
    }

    // Charge builds during build-up
    if (this._energyRiseCounter > 0.3 && this._dropCooldown <= 0) {
      this.dropCharge = clamp(this._energyRiseCounter / 2, 0, 1);
    }

    // Detect the drop: bass spike after charge
    const dropTriggered =
      this.dropCharge > 0.15 &&
      ((bassDelta > 15 && this.bass > 100) ||
       (this.spectralFlux > 12 && bassDelta > 8) ||
       (bassDelta > 25));

    if (dropTriggered && this._dropCooldown <= 0) {
      this.isDropping = true;
      this.dropTimer = 1.5; // show DROP for 1.5s
      this.dropCharge = 0;
      this._energyRiseCounter = 0;
      this._dropCooldown = 2.5; // shorter cooldown
    } else {
      this.isDropping = this.dropTimer > 0;
    }

    // Decay charge
    if (energySlope < -0.5) {
      this.dropCharge *= 0.93;
    }

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
}
