// js/visualizers/radial.js — FIRED radial visualizer with aggressive reactivity

import { lerp, map, clamp, hslString, perlin } from '../utils.js';

const BARS = 220;
const MAX_SHOCKWAVES = 5;
const ORBIT_PARTICLES = 60;

let orbitParticles = [];
let hueOffset = 0;

// Drop fireworks
let dropRockets = [];
let dropSparks = [];
let dropCooldown = 0;
let centroidHist = new Float32Array(40);
let bassAvgHist = new Float32Array(40);
let dHistIdx = 0;
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
  dropRockets = [];
  dropSparks = [];
  dropCooldown = 0;
  centroidHist.fill(0);
  bassAvgHist.fill(0);
  dHistIdx = 0;
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
  const fireSegments = 30;
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

  // ===== RADIAL BARS — symmetric 360°, rotating, full circle =====
  const radsPerBar = (Math.PI * 2) / BARS;
  const halfBars = Math.floor(BARS / 2);
  const barStartR = 6;
  const numBins = freqData.length; // 128 bins

  // Strategy: map 110 bars directly to 128 freq bins (linear stretch)
  // Then mirror to second half. NO log mapping — keeps all bars equally loud.
  const barValues = new Float32Array(BARS);
  for (let i = 0; i < halfBars; i++) {
    const freqIdx = Math.floor((i / halfBars) * numBins);
    barValues[i] = freqData[clamp(freqIdx, 0, numBins - 1)];
  }
  // Mirror second half = exact reverse copy of first half
  for (let i = 0; i < halfBars; i++) {
    barValues[halfBars + i] = barValues[halfBars - 1 - i];
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < BARS; i++) {
    // Boost quiet frequencies so ALL bars are clearly visible
    const raw = barValues[i];
    const boosted = raw < 30 ? raw + 30 : raw; // lift quiet bars
    const value = Math.max(boosted, 35);

    const maxBarH = minDim * 0.38;
    const barHeight = map(value, 0, 255, 20, maxBarH);
    const barWidth = Math.max(1.5, map(value, 0, 255, 1.3, 4.5));

    const angle = radsPerBar * i + beatAccum; // ROTATE with music
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

    // Glow + core (2 passes instead of 3)
    ctx.strokeStyle = hslString(barHue, 0.9, lightness, alpha * 0.25);
    ctx.lineWidth = barWidth + 5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

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

    // Single glow+core (1 draw instead of trail+glow+core = saves ~400 draws/frame)
    ctx.fillStyle = hslString(pHue, 0.7, 0.8, pAlpha);
    ctx.beginPath();
    ctx.arc(px, py, pSize + 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // ===== HARD BEAT: full screen colored flash =====
  if (isHardBeat) {
    const beatHue = hueOffset % 360;
    ctx.fillStyle = hslString(beatHue, 0.7, 0.8, 0.15);
    ctx.fillRect(0, 0, w, h);
  }

  // ===== DROP FIREWORKS — rockets + bursts only on real drops =====
  // Drop = build-up (snare rolls, risers, rising pitch) → silence/pause → BASS RETURNS
  // Key signals:
  // 1. Build-up: brightness rises over 2-3s (risers, hi-hats accelerating)
  // 2. Bass vacuum: bass drops out while mids/highs stay
  // 3. Brief silence: sudden energy dip
  // 4. DROP: bass explodes back, total energy spikes

  dropCooldown = Math.max(0, dropCooldown - dt);

  // Spectral brightness (centroid)
  let wSum = 0, tMag = 0;
  for (let i = 0; i < freqData.length; i++) { wSum += i * freqData[i]; tMag += freqData[i]; }
  const brightness = tMag > 0 ? (wSum / tMag / freqData.length) * 2.5 : 0;

  // Track history for trend analysis
  const dhi = dHistIdx % 40;
  centroidHist[dhi] = brightness;
  bassAvgHist[dhi] = rawBass;
  dHistIdx++;

  // Compare RECENT (last ~0.6s) vs OLD (1.5s ago) for both brightness and bass
  let recentBright = 0, oldBright = 0, recentBassA = 0, oldBassA = 0;
  let veryRecentEnergy = 0, slightlyOldEnergy = 0;
  for (let k = 0; k < 10; k++) {
    const rIdx = ((dHistIdx - k) % 40 + 40) % 40;
    const oIdx = ((dHistIdx - 20 - k) % 40 + 40) % 40;
    recentBright += centroidHist[rIdx];
    oldBright += centroidHist[oIdx];
    recentBassA += bassAvgHist[rIdx];
    oldBassA += bassAvgHist[oIdx];
  }
  recentBright /= 10; oldBright /= 10;
  recentBassA /= 10; oldBassA /= 10;

  // Very recent energy (last 3 frames) vs slightly older (5-8 frames ago)
  for (let k = 0; k < 3; k++) {
    veryRecentEnergy += bassAvgHist[((dHistIdx - k) % 40 + 40) % 40];
  }
  for (let k = 5; k < 8; k++) {
    slightlyOldEnergy += bassAvgHist[((dHistIdx - k) % 40 + 40) % 40];
  }
  veryRecentEnergy /= 3;
  slightlyOldEnergy /= 3;

  // === DETECTION SIGNALS ===

  // 1. Build-up: brightness has been rising (risers, snare rolls)
  const buildupDetected = recentBright - oldBright > 0.01;

  // 2. Bass vacuum: bass was present before, now it's reduced
  const bassWasPresent = oldBassA > 30;
  const bassDroppedOut = bassWasPresent && recentBassA < oldBassA * 0.6;

  // 3. Brief silence/dip: very recent energy much lower than slightly older
  const silenceDip = slightlyOldEnergy > 30 && veryRecentEnergy < slightlyOldEnergy * 0.5;

  // 4. Bass return: sudden bass spike RIGHT NOW
  const bassExploding = bassDelta > 8 && rawBass > 50;
  const bigBassReturn = bassDelta > 15;

  // 5. Simple loud spike after quiet: energy jumped significantly
  const energyJump = rawBass > avgEnergy * 1.3 && avgEnergy > 15;

  // === TRIGGER DROP ===
  // Method A: classic build-up → bass return
  const classicDrop = (buildupDetected || bassDroppedOut) && bassExploding;
  // Method B: silence → boom
  const silenceDrop = silenceDip && bassExploding;
  // Method C: sudden massive bass spike (catch obvious drops)
  const obviousDrop = bigBassReturn && energyJump && rawBass > 100;

  if (dropCooldown <= 0 && (classicDrop || silenceDrop || obviousDrop)) {
    dropCooldown = 3;
    flashAlpha = Math.max(flashAlpha, 0.35);

    const numR = 5 + Math.floor(Math.random() * 4);
    for (let r = 0; r < numR; r++) {
      const sx = w * 0.1 + Math.random() * w * 0.8;
      const ty = h * 0.08 + Math.random() * h * 0.3;
      const ddx = (w * 0.15 + Math.random() * w * 0.7) - sx;
      const ddy = ty - (h + 5);
      const dd = Math.hypot(ddx, ddy);
      const spd = 400 + Math.random() * 200;
      dropRockets.push({
        x: sx, y: h + 5,
        vx: (ddx / dd) * spd, vy: (ddy / dd) * spd,
        targetY: ty, hue: (hueOffset + r * 45) % 360,
        trail: [], sparkCount: 50 + Math.floor(Math.random() * 50),
        burstType: Math.floor(Math.random() * 4),
      });
    }
  }

  // Render rockets
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = dropRockets.length - 1; i >= 0; i--) {
    const r = dropRockets[i];
    r.x += r.vx * dt; r.y += r.vy * dt; r.vy += 20 * dt;
    r.trail.push({ x: r.x, y: r.y });
    while (r.trail.length > 10) r.trail.shift();

    for (let t = 1; t < r.trail.length; t++) {
      const ratio = t / r.trail.length;
      ctx.strokeStyle = hslString(r.hue, 0.8, 0.8, ratio * 0.5);
      ctx.lineWidth = ratio * 2.5;
      ctx.beginPath();
      ctx.moveTo(r.trail[t-1].x, r.trail[t-1].y);
      ctx.lineTo(r.trail[t].x, r.trail[t].y);
      ctx.stroke();
    }
    ctx.fillStyle = hslString(r.hue, 0.5, 0.95, 0.9);
    ctx.beginPath(); ctx.arc(r.x, r.y, 2.5, 0, Math.PI * 2); ctx.fill();

    if (r.y <= r.targetY) {
      const bs = 100 + Math.random() * 80;
      for (let s = 0; s < r.sparkCount; s++) {
        const a = (Math.PI * 2 * s) / r.sparkCount + Math.random() * 0.1;
        const sp = bs * (0.5 + Math.random() * 0.8);
        const grav = [35, 20, 55, 30][r.burstType];
        const drag = [0.97, 0.98, 0.96, 0.975][r.burstType];
        const life = [1.8, 1.2, 2.5, 1.5][r.burstType] + Math.random();
        dropSparks.push({
          x: r.x, y: r.y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp,
          life, maxLife: life, size: 1.5 + Math.random() * 2,
          hue: r.hue + Math.random() * 30, gravity: grav, drag, trail: [],
        });
      }
      dropRockets.splice(i, 1);
      flashAlpha = Math.max(flashAlpha, 0.12);
    }
  }

  // Render sparks
  for (let i = dropSparks.length - 1; i >= 0; i--) {
    const s = dropSparks[i];
    s.vx *= s.drag; s.vy *= s.drag; s.vy += s.gravity * dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    if (s.life <= 0) { dropSparks.splice(i, 1); continue; }

    const lr = clamp(s.life / s.maxLife, 0, 1);
    const al = lr * lr;

    s.trail.push({ x: s.x, y: s.y });
    while (s.trail.length > 5) s.trail.shift();

    for (let t = 1; t < s.trail.length; t++) {
      const tR = t / s.trail.length;
      ctx.strokeStyle = hslString(s.hue, 0.8, 0.6, tR * al * 0.2);
      ctx.lineWidth = tR * s.size * 0.5;
      ctx.beginPath();
      ctx.moveTo(s.trail[t-1].x, s.trail[t-1].y);
      ctx.lineTo(s.trail[t].x, s.trail[t].y);
      ctx.stroke();
    }

    ctx.fillStyle = hslString(s.hue, 0.9, 0.6, al * 0.1);
    ctx.beginPath(); ctx.arc(s.x, s.y, s.size + 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hslString(s.hue, 0.6, 0.5 + lr * 0.4, al);
    ctx.beginPath(); ctx.arc(s.x, s.y, s.size * lr, 0, Math.PI * 2); ctx.fill();
  }

  while (dropSparks.length > 1200) dropSparks.shift();
  ctx.restore();
}

export function destroy() {
  orbitParticles = [];
  shockwaves = [];
  dropRockets = [];
  dropSparks = [];
  smoothRadius = 80;
  rawBass = 0;
  prevBass = 0;
  beatAccum = 0;
  flashAlpha = 0;
  screenShakeX = 0;
  screenShakeY = 0;
  beatPower = 0;
}
