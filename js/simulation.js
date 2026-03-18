// js/simulation.js — Fake audio data generator for YouTube mode

import { perlinOctaves, clamp, lerp } from './utils.js';

export class AudioSimulation {
  constructor(bins = 128) {
    this.bins = bins;
    this.frequencyData = new Uint8Array(bins);
    this.timeDomainData = new Uint8Array(bins);
    this.time = 0;
    this.playing = false;
    this.beatTimer = 0;
    this.beatInterval = 0.5;
    this.beatIntensity = 0;
    this.seed = Math.random() * 1000;
    this.targetIntensity = 0;
    this.currentIntensity = 0;
  }

  setState(state) {
    this.playing = state === 'playing';
    if (this.playing && this.currentIntensity < 0.1) {
      this.targetIntensity = 1;
    }
  }

  reset() {
    this.time = 0;
    this.beatTimer = 0;
    this.beatIntensity = 0;
    this.currentIntensity = 0;
    this.targetIntensity = 0;
  }

  update(dt) {
    if (!this.playing) {
      // Smooth decay to silence
      this.targetIntensity = 0;
      this.currentIntensity = lerp(this.currentIntensity, 0, 0.05);
      for (let i = 0; i < this.bins; i++) {
        this.frequencyData[i] = Math.max(0, Math.round(this.frequencyData[i] * 0.9));
        this.timeDomainData[i] = Math.round(lerp(this.timeDomainData[i], 128, 0.15));
      }
      return;
    }

    this.time += dt;
    this.beatTimer += dt;

    // Smooth ramp up
    this.currentIntensity = lerp(this.currentIntensity, this.targetIntensity, 0.03);
    if (this.currentIntensity > 0.95) this.targetIntensity = 1;

    // Trigger beats at semi-random intervals
    if (this.beatTimer >= this.beatInterval) {
      this.beatTimer = 0;
      this.beatIntensity = 0.6 + Math.random() * 0.4;
      this.beatInterval = 0.35 + Math.random() * 0.45;
    }
    this.beatIntensity *= 0.9;

    // Overall intensity envelope (slow build and drops)
    const envelope = (0.55 + 0.45 * Math.sin(this.time * 0.25)) * this.currentIntensity;

    for (let i = 0; i < this.bins; i++) {
      const ratio = i / this.bins;
      const noise = perlinOctaves(
        i * 0.08 + this.seed,
        this.time * (0.5 + ratio * 3),
        3,
        0.5
      );

      let value;
      if (ratio < 0.12) {
        // Bass: slow, strong, beat-reactive
        value = 120 + noise * 80 + this.beatIntensity * 150;
      } else if (ratio < 0.5) {
        // Mids: medium variation
        value = 80 + noise * 100 + this.beatIntensity * 60;
      } else {
        // Highs: fast sparkle
        value = 40 + noise * 80 + Math.random() * 30;
      }

      value *= envelope;
      this.frequencyData[i] = clamp(Math.round(value), 0, 255);
    }

    // Generate waveform
    for (let i = 0; i < this.bins; i++) {
      const wave =
        Math.sin(i * 0.15 + this.time * 8) * (40 + this.beatIntensity * 60);
      const noise = perlinOctaves(i * 0.1, this.time * 2, 2) * 20;
      this.timeDomainData[i] = clamp(
        Math.round(128 + (wave + noise) * envelope),
        0,
        255
      );
    }
  }

  getFrequencyData() {
    return this.frequencyData;
  }

  getTimeDomainData() {
    return this.timeDomainData;
  }
}
