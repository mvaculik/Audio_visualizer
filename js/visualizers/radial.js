// js/visualizers/radial.js — FIRED radial visualizer with aggressive reactivity

import { lerp, map, clamp, hslString, perlin } from '../utils.js';

const BARS = 220;
const MAX_SHOCKWAVES = 5;
const ORBIT_PARTICLES = 60;

let orbitParticles = [];
let hueOffset = 0;
let smoothRadius = 80;
let rawBass = 0;
let rawMid = 0;
let rawHigh = 0;
let prevBass = 0;
let beatAccum = 0;
let rotSpeed = 0;
let flashAlpha = 0;
let shockwaves = [];
let fireRingPhase = 0;
let screenShakeX = 0;
let screenShakeY = 0;
let energyHistory = new Float32Array(8);
let energyIdx = 0;
let beatPower = 0;

// Center light
let portalGlitch = 0;
let portalPulse = 0;

export function init(canvas, ctx) {
  orbitParticles = [];
  for (let i = 0; i < ORBIT_PARTICLES; i++) {
    orbitParticles.push({
      angle: (Math.PI * 2 * i) / ORBIT_PARTICLES,
      dist: 0,
      size: 1.5 + Math.random() * 2.5,
      speed: 0.3 + Math.random() * 0.6,
      hueOff: Math.random() * 120,
      trail: [],
    });
  }
  shockwaves = [];
  smoothRadius = 80;
  rawBass = 0;
  prevBass = 0;
  beatAccum = 0;
  flashAlpha = 0;
  energyHistory.fill(0);
  beatPower = 0;
  portalGlitch = 0;
  portalPulse = 0;
}

