// js/visualizers/particles.js — FIREWORKS: instant beat-synced bursts, always on rhythm

import { lerp, map, clamp, hslString, perlin } from '../utils.js';

const MAX_SPARKS = 2000;
const MOBILE_SPARKS = 800;

let sparks = [];
let hueBase = 0;
let time = 0;
let maxSparks = MAX_SPARKS;

// Beat state
let rawBass = 0, rawMid = 0, rawHigh = 0;
let prevBass = 0;
let bassHistory = new Float32Array(16);
let bassIdx = 0;
let beatPower = 0;
let flashAlpha = 0;

// Burst types
function burstCircle(x, y, count, speed, hue, sparksArr) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const spd = speed * (0.7 + Math.random() * 0.6);
    sparksArr.push(makeSpark(x, y, Math.cos(angle) * spd, Math.sin(angle) * spd,
      hue + Math.random() * 20, 1.5 + Math.random() * 1, 1.5 + Math.random() * 2, 40, 0.97));
  }
}

function burstRing(x, y, count, radius, hue, sparksArr) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const spd = radius * (0.95 + Math.random() * 0.1);
    sparksArr.push(makeSpark(x, y, Math.cos(angle) * spd, Math.sin(angle) * spd,
      hue, 0.8 + Math.random() * 0.4, 2 + Math.random(), 25, 0.98));
  }
}

function burstPalm(x, y, count, speed, hue, sparksArr) {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.7;
    const spd = speed * (0.4 + Math.random() * 1);
    sparksArr.push(makeSpark(x, y, Math.cos(angle) * spd, Math.sin(angle) * spd,
      hue + (i % 2 === 0 ? 0 : 100), 2.5 + Math.random() * 1.5, 1.5 + Math.random(), 65, 0.96));
  }
}

function burstCrossette(x, y, count, speed, hue, sparksArr) {
  const arms = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < count; i++) {
    const arm = i % arms;
    const mainAngle = (Math.PI * 2 * arm) / arms;
    const subAngle = mainAngle + (Math.random() - 0.5) * 0.4;
    const spd = speed * (0.5 + Math.random() * 0.7);
    sparksArr.push(makeSpark(x, y, Math.cos(subAngle) * spd, Math.sin(subAngle) * spd,
      hue + arm * 35, 1.2 + Math.random() * 0.8, 1.5 + Math.random(), 35, 0.97));
  }
}

function burstWillow(x, y, count, speed, hue, sparksArr) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
    const spd = speed * (0.2 + Math.random() * 0.4);
    sparksArr.push(makeSpark(x, y, Math.cos(angle) * spd, Math.sin(angle) * spd,
      hue + Math.random() * 15, 3.5 + Math.random() * 2, 1 + Math.random(), 20, 0.992));
  }
}

function burstHeartbeat(x, y, count, size, hue, sparksArr) {
  // Heart shape burst
  for (let i = 0; i < count; i++) {
    const t = (Math.PI * 2 * i) / count;
    const hx = 16 * Math.pow(Math.sin(t), 3);
    const hy = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
    const spd = size * 0.07;
    sparksArr.push(makeSpark(x, y, hx * spd + (Math.random()-0.5)*10, hy * spd + (Math.random()-0.5)*10,
      hue, 2 + Math.random(), 1.5 + Math.random(), 15, 0.985));
  }
}

function burstSpiral(x, y, count, speed, hue, sparksArr) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 6;
    const r = (i / count) * speed;
    sparksArr.push(makeSpark(x, y, Math.cos(angle) * r, Math.sin(angle) * r,
      hue + (i / count) * 60, 1.5 + Math.random(), 1.5 + Math.random(), 30, 0.975));
  }
}

function makeSpark(x, y, vx, vy, hue, life, size, gravity, drag) {
  return { x, y, vx, vy, life, maxLife: life, size, hue, gravity, drag, trail: [] };
}

const BURST_TYPES = [burstCircle, burstRing, burstPalm, burstCrossette, burstWillow, burstHeartbeat, burstSpiral];

