// js/visualizers/radial.js — Enhanced radial visualizer with glow, particles, color cycling

import { lerp, map, clamp, hslString, perlin } from '../utils.js';

const BARS = 180;
const ORBIT_PARTICLES = 60;

let orbitParticles = [];
let hueOffset = 0;
let smoothRadius = 80;
let smoothIntensity = 0;
let prevShockwave = 0;
let shockwaveRadius = 0;
let shockwaveAlpha = 0;

export function init(canvas, ctx) {
  orbitParticles = [];
  for (let i = 0; i < ORBIT_PARTICLES; i++) {
    orbitParticles.push({
      angle: (Math.PI * 2 * i) / ORBIT_PARTICLES,
      dist: 0,
      size: 1 + Math.random() * 2,
      speed: 0.2 + Math.random() * 0.5,
      hueOff: Math.random() * 60,
    });
  }
}

export function render(freqData, timeData, dt, w, h) {
  const ctx = arguments[5] || null;
  if (!ctx) return;

  const cx = w / 2;
  const cy = h / 2;

  // Calculate intensity (average of all frequencies)
  let intensity = 0;
  let bassIntensity = 0;
  for (let i = 0; i < freqData.length; i++) {
    intensity += freqData[i];
    if (i < 16) bassIntensity += freqData[i];
  }
  intensity /= freqData.length;
  bassIntensity /= 16;

  smoothIntensity = lerp(smoothIntensity, intensity, 0.15);
  hueOffset += dt * 20 + smoothIntensity * dt * 0.5;

  // Radius pulses with bass
  const targetRadius = map(bassIntensity, 0, 255, 60, Math.min(w, h) * 0.12);
  const prevRadius = smoothRadius;
  smoothRadius = lerp(smoothRadius, targetRadius, 0.12);

  // Shockwave on bass spike
  const deltaRad = smoothRadius - prevRadius;
  if (deltaRad > 3) {
    shockwaveRadius = smoothRadius;
    shockwaveAlpha = 0.7;
  }

  // Draw radial bars
  const radsPerBar = (Math.PI * 2) / BARS;

  for (let i = 0; i < BARS; i++) {
    const freqIndex = Math.floor(map(i, 0, BARS, 0, freqData.length - 1));
    const value = freqData[freqIndex];

    const barHeight = map(value, 0, 255, 2, Math.min(w, h) * 0.28);
    const barWidth = Math.max(1, barHeight * 0.02 + 1);

    const angle = radsPerBar * i + (hueOffset * 0.002);
    const x1 = cx + Math.cos(angle) * smoothRadius;
    const y1 = cy + Math.sin(angle) * smoothRadius;
    const x2 = cx + Math.cos(angle) * (smoothRadius + barHeight);
    const y2 = cy + Math.sin(angle) * (smoothRadius + barHeight);

    const barHue = (hueOffset + i * (360 / BARS)) % 360;
    const alpha = map(value, 0, 255, 0.3, 0.95);

    // Glow pass (wider, transparent)
    ctx.strokeStyle = hslString(barHue, 0.9, 0.6, alpha * 0.3);
    ctx.lineWidth = barWidth + 4;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Main bar
    ctx.strokeStyle = hslString(barHue, 0.85, 0.65, alpha);
    ctx.lineWidth = barWidth;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Center circle glow
  const glowSize = smoothRadius + 15;
  const gradient = ctx.createRadialGradient(cx, cy, smoothRadius * 0.3, cx, cy, glowSize);
  const centerHue = hueOffset % 360;
  gradient.addColorStop(0, hslString(centerHue, 0.7, 0.15, 0.6));
  gradient.addColorStop(0.6, hslString(centerHue, 0.8, 0.1, 0.3));
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, glowSize, 0, Math.PI * 2);
  ctx.fill();

  // Center circle solid
  ctx.fillStyle = hslString(centerHue, 0.5, 0.08, 0.9);
  ctx.beginPath();
  ctx.arc(cx, cy, smoothRadius * 0.65, 0, Math.PI * 2);
  ctx.fill();

  // Center ring
  ctx.strokeStyle = hslString(centerHue, 0.8, 0.5, 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, smoothRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Orbit particles
  for (const p of orbitParticles) {
    p.angle += p.speed * dt;
    const freqIdx = Math.floor(map(p.hueOff, 0, 60, 64, 127));
    const highVal = freqData[clamp(freqIdx, 0, freqData.length - 1)] || 0;
    const targetDist = smoothRadius + 10 + map(highVal, 0, 255, 0, 80);
    p.dist = lerp(p.dist, targetDist, 0.08);

    const px = cx + Math.cos(p.angle) * p.dist;
    const py = cy + Math.sin(p.angle) * p.dist;
    const pHue = (hueOffset + p.hueOff * 3) % 360;
    const pSize = p.size + map(highVal, 0, 255, 0, 3);

    // Glow
    ctx.fillStyle = hslString(pHue, 0.9, 0.7, 0.3);
    ctx.beginPath();
    ctx.arc(px, py, pSize + 3, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = hslString(pHue, 0.9, 0.8, 0.9);
    ctx.beginPath();
    ctx.arc(px, py, pSize, 0, Math.PI * 2);
    ctx.fill();
  }

  // Shockwave ring
  if (shockwaveAlpha > 0.01) {
    shockwaveRadius += dt * 400;
    shockwaveAlpha *= 0.93;

    ctx.strokeStyle = hslString(hueOffset % 360, 0.7, 0.7, shockwaveAlpha);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, shockwaveRadius, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Bass flash
  if (deltaRad > 5) {
    ctx.fillStyle = `rgba(255,255,255,${clamp(deltaRad * 0.03, 0, 0.15)})`;
    ctx.fillRect(0, 0, w, h);
  }
}

export function destroy() {
  orbitParticles = [];
  smoothRadius = 80;
  smoothIntensity = 0;
}