export function render(freqData, timeData, dt, w, h, ctx) {
  if (!ctx) return;

  const cx = w / 2 + screenShakeX;
  const cy = h / 2 + screenShakeY;
  const minDim = Math.min(w, h);

  // ===== ANALYZE AUDIO — raw, no over-smoothing =====
  let bassSum = 0, midSum = 0, highSum = 0;
  const bassEnd = Math.floor(freqData.length * 0.1);
  const midEnd = Math.floor(freqData.length * 0.45);

  for (let i = 0; i < freqData.length; i++) {
    if (i < bassEnd) bassSum += freqData[i];
    else if (i < midEnd) midSum += freqData[i];
    else highSum += freqData[i];
  }

  // FAST response — lerp 0.45 for bass (almost instant)
  rawBass = lerp(rawBass, bassSum / bassEnd, 0.45);
  rawMid = lerp(rawMid, midSum / (midEnd - bassEnd), 0.35);
  rawHigh = lerp(rawHigh, highSum / (freqData.length - midEnd), 0.4);

  // Beat detection — compare to rolling average
  energyHistory[energyIdx % 8] = rawBass;
  energyIdx++;
  let avgEnergy = 0;
  for (let i = 0; i < 8; i++) avgEnergy += energyHistory[i];
  avgEnergy /= 8;

  const bassDelta = rawBass - prevBass;
  const isBeat = rawBass > avgEnergy * 1.15 && bassDelta > 15;
  const isHardBeat = rawBass > avgEnergy * 1.4 && bassDelta > 35;
  prevBass = rawBass;

  // Beat power (for bust and effects)
  if (isHardBeat) beatPower = 1.0;
  else if (isBeat) beatPower = Math.max(beatPower, 0.5);
  beatPower *= 0.92;

  // ===== SCREEN FLASH on beats =====
  if (isHardBeat) {
    flashAlpha = clamp(0.25 + bassDelta * 0.004, 0.2, 0.55);
    screenShakeX = (Math.random() - 0.5) * clamp(bassDelta * 0.3, 0, 15);
    screenShakeY = (Math.random() - 0.5) * clamp(bassDelta * 0.3, 0, 15);
  } else if (isBeat) {
    flashAlpha = Math.max(flashAlpha, 0.08 + bassDelta * 0.002);
    screenShakeX = (Math.random() - 0.5) * 3;
    screenShakeY = (Math.random() - 0.5) * 3;
  }

  // Flash render
  if (flashAlpha > 0.005) {
    const flashHue = hueOffset % 360;
    ctx.fillStyle = hslString(flashHue, 0.6, 0.85, flashAlpha);
    ctx.fillRect(0, 0, w, h);
    flashAlpha *= 0.82; // fast decay
  }

  // Shake decay
  screenShakeX *= 0.85;
  screenShakeY *= 0.85;

  // ===== RADIUS — aggressive bass pulse =====
  const targetRadius = map(rawBass, 0, 255, 50, minDim * 0.15);
  smoothRadius = lerp(smoothRadius, targetRadius, 0.3); // FAST

  // Rotation accelerates on beats
  if (isBeat) rotSpeed += 0.02 + bassDelta * 0.0003;
  rotSpeed *= 0.97;
  hueOffset += dt * 30 + rawMid * dt * 0.3;
  beatAccum += rotSpeed + dt * 0.5;
  fireRingPhase += dt * 4 + rawBass * dt * 0.02;

  // ===== SHOCKWAVES — multiple, on every beat =====
  if (isBeat) {
    shockwaves.push({
      radius: smoothRadius,
      alpha: isHardBeat ? 0.9 : 0.5,
      width: isHardBeat ? 6 : 3,
      hue: hueOffset % 360,
    });
    if (shockwaves.length > MAX_SHOCKWAVES) shockwaves.shift();
  }

  // Update & draw shockwaves
  for (let s = shockwaves.length - 1; s >= 0; s--) {
    const sw = shockwaves[s];
    sw.radius += dt * 500;
    sw.alpha *= 0.92;

    if (sw.alpha < 0.01) {
      shockwaves.splice(s, 1);
      continue;
    }

    ctx.strokeStyle = hslString(sw.hue, 0.8, 0.7, sw.alpha);
    ctx.lineWidth = sw.width;
    ctx.beginPath();
    ctx.arc(cx, cy, sw.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Second ring (echo)
    ctx.strokeStyle = hslString((sw.hue + 30) % 360, 0.6, 0.5, sw.alpha * 0.3);
    ctx.lineWidth = sw.width * 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, sw.radius * 1.05, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ===== FIRE RING around center =====
  const fireSegments = 60;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < fireSegments; i++) {
    const angle = (Math.PI * 2 * i) / fireSegments;
    const fireNoise = perlin(i * 0.4, fireRingPhase) * 0.5 + 0.5;
    const fireHeight = 8 + fireNoise * map(rawBass, 0, 255, 5, 40);
    const fireR = smoothRadius + fireHeight;

    const fx = cx + Math.cos(angle) * fireR;
    const fy = cy + Math.sin(angle) * fireR;
    const fireHue = (hueOffset + fireNoise * 60) % 360;
    const fireSize = 3 + fireNoise * 5 + map(rawBass, 0, 255, 0, 4);

    ctx.fillStyle = hslString(fireHue, 0.9, 0.6, 0.3 + fireNoise * 0.3);
    ctx.beginPath();
    ctx.arc(fx, fy, fireSize, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ===== RADIAL BARS — log freq mapping, symmetric 360°, from center =====
  const radsPerBar = (Math.PI * 2) / BARS;
  const halfBars = Math.floor(BARS / 2);
  const barStartR = 6;

  // Pre-build symmetric frequency data with LOG mapping (more bass resolution)
  const barValues = new Float32Array(BARS);
  for (let i = 0; i < halfBars; i++) {
    // Logarithmic mapping: more bars dedicated to bass/mids, fewer to highs
    const t = i / halfBars; // 0→1
    const logT = Math.pow(t, 0.6); // log curve — compresses highs
    const freqIdx = Math.floor(logT * (freqData.length - 1));
    const val = freqData[clamp(freqIdx, 0, freqData.length - 1)];
    barValues[i] = val;
    barValues[BARS - 1 - i] = val; // mirror
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < BARS; i++) {
    const value = Math.max(barValues[i], 12); // minimum visible bar

    const maxBarH = minDim * 0.38;
    const barHeight = map(value, 0, 255, 8, maxBarH);
    const barWidth = Math.max(1.3, map(value, 0, 255, 1.2, 4.5));

    const angle = radsPerBar * i + beatAccum;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const x1 = cx + cosA * barStartR;
    const y1 = cy + sinA * barStartR;
    const x2 = cx + cosA * (barStartR + barHeight);
    const y2 = cy + sinA * (barStartR + barHeight);

    // Color: smooth hue around circle (position-based, not freq-based)
    const barHue = (hueOffset + (i / BARS) * 360) % 360;
    const alpha = map(value, 0, 255, 0.08, 0.95);
    const lightness = map(value, 0, 255, 0.3, 0.75);

    // Outer glow
    ctx.strokeStyle = hslString(barHue, 0.95, lightness, alpha * 0.15);
    ctx.lineWidth = barWidth + 7;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Mid glow
    ctx.strokeStyle = hslString(barHue, 0.9, lightness, alpha * 0.4);
    ctx.lineWidth = barWidth + 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Core bar
    ctx.strokeStyle = hslString(barHue, 0.85, lightness + 0.15, alpha);
    ctx.lineWidth = barWidth;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Hot tip spark
    if (value > 160) {
      const sparkSize = map(value, 160, 255, 1.5, 5);
      ctx.fillStyle = hslString(barHue, 0.5, 0.9, alpha * 0.8);
      ctx.beginPath();
      ctx.arc(x2, y2, sparkSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();

  // ===== CENTER — PURE LIGHT with drop-reactive glow =====
  const centerHue = hueOffset % 360;
  portalPulse = lerp(portalPulse, map(rawBass, 0, 255, 0, 1), 0.4);

  // Drop flash tracker
  if (isHardBeat) portalGlitch = 1;
  else if (isBeat) portalGlitch = Math.max(portalGlitch, 0.4);
  portalGlitch *= 0.88;

  const lightR = smoothRadius + portalPulse * 20 + beatPower * 30;

  // Layer 1: Wide soft glow (fades from center outward into bars)
  const wideR = lightR + minDim * 0.12;
  const wideGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, wideR);
  wideGrad.addColorStop(0, hslString(centerHue, 0.7, 0.5, 0.25 + portalPulse * 0.2));
  wideGrad.addColorStop(0.3, hslString(centerHue, 0.6, 0.3, 0.12 + portalPulse * 0.1));
  wideGrad.addColorStop(0.7, hslString((centerHue + 30) % 360, 0.4, 0.15, 0.04));
  wideGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = wideGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, wideR, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Layer 2: Core bright light
  const coreR = lightR * 0.5;
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  const coreAlpha = 0.4 + portalPulse * 0.4 + beatPower * 0.2;
  coreGrad.addColorStop(0, hslString(centerHue, 0.5, 0.95, coreAlpha));
  coreGrad.addColorStop(0.2, hslString(centerHue, 0.7, 0.7, coreAlpha * 0.7));
  coreGrad.addColorStop(0.5, hslString(centerHue, 0.8, 0.4, coreAlpha * 0.25));
  coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  ctx.fill();

  // Layer 3: Mid glow ring (second hue — creates depth)
  const midR = lightR * 0.8;
  const midGrad = ctx.createRadialGradient(cx, cy, midR * 0.3, cx, cy, midR);
  const midHue = (centerHue + 60) % 360;
  midGrad.addColorStop(0, hslString(midHue, 0.8, 0.6, 0.15 + beatPower * 0.25));
  midGrad.addColorStop(0.5, hslString(midHue, 0.6, 0.4, 0.06));
  midGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = midGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, midR, 0, Math.PI * 2);
  ctx.fill();

  // Layer 4: Beat flash (white-hot center on drops)
  if (portalGlitch > 0.1) {
    const flashR = lightR * (0.3 + portalGlitch * 0.5);
    const flashGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashR);
    flashGrad.addColorStop(0, `rgba(255,255,255,${portalGlitch * 0.5})`);
    flashGrad.addColorStop(0.3, hslString(centerHue, 0.5, 0.9, portalGlitch * 0.25));
    flashGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = flashGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, flashR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Layer 5: Subtle pulsing ring at bar boundary
  const ringR = smoothRadius + 3;
  const ringAlpha = 0.06 + portalPulse * 0.15;
  ctx.strokeStyle = hslString(centerHue, 0.7, 0.7, ringAlpha);
  ctx.lineWidth = 1 + portalPulse * 2;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();

  // ===== ORBIT PARTICLES around the circle =====
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const p of orbitParticles) {
    const freqIdx = Math.floor(map(p.hueOff, 0, 120, 10, freqData.length - 1));
    const freqVal = freqData[clamp(freqIdx, 0, freqData.length - 1)] || 0;

    p.angle += (p.speed + map(freqVal, 0, 255, 0, 1.5)) * dt;

    const orbitWave = Math.sin(p.angle * 0.4 + p.hueOff) * 15;
    const targetDist = smoothRadius + 10 + map(freqVal, 0, 255, 5, 80) + orbitWave;
    p.dist = lerp(p.dist, targetDist, 0.12);

    if (isHardBeat) p.dist += 25 + Math.random() * 15;

    const px = cx + Math.cos(p.angle) * p.dist;
    const py = cy + Math.sin(p.angle) * p.dist;
    const pHue = (hueOffset + p.hueOff * 2) % 360;
    const pSize = p.size + map(freqVal, 0, 255, 0, 4) + beatPower * 2;
    const pAlpha = map(freqVal, 0, 255, 0.15, 0.8);

    p.trail.push({ x: px, y: py });
    while (p.trail.length > 8) p.trail.shift();

    // Trail
    if (p.trail.length > 1) {
      for (let t = 1; t < p.trail.length; t++) {
        const ratio = t / p.trail.length;
        ctx.strokeStyle = hslString(pHue, 0.8, 0.6, ratio * pAlpha * 0.2);
        ctx.lineWidth = ratio * pSize * 0.5;
        ctx.beginPath();
        ctx.moveTo(p.trail[t - 1].x, p.trail[t - 1].y);
        ctx.lineTo(p.trail[t].x, p.trail[t].y);
        ctx.stroke();
      }
    }

    // Glow
    ctx.fillStyle = hslString(pHue, 0.9, 0.6, pAlpha * 0.1);
    ctx.beginPath();
    ctx.arc(px, py, pSize + 5, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = hslString(pHue, 0.4, 0.9, pAlpha);
    ctx.beginPath();
    ctx.arc(px, py, pSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // ===== HARD BEAT: full screen colored flash =====
  if (isHardBeat) {
    const beatHue = hueOffset % 360;
    ctx.fillStyle = hslString(beatHue, 0.7, 0.8, 0.15);
    ctx.fillRect(0, 0, w, h);
  }
}

export function destroy() {
  orbitParticles = [];
  shockwaves = [];
  smoothRadius = 80;
  rawBass = 0;
  prevBass = 0;
  beatAccum = 0;
  flashAlpha = 0;
  screenShakeX = 0;
  screenShakeY = 0;
  beatPower = 0;
}
