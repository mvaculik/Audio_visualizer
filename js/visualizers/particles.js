// js/visualizers/particles.js — FIREWORKS: rockets, bursts, trails, sparks

import { lerp, map, clamp, hslString, perlin } from '../utils.js';

const MAX_ROCKETS = 30;
const MAX_SPARKS = 1500;
const MOBILE_SPARKS = 600;

let rockets = [];
let sparks = [];
let hueBase = 0;
let time = 0;
let maxSparks = MAX_SPARKS;

// Beat state
let rawBass = 0, rawMid = 0, rawHigh = 0;
let prevBass = 0;
let bassHistory = new Float32Array(12);
let bassIdx = 0;
let beatPower = 0;
let flashAlpha = 0;

function createRocket(w, h, cx, cy, hue, intensity) {
  // Launch from bottom area, aim toward upper area
  const startX = w * 0.1 + Math.random() * w * 0.8;
  const startY = h + 10;
  const targetX = w * 0.15 + Math.random() * w * 0.7;
  const targetY = h * 0.1 + Math.random() * h * 0.35;

  const dx = targetX - startX;
  const dy = targetY - startY;
  const dist = Math.hypot(dx, dy);
  const speed = 300 + Math.random() * 200 + intensity * 100;

  return {
    x: startX,
    y: startY,
    vx: (dx / dist) * speed,
    vy: (dy / dist) * speed,
    targetY,
    hue: hue + Math.random() * 60,
    size: 2 + Math.random() * 2,
    trail: [],
    alive: true,
    burstType: Math.floor(Math.random() * 5), // 0=circle, 1=ring, 2=palm, 3=crossette, 4=willow
    sparkCount: 40 + Math.floor(Math.random() * 60 + intensity * 30),
  };
}

function burstRocket(rocket, sparksArr) {
  const { x, y, hue, burstType, sparkCount } = rocket;
  const baseSpeed = 80 + Math.random() * 120;

  for (let i = 0; i < sparkCount; i++) {
    let vx, vy, life, size, sparkHue, gravity, drag;

    if (burstType === 0) {
      // CIRCLE — even spread
      const angle = (Math.PI * 2 * i) / sparkCount + Math.random() * 0.1;
      const speed = baseSpeed * (0.7 + Math.random() * 0.6);
      vx = Math.cos(angle) * speed;
      vy = Math.sin(angle) * speed;
      life = 1.5 + Math.random() * 1;
      size = 1.5 + Math.random() * 2;
      sparkHue = hue + Math.random() * 20;
      gravity = 40;
      drag = 0.97;
    } else if (burstType === 1) {
      // RING — particles form a ring
      const angle = (Math.PI * 2 * i) / sparkCount;
      const speed = baseSpeed * (0.95 + Math.random() * 0.1);
      vx = Math.cos(angle) * speed;
      vy = Math.sin(angle) * speed;
      life = 1 + Math.random() * 0.5;
      size = 2 + Math.random();
      sparkHue = hue;
      gravity = 30;
      drag = 0.98;
    } else if (burstType === 2) {
      // PALM — upward streams falling down
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
      const speed = baseSpeed * (0.5 + Math.random() * 1);
      vx = Math.cos(angle) * speed;
      vy = Math.sin(angle) * speed;
      life = 2 + Math.random() * 1.5;
      size = 1 + Math.random() * 2;
      sparkHue = hue + (i % 2 === 0 ? 0 : 120);
      gravity = 60;
      drag = 0.96;
    } else if (burstType === 3) {
      // CROSSETTE — burst into sub-bursts (cross pattern)
      const mainAngle = (Math.PI * 2 * Math.floor(i / 8)) / Math.ceil(sparkCount / 8);
      const subAngle = mainAngle + (Math.random() - 0.5) * 0.5;
      const speed = baseSpeed * (0.6 + Math.random() * 0.8);
      vx = Math.cos(subAngle) * speed;
      vy = Math.sin(subAngle) * speed;
      life = 1.2 + Math.random() * 0.8;
      size = 1.5 + Math.random() * 1.5;
      sparkHue = hue + Math.floor(i / 8) * 40;
      gravity = 35;
      drag = 0.97;
    } else {
      // WILLOW — long drooping trails
      const angle = (Math.PI * 2 * i) / sparkCount + Math.random() * 0.2;
      const speed = baseSpeed * (0.3 + Math.random() * 0.5);
      vx = Math.cos(angle) * speed;
      vy = Math.sin(angle) * speed;
      life = 3 + Math.random() * 2;
      size = 1 + Math.random();
      sparkHue = hue + Math.random() * 10;
      gravity = 25;
      drag = 0.99;
    }

    sparksArr.push({
      x, y, vx, vy, life, maxLife: life, size,
      hue: sparkHue, gravity, drag,
      trail: [],
    });
  }
}

export function init(canvas, ctx) {
  maxSparks = window.innerWidth < 768 ? MOBILE_SPARKS : MAX_SPARKS;
  rockets = [];
  sparks = [];
  rawBass = 0; rawMid = 0; rawHigh = 0;
  prevBass = 0; beatPower = 0; flashAlpha = 0;
  bassHistory.fill(0);
  time = 0;
  hueBase = 0;
}

