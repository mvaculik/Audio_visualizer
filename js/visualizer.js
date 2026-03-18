// js/visualizer.js — Canvas orchestrator, mode switching, background effects

import { lerp, map, hslString, perlinOctaves, clamp } from './utils.js';
import * as radial from './visualizers/radial.js';
import * as bars from './visualizers/bars.js';
import * as waveform from './visualizers/waveform.js';
import * as particles from './visualizers/particles.js';
import * as spectrum from './visualizers/spectrum.js';

const MODES = [
  { name: 'Radial', module: radial, icon: '◎' },
  { name: 'Bars', module: bars, icon: '▮' },
  { name: 'Waveform', module: waveform, icon: '∿' },
  { name: 'Particles', module: particles, icon: '✦' },
  { name: 'Spectrum', module: spectrum, icon: '▤' },
];

const DUST_COUNT = 50;
const MOBILE_DUST = 20;

export class Visualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.currentMode = 0;
    this.bgHue = 0;
    this.dust = [];
    this.running = false;
    this.lastTime = 0;
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Global beat detection for background reactivity
    this._prevBass = 0;
    this._bassAvgBuf = new Float32Array(10);
    this._bassIdx = 0;
    this._bgFlash = 0;
    this._bgPulse = 0;

    this._initDust();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _initDust() {
    const count = window.innerWidth < 768 ? MOBILE_DUST : DUST_COUNT;
    this.dust = [];
    for (let i = 0; i < count; i++) {
      this.dust.push({
        x: Math.random(),
        y: Math.random(),
        size: 0.5 + Math.random() * 1.5,
        speed: 0.002 + Math.random() * 0.005,
        alpha: 0.1 + Math.random() * 0.2,
        drift: (Math.random() - 0.5) * 0.001,
      });
    }
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = w * this._dpr;
    this.canvas.height = h * this._dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    this.w = w;
    this.h = h;
  }

  get modeCount() { return MODES.length; }
  getModeName(index) { return MODES[index]?.name || ''; }
  getModeIcon(index) { return MODES[index]?.icon || ''; }

  setMode(index) {
    if (index < 0 || index >= MODES.length) return;
    MODES[this.currentMode].module.destroy();
    this.currentMode = index;
    MODES[this.currentMode].module.init(this.canvas, this.ctx);
  }

  start() {
    if (this.running) return;
    this.running = true;
    MODES[this.currentMode].module.init(this.canvas, this.ctx);
    this.lastTime = performance.now();
  }

  stop() { this.running = false; }

  render(freqData, timeData) {
    if (!this.running) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    const { ctx, w, h } = this;

    // ===== Analyze bass globally for background effects =====
    let bassNow = 0;
    const bassEnd = Math.floor(freqData.length * 0.12);
    for (let i = 0; i < bassEnd; i++) bassNow += freqData[i];
    bassNow /= bassEnd;

    this._bassAvgBuf[this._bassIdx % 10] = bassNow;
    this._bassIdx++;
    let bassAvg = 0;
    for (let i = 0; i < 10; i++) bassAvg += this._bassAvgBuf[i];
    bassAvg /= 10;

    const bassDelta = bassNow - this._prevBass;
    const isBeat = bassNow > bassAvg * 1.2 && bassDelta > 20;
    this._prevBass = lerp(this._prevBass, bassNow, 0.3);

    if (isBeat) {
      this._bgFlash = clamp(0.06 + bassDelta * 0.001, 0.04, 0.15);
      this._bgPulse = 1;
    }
    this._bgFlash *= 0.88;
    this._bgPulse *= 0.93;

    // ===== Clear =====
    ctx.clearRect(0, 0, w, h);

    // ===== Background gradient — reacts to bass =====
    this.bgHue += dt * 3 + bassNow * dt * 0.08;
    const bgHue1 = this.bgHue % 360;
    const bgHue2 = (this.bgHue + 40) % 360;
    const bgLight = 0.04 + this._bgPulse * 0.04;

    const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    bgGrad.addColorStop(0, hslString(bgHue1, 0.35, bgLight + 0.03, 1));
    bgGrad.addColorStop(0.5, hslString(bgHue2, 0.25, bgLight, 1));
    bgGrad.addColorStop(1, 'rgb(8,8,12)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Background flash on beat
    if (this._bgFlash > 0.005) {
      ctx.fillStyle = hslString(bgHue1, 0.5, 0.7, this._bgFlash);
      ctx.fillRect(0, 0, w, h);
    }

    // ===== Background dust — reacts to music =====
    for (const d of this.dust) {
      d.y -= d.speed + bassNow * 0.00003;
      d.x += d.drift + Math.sin(now * 0.0005 + d.x * 10) * 0.0003;
      if (d.y < -0.01) { d.y = 1.01; d.x = Math.random(); }
      if (d.x < 0) d.x = 1;
      if (d.x > 1) d.x = 0;

      const dustAlpha = d.alpha + map(bassNow, 0, 200, 0, 0.15);
      const dustSize = d.size + (isBeat ? 1 : 0);
      ctx.fillStyle = `rgba(255,255,255,${dustAlpha})`;
      ctx.beginPath();
      ctx.arc(d.x * w, d.y * h, dustSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // ===== Render active visualizer =====
    MODES[this.currentMode].module.render(freqData, timeData, dt, w, h, ctx);
  }
}
