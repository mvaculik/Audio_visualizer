// js/visualizers/particles.js — NEBULA: never settling, always morphing

import { lerp, map, clamp, hslString, distance, perlin, perlinOctaves } from '../utils.js';

const MAX_P = 700;
const MOBILE_P = 250;
const TRAIL_LEN = 12;
const NEBULA_BLOBS = 8;

// How many formations we cycle through
const NUM_FORMATIONS = 6;

let particles = [];
let nebulaBlobs = [];
let hueBase = 0;
let time = 0;

// Beat state
let rawBass = 0, rawMid = 0, rawHigh = 0;
let prevBass = 0;
let bassHistory = new Float32Array(12);
let bassIdx = 0;
let beatPower = 0;
let warpPower = 0;
let flashAlpha = 0;
let shakeX = 0, shakeY = 0;

// Formation state — continuously morphing
let formationPhase = 0;
let formationTimer = 0;       // time until next formation switch
let formationDuration = 4;    // seconds per formation
let formationBlend = 0;       // 0=transitioning, 1=locked in
let formationAngle = 0;
let prevFormation = 0;

// Chaos injection — prevents settling
let chaosTimer = 0;
let chaosBurst = 0;           // periodic chaos injection

function createParticle(cx, cy, i, total) {
  const angle = (Math.PI * 2 * i) / total + Math.random() * 0.3;
  const dist = 30 + Math.random() * 300;
  return {
    x: cx + Math.cos(angle) * dist,
    y: cy + Math.sin(angle) * dist,
    vx: (Math.random() - 0.5) * 3,
    vy: (Math.random() - 0.5) * 3,
    size: 1 + Math.random() * 2.5,
    baseSize: 1 + Math.random() * 2.5,
    hueOff: (i / total) * 360,
    alpha: 1,
    band: i % 3,
    trail: [],
    ember: 0,
  };
}

function createNebula(cx, cy) {
  return {
    x: cx + (Math.random() - 0.5) * 400,
    y: cy + (Math.random() - 0.5) * 400,
    radius: 60 + Math.random() * 120,
    hueOff: Math.random() * 360,
    alpha: 0,
    vx: (Math.random() - 0.5) * 0.5,
    vy: (Math.random() - 0.5) * 0.5,
  };
}

export function init(canvas, ctx) {
  const count = window.innerWidth < 768 ? MOBILE_P : MAX_P;
  const cx = canvas.width / (window.devicePixelRatio || 1) / 2;
  const cy = canvas.height / (window.devicePixelRatio || 1) / 2;

  particles = [];
  for (let i = 0; i < count; i++) {
    particles.push(createParticle(cx, cy, i, count));
  }

  nebulaBlobs = [];
  for (let i = 0; i < NEBULA_BLOBS; i++) {
    nebulaBlobs.push(createNebula(cx, cy));
  }

  rawBass = 0; rawMid = 0; rawHigh = 0;
  prevBass = 0; beatPower = 0; warpPower = 0;
  flashAlpha = 0; time = 0;
  bassHistory.fill(0);
  formationPhase = 0;
  formationTimer = 0;
  formationBlend = 0;
  chaosTimer = 0;
  chaosBurst = 0;
  prevFormation = 0;
}