export function render(freqData, timeData, dt, w, h, ctx) {
  if (!ctx) return;

  time += dt;
  hueBase += dt * 15;

  const cx = w / 2;
  const cy = h / 2;

  // ===== AUDIO =====
  const bassEnd = Math.floor(freqData.length * 0.1);
  const midEnd = Math.floor(freqData.length * 0.45);
  let bSum = 0, mSum = 0, hSum = 0;
  for (let i = 0; i < freqData.length; i++) {
    if (i < bassEnd) bSum += freqData[i];
    else if (i < midEnd) mSum += freqData[i];
    else hSum += freqData[i];
  }
  rawBass = lerp(rawBass, bSum / bassEnd, 0.5);
  rawMid = lerp(rawMid, mSum / (midEnd - bassEnd), 0.4);
  rawHigh = lerp(rawHigh, hSum / (freqData.length - midEnd), 0.45);

  bassHistory[bassIdx % 12] = rawBass;
  bassIdx++;
  let avgBass = 0;
  for (let i = 0; i < 12; i++) avgBass += bassHistory[i];
  avgBass /= 12;

  const bassDelta = rawBass - prevBass;
  const isBeat = rawBass > avgBass * 1.1 && bassDelta > 8;
  const isHardBeat = rawBass > avgBass * 1.3 && bassDelta > 20;
  prevBass = lerp(prevBass, rawBass, 0.25);

  const energy = clamp((rawBass + rawMid + rawHigh) / 500, 0, 1);

  if (isHardBeat) { beatPower = 1; flashAlpha = 0.15; }
  else if (isBeat) { beatPower = Math.max(beatPower, 0.5); flashAlpha = Math.max(flashAlpha, 0.04); }
  beatPower *= 0.9;
  flashAlpha *= 0.88;

  // Flash
  if (flashAlpha > 0.005) {
    ctx.fillStyle = hslString(hueBase % 360, 0.5, 0.8, flashAlpha);
    ctx.fillRect(0, 0, w, h);
  }

  // ===== LAUNCH ROCKETS on beats =====
  if (isBeat && rockets.length < MAX_ROCKETS) {
    const numRockets = isHardBeat ? 3 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2);
    for (let r = 0; r < numRockets; r++) {
      rockets.push(createRocket(w, h, cx, cy, hueBase % 360, energy));
    }
  }

  // Continuous slow launches when music is playing
  if (energy > 0.15 && Math.random() < energy * 0.08 && rockets.length < MAX_ROCKETS) {
    rockets.push(createRocket(w, h, cx, cy, hueBase % 360, energy));
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // ===== UPDATE & RENDER ROCKETS =====
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];

    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.vy += 20 * dt; // slight gravity on rocket

    // Trail
    r.trail.push({ x: r.x, y: r.y });
    while (r.trail.length > 15) r.trail.shift();

    // Draw rocket trail
    for (let t = 1; t < r.trail.length; t++) {
      const ratio = t / r.trail.length;
      ctx.strokeStyle = hslString(r.hue, 0.8, 0.8, ratio * 0.6);
      ctx.lineWidth = ratio * r.size;
      ctx.beginPath();
      ctx.moveTo(r.trail[t - 1].x, r.trail[t - 1].y);
      ctx.lineTo(r.trail[t].x, r.trail[t].y);
      ctx.stroke();
    }

    // Rocket head
    ctx.fillStyle = hslString(r.hue, 0.5, 0.95, 0.9);
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.size, 0, Math.PI * 2);
    ctx.fill();

    // Burst when reaching target height
    if (r.y <= r.targetY) {
      burstRocket(r, sparks);
      rockets.splice(i, 1);

      // Screen flash on burst
      flashAlpha = Math.max(flashAlpha, 0.08);
    }
  }

  // ===== UPDATE & RENDER SPARKS =====
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];

    s.vx *= s.drag;
    s.vy *= s.drag;
    s.vy += s.gravity * dt; // gravity pulls down

    s.x += s.vx * dt;
    s.y += s.vy * dt;

    s.life -= dt;
    if (s.life <= 0) { sparks.splice(i, 1); continue; }

    const lifeRatio = clamp(s.life / s.maxLife, 0, 1);
    const alpha = lifeRatio * lifeRatio; // quadratic fade

    // Trail
    s.trail.push({ x: s.x, y: s.y });
    while (s.trail.length > 6) s.trail.shift();

    // Draw trail
    for (let t = 1; t < s.trail.length; t++) {
      const tRatio = t / s.trail.length;
      ctx.strokeStyle = hslString(s.hue, 0.8, 0.6, tRatio * alpha * 0.3);
      ctx.lineWidth = tRatio * s.size * 0.7;
      ctx.beginPath();
      ctx.moveTo(s.trail[t - 1].x, s.trail[t - 1].y);
      ctx.lineTo(s.trail[t].x, s.trail[t].y);
      ctx.stroke();
    }

    // Glow
    ctx.fillStyle = hslString(s.hue, 0.9, 0.6, alpha * 0.15);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size + 4, 0, Math.PI * 2);
    ctx.fill();

    // Core
    const coreLightness = 0.5 + lifeRatio * 0.4;
    ctx.fillStyle = hslString(s.hue, 0.7, coreLightness, alpha);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size * lifeRatio, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cap sparks
  while (sparks.length > maxSparks) sparks.shift();

  ctx.restore();

  // ===== GROUND REFLECTION =====
  const groundY = h * 0.92;
  const reflGrad = ctx.createLinearGradient(0, groundY, 0, h);
  reflGrad.addColorStop(0, 'rgba(0,0,0,0)');
  reflGrad.addColorStop(1, hslString(hueBase % 360, 0.3, 0.1, 0.1 + beatPower * 0.1));
  ctx.fillStyle = reflGrad;
  ctx.fillRect(0, groundY, w, h - groundY);

  // Ground line
  ctx.strokeStyle = `rgba(255,255,255,${0.03 + beatPower * 0.05})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(w, groundY);
  ctx.stroke();
}

export function destroy() {
  rockets = [];
  sparks = [];
}
