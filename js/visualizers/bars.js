// js/visualizers/bars.js — Equalizer bars with reflections, bloom, gradient

import { lerp, map, clamp, hslString } from '../utils.js';

const NUM_BARS = 64;
let smoothBars = new Float32Array(NUM_BARS);
let hueBase = 0;

export function init(canvas, ctx) {
  smoothBars = new Float32Array(NUM_BARS);
  hueBase = 0;
}

export function render(freqData, timeData, dt, w, h, ctx) {
  if (!ctx) return;

  hueBase += dt * 15;

  const barGap = 3;
  const totalGap = barGap * (NUM_BARS - 1);
  const barWidth = Math.max(2, (w * 0.85 - totalGap) / NUM_BARS);
  const startX = (w - (barWidth * NUM_BARS + totalGap)) / 2;
  const baseY = h * 0.6;
  const maxBarHeight = h * 0.45;

  for (let i = 0; i < NUM_BARS; i++) {
    // Map bar index to frequency data
    const freqIndex = Math.floor(map(i, 0, NUM_BARS, 0, freqData.length - 1));
    const value = freqData[freqIndex];
    const target = map(value, 0, 255, 2, maxBarHeight);

    // Fast rise, moderate fall — snappy reaction
    if (target > smoothBars[i]) {
      smoothBars[i] = lerp(smoothBars[i], target, 0.55);
    } else {
      smoothBars[i] = lerp(smoothBars[i], target, 0.12);
    }

    const barH = smoothBars[i];
    const x = startX + i * (barWidth + barGap);

    // Hue: bass = warm (0-30°), mids = green-cyan (90-180°), highs = blue-purple (210-300°)
    const hue = (hueBase + map(i, 0, NUM_BARS, 0, 270)) % 360;
    const saturation = 0.85;
    const lightness = map(barH, 2, maxBarHeight, 0.35, 0.65);

    // Glow pass (additive)
    const saved = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';

    const glowGrad = ctx.createLinearGradient(x, baseY, x, baseY - barH);
    glowGrad.addColorStop(0, hslString(hue, saturation, lightness, 0.0));
    glowGrad.addColorStop(0.3, hslString(hue, saturation, lightness, 0.15));
    glowGrad.addColorStop(1, hslString(hue, saturation, lightness + 0.15, 0.25));
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    roundRect(ctx, x - 3, baseY - barH - 3, barWidth + 6, barH + 6, 5);
    ctx.fill();

    ctx.globalCompositeOperation = saved;

    // Main bar with gradient
    const barGrad = ctx.createLinearGradient(x, baseY, x, baseY - barH);
    barGrad.addColorStop(0, hslString(hue, saturation, lightness * 0.6, 0.9));
    barGrad.addColorStop(0.5, hslString(hue, saturation, lightness, 0.95));
    barGrad.addColorStop(1, hslString(hue, saturation, lightness + 0.1, 1));
    ctx.fillStyle = barGrad;
    ctx.beginPath();
    roundRect(ctx, x, baseY - barH, barWidth, barH, 3);
    ctx.fill();

    // Top cap (bright dot)
    ctx.fillStyle = hslString(hue, 0.6, 0.85, 0.9);
    ctx.beginPath();
    roundRect(ctx, x, baseY - barH - 4, barWidth, 4, 2);
    ctx.fill();

    // Mirror reflection (below baseline)
    const reflGrad = ctx.createLinearGradient(x, baseY, x, baseY + barH * 0.4);
    reflGrad.addColorStop(0, hslString(hue, saturation, lightness, 0.25));
    reflGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = reflGrad;
    ctx.beginPath();
    roundRect(ctx, x, baseY + 2, barWidth, barH * 0.35, 2);
    ctx.fill();
  }

  // Baseline
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(startX - 10, baseY);
  ctx.lineTo(startX + NUM_BARS * (barWidth + barGap) + 10, baseY);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  if (r < 0) r = 0;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function destroy() {
  smoothBars = new Float32Array(NUM_BARS);
}
