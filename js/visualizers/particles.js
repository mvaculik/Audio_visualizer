// js/visualizers/particles.js — FIREWORKS CYCLE:
// rockets → burst → sparks form patterns to rhythm → fade before drop → DROP explosion

import { lerp, map, clamp, hslString, perlin, perlinOctaves } from '../utils.js';

const MAX_SPARKS = 1800;
const MOBILE_SPARKS = 700;
const MAX_ROCKETS = 15;

let rockets = [];
let sparks = [];    // active sparks (from bursts, then morph into pattern)
let hueBase = 0;
let time = 0;
let maxSparks = MAX_SPARKS;

// Beat
let rawBass = 0, rawMid = 0, rawHigh = 0;
let prevBass = 0;
let bassHistory = new Float32Array(16);
let bassIdx = 0;
let beatPower = 0;
let flashAlpha = 0;

// Drop tracking
let dropBuildup = 0;     // 0-1, rises before drop
let dropFadeActive = 0;  // 1 = fading out before drop
let postDropTime = 0;    // time since last drop burst
let centroidHistory = new Float32Array(40);
let bassAvgHistory = new Float32Array(40);
let histIdx = 0;

// Pattern state for sparks
let patternPhase = 0;
let patternAngle = 0;

function createRocket(w, h, hue, big) {
  const startX = w * 0.1 + Math.random() * w * 0.8;
  const startY = h + 5;
  const targetX = w * 0.15 + Math.random() * w * 0.7;
  const targetY = h * (big ? 0.15 : 0.2) + Math.random() * h * 0.25;
  const dx = targetX - startX;
  const dy = targetY - startY;
  const dist = Math.hypot(dx, dy);
  const speed = big ? 450 + Math.random() * 150 : 300 + Math.random() * 150;

  return {
    x: startX, y: startY,
    vx: (dx / dist) * speed,
    vy: (dy / dist) * speed,
    targetY, hue: hue + Math.random() * 50,
    size: big ? 3 : 2,
    trail: [],
    sparkCount: big ? 80 + Math.floor(Math.random() * 50) : 30 + Math.floor(Math.random() * 30),
    burstType: Math.floor(Math.random() * 5),
  };
}

function burstRocket(rocket) {
  const { x, y, hue, sparkCount, burstType } = rocket;
  const baseSpeed = 100 + Math.random() * 80;
  const newSparks = [];

  for (let i = 0; i < sparkCount; i++) {
    let angle, spd, life, gravity, drag;

    if (burstType === 0) { // Circle
      angle = (Math.PI * 2 * i) / sparkCount;
      spd = baseSpeed * (0.7 + Math.random() * 0.6);
      life = 2 + Math.random() * 1.5;
      gravity = 35; drag = 0.97;
    } else if (burstType === 1) { // Ring
      angle = (Math.PI * 2 * i) / sparkCount;
      spd = baseSpeed * (0.95 + Math.random() * 0.1);
      life = 1.5 + Math.random() * 0.5;
      gravity = 20; drag = 0.98;
    } else if (burstType === 2) { // Palm
      angle = -Math.PI/2 + (Math.random()-0.5) * Math.PI * 0.7;
      spd = baseSpeed * (0.4 + Math.random());
      life = 2.5 + Math.random() * 1.5;
      gravity = 55; drag = 0.96;
    } else if (burstType === 3) { // Crossette
      const arm = i % 6;
      angle = (Math.PI * 2 * arm) / 6 + (Math.random()-0.5)*0.3;
      spd = baseSpeed * (0.5 + Math.random() * 0.7);
      life = 1.5 + Math.random();
      gravity = 30; drag = 0.97;
    } else { // Willow
      angle = (Math.PI * 2 * i) / sparkCount;
      spd = baseSpeed * (0.2 + Math.random() * 0.4);
      life = 4 + Math.random() * 2;
      gravity = 18; drag = 0.992;
    }

    newSparks.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life, maxLife: life,
      size: 1.2 + Math.random() * 2,
      hue: hue + Math.random() * 30 + (burstType === 3 ? i % 6 * 40 : 0),
      gravity, drag,
      trail: [],
      patternForce: 0, // ramps up over time → sparks join pattern
    });
  }
  return newSparks;
}

