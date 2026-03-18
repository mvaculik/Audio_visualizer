// js/visualizers/waveform.js — Oscilloscope with neon glow and trail persistence

import { lerp, map, clamp, hslString } from '../utils.js';

let trailCanvas = null;
let trailCtx = null;
let hueShift = 0;
let prevW = 0, prevH = 0;

export function init(canvas, ctx) {
  trailCanvas = document.createElement('canvas');
  trailCtx = trailCanvas.getContext('2d');
  prevW = 0;
  prevH = 0;
  hueShift = 0;
}

function ensureTrailSize(w, h) {
  if (prevW !== w || prevH !== h) {
    trailCanvas.width = w;
    trailCanvas.height = h;
    prevW = w;
    prevH = h;
  }
}

export function render(freqData, timeData, dt, w, h, ctx) {
  if (!ctx || !trailCtx) return;

  ensureTrailSize(w, h);
  hueShift += dt * 25;

  // Calculate RMS volume for line thickness
  let rms = 0;
  for (let i = 0; i < timeData.length; i++) {
    const v = (timeData[i] - 128) / 128;
    rms += v * v;
  }
  rms = Math.sqrt(rms / timeData.length);

  const lineWidth = map(rms, 0, 0.5, 2, 8);
  const hue = hueShift % 360;

  // Fade previous trail
  trailCtx.fillStyle = 'rgba(0, 0, 0, 0.08)';
  trailCtx.fillRect(0, 0, w, h);

  // Draw waveform on trail canvas
  const sliceWidth = w / timeData.length;
  const centerY = h / 2;

  // Outer glow pass
  trailCtx.strokeStyle = hslString(hue, 0.9, 0.6, 0.2);
  trailCtx.lineWidth = lineWidth + 10;
  trailCtx.lineCap = 'round';
  trailCtx.lineJoin = 'round';
  trailCtx.beginPath();
  for (let i = 0; i < timeData.length; i++) {
    const v = (timeData[i] - 128) / 128;
    const y = centerY + v * h * 0.35;
    const x = i * sliceWidth;
    if (i === 0) trailCtx.moveTo(x, y);
    else trailCtx.lineTo(x, y);
  }
  trailCtx.stroke();

  // Mid glow pass
  trailCtx.strokeStyle = hslString(hue, 0.85, 0.55, 0.4);
  trailCtx.lineWidth = lineWidth + 4;
  trailCtx.beginPath();
  for (let i = 0; i < timeData.length; i++) {
    const v = (timeData[i] - 128) / 128;
    const y = centerY + v * h * 0.35;
    const x = i * sliceWidth;
    if (i === 0) trailCtx.moveTo(x, y);
    else trailCtx.lineTo(x, y);
  }
  trailCtx.stroke();

  // Core line (bright)
  trailCtx.strokeStyle = hslString(hue, 0.7, 0.85, 0.95);
  trailCtx.lineWidth = lineWidth;
  trailCtx.beginPath();
  for (let i = 0; i < timeData.length; i++) {
    const v = (timeData[i] - 128) / 128;
    const y = centerY + v * h * 0.35;
    const x = i * sliceWidth;
    if (i === 0) trailCtx.moveTo(x, y);
    else trailCtx.lineTo(x, y);
  }
  trailCtx.stroke();

  // Draw second harmonic line (subtle, offset hue)
  const hue2 = (hue + 120) % 360;
  trailCtx.strokeStyle = hslString(hue2, 0.8, 0.6, 0.15);
  trailCtx.lineWidth = lineWidth * 0.5;
  trailCtx.beginPath();
  for (let i = 0; i < timeData.length; i++) {
    const v = (timeData[i] - 128) / 128;
    const y = centerY + v * h * 0.2 + Math.sin(i * 0.05 + hueShift * 0.1) * 20;
    const x = i * sliceWidth;
    if (i === 0) trailCtx.moveTo(x, y);
    else trailCtx.lineTo(x, y);
  }
  trailCtx.stroke();

  // Composite trail onto main canvas
  ctx.drawImage(trailCanvas, 0, 0);

  // Center line (subtle reference)
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(w, centerY);
  ctx.stroke();

  // Frequency intensity indicator (small bars at bottom)
  const numIndicators = 32;
  const indicatorWidth = w / numIndicators;
  for (let i = 0; i < numIndicators; i++) {
    const freqIdx = Math.floor(map(i, 0, numIndicators, 0, freqData.length - 1));
    const val = freqData[freqIdx];
    const barH = map(val, 0, 255, 1, 30);
    const iHue = (hue + i * 8) % 360;

    ctx.fillStyle = hslString(iHue, 0.8, 0.5, 0.3);
    ctx.fillRect(i * indicatorWidth, h - barH, indicatorWidth - 1, barH);
  }
}

export function destroy() {
  trailCanvas = null;
  trailCtx = null;
}
