// js/visualizers/spectrum.js — Waterfall spectrogram with live EQ overlay + beat markers

import { map, clamp, hslString, lerp } from '../utils.js';

let historyCanvas = null;
let historyCtx = null;
let prevW = 0, prevH = 0;
let prevBass = 0;
let flashAlpha = 0;
let beatMarkers = []; // vertical lines at beat moments

const HEATMAP = [
  [0, 0, 0],
  [15, 0, 50],
  [50, 0, 110],
  [100, 0, 160],
  [160, 0, 140],
  [210, 30, 40],
  [255, 80, 0],
  [255, 150, 0],
  [255, 210, 30],
  [255, 245, 120],
  [255, 255, 220],
  [255, 255, 255],
];

function getHeatColor(value) {
  const v = clamp(value, 0, 255);
  const idx = (v / 255) * (HEATMAP.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, HEATMAP.length - 1);
  const t = idx - lo;
  return [
    Math.round(HEATMAP[lo][0] + (HEATMAP[hi][0] - HEATMAP[lo][0]) * t),
    Math.round(HEATMAP[lo][1] + (HEATMAP[hi][1] - HEATMAP[lo][1]) * t),
    Math.round(HEATMAP[lo][2] + (HEATMAP[hi][2] - HEATMAP[lo][2]) * t),
  ];
}

export function init(canvas, ctx) {
  historyCanvas = document.createElement('canvas');
  historyCtx = historyCanvas.getContext('2d');
  prevW = 0;
  prevH = 0;
  prevBass = 0;
  flashAlpha = 0;
  beatMarkers = [];
}

function ensureSize(w, h) {
  if (prevW !== w || prevH !== h) {
    historyCanvas.width = w;
    historyCanvas.height = h;
    historyCtx.fillStyle = '#000';
    historyCtx.fillRect(0, 0, w, h);
    prevW = w;
    prevH = h;
  }
}

export function render(freqData, timeData, dt, w, h, ctx) {
  if (!ctx || !historyCtx) return;
  ensureSize(w, h);

  // Bass beat detection for markers
  let bassNow = 0;
  for (let i = 0; i < 10; i++) bassNow += freqData[i];
  bassNow /= 10;
  const bassDelta = bassNow - prevBass;
  const isBeat = bassDelta > 15 && bassNow > 80;
  prevBass = lerp(prevBass, bassNow, 0.3);

  if (isBeat) {
    flashAlpha = Math.max(flashAlpha, 0.02);
    beatMarkers.push({ alpha: 1 });
  }
  flashAlpha *= 0.92;

  // Flash
  if (flashAlpha > 0.005) {
    ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
    ctx.fillRect(0, 0, w, h);
  }

  // Scroll history down
  const lineHeight = 2;
  historyCtx.drawImage(historyCanvas, 0, 0, w, h, 0, lineHeight, w, h);

  // Draw frequency line at top with log mapping
  const numBins = 256;
  const binW = w / numBins;

  for (let i = 0; i < numBins; i++) {
    const t = i / numBins;
    const logT = Math.pow(t, 0.6);
    const freqIdx = Math.floor(logT * (freqData.length - 1));
    const val = freqData[clamp(freqIdx, 0, freqData.length - 1)];
    const [r, g, b] = getHeatColor(val);
    historyCtx.fillStyle = `rgb(${r},${g},${b})`;
    historyCtx.fillRect(Math.floor(i * binW), 0, Math.ceil(binW) + 1, lineHeight);
  }

  // Beat marker line (white flash line in history)
  if (isBeat) {
    historyCtx.fillStyle = 'rgba(255,255,255,0.3)';
    historyCtx.fillRect(0, 0, w, lineHeight);
  }

  // Draw history
  ctx.drawImage(historyCanvas, 0, 0);

  // ===== LIVE EQ OVERLAY (top) =====
  const eqH = 80;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, w, eqH);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const eqBars = 64;
  const eqBarW = w / eqBars;
  for (let i = 0; i < eqBars; i++) {
    const t = i / eqBars;
    const logT = Math.pow(t, 0.7);
    const freqIdx = Math.floor(logT * (freqData.length - 1));
    const val = freqData[clamp(freqIdx, 0, freqData.length - 1)];
    const barH = map(val, 0, 255, 1, eqH - 5);
    const [r, g, b] = getHeatColor(val);

    // Bar
    ctx.fillStyle = `rgba(${r},${g},${b},0.7)`;
    ctx.fillRect(i * eqBarW, eqH - barH, eqBarW - 1, barH);

    // Glow
    ctx.fillStyle = `rgba(${r},${g},${b},0.15)`;
    ctx.fillRect(i * eqBarW - 2, eqH - barH - 4, eqBarW + 4, barH + 8);
  }

  ctx.restore();

  // EQ baseline
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, eqH);
  ctx.lineTo(w, eqH);
  ctx.stroke();

  // ===== FREQUENCY LABELS =====
  ctx.font = '9px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.textAlign = 'left';
  const freqLabels = ['60Hz', '250Hz', '1kHz', '4kHz', '16kHz'];
  for (let i = 0; i < freqLabels.length; i++) {
    const t = i / (freqLabels.length - 1);
    const x = Math.pow(t, 1 / 0.6) * w; // inverse of log mapping
    ctx.fillText(freqLabels[i], x + 3, eqH - 3);
  }

  // ===== SCROLLING BEAT MARKERS (right side) =====
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  for (let i = beatMarkers.length - 1; i >= 0; i--) {
    beatMarkers[i].alpha -= dt * 0.5;
    if (beatMarkers[i].alpha <= 0) { beatMarkers.splice(i, 1); continue; }
    // Just visual indicators, already drawn into history
  }

  // Time indicator lines (horizontal)
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 0.5;
  for (let y = eqH; y < h; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

export function destroy() {
  historyCanvas = null;
  historyCtx = null;
  beatMarkers = [];
}
