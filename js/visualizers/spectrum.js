// js/visualizers/spectrum.js — Waterfall spectrogram with heatmap palette

import { map, clamp, hslString } from '../utils.js';

let historyCanvas = null;
let historyCtx = null;
let prevW = 0, prevH = 0;
let scrollY = 0;

// Heatmap: black → deep purple → red → orange → yellow → white
const HEATMAP = [
  [0, 0, 0],          // 0
  [20, 0, 40],        // ~25
  [60, 0, 100],       // ~50
  [120, 0, 150],      // ~75
  [180, 0, 120],      // ~100
  [220, 30, 30],      // ~125
  [255, 80, 0],       // ~150
  [255, 140, 0],      // ~175
  [255, 200, 0],      // ~200
  [255, 240, 100],    // ~225
  [255, 255, 220],    // ~250
  [255, 255, 255],    // 255
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
  scrollY = 0;
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

  // Scroll: shift existing content down by 2px
  const lineHeight = 2;
  historyCtx.drawImage(historyCanvas, 0, 0, w, h, 0, lineHeight, w, h);

  // Draw new frequency line at top
  const barWidth = w / freqData.length;

  for (let i = 0; i < freqData.length; i++) {
    const [r, g, b] = getHeatColor(freqData[i]);
    historyCtx.fillStyle = `rgb(${r},${g},${b})`;
    historyCtx.fillRect(
      Math.floor(i * barWidth),
      0,
      Math.ceil(barWidth) + 1,
      lineHeight
    );
  }

  // Draw history to main canvas
  ctx.drawImage(historyCanvas, 0, 0);

  // Overlay: frequency labels (left side)
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, 0, 55, h);

  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'right';

  const freqLabels = ['20k', '16k', '12k', '8k', '4k', '2k', '1k', '500', '200', '60'];
  for (let i = 0; i < freqLabels.length; i++) {
    const y = map(i, 0, freqLabels.length - 1, 15, h - 5);
    // Labels are positioned along the x-axis (frequency axis runs horizontally in spectrogram)
  }

  // Top: current spectrum bar (mini equalizer)
  const miniBarH = 40;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, w, miniBarH);

  const miniBarW = w / 64;
  for (let i = 0; i < 64; i++) {
    const freqIdx = Math.floor(map(i, 0, 64, 0, freqData.length - 1));
    const val = freqData[freqIdx];
    const barH = map(val, 0, 255, 1, miniBarH - 4);
    const [r, g, b] = getHeatColor(val);

    ctx.fillStyle = `rgba(${r},${g},${b},0.8)`;
    ctx.fillRect(
      i * miniBarW,
      miniBarH - barH,
      miniBarW - 1,
      barH
    );
  }

  // Time indicator (right side)
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let y = miniBarH; y < h; y += 60) {
    ctx.fillRect(0, y, w, 1);
  }
}

export function destroy() {
  historyCanvas = null;
  historyCtx = null;
}