export function render(freqData, timeData, dt, w, h, ctx) {
  if (!ctx) return;

  time += dt;
  hueBase += dt * 18;

  const cx = w / 2 + shakeX;
  const cy = h / 2 + shakeY;
  const minDim = Math.min(w, h);

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
  const isBeat = rawBass > avgBass * 1.12 && bassDelta > 10;
  const isHardBeat = rawBass > avgBass * 1.3 && bassDelta > 25;
  const isSupernova = rawBass > avgBass * 1.5 && bassDelta > 45;
  prevBass = lerp(prevBass, rawBass, 0.25);

  const energy = clamp((rawBass + rawMid + rawHigh) / 500, 0, 1);

  // ===== FORMATION AUTO-CYCLING =====
  // Formations change on timer OR on hard beats — never stays still
  formationTimer += dt;
  formationDuration = 3 + Math.random() * 2; // 3-5 seconds per formation

  let shouldSwitch = false;
  if (formationTimer > formationDuration) shouldSwitch = true;
  if (isSupernova) shouldSwitch = true;
  if (isHardBeat && formationTimer > 1.5) shouldSwitch = true; // hard beat after 1.5s minimum

  if (shouldSwitch) {
    prevFormation = formationPhase;
    formationPhase = (formationPhase + 1 + Math.floor(Math.random() * (NUM_FORMATIONS - 1))) % NUM_FORMATIONS;
    formationTimer = 0;
    formationBlend = 0;
  }

  // Formation blend: ramps up fast then holds
  formationBlend = lerp(formationBlend, 1, 0.04 + energy * 0.03);

  // ===== PERIODIC CHAOS INJECTION — prevents settling =====
  chaosTimer += dt;
  if (chaosTimer > 0.8 + Math.random() * 0.5) {
    chaosTimer = 0;
    chaosBurst = 0.3 + energy * 0.7; // stronger with more energy
  }
  chaosBurst *= 0.92;

  // ===== BEAT REACTIONS =====
  if (isSupernova) {
    warpPower = 1.0;
    beatPower = 1.0;
    flashAlpha = 0.35;
    shakeX = (Math.random() - 0.5) * 20;
    shakeY = (Math.random() - 0.5) * 20;
  } else if (isHardBeat) {
    warpPower = Math.max(warpPower, 0.6);
    beatPower = Math.max(beatPower, 0.7);
    flashAlpha = Math.max(flashAlpha, 0.12);
    shakeX = (Math.random() - 0.5) * 10;
    shakeY = (Math.random() - 0.5) * 10;
  } else if (isBeat) {
    beatPower = Math.max(beatPower, 0.4);
    flashAlpha = Math.max(flashAlpha, 0.04);
    shakeX += (Math.random() - 0.5) * 3;
    shakeY += (Math.random() - 0.5) * 3;
  }

  beatPower *= 0.9;
  warpPower *= 0.86;
  flashAlpha *= 0.84;
  shakeX *= 0.85;
  shakeY *= 0.85;

  formationAngle += dt * (0.3 + energy * 1.2 + beatPower * 2);

  // ===== FLASH =====
  if (flashAlpha > 0.005) {
    ctx.fillStyle = hslString(hueBase % 360, 0.6, 0.8, flashAlpha);
    ctx.fillRect(0, 0, w, h);
  }

  // ===== NEBULA CLOUDS =====
  for (const nb of nebulaBlobs) {
    const targetAlpha = map(energy, 0.1, 0.7, 0, 0.15) + beatPower * 0.05;
    nb.alpha = lerp(nb.alpha, targetAlpha, 0.04);
    nb.x += nb.vx + Math.sin(time * 0.3 + nb.hueOff) * 0.3;
    nb.y += nb.vy + Math.cos(time * 0.25 + nb.hueOff) * 0.3;

    if (nb.x < -200) nb.x = w + 200;
    if (nb.x > w + 200) nb.x = -200;
    if (nb.y < -200) nb.y = h + 200;
    if (nb.y > h + 200) nb.y = -200;

    if (nb.alpha > 0.003) {
      const nbHue = (hueBase + nb.hueOff) % 360;
      const r = nb.radius + beatPower * 50;
      const grad = ctx.createRadialGradient(nb.x, nb.y, 0, nb.x, nb.y, r);
      grad.addColorStop(0, hslString(nbHue, 0.7, 0.4, nb.alpha));
      grad.addColorStop(0.5, hslString((nbHue + 30) % 360, 0.5, 0.2, nb.alpha * 0.4));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(nb.x, nb.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ===== PARTICLES =====
  const bandVals = [rawBass, rawMid, rawHigh];

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const bv = bandVals[p.band];
    const dx = cx - p.x;
    const dy = cy - p.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / dist;
    const ny = dy / dist;
    const fi = i / particles.length;

    // ===== FORMATION TARGET =====
    let targetX, targetY;

    // Phase 0: EXPANDING RINGS (concentric, pulsing)
    // Phase 1: SPIRAL GALAXY (2 arms)
    // Phase 2: WAVE GRID (undulating)
    // Phase 3: FIGURE 8 / INFINITY
    // Phase 4: STAR BURST (radial lines)
    // Phase 5: CHAOS SCATTER (no formation, pure physics)

    const phase = formationPhase;

    if (phase === 0) {
      // Concentric rings — 5 rings, each pulsing differently
      const ring = Math.floor(fi * 5);
      const ringPos = (fi * 5) % 1;
      const ringR = (ring + 1) * minDim * 0.06 + map(bv, 0, 255, 0, 40) + Math.sin(time * 2 + ring) * 15;
      const ringAngle = ringPos * Math.PI * 2 + formationAngle * (ring % 2 === 0 ? 1 : -0.7);
      targetX = cx + Math.cos(ringAngle) * ringR;
      targetY = cy + Math.sin(ringAngle) * ringR;
    } else if (phase === 1) {
      // Spiral galaxy — 2 arms
      const arm = i % 2;
      const spiralR = fi * minDim * 0.4 + map(bv, 0, 255, -20, 40);
      const spiralAngle = fi * Math.PI * 10 + formationAngle * 1.5 + arm * Math.PI;
      targetX = cx + Math.cos(spiralAngle) * spiralR;
      targetY = cy + Math.sin(spiralAngle) * spiralR;
    } else if (phase === 2) {
      // Wave grid
      const cols = Math.ceil(Math.sqrt(particles.length));
      const gx = i % cols;
      const gy = Math.floor(i / cols);
      const spacing = minDim * 0.7 / cols;
      const wave = Math.sin(gx * 0.3 + time * 4) * map(bv, 0, 255, 5, 50);
      const wave2 = Math.cos(gy * 0.25 + time * 3) * map(rawMid, 0, 255, 5, 35);
      targetX = (w - minDim * 0.7) / 2 + gx * spacing + wave;
      targetY = (h - minDim * 0.7) / 2 + gy * spacing + wave2;
    } else if (phase === 3) {
      // Figure 8 / infinity
      const t8 = fi * Math.PI * 2 + formationAngle;
      const scale8 = minDim * 0.2 + map(bv, 0, 255, 0, 50);
      targetX = cx + Math.sin(t8) * scale8;
      targetY = cy + Math.sin(t8 * 2) * scale8 * 0.5;
    } else if (phase === 4) {
      // Star burst — radial lines from center
      const numLines = 8;
      const lineIdx = i % numLines;
      const linePos = Math.floor(i / numLines) / Math.ceil(particles.length / numLines);
      const lineAngle = (lineIdx / numLines) * Math.PI * 2 + formationAngle * 0.3;
      const lineR = linePos * minDim * 0.4 + map(bv, 0, 255, 0, 30);
      targetX = cx + Math.cos(lineAngle) * lineR;
      targetY = cy + Math.sin(lineAngle) * lineR;
    } else {
      // Phase 5: PURE CHAOS — target is a random noise-driven point
      const noiseX = perlinOctaves(fi * 3, time * 0.5, 2) * minDim * 0.4;
      const noiseY = perlinOctaves(fi * 3 + 100, time * 0.5, 2) * minDim * 0.4;
      targetX = cx + noiseX;
      targetY = cy + noiseY;
    }

    // ===== FORCES =====

    // Formation pull — stronger pull = snappier formations
    const formPull = 0.04 + energy * 0.03;
    const blendedPull = formPull * clamp(formationBlend, 0, 1);
    p.vx += (targetX - p.x) * blendedPull;
    p.vy += (targetY - p.y) * blendedPull;

    // Vortex tangential force (always present — keeps things moving)
    const tangentX = -ny;
    const tangentY = nx;
    const spiralForce = 0.15 + energy * 0.6 + beatPower * 0.5;
    p.vx += tangentX * spiralForce * 0.4;
    p.vy += tangentY * spiralForce * 0.4;

    // Frequency push (outward)
    const freqIdx = Math.floor(map(fi, 0, 1, 0, freqData.length - 1));
    const freqVal = freqData[freqIdx];
    const freqPush = map(freqVal, 0, 255, 0, 5);
    p.vx -= nx * freqPush * dt * 4;
    p.vy -= ny * freqPush * dt * 4;

    // Perlin flow field — organic, never-still movement
    const noiseScale = 0.002 + chaosBurst * 0.003;
    const noiseSpeed = 0.3 + energy * 0.5 + chaosBurst * 2;
    const noiseAngle = perlinOctaves(p.x * noiseScale, p.y * noiseScale + time * noiseSpeed, 2) * Math.PI * 4;
    const noiseStrength = 0.2 + chaosBurst * 1.5 + energy * 0.5;
    p.vx += Math.cos(noiseAngle) * noiseStrength;
    p.vy += Math.sin(noiseAngle) * noiseStrength;

    // WARP BURST
    if (warpPower > 0.05) {
      const warpForce = warpPower * map(dist, 0, minDim * 0.5, 18, 4);
      p.vx -= nx * warpForce;
      p.vy -= ny * warpForce;
      p.ember = Math.max(p.ember, warpPower);
    }

    // Beat explosion
    if (isHardBeat && dist < minDim * 0.5) {
      const blastForce = map(bassDelta, 25, 80, 5, 20);
      p.vx -= nx * blastForce * (0.5 + Math.random());
      p.vy -= ny * blastForce * (0.5 + Math.random());
    }

    // Chaos injection — random kicks
    if (chaosBurst > 0.1) {
      p.vx += (Math.random() - 0.5) * chaosBurst * 4;
      p.vy += (Math.random() - 0.5) * chaosBurst * 4;
    }

    // Damping — keep it loose so particles stay lively
    p.vx *= 0.965;
    p.vy *= 0.965;

    // Integrate
    p.x += p.vx * 60 * dt;
    p.y += p.vy * 60 * dt;

    // Soft boundary
    const margin = 30;
    if (p.x < margin) p.vx += 1;
    if (p.x > w - margin) p.vx -= 1;
    if (p.y < margin) p.vy += 1;
    if (p.y > h - margin) p.vy -= 1;

    // Hard wrap
    if (p.x < -60) p.x = w + 60;
    if (p.x > w + 60) p.x = -60;
    if (p.y < -60) p.y = h + 60;
    if (p.y > h + 60) p.y = -60;

    p.ember *= 0.94;

    // ===== SIZE =====
    const sizeBoost = map(bv, 0, 255, 0, 5) + p.ember * 4 + beatPower * 2;
    p.size = lerp(p.size, p.baseSize + sizeBoost, 0.3);

    // ===== TRAIL =====
    const speed = Math.hypot(p.vx, p.vy);
    p.trail.push({ x: p.x, y: p.y, size: p.size * 0.6 });
    const maxTrail = speed > 2 ? TRAIL_LEN : 6;
    while (p.trail.length > maxTrail) p.trail.shift();

    // ===== RENDER =====
    const hue = (hueBase + p.hueOff + bv * 0.3) % 360;
    const lightness = map(bv, 0, 255, 0.3, 0.75);
    const pAlpha = map(bv, 0, 255, 0.35, 1.0);

    // Trail
    for (let t = 0; t < p.trail.length; t++) {
      const tp = p.trail[t];
      const tRatio = t / p.trail.length;
      const tAlpha = tRatio * pAlpha * 0.2;
      const tSize = tp.size * tRatio;
      if (tSize < 0.3) continue;

      ctx.fillStyle = hslString(hue, 0.8, lightness, tAlpha);
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, tSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Warp streak
    if (p.ember > 0.12 && speed > 2) {
      const streakLen = speed * 3 * p.ember;
      const angle = Math.atan2(p.vy, p.vx);
      ctx.strokeStyle = hslString(hue, 0.9, 0.8, p.ember * 0.4);
      ctx.lineWidth = p.size * 0.7;
      ctx.beginPath();
      ctx.moveTo(p.x - Math.cos(angle) * streakLen, p.y - Math.sin(angle) * streakLen);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    // Outer glow
    ctx.fillStyle = hslString(hue, 0.9, lightness, pAlpha * 0.12);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size + 6 + p.ember * 8, 0, Math.PI * 2);
    ctx.fill();

    // Mid glow
    ctx.fillStyle = hslString(hue, 0.85, lightness + 0.1, pAlpha * 0.3);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size + 2 + p.ember * 3, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = hslString(hue, 0.7, lightness + 0.25, pAlpha);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();

    // Hot center
    if (bv > 140) {
      ctx.fillStyle = hslString(hue, 0.3, 0.95, map(bv, 140, 255, 0.1, 0.8));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ===== PLASMA CONNECTIONS =====
  const gridSize = 90;
  const grid = {};
  const connLimit = Math.min(particles.length, 350);
  for (let i = 0; i < connLimit; i++) {
    const p = particles[i];
    const key = `${Math.floor(p.x / gridSize)},${Math.floor(p.y / gridSize)}`;
    if (!grid[key]) grid[key] = [];
    grid[key].push(i);
  }

  const connDist = 65 + energy * 50 + beatPower * 30;
  const connAlpha = 0.03 + energy * 0.1 + beatPower * 0.08;

  for (const key in grid) {
    const cell = grid[key];
    const [gx, gy] = key.split(',').map(Number);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const neighbor = grid[`${gx + ox},${gy + oy}`];
        if (!neighbor) continue;
        for (const ai of cell) {
          for (const bi of neighbor) {
            if (bi <= ai) continue;
            const a = particles[ai], b = particles[bi];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d > connDist) continue;
            const la = map(d, 0, connDist, connAlpha, 0);
            const lh = (hueBase + (a.hueOff + b.hueOff) * 0.5) % 360;
            ctx.strokeStyle = hslString(lh, 0.7, 0.6, la);
            ctx.lineWidth = map(d, 0, connDist, 1.5, 0.3) + beatPower * 2;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
    }
  }

  ctx.restore();

  // ===== VORTEX CORE =====
  const coreSize = 12 + map(rawBass, 0, 255, 0, 45) + beatPower * 35;
  const coreHue = hueBase % 360;
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize);
  coreGrad.addColorStop(0, hslString(coreHue, 0.9, 0.9, 0.4 + beatPower * 0.4));
  coreGrad.addColorStop(0.3, hslString(coreHue, 0.8, 0.6, 0.2));
  coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, coreSize, 0, Math.PI * 2);
  ctx.fill();

  // Beat shockwave
  if (beatPower > 0.1) {
    const swR = minDim * 0.1 + (1 - beatPower) * minDim * 0.4;
    ctx.strokeStyle = hslString(coreHue, 0.7, 0.7, beatPower * 0.35);
    ctx.lineWidth = 2 + beatPower * 5;
    ctx.beginPath();
    ctx.arc(cx, cy, swR, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function destroy() {
  particles = [];
  nebulaBlobs = [];
}