export function init(canvas, ctx) {
  maxSparks = window.innerWidth < 768 ? MOBILE_SPARKS : MAX_SPARKS;
  rockets = []; sparks = [];
  rawBass = 0; rawMid = 0; rawHigh = 0;
  prevBass = 0; beatPower = 0; flashAlpha = 0;
  dropBuildup = 0; dropFadeActive = 0; postDropTime = 0;
  bassHistory.fill(0); centroidHistory.fill(0); bassAvgHistory.fill(0);
  time = 0; hueBase = 0; patternPhase = 0; patternAngle = 0;
}

export function render(freqData, timeData, dt, w, h, ctx) {
  if (!ctx) return;

  time += dt;
  hueBase += dt * 12;
  const cx = w / 2;
  const cy = h / 2;
  const minDim = Math.min(w, h);

  // ===== AUDIO =====
  const len = freqData.length;
  const bassEnd = Math.floor(len * 0.1);
  const midEnd = Math.floor(len * 0.45);
  let bSum = 0, mSum = 0, hSum = 0, wSum = 0, tMag = 0;
  for (let i = 0; i < len; i++) {
    if (i < bassEnd) bSum += freqData[i];
    else if (i < midEnd) mSum += freqData[i];
    else hSum += freqData[i];
    wSum += i * freqData[i];
    tMag += freqData[i];
  }
  rawBass = lerp(rawBass, bSum / bassEnd, 0.5);
  rawMid = lerp(rawMid, mSum / (midEnd - bassEnd), 0.4);
  rawHigh = lerp(rawHigh, hSum / (len - midEnd), 0.45);

  const brightness = tMag > 0 ? (wSum / tMag / len) * 2.5 : 0;

  bassHistory[bassIdx % 16] = rawBass;
  bassIdx++;
  let avgBass = 0;
  for (let i = 0; i < 16; i++) avgBass += bassHistory[i];
  avgBass /= 16;

  const bassDelta = rawBass - prevBass;
  const isBeat = rawBass > avgBass * 1.08 && bassDelta > 5;
  const isHardBeat = rawBass > avgBass * 1.25 && bassDelta > 18;
  prevBass = lerp(prevBass, rawBass, 0.25);
  const energy = clamp((rawBass + rawMid + rawHigh) / 500, 0, 1);

  if (isHardBeat) { beatPower = 1; flashAlpha = Math.max(flashAlpha, 0.15); }
  else if (isBeat) { beatPower = Math.max(beatPower, 0.4); flashAlpha = Math.max(flashAlpha, 0.03); }
  beatPower *= 0.88;
  flashAlpha *= 0.85;

  // ===== DROP DETECTION (simplified from music-intelligence) =====
  const hi = histIdx % 40;
  centroidHistory[hi] = brightness;
  bassAvgHistory[hi] = rawBass;
  histIdx++;

  // Compare recent vs old brightness + bass
  let recentBright = 0, oldBright = 0, recentBassAvg = 0, oldBassAvg = 0;
  for (let k = 0; k < 15; k++) {
    recentBright += centroidHistory[((histIdx - k) % 40 + 40) % 40];
    oldBright += centroidHistory[((histIdx - 25 - k) % 40 + 40) % 40];
    recentBassAvg += bassAvgHistory[((histIdx - k) % 40 + 40) % 40];
    oldBassAvg += bassAvgHistory[((histIdx - 25 - k) % 40 + 40) % 40];
  }
  recentBright /= 15; oldBright /= 15;
  recentBassAvg /= 15; oldBassAvg /= 15;

  const centroidRising = recentBright - oldBright > 0.02;
  const bassVacuum = oldBassAvg > 10 && recentBassAvg / oldBassAvg < 0.5;

  // Buildup score
  let buildup = 0;
  if (centroidRising) buildup += 0.4;
  if (bassVacuum) buildup += 0.3;
  if (brightness > 0.4 && energy > 0.3) buildup += 0.2;
  dropBuildup = lerp(dropBuildup, buildup, 0.06);

  // Drop trigger: bass returns after buildup
  const isDropMoment = dropBuildup > 0.15 && bassDelta > 12 && rawBass > avgBass * 1.2;

  postDropTime += dt;

  // ===== PHASE: FADE before drop =====
  if (dropBuildup > 0.25) {
    dropFadeActive = lerp(dropFadeActive, dropBuildup, 0.05);
  } else {
    dropFadeActive *= 0.95;
  }

  // Flash
  if (flashAlpha > 0.005) {
    ctx.fillStyle = hslString(hueBase % 360, 0.6, 0.8, flashAlpha);
    ctx.fillRect(0, 0, w, h);
  }

  // ===== LAUNCH ROCKETS on beats (normal phase) =====
  if (isBeat && dropFadeActive < 0.3 && rockets.length < MAX_ROCKETS) {
    const num = isHardBeat ? 2 + Math.floor(Math.random() * 2) : 1;
    for (let r = 0; r < num; r++) {
      rockets.push(createRocket(w, h, hueBase % 360, isHardBeat));
    }
  }

  // ===== DROP MOMENT: massive instant bursts =====
  if (isDropMoment) {
    flashAlpha = 0.35;
    const numBursts = 4 + Math.floor(Math.random() * 4);
    for (let b = 0; b < numBursts; b++) {
      const bx = w * 0.1 + Math.random() * w * 0.8;
      const by = h * 0.1 + Math.random() * h * 0.4;
      const fakeRocket = {
        x: bx, y: by,
        hue: (hueBase + b * 40) % 360,
        sparkCount: 60 + Math.floor(Math.random() * 60),
        burstType: Math.floor(Math.random() * 5),
      };
      sparks.push(...burstRocket(fakeRocket));
    }
    dropBuildup = 0;
    dropFadeActive = 0;
    postDropTime = 0;
    patternPhase = (patternPhase + 1) % 4;
  }

  // Pattern rotation
  patternAngle += dt * (0.3 + energy * 0.8 + beatPower);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // ===== ROCKETS =====
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.vy += 25 * dt;

    r.trail.push({ x: r.x, y: r.y });
    while (r.trail.length > 12) r.trail.shift();

    // Rocket trail
    for (let t = 1; t < r.trail.length; t++) {
      const ratio = t / r.trail.length;
      ctx.strokeStyle = hslString(r.hue, 0.8, 0.8, ratio * 0.5);
      ctx.lineWidth = ratio * r.size;
      ctx.beginPath();
      ctx.moveTo(r.trail[t-1].x, r.trail[t-1].y);
      ctx.lineTo(r.trail[t].x, r.trail[t].y);
      ctx.stroke();
    }

    // Head
    ctx.fillStyle = hslString(r.hue, 0.5, 0.95, 0.9);
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.size, 0, Math.PI * 2);
    ctx.fill();

    // Burst at target
    if (r.y <= r.targetY) {
      sparks.push(...burstRocket(r));
      rockets.splice(i, 1);
      flashAlpha = Math.max(flashAlpha, 0.06);
    }
  }

  // ===== SPARKS — physics + pattern morphing =====
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    const fi = i / sparks.length;
    const lifeRatio = clamp(s.life / s.maxLife, 0, 1);

    // After initial burst, sparks gradually join rhythm patterns
    s.patternForce = lerp(s.patternForce, 1, 0.008);
    const pf = clamp(s.patternForce * (1 - lifeRatio * 0.5), 0, 0.6);

    // Pattern target (only when patternForce > 0.2)
    if (pf > 0.2) {
      let tx = s.x, ty = s.y;
      if (patternPhase === 0) {
        // Orbiting ring
        const ringAngle = fi * Math.PI * 2 + patternAngle;
        const ringR = minDim * 0.2 + map(rawBass, 0, 255, 0, 50);
        tx = cx + Math.cos(ringAngle) * ringR;
        ty = cy + Math.sin(ringAngle) * ringR;
      } else if (patternPhase === 1) {
        // Wave
        tx = map(fi, 0, 1, w * 0.05, w * 0.95);
        ty = cy + Math.sin(fi * Math.PI * 4 + patternAngle * 2) * (50 + rawMid * 0.3);
      } else if (patternPhase === 2) {
        // Spiral
        const sa = fi * Math.PI * 8 + patternAngle;
        const sr = fi * minDim * 0.3;
        tx = cx + Math.cos(sa) * sr;
        ty = cy + Math.sin(sa) * sr;
      } else {
        // Grid pulse
        const cols = 12;
        const gx = (i % cols) / cols;
        const gy = Math.floor(i / cols) / Math.ceil(sparks.length / cols);
        tx = w * 0.1 + gx * w * 0.8 + Math.sin(gx * 6 + time * 3) * rawBass * 0.1;
        ty = h * 0.15 + gy * h * 0.6 + Math.cos(gy * 6 + time * 2) * rawMid * 0.08;
      }

      s.vx += (tx - s.x) * pf * 0.03;
      s.vy += (ty - s.y) * pf * 0.03;
    }

    // Beat push (keeps rhythm feel)
    if (isBeat && pf > 0.3) {
      const dx = s.x - cx;
      const dy = s.y - cy;
      const dist = Math.max(1, Math.hypot(dx, dy));
      s.vx += (dx / dist) * beatPower * 6;
      s.vy += (dy / dist) * beatPower * 6;
    }

    // Normal physics
    s.vx *= s.drag;
    s.vy *= s.drag;
    s.vy += s.gravity * dt * (1 - pf * 0.8); // reduce gravity when in pattern
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;

    // Fade before drop: accelerate life decay
    if (dropFadeActive > 0.3) {
      s.life -= dt * dropFadeActive * 2;
    }

    if (s.life <= 0) { sparks.splice(i, 1); continue; }

    const alpha = lifeRatio * lifeRatio * (1 - dropFadeActive * 0.5);

    // Trail
    s.trail.push({ x: s.x, y: s.y });
    while (s.trail.length > 6) s.trail.shift();

    for (let t = 1; t < s.trail.length; t++) {
      const tR = t / s.trail.length;
      ctx.strokeStyle = hslString(s.hue, 0.8, 0.6, tR * alpha * 0.2);
      ctx.lineWidth = tR * s.size * 0.5;
      ctx.beginPath();
      ctx.moveTo(s.trail[t-1].x, s.trail[t-1].y);
      ctx.lineTo(s.trail[t].x, s.trail[t].y);
      ctx.stroke();
    }

    // Glow
    ctx.fillStyle = hslString(s.hue, 0.9, 0.6, alpha * 0.1);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size + 4, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = hslString(s.hue, 0.6, 0.5 + lifeRatio * 0.4, alpha);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size * Math.max(lifeRatio, 0.3), 0, Math.PI * 2);
    ctx.fill();
  }

  while (sparks.length > maxSparks) sparks.shift();

  ctx.restore();

  // ===== GROUND REFLECTION =====
  const groundY = h * 0.9;
  const reflGrad = ctx.createLinearGradient(0, groundY, 0, h);
  reflGrad.addColorStop(0, 'rgba(0,0,0,0)');
  reflGrad.addColorStop(1, hslString(hueBase % 360, 0.3, 0.1, 0.06 + beatPower * 0.08));
  ctx.fillStyle = reflGrad;
  ctx.fillRect(0, groundY, w, h - groundY);

  // Drop buildup indicator (subtle pulsing border)
  if (dropBuildup > 0.1) {
    const pulseA = dropBuildup * (0.1 + Math.sin(time * 8) * 0.05);
    ctx.strokeStyle = hslString(0, 0.8, 0.6, pulseA);
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, w - 20, h - 20);
  }
}

export function destroy() {
  rockets = [];
  sparks = [];
}
