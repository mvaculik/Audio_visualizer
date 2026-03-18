// js/visualizers/particles.js — Spectral-reactive particles: formations driven by audio character

import { lerp, map, clamp, hslString, distance, perlin, perlinOctaves } from '../utils.js';

const MAX_P = 600;
const MOBILE_P = 200;
const TRAIL_LEN = 10;
const NEBULA_BLOBS = 6;

// Formation types driven by spectral analysis
const FORM = {
  PULSE_RING: 0,   // Heavy bass → concentric pulsing rings
  SPIRAL: 1,       // Melodic mids → flowing spiral
  STAR: 2,         // Hi-hats/percussion → star burst
  WAVE: 3,         // Balanced mix → wave grid
  INFINITY: 4,     // Tonal/sustained → figure 8
  CONVERGE: 5,     // Quiet → particles converge to center point
};

let particles = [];
let nebulaBlobs = [];
let hueBase = 0;
let time = 0;

// Audio state
let rawBass = 0, rawMid = 0, rawHigh = 0;
let prevBass = 0;
let bassHistory = new Float32Array(30);
let bassIdx = 0;
let beatPower = 0;
let warpPower = 0;
let flashAlpha = 0;
let shakeX = 0, shakeY = 0;

// Spectral character detection
let spectralDominance = FORM.PULSE_RING; // current detected formation
let prevDominance = FORM.PULSE_RING;
let formationBlend = 1;
let formationAngle = 0;
let dominanceSmooth = [0, 0, 0]; // [bass, mid, high] smoothed
let totalEnergySmooth = 0;
let zeroCrossingRate = 0;

// Drop detection state
let energyHistory = new Float32Array(60); // ~1 second at 60fps
let energyHistIdx = 0;
let isInDrop = false;
let dropCooldown = 0;
let dropExplosionPower = 0;

// Fireworks state for drops
let fireworks = [];
let fireworkSparks = [];

function createParticle(cx, cy, i, total) {
  const angle = (Math.PI * 2 * i) / total + Math.random() * 0.3;
  const dist = 30 + Math.random() * 250;
  return {
    x: cx + Math.cos(angle) * dist,
    y: cy + Math.sin(angle) * dist,
    vx: (Math.random() - 0.5) * 2,
    vy: (Math.random() - 0.5) * 2,
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
    radius: 60 + Math.random() * 100,
    hueOff: Math.random() * 360,
    alpha: 0,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
  };
}

// ===== SPECTRAL ANALYSIS → FORMATION DETECTION =====
function detectFormation(freqData, energy) {
  const bassRatio = dominanceSmooth[0] / (totalEnergySmooth + 1);
  const midRatio = dominanceSmooth[1] / (totalEnergySmooth + 1);
  const highRatio = dominanceSmooth[2] / (totalEnergySmooth + 1);

  // Very quiet → converge
  if (totalEnergySmooth < 25) return FORM.CONVERGE;

  // Heavy bass dominant (>50% of energy) → pulsing rings
  if (bassRatio > 0.50) return FORM.PULSE_RING;

  // High frequencies dominant (>35%) → star burst (hi-hats, percussion)
  if (highRatio > 0.35) return FORM.STAR;

  // Mid frequencies dominant (>45%) → spiral (melody, vocals)
  if (midRatio > 0.45) return FORM.SPIRAL;

  // Balanced energy → wave grid
  if (bassRatio > 0.25 && midRatio > 0.25 && highRatio > 0.2) return FORM.WAVE;

  // Default: infinity/sustained tonal
  return FORM.INFINITY;
}