export function init(canvas, ctx) {
  maxSparks = window.innerWidth < 768 ? MOBILE_SPARKS : MAX_SPARKS;
  sparks = [];
  rawBass = 0; rawMid = 0; rawHigh = 0;
  prevBass = 0; beatPower = 0; flashAlpha = 0;
  bassHistory.fill(0);
  time = 0; hueBase = 0;
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

  bassHistory[bassIdx % 16] = rawBass;
  bassIdx++;
  let avgBass = 0;
  for (let i = 0; i < 16; i++) avgBass += bassHistory[i];
  avgBass /= 16;

  const bassDelta = rawBass - prevBass;
  const isBeat = rawBass > avgBass * 1.08 && bassDelta > 5;
  const isHardBeat = rawBass > avgBass * 1.25 && bassDelta > 18;
  const isMegaBeat = rawBass > avgBass * 1.5 && bassDelta > 35;
  prevBass = lerp(prevBass, rawBass, 0.25);

  const energy = clamp((rawBass + rawMid + rawHigh) / 500, 0, 1);

  if (isMegaBeat) { beatPower = 1; flashAlpha = 0.25; }
  else if (isHardBeat) { beatPower = Math.max(beatPower, 0.7); flashAlpha = Math.max(flashAlpha, 0.12); }
  else if (isBeat) { beatPower = Math.max(beatPower, 0.4); flashAlpha = Math.max(flashAlpha, 0.04); }
  beatPower *= 0.88;
  flashAlpha *= 0.85;

  // Flash
  if (flashAlpha > 0.005) {
    ctx.fillStyle = hslString(hueBase % 360, 0.6, 0.8, flashAlpha);
    ctx.fillRect(0, 0, w, h);
  }

  // ===== INSTANT BURSTS ON BEAT — always on rhythm =====
  if (isBeat) {
    const burstHue = (hueBase + Math.random() * 80) % 360;
    const speed = 80 + energy * 150 + beatPower * 80;
    const count = Math.floor(30 + energy * 50 + (isHardBeat ? 40 : 0));

    if (isMegaBeat) {
      // MEGA: multiple bursts across screen
      const numBursts = 3 + Math.floor(Math.random() * 3);
      for (let b = 0; b < numBursts; b++) {
        const bx = w * 0.1 + Math.random() * w * 0.8;
        const by = h * 0.15 + Math.random() * h * 0.5;
        const type = BURST_TYPES[Math.floor(Math.random() * BURST_TYPES.length)];
        type(bx, by, count, speed * 1.3, burstHue + b * 50, sparks);
      }
    } else if (isHardBeat) {
      // HARD: 1-2 big bursts
      const numBursts = 1 + Math.floor(Math.random() * 2);
      for (let b = 0; b < numBursts; b++) {
        const bx = w * 0.15 + Math.random() * w * 0.7;
        const by = h * 0.15 + Math.random() * h * 0.45;
        const type = BURST_TYPES[Math.floor(Math.random() * BURST_TYPES.length)];
        type(bx, by, count, speed, burstHue + b * 60, sparks);
      }
    } else {
      // NORMAL beat: single smaller burst
      const bx = w * 0.2 + Math.random() * w * 0.6;
      const by = h * 0.2 + Math.random() * h * 0.4;
      const type = BURST_TYPES[Math.floor(Math.random() * BURST_TYPES.length)];
      type(bx, by, Math.floor(count * 0.6), speed * 0.7, burstHue, sparks);
    }
  }

  // ===== UPDATE & RENDER SPARKS =====
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];

    s.vx *= s.drag;
    s.vy *= s.drag;
    s.vy += s.gravity * dt;

    s.x += s.vx * dt;
    s.y += s.vy * dt;

    s.life -= dt;
    if (s.life <= 0) { sparks.splice(i, 1); continue; }

    const lifeRatio = clamp(s.life / s.maxLife, 0, 1);
    const alpha = lifeRatio * lifeRatio;

    // Trail
    s.trail.push({ x: s.x, y: s.y });
    while (s.trail.length > 8) s.trail.shift();

    for (let t = 1; t < s.trail.length; t++) {
      const tR = t / s.trail.length;
      ctx.strokeStyle = hslString(s.hue, 0.8, 0.6, tR * alpha * 0.25);
      ctx.lineWidth = tR * s.size * 0.6;
      ctx.beginPath();
      ctx.moveTo(s.trail[t - 1].x, s.trail[t - 1].y);
      ctx.lineTo(s.trail[t].x, s.trail[t].y);
      ctx.stroke();
    }

    // Glow
    ctx.fillStyle = hslString(s.hue, 0.9, 0.6, alpha * 0.12);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size + 4, 0, Math.PI * 2);
    ctx.fill();

    // Core — brighter when young
    ctx.fillStyle = hslString(s.hue, 0.6, 0.5 + lifeRatio * 0.4, alpha);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size * lifeRatio, 0, Math.PI * 2);
    ctx.fill();
  }

  while (sparks.length > maxSparks) sparks.shift();

  ctx.restore();

  // ===== GROUND REFLECTION =====
  const groundY = h * 0.9;
  const reflGrad = ctx.createLinearGradient(0, groundY, 0, h);
  reflGrad.addColorStop(0, 'rgba(0,0,0,0)');
  reflGrad.addColorStop(1, hslString(hueBase % 360, 0.3, 0.1, 0.08 + beatPower * 0.1));
  ctx.fillStyle = reflGrad;
  ctx.fillRect(0, groundY, w, h - groundY);

  ctx.strokeStyle = `rgba(255,255,255,${0.02 + beatPower * 0.04})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(w, groundY);
  ctx.stroke();
}

export function destroy() {
  sparks = [];
}
