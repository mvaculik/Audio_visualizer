// js/visualizers/bars.js — Equalizer with peak hold, bass shockwave, mirror, particles

import { lerp, map, clamp, hslString, perlin } from '../utils.js';

const NUM_BARS = 64;
let smoothBars = new Float32Array(NUM_BARS);
let peakBars = new Float32Array(NUM_BARS);  // peak hold dots
let peakFall = new Float32Array(NUM_BARS);
let hueBase = 0;
let prevBass = 0;
let flashAlpha = 0;
let barParticles = []; // sparks flying off loud bars

export function init(canvas, ctx) {
  smoothBars = new Float32Array(NUM_BARS);
  peakBars = new Float32Array(NUM_BARS);
  peakFall = new Float32Array(NUM_BARS);
  hueBase = 0;
  prevBass = 0;
  flashAlpha = 0;
  barParticles = [];
}

export function render(freqData, timeData, dt, w, h, ctx) {
  if (!ctx) return;

  hueBase += dt * 15;

  // Bass analysis
  let bassNow = 0;
  for (let i = 0; i < 10; i++) bassNow += freqData[i];
  bassNow /= 10;
  const bassDelta = bassNow - prevBass;
  const isBeat = bassDelta > 15 && bassNow > 80;
  prevBass = lerp(prevBass, bassNow, 0.3);

  if (isBeat) flashAlpha = Math.max(flashAlpha, 0.08 + bassDelta * 0.002);
  flashAlpha *= 0.88;

  // Screen flash
  if (flashAlpha > 0.005) {
    ctx.fillStyle = hslString(hueBase % 360, 0.6, 0.7, flashAlpha);
    ctx.fillRect(0, 0, w, h);
  }

  const barGap = 2;
  const totalGap = barGap * (NUM_BARS - 1);
  const barWidth = Math.max(3, (w * 0.9 - totalGap) / NUM_BARS);
  const startX = (w - (barWidth * NUM_BARS + totalGap)) / 2;
  const baseY = h * 0.55;
  const maxBarHeight = h * 0.48;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < NUM_BARS; i++) {
    // Log freq mapping
    const t = i / NUM_BARS;
    const logT = Math.pow(t, 0.7);
    const freqIndex = Math.floor(logT * (freqData.length - 1));
    const value = freqData[clamp(freqIndex, 0, freqData.length - 1)];
    const target = map(value, 0, 255, 3, maxBarHeight);

    // Snappy rise, moderate fall
    if (target > smoothBars[i]) {
      smoothBars[i] = lerp(smoothBars[i], target, 0.6);
    } else {
      smoothBars[i] = lerp(smoothBars[i], target, 0.1);
    }

    // Peak hold with gravity
    if (smoothBars[i] > peakBars[i]) {
      peakBars[i] = smoothBars[i];
      peakFall[i] = 0;
    } else {
      peakFall[i] += dt * 400;
      peakBars[i] -= peakFall[i] * dt;
      if (peakBars[i] < 0) peakBars[i] = 0;
    }

    const barH = smoothBars[i];
    const x = startX + i * (barWidth + barGap);
    const hue = (hueBase + map(i, 0, NUM_BARS, 0, 300)) % 360;
    const sat = 0.85;
    const lightness = map(barH, 3, maxBarHeight, 0.3, 0.7);
    const alpha = map(value, 0, 255, 0.3, 1);

    // Glow behind bar
    ctx.fillStyle = hslString(hue, sat, lightness, alpha * 0.1);
    ctx.fillRect(x - 4, baseY - barH - 4, barWidth + 8, barH + 8);

    // Main bar gradient
    const barGrad = ctx.createLinearGradient(x, baseY, x, baseY - barH);
    barGrad.addColorStop(0, hslString(hue, sat, lightness * 0.5, alpha * 0.8));
    barGrad.addColorStop(0.5, hslString(hue, sat, lightness, alpha));
    barGrad.addColorStop(1, hslString(hue, sat, lightness + 0.15, alpha));
    ctx.fillStyle = barGrad;
    ctx.fillRect(x, baseY - barH, barWidth, barH);

    // Bright top edge
    ctx.fillStyle = hslString(hue, 0.5, 0.9, alpha * 0.9);
    ctx.fillRect(x, baseY - barH, barWidth, 2);

    // Peak hold dot (floating above bar)
    if (peakBars[i] > 5) {
      const peakY = baseY - peakBars[i];
      ctx.fillStyle = hslString(hue, 0.6, 0.9, 0.9);
      ctx.fillRect(x, peakY - 3, barWidth, 3);
      // Peak glow
      ctx.fillStyle = hslString(hue, 0.8, 0.7, 0.2);
      ctx.fillRect(x - 2, peakY - 5, barWidth + 4, 7);
    }

    // Mirror reflection (below baseline)
    const reflH = barH * 0.4;
    const reflGrad = ctx.createLinearGradient(x, baseY + 2, x, baseY + 2 + reflH);
    reflGrad.addColorStop(0, hslString(hue, sat, lightness, 0.2));
    reflGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = reflGrad;
    ctx.fillRect(x, baseY + 2, barWidth, reflH);

    // Spark particles on very loud bars
    if (value > 200 && Math.random() > 0.6) {
      barParticles.push({
        x: x + barWidth / 2,
        y: baseY - barH,
        vx: (Math.random() - 0.5) * 3,
        vy: -2 - Math.random() * 4,
        size: 1 + Math.random() * 2,
        alpha: 1,
        hue,
      });
    }
  }

  // Render & update spark particles
  for (let i = barParticles.length - 1; i >= 0; i--) {
    const p = barParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15; // gravity
    p.alpha -= dt * 2;
    if (p.alpha <= 0) { barParticles.splice(i, 1); continue; }

    ctx.fillStyle = hslString(p.hue, 0.8, 0.8, p.alpha);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  while (barParticles.length > 200) barParticles.shift();

  ctx.restore();

  // Baseline glow
  const lineGrad = ctx.createLinearGradient(startX, 0, startX + NUM_BARS * (barWidth + barGap), 0);
  lineGrad.addColorStop(0, hslString(hueBase % 360, 0.5, 0.5, 0.1));
  lineGrad.addColorStop(0.5, hslString((hueBase + 150) % 360, 0.5, 0.5, 0.2));
  lineGrad.addColorStop(1, hslString((hueBase + 300) % 360, 0.5, 0.5, 0.1));
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(startX - 20, baseY);
  ctx.lineTo(startX + NUM_BARS * (barWidth + barGap) + 20, baseY);
  ctx.stroke();
}

export function destroy() {
  smoothBars = new Float32Array(NUM_BARS);
  peakBars = new Float32Array(NUM_BARS);
  barParticles = [];
}