// ===== DROP DETECTION =====
function detectDrop(energy, rawBassNow) {
  energyHistory[energyHistIdx % 60] = energy;
  energyHistIdx++;

  if (dropCooldown > 0) { dropCooldown -= 1 / 60; return false; }

  // Calculate recent vs older energy
  let recentEnergy = 0, olderEnergy = 0;
  for (let i = 0; i < 60; i++) {
    const idx = (energyHistIdx - 1 - i + 600) % 60;
    if (i < 8) recentEnergy += energyHistory[idx];   // last ~130ms
    else olderEnergy += energyHistory[idx];            // older 870ms
  }
  recentEnergy /= 8;
  olderEnergy /= 52;

  // Drop = sudden energy spike after calm period
  // OR silence (near-zero) followed by big energy
  const isSilenceToDrop = olderEnergy < 15 && recentEnergy > 50;
  const isBuildToDrop = recentEnergy > olderEnergy * 2.2 && recentEnergy > 40 && rawBassNow > 100;

  if (isSilenceToDrop || isBuildToDrop) {
    dropCooldown = 4; // 4 second cooldown
    return true;
  }
  return false;
}

// ===== FIREWORKS =====
function launchFirework(w, h) {
  const sx = w * 0.15 + Math.random() * w * 0.7;
  const burstY = h * 0.15 + Math.random() * h * 0.35;
  fireworks.push({
    x: sx, y: h + 10,
    targetY: burstY,
    vx: (Math.random() - 0.5) * 2,
    vy: -(12 + Math.random() * 6),
    hue: Math.random() * 360,
    alpha: 1,
    trail: [],
  });
}

function burstFirework(fw) {
  const count = 40 + Math.floor(Math.random() * 30);
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
    const speed = 3 + Math.random() * 8;
    fireworkSparks.push({
      x: fw.x, y: fw.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      hue: fw.hue + (Math.random() - 0.5) * 40,
      size: 1.5 + Math.random() * 2,
      life: 1.0,
      decay: 0.012 + Math.random() * 0.015,
      gravity: 0.06 + Math.random() * 0.04,
    });
  }
}

export function destroy() {
  particles = [];
  nebulaBlobs = [];
  fireworks = [];
  fireworkSparks = [];
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
  energyHistory.fill(0);
  energyHistIdx = 0;
  dominanceSmooth = [0, 0, 0];
  totalEnergySmooth = 0;
  spectralDominance = FORM.PULSE_RING;
  prevDominance = FORM.PULSE_RING;
  formationBlend = 1;
  formationAngle = 0;
  isInDrop = false;
  dropCooldown = 0;
  dropExplosionPower = 0;
  fireworks = [];
  fireworkSparks = [];
}

