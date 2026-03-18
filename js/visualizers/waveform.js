// js/visualizers/waveform.js — Multi-layer oscilloscope with glow, mirror, freq bars

import { lerp, map, clamp, hslString } from '../utils.js';

let trailCanvas = null;
let trailCtx = null;
let hueShift = 0;
let prevW = 0, prevH = 0;
let prevBass = 0;
let flashAlpha = 0;

export function init(canvas, ctx) {
  trailCanvas = document.createElement('canvas');
  trailCtx = trailCanvas.getContext('2d');
  prevW = 0;
  prevH = 0;
  hueShift = 0;
  prevBass = 0;
  flashAlpha = 0;
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

  // Bass for flash
  let bassNow = 0;
  for (let i = 0; i < 10; i++) bassNow += freqData[i];
  bassNow /= 10;
  const bassDelta = bassNow - prevBass;
  if (bassDelta > 20) flashAlpha = Math.max(flashAlpha, 0.03);
  prevBass = lerp(prevBass, bassNow, 0.3);
  flashAlpha *= 0.92;

  // Flash
  if (flashAlpha > 0.005) {
    ctx.fillStyle = hslString(hueShift % 360, 0.6, 0.7, flashAlpha);
    ctx.fillRect(0, 0, w, h);
  }

  // RMS volume
  let rms = 0;
  for (let i = 0; i < timeData.length; i++) {
    const v = (timeData[i] - 128) / 128;
    rms += v * v;
  }
  rms = Math.sqrt(rms / timeData.length);

  const lineWidth = map(rms, 0, 0.5, 1.5, 6);
  const hue = hueShift % 360;
  const centerY = h / 2;

  // Fade trail
  trailCtx.fillStyle = 'rgba(0, 0, 0, 0.06)';
  trailCtx.fillRect(0, 0, w, h);

  const sliceWidth = w / timeData.length;

  // Draw multiple waveform layers on trail canvas
  const layers = [
    { hue: hue, alpha: 0.95, width: lineWidth, amp: 0.38, yOff: 0 },
    { hue: (hue + 90) % 360, alpha: 0.2, width: lineWidth * 0.6, amp: 0.25, yOff: -10 },
    { hue: (hue + 180) % 360, alpha: 0.15, width: lineWidth * 0.4, amp: 0.2, yOff: 10 },
  ];

  for (const layer of layers) {
    // Outer glow
    trailCtx.strokeStyle = hslString(layer.hue, 0.9, 0.6, layer.alpha * 0.2);
    trailCtx.lineWidth = layer.width + 8;
    trailCtx.lineCap = 'round';
    trailCtx.lineJoin = 'round';
    trailCtx.beginPath();
    for (let i = 0; i < timeData.length; i++) {
      const v = (timeData[i] - 128) / 128;
      const y = centerY + layer.yOff + v * h * layer.amp;
      if (i === 0) trailCtx.moveTo(i * sliceWidth, y);
      else trailCtx.lineTo(i * sliceWidth, y);
    }
    trailCtx.stroke();

    // Core line
    trailCtx.strokeStyle = hslString(layer.hue, 0.7, 0.85, layer.alpha);
    trailCtx.lineWidth = layer.width;
    trailCtx.beginPath();
    for (let i = 0; i < timeData.length; i++) {
      const v = (timeData[i] - 128) / 128;
      const y = centerY + layer.yOff + v * h * layer.amp;
      if (i === 0) trailCtx.moveTo(i * sliceWidth, y);
      else trailCtx.lineTo(i * sliceWidth, y);
    }
    trailCtx.stroke();
  }

  // Mirror waveform (below center, inverted, dimmer)
  trailCtx.save();
  trailCtx.globalAlpha = 0.15;
  trailCtx.translate(0, centerY);
  trailCtx.scale(1, -1);
  trailCtx.translate(0, -centerY);
  trailCtx.strokeStyle = hslString(hue, 0.6, 0.5, 0.3);
  trailCtx.lineWidth = lineWidth * 0.7;
  trailCtx.beginPath();
  for (let i = 0; i < timeData.length; i++) {
    const v = (timeData[i] - 128) / 128;
    const y = centerY + v * h * 0.38;
    if (i === 0) trailCtx.moveTo(i * sliceWidth, y);
    else trailCtx.lineTo(i * sliceWidth, y);
  }
  trailCtx.stroke();
  trailCtx.restore();

  // Composite trail
  ctx.drawImage(trailCanvas, 0, 0);

  // Center line
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(w, centerY);
  ctx.stroke();

  // Bottom frequency bars (mini equalizer)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const numBars = 48;
  const barW = w / numBars;
  for (let i = 0; i < numBars; i++) {
    const freqIdx = Math.floor(Math.pow(i / numBars, 0.7) * (freqData.length - 1));
    const val = freqData[freqIdx];
    const barH = map(val, 0, 255, 1, 50);
    const bHue = (hue + i * 6) % 360;

    // Bottom bars
    ctx.fillStyle = hslString(bHue, 0.8, 0.5, 0.25);
    ctx.fillRect(i * barW, h - barH, barW - 1, barH);

    // Top bars (mirror)
    ctx.fillStyle = hslString(bHue, 0.8, 0.5, 0.12);
    ctx.fillRect(i * barW, 0, barW - 1, barH * 0.5);
  }
  ctx.restore();

  // Energy indicator circles (left and right)
  const energy = rms * 4;
  const circR = 20 + energy * 60;
  ctx.fillStyle = hslString(hue, 0.7, 0.5, energy * 0.15);
  ctx.beginPath();
  ctx.arc(50, centerY, circR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w - 50, centerY, circR, 0, Math.PI * 2);
  ctx.fill();
}

export function destroy() {
  trailCanvas = null;
  trailCtx = null;
}
