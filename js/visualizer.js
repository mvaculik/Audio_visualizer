// js/visualizer.js — Canvas orchestrator, mode switching, background effects

import { lerp, map, hslString, perlinOctaves, clamp } from './utils.js';
import { MusicIntelligence } from './music-intelligence.js';
import { renderHud } from './hud.js';
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

    // Music intelligence + HUD
    this.mi = new MusicIntelligence();
    this.hudVisible = false;

    this._initDust();
    this._initFalling();
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

  _initFalling() {
    const isMobile = window.innerWidth < 768;
    // Falling energy streaks
    this.streaks = [];
    const streakCount = isMobile ? 15 : 40;
    for (let i = 0; i < streakCount; i++) {
      this.streaks.push({
        x: Math.random(),
        y: Math.random(),
        speed: 0.15 + Math.random() * 0.4,
        length: 20 + Math.random() * 80,
        alpha: 0.02 + Math.random() * 0.06,
        width: 0.5 + Math.random() * 1.5,
        hueOff: Math.random() * 60,
        drift: (Math.random() - 0.5) * 0.02,
      });
    }
    // Falling geometric fragments
    this.fragments = [];
    const fragCount = isMobile ? 8 : 20;
    for (let i = 0; i < fragCount; i++) {
      this.fragments.push({
        x: Math.random(),
        y: Math.random(),
        speed: 0.03 + Math.random() * 0.08,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 2,
        size: 3 + Math.random() * 10,
        sides: [3, 4, 5, 6][Math.floor(Math.random() * 4)],
        alpha: 0.02 + Math.random() * 0.05,
        hueOff: Math.random() * 120,
        drift: (Math.random() - 0.5) * 0.01,
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

    // ===== Falling energy streaks (behind visualizer) =====
    const bgHue1 = this.bgHue % 360;
    for (const s of this.streaks) {
      s.y += s.speed * dt;
      s.x += s.drift * dt + Math.sin(now * 0.001 + s.x * 5) * 0.0002;
      if (s.y > 1.1) { s.y = -0.05; s.x = Math.random(); }
      if (s.x < 0) s.x = 1;
      if (s.x > 1) s.x = 0;

      const sx = s.x * w;
      const sy = s.y * h;
      const sLen = s.length + bassNow * 0.15 + (isBeat ? 20 : 0);
      const sAlpha = s.alpha + bassNow * 0.0002;
      const sHue = (bgHue1 + s.hueOff) % 360;

      const grad = ctx.createLinearGradient(sx, sy - sLen, sx, sy);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.3, hslString(sHue, 0.5, 0.5, sAlpha * 0.3));
      grad.addColorStop(1, hslString(sHue, 0.6, 0.7, sAlpha));
      ctx.strokeStyle = grad;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      ctx.moveTo(sx, sy - sLen);
      ctx.lineTo(sx, sy);
      ctx.stroke();

      // Bright head
      ctx.fillStyle = hslString(sHue, 0.4, 0.8, sAlpha * 1.5);
      ctx.beginPath();
      ctx.arc(sx, sy, s.width, 0, Math.PI * 2);
      ctx.fill();
    }

    // ===== Falling geometric fragments =====
    for (const f of this.fragments) {
      f.y += f.speed * dt;
      f.x += f.drift * dt;
      f.rotation += f.rotSpeed * dt * (1 + bassNow * 0.003);
      if (f.y > 1.1) { f.y = -0.05; f.x = Math.random(); }
      if (f.x < -0.05) f.x = 1.05;
      if (f.x > 1.05) f.x = -0.05;

      const fx = f.x * w;
      const fy = f.y * h;
      const fAlpha = f.alpha + bassNow * 0.0001 + (isBeat ? 0.03 : 0);
      const fHue = (bgHue1 + f.hueOff) % 360;
      const fSize = f.size + bassNow * 0.01;

      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(f.rotation);

      ctx.strokeStyle = hslString(fHue, 0.5, 0.5, fAlpha);
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let s = 0; s <= f.sides; s++) {
        const a = (Math.PI * 2 * s) / f.sides;
        const px = Math.cos(a) * fSize;
        const py = Math.sin(a) * fSize;
        if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      ctx.restore();
    }

    // ===== Update music intelligence =====
    this.mi.update(freqData, timeData, dt);

    // ===== Render active visualizer =====
    MODES[this.currentMode].module.render(freqData, timeData, dt, w, h, ctx);

    // ===== HUD overlay (on top of everything) =====
    renderHud(ctx, w, h, this.mi, dt, this.hudVisible);
  }

  toggleHud() {
    this.hudVisible = !this.hudVisible;
    return this.hudVisible;
  }
}