export function render(freqData, timeData, dt, w, h, ctx) {
  if (!ctx) return;

  time += dt;
  hueBase += dt * 18;

  const cx = w / 2 + shakeX;
  const cy = h / 2 + shakeY;
  const minDim = Math.min(w, h);

  // ===== AUDIO ANALYSIS =====
  const bassEnd = Math.floor(freqData.length * 0.1);
  const midEnd = Math.floor(freqData.length * 0.45);
  let bSum = 0, mSum = 0, hSum = 0;

  for (let i = 0; i < freqData.length; i++) {
    if (i < bassEnd) bSum += freqData[i];
    else if (i < midEnd) mSum += freqData[i];
    else hSum += freqData[i];
  }

  const bAvg = bSum / Math.max(1, bassEnd);
  const mAvg = mSum / Math.max(1, midEnd - bassEnd);
  const hAvg = hSum / Math.max(1, freqData.length - midEnd);

  rawBass = lerp(rawBass, bAvg, 0.5);
  rawMid = lerp(rawMid, mAvg, 0.4);
  rawHigh = lerp(rawHigh, hAvg, 0.45);

  // Smooth spectral dominance
  dominanceSmooth[0] = lerp(dominanceSmooth[0], rawBass, 0.08);
  dominanceSmooth[1] = lerp(dominanceSmooth[1], rawMid, 0.08);
  dominanceSmooth[2] = lerp(dominanceSmooth[2], rawHigh, 0.08);
  totalEnergySmooth = dominanceSmooth[0] + dominanceSmooth[1] + dominanceSmooth[2];

  // Zero-crossing rate from time domain
  if (timeData) {
    let crossings = 0;
    for (let i = 1; i < timeData.length; i++) {
      if ((timeData[i] > 128) !== (timeData[i - 1] > 128)) crossings++;
    }
    zeroCrossingRate = lerp(zeroCrossingRate, crossings / timeData.length, 0.1);
  }

  // Bass beat detection
  bassHistory[bassIdx % 30] = rawBass;
  bassIdx++;
  let avgBass = 0;
  for (let i = 0; i < 30; i++) avgBass += bassHistory[i];
  avgBass /= 30;

  const bassDelta = rawBass - prevBass;
  const isBeat = rawBass > avgBass * 1.12 && bassDelta > 8;
  const isHardBeat = rawBass > avgBass * 1.3 && bassDelta > 20;
  prevBass = lerp(prevBass, rawBass, 0.25);

  const energy = clamp((rawBass + rawMid + rawHigh) / 500, 0, 1);

  // ===== SPECTRAL FORMATION DETECTION =====
  const detectedForm = detectFormation(freqData, energy);
  if (detectedForm !== spectralDominance) {
    prevDominance = spectralDominance;
    spectralDominance = detectedForm;
    formationBlend = 0; // start blending to new formation
  }
  formationBlend = lerp(formationBlend, 1, 0.025 + energy * 0.02);

  // ===== DROP DETECTION =====
  const dropDetected = detectDrop(energy, rawBass);
  if (dropDetected) {
    isInDrop = true;
    dropExplosionPower = 1.0;
    warpPower = 1.0;
    beatPower = 1.0;
    flashAlpha = 0.1;
    shakeX = (Math.random() - 0.5) * 12;
    shakeY = (Math.random() - 0.5) * 12;

    // Launch fireworks on drop
    const numRockets = 4 + Math.floor(Math.random() * 4);
    for (let r = 0; r < numRockets; r++) {
      launchFirework(w, h);
    }
  }
  dropExplosionPower *= 0.94;
  if (dropExplosionPower < 0.01) isInDrop = false;

  // ===== BEAT REACTIONS (subtle, no timer-based chaos) =====
  if (isHardBeat) {
    warpPower = Math.max(warpPower, 0.5);
    beatPower = Math.max(beatPower, 0.6);
    flashAlpha = Math.max(flashAlpha, 0.04);
    shakeX = (Math.random() - 0.5) * 3;
    shakeY = (Math.random() - 0.5) * 3;
  } else if (isBeat) {
    beatPower = Math.max(beatPower, 0.35);
    flashAlpha = Math.max(flashAlpha, 0.015);
    shakeX += (Math.random() - 0.5) * 1;
    shakeY += (Math.random() - 0.5) * 1;
  }

  beatPower *= 0.92;
  warpPower *= 0.88;
  flashAlpha *= 0.91;
  shakeX *= 0.87;
  shakeY *= 0.87;

  formationAngle += dt * (0.25 + energy * 0.8 + beatPower * 1.5);

  // ===== FLASH =====
  if (flashAlpha > 0.003) {
    ctx.fillStyle = hslString(hueBase % 360, 0.5, 0.7, flashAlpha);
    ctx.fillRect(0, 0, w, h);
  }

  // ===== NEBULA CLOUDS =====
  for (const nb of nebulaBlobs) {
    const targetAlpha = map(energy, 0.1, 0.7, 0, 0.12) + beatPower * 0.04;
    nb.alpha = lerp(nb.alpha, targetAlpha, 0.04);
    nb.x += nb.vx + Math.sin(time * 0.3 + nb.hueOff) * 0.3;
    nb.y += nb.vy + Math.cos(time * 0.25 + nb.hueOff) * 0.3;

    if (nb.x < -200) nb.x = w + 200;
    if (nb.x > w + 200) nb.x = -200;
    if (nb.y < -200) nb.y = h + 200;
    if (nb.y > h + 200) nb.y = -200;

    if (nb.alpha > 0.003) {
      const nbHue = (hueBase + nb.hueOff) % 360;
      const r = nb.radius + beatPower * 40;
      const grad = ctx.createRadialGradient(nb.x, nb.y, 0, nb.x, nb.y, r);
      grad.addColorStop(0, hslString(nbHue, 0.6, 0.35, nb.alpha));
      grad.addColorStop(0.5, hslString((nbHue + 30) % 360, 0.4, 0.2, nb.alpha * 0.3));
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

    // ===== FORMATION TARGET based on spectral analysis =====
    let targetX, targetY;
    const phase = spectralDominance;

    if (phase === FORM.PULSE_RING) {
      // Heavy bass → concentric pulsing rings
      const ring = Math.floor(fi * 5);
      const ringPos = (fi * 5) % 1;
      const bassScale = map(rawBass, 0, 255, 0, 50);
      const ringR = (ring + 1) * minDim * 0.055 + bassScale + Math.sin(time * 2.5 + ring * 1.3) * 12;
      const ringAngle = ringPos * Math.PI * 2 + formationAngle * (ring % 2 === 0 ? 1 : -0.6);
      targetX = cx + Math.cos(ringAngle) * ringR;
      targetY = cy + Math.sin(ringAngle) * ringR;
    } else if (phase === FORM.SPIRAL) {
      // Melodic → flowing spiral arms
      const arm = i % 3;
      const spiralR = fi * minDim * 0.38 + map(bv, 0, 255, -15, 30);
      const spiralAngle = fi * Math.PI * 8 + formationAngle * 1.2 + arm * (Math.PI * 2 / 3);
      targetX = cx + Math.cos(spiralAngle) * spiralR;
      targetY = cy + Math.sin(spiralAngle) * spiralR;
    } else if (phase === FORM.STAR) {
      // Percussion → star burst lines
      const numLines = 12;
      const lineIdx = i % numLines;
      const linePos = Math.floor(i / numLines) / Math.ceil(particles.length / numLines);
      const lineAngle = (lineIdx / numLines) * Math.PI * 2 + formationAngle * 0.25;
      const lineR = linePos * minDim * 0.38 + map(bv, 0, 255, 0, 25);
      targetX = cx + Math.cos(lineAngle) * lineR;
      targetY = cy + Math.sin(lineAngle) * lineR;
    } else if (phase === FORM.WAVE) {
      // Balanced → wave grid
      const cols = Math.ceil(Math.sqrt(particles.length));
      const gx = i % cols;
      const gy = Math.floor(i / cols);
      const spacing = minDim * 0.65 / cols;
      const wave = Math.sin(gx * 0.3 + time * 3) * map(bv, 0, 255, 5, 40);
      const wave2 = Math.cos(gy * 0.25 + time * 2.5) * map(rawMid, 0, 255, 5, 30);
      targetX = (w - minDim * 0.65) / 2 + gx * spacing + wave;
      targetY = (h - minDim * 0.65) / 2 + gy * spacing + wave2;
    } else if (phase === FORM.INFINITY) {
      // Sustained tonal → figure 8
      const t8 = fi * Math.PI * 2 + formationAngle * 0.8;
      const scale8 = minDim * 0.18 + map(bv, 0, 255, 0, 40);
      targetX = cx + Math.sin(t8) * scale8;
      targetY = cy + Math.sin(t8 * 2) * scale8 * 0.5;
    } else {
      // CONVERGE → all particles to center
      const convergeR = 5 + fi * 20 + Math.sin(time + fi * 10) * 3;
      const convergeAngle = fi * Math.PI * 2 * 5 + time * 0.5;
      targetX = cx + Math.cos(convergeAngle) * convergeR;
      targetY = cy + Math.sin(convergeAngle) * convergeR;
    }

    // ===== FORCES =====

    // Formation pull — smooth, consistent
    const formPull = 0.03 + energy * 0.025;
    const blendedPull = formPull * clamp(formationBlend, 0.1, 1);
    p.vx += (targetX - p.x) * blendedPull;
    p.vy += (targetY - p.y) * blendedPull;

    // Gentle vortex tangential (keeps movement organic)
    const tangentX = -ny;
    const tangentY = nx;
    const spiralForce = 0.08 + energy * 0.3 + beatPower * 0.3;
    p.vx += tangentX * spiralForce * 0.3;
    p.vy += tangentY * spiralForce * 0.3;

    // Frequency-driven outward push
    const freqIdx = Math.floor(map(fi, 0, 1, 0, freqData.length - 1));
    const freqVal = freqData[freqIdx];
    const freqPush = map(freqVal, 0, 255, 0, 3);
    p.vx -= nx * freqPush * dt * 3;
    p.vy -= ny * freqPush * dt * 3;

    // Perlin flow field (organic movement, no chaos timer)
    const noiseScale = 0.002;
    const noiseSpeed = 0.2 + energy * 0.3;
    const noiseAngle = perlinOctaves(p.x * noiseScale, p.y * noiseScale + time * noiseSpeed, 2) * Math.PI * 3;
    const noiseStrength = 0.15 + energy * 0.3;
    p.vx += Math.cos(noiseAngle) * noiseStrength;
    p.vy += Math.sin(noiseAngle) * noiseStrength;

    // DROP EXPLOSION — only on real drops
    if (dropExplosionPower > 0.05) {
      const warpForce = dropExplosionPower * map(dist, 0, minDim * 0.5, 15, 3);
      p.vx -= nx * warpForce;
      p.vy -= ny * warpForce;
      p.ember = Math.max(p.ember, dropExplosionPower);
    }

    // Beat pulse (gentle, keeps formation mostly intact)
    if (isHardBeat && dist < minDim * 0.4) {
      const blastForce = map(bassDelta, 20, 60, 2, 8);
      p.vx -= nx * blastForce * (0.5 + Math.random() * 0.5);
      p.vy -= ny * blastForce * (0.5 + Math.random() * 0.5);
    }

    // Damping
    p.vx *= 0.96;
    p.vy *= 0.96;

    // Integrate
    p.x += p.vx * 60 * dt;
    p.y += p.vy * 60 * dt;

    // Soft boundary
    const margin = 30;
    if (p.x < margin) p.vx += 0.8;
    if (p.x > w - margin) p.vx -= 0.8;
    if (p.y < margin) p.vy += 0.8;
    if (p.y > h - margin) p.vy -= 0.8;

    // Hard wrap
    if (p.x < -60) p.x = w + 60;
    if (p.x > w + 60) p.x = -60;
    if (p.y < -60) p.y = h + 60;
    if (p.y > h + 60) p.y = -60;

    p.ember *= 0.94;

    // ===== SIZE =====
    const sizeBoost = map(bv, 0, 255, 0, 4) + p.ember * 3 + beatPower * 1.5;
    p.size = lerp(p.size, p.baseSize + sizeBoost, 0.3);

    // ===== TRAIL =====
    const speed = Math.hypot(p.vx, p.vy);
    p.trail.push({ x: p.x, y: p.y, size: p.size * 0.5 });
    const maxTrail = speed > 2 ? TRAIL_LEN : 5;
    while (p.trail.length > maxTrail) p.trail.shift();

    // ===== RENDER =====
    const hue = (hueBase + p.hueOff + bv * 0.3) % 360;
    const lightness = map(bv, 0, 255, 0.3, 0.7);
    const pAlpha = map(bv, 0, 255, 0.3, 0.95);

    // Trail
    for (let t = 0; t < p.trail.length; t++) {
      const tp = p.trail[t];
      const tRatio = t / p.trail.length;
      const tAlpha = tRatio * pAlpha * 0.18;
      const tSize = tp.size * tRatio;
      if (tSize < 0.3) continue;
      ctx.fillStyle = hslString(hue, 0.8, lightness, tAlpha);
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, tSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ember streak (drop only)
    if (p.ember > 0.12 && speed > 2) {
      const streakLen = speed * 3 * p.ember;
      const angle = Math.atan2(p.vy, p.vx);
      ctx.strokeStyle = hslString(hue, 0.9, 0.8, p.ember * 0.35);
      ctx.lineWidth = p.size * 0.6;
      ctx.beginPath();
      ctx.moveTo(p.x - Math.cos(angle) * streakLen, p.y - Math.sin(angle) * streakLen);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    // Outer glow
    ctx.fillStyle = hslString(hue, 0.85, lightness, pAlpha * 0.1);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size + 5 + p.ember * 6, 0, Math.PI * 2);
    ctx.fill();

    // Mid glow
    ctx.fillStyle = hslString(hue, 0.8, lightness + 0.1, pAlpha * 0.25);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size + 1.5 + p.ember * 2, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = hslString(hue, 0.6, lightness + 0.25, pAlpha);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();

    // Hot center on loud frequencies
    if (bv > 130) {
      ctx.fillStyle = hslString(hue, 0.2, 0.95, map(bv, 130, 255, 0.1, 0.7));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ===== PLASMA CONNECTIONS =====
  const gridSize = 85;
  const grid = {};
  const connLimit = Math.min(particles.length, 300);
  for (let i = 0; i < connLimit; i++) {
    const p = particles[i];
    const key = `${Math.floor(p.x / gridSize)},${Math.floor(p.y / gridSize)}`;
    if (!grid[key]) grid[key] = [];
    grid[key].push(i);
  }

  const connDist = 55 + energy * 40 + beatPower * 25;
  const connAlpha = 0.025 + energy * 0.08 + beatPower * 0.06;

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
            ctx.strokeStyle = hslString(lh, 0.6, 0.5, la);
            ctx.lineWidth = map(d, 0, connDist, 1.2, 0.3) + beatPower * 1.5;
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

  // ===== FIREWORKS (only on drops) =====
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Update & render rockets
  for (let i = fireworks.length - 1; i >= 0; i--) {
    const fw = fireworks[i];
    fw.trail.push({ x: fw.x, y: fw.y });
    if (fw.trail.length > 15) fw.trail.shift();

    fw.vy += 0.15; // slight gravity
    fw.x += fw.vx;
    fw.y += fw.vy;

    // Render trail
    for (let t = 0; t < fw.trail.length; t++) {
      const tp = fw.trail[t];
      const tAlpha = (t / fw.trail.length) * 0.5;
      ctx.fillStyle = hslString(fw.hue, 0.9, 0.8, tAlpha);
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rocket head
    ctx.fillStyle = hslString(fw.hue, 0.8, 0.95, 0.9);
    ctx.beginPath();
    ctx.arc(fw.x, fw.y, 3, 0, Math.PI * 2);
    ctx.fill();

    // Burst when reaching target
    if (fw.y <= fw.targetY || fw.vy >= 0) {
      burstFirework(fw);
      fireworks.splice(i, 1);
      flashAlpha = Math.max(flashAlpha, 0.06);
    }
  }

  // Update & render sparks
  for (let i = fireworkSparks.length - 1; i >= 0; i--) {
    const sp = fireworkSparks[i];
    sp.vy += sp.gravity;
    sp.vx *= 0.98;
    sp.vy *= 0.98;
    sp.x += sp.vx;
    sp.y += sp.vy;
    sp.life -= sp.decay;

    if (sp.life <= 0) {
      fireworkSparks.splice(i, 1);
      continue;
    }

    const spAlpha = sp.life * 0.8;
    const spSize = sp.size * sp.life;

    // Glow
    ctx.fillStyle = hslString(sp.hue, 0.8, 0.7, spAlpha * 0.3);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, spSize + 3, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = hslString(sp.hue, 0.7, 0.85, spAlpha);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, spSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // ===== VORTEX CORE =====
  const coreSize = 10 + map(rawBass, 0, 255, 0, 35) + beatPower * 25;
  const coreHue = hueBase % 360;
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize);
  coreGrad.addColorStop(0, hslString(coreHue, 0.8, 0.85, 0.35 + beatPower * 0.3));
  coreGrad.addColorStop(0.3, hslString(coreHue, 0.7, 0.5, 0.15));
  coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, coreSize, 0, Math.PI * 2);
  ctx.fill();

  // Beat shockwave
  if (beatPower > 0.1) {
    const swR = minDim * 0.08 + (1 - beatPower) * minDim * 0.35;
    ctx.strokeStyle = hslString(coreHue, 0.6, 0.6, beatPower * 0.25);
    ctx.lineWidth = 1.5 + beatPower * 3;
    ctx.beginPath();
    ctx.arc(cx, cy, swR, 0, Math.PI * 2);
    ctx.stroke();
  }
}
