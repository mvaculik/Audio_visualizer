// js/visualizers/particles.js — NEBULA: warp bursts, vortex, plasma connections, trails

import { lerp, map, clamp, hslString, distance, perlin, perlinOctaves } from '../utils.js';

const MAX_P = 700;
const MOBILE_P = 250;
const TRAIL_LEN = 12;
const NEBULA_BLOBS = 8;

let particles = [];
let nebulaBlobs = [];
let hueBase = 0;
let time = 0;

// Beat state
let rawBass = 0, rawMid = 0, rawHigh = 0;
let prevBass = 0;
let bassHistory = new Float32Array(12);
let bassIdx = 0;
let beatPower = 0;     // current beat intensity (decays)
let warpPower = 0;     // warp-speed burst (decays)
let vortexStrength = 0; // spiral pull
let chaosLevel = 0;    // ordered vs chaotic
let flashAlpha = 0;
let shakeX = 0, shakeY = 0;

// Formation state
let formationAngle = 0;
let formationPhase = 0; // 0=chaos, 1=ring, 2=spiral, 3=grid
let formationBlend = 0;

function createParticle(cx, cy, i, total) {
  const angle = (Math.PI * 2 * i) / total + Math.random() * 0.2;
  const dist = 30 + Math.random() * 250;
  return {
    x: cx + Math.cos(angle) * dist,
    y: cy + Math.sin(angle) * dist,
    vx: 0,
    vy: 0,
    size: 1 + Math.random() * 2.5,
    baseSize: 1 + Math.random() * 2.5,
    hueOff: (i / total) * 360,
    alpha: 1,
    band: i % 3, // 0=bass, 1=mid, 2=high
    orbitAngle: angle,
    orbitRadius: dist,
    orbitSpeed: 0.1 + Math.random() * 0.4,
    trail: [],
    ember: 0, // ember glow after explosion
  };
}

function createNebula(cx, cy) {
  return {
    x: cx + (Math.random() - 0.5) * 400,
    y: cy + (Math.random() - 0.5) * 400,
    radius: 60 + Math.random() * 120,
    hueOff: Math.random() * 360,
    alpha: 0,
    targetAlpha: 0,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
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
  vortexStrength = 0; chaosLevel = 0; flashAlpha = 0;
  bassHistory.fill(0);
  time = 0;
  formationPhase = 0;
  formationBlend = 0;
}

export function render(freqData, timeData, dt, w, h, ctx) {
  if (!ctx) return;

  time += dt;
  hueBase += dt * 18;

  const cx = w / 2 + shakeX;
  const cy = h / 2 + shakeY;

  // ===== AUDIO ANALYSIS =====
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

  // Rolling average for beat detection
  bassHistory[bassIdx % 12] = rawBass;
  bassIdx++;
  let avgBass = 0;
  for (let i = 0; i < 12; i++) avgBass += bassHistory[i];
  avgBass /= 12;

  const bassDelta = rawBass - prevBass;
  const isBeat = rawBass > avgBass * 1.15 && bassDelta > 12;
  const isHardBeat = rawBass > avgBass * 1.35 && bassDelta > 30;
  const isSupernova = rawBass > avgBass * 1.6 && bassDelta > 55;
  prevBass = lerp(prevBass, rawBass, 0.25);

  // Overall energy 0-1
  const energy = clamp((rawBass + rawMid + rawHigh) / 600, 0, 1);

  // ===== BEAT REACTIONS =====
  if (isSupernova) {
    warpPower = 1.0;
    beatPower = 1.0;
    flashAlpha = 0.4;
    shakeX = (Math.random() - 0.5) * 20;
    shakeY = (Math.random() - 0.5) * 20;
    // Switch formation on supernova
    formationPhase = (formationPhase + 1) % 4;
    formationBlend = 0;
  } else if (isHardBeat) {
    warpPower = Math.max(warpPower, 0.6);
    beatPower = Math.max(beatPower, 0.7);
    flashAlpha = Math.max(flashAlpha, 0.15);
    shakeX = (Math.random() - 0.5) * 8;
    shakeY = (Math.random() - 0.5) * 8;
  } else if (isBeat) {
    beatPower = Math.max(beatPower, 0.35);
    flashAlpha = Math.max(flashAlpha, 0.05);
  }

  beatPower *= 0.92;
  warpPower *= 0.88;
  flashAlpha *= 0.85;
  shakeX *= 0.88;
  shakeY *= 0.88;
  formationBlend = lerp(formationBlend, 1, 0.015);

  // Vortex: between beats, pull inward; on beats, push out
  vortexStrength = lerp(vortexStrength, isBeat ? -1 : 0.5, 0.1);
  chaosLevel = lerp(chaosLevel, energy, 0.05);

  formationAngle += dt * (0.15 + energy * 0.6);

  // ===== SCREEN FLASH =====
  if (flashAlpha > 0.005) {
    const fHue = hueBase % 360;
    ctx.fillStyle = hslString(fHue, 0.6, 0.8, flashAlpha);
    ctx.fillRect(0, 0, w, h);
  }

  // ===== NEBULA CLOUDS =====
  for (const nb of nebulaBlobs) {
    nb.targetAlpha = map(energy, 0.1, 0.8, 0, 0.12);
    nb.alpha = lerp(nb.alpha, nb.targetAlpha, 0.03);
    nb.x += nb.vx + Math.sin(time * 0.3 + nb.hueOff) * 0.2;
    nb.y += nb.vy + Math.cos(time * 0.25 + nb.hueOff) * 0.2;

    // Wrap
    if (nb.x < -200) nb.x = w + 200;
    if (nb.x > w + 200) nb.x = -200;
    if (nb.y < -200) nb.y = h + 200;
    if (nb.y > h + 200) nb.y = -200;

    if (nb.alpha > 0.003) {
      const nbHue = (hueBase + nb.hueOff) % 360;
      const r = nb.radius + beatPower * 40;
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
  const minDim = Math.min(w, h);

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

    // ===== FORMATION TARGET =====
    let targetX = p.x, targetY = p.y;
    const fi = i / particles.length;

    if (formationPhase === 1) {
      // RING — particles form a giant pulsing ring
      const ringR = minDim * 0.25 + map(bv, 0, 255, 0, 80);
      const ringAngle = fi * Math.PI * 2 + formationAngle;
      targetX = cx + Math.cos(ringAngle) * ringR;
      targetY = cy + Math.sin(ringAngle) * ringR;
    } else if (formationPhase === 2) {
      // DOUBLE HELIX SPIRAL
      const arm = i % 2;
      const spiralR = fi * minDim * 0.4 + map(bv, 0, 255, 0, 30);
      const spiralAngle = fi * Math.PI * 8 + formationAngle + arm * Math.PI;
      targetX = cx + Math.cos(spiralAngle) * spiralR;
      targetY = cy + Math.sin(spiralAngle) * spiralR;
    } else if (formationPhase === 3) {
      // WAVE GRID
      const cols = Math.ceil(Math.sqrt(particles.length));
      const gx = i % cols;
      const gy = Math.floor(i / cols);
      const spacing = minDim * 0.6 / cols;
      const wave = Math.sin(gx * 0.3 + time * 3) * map(bv, 0, 255, 5, 40);
      const wave2 = Math.cos(gy * 0.3 + time * 2) * map(rawMid, 0, 255, 5, 25);
      targetX = (w - minDim * 0.6) / 2 + gx * spacing + wave;
      targetY = (h - minDim * 0.6) / 2 + gy * spacing + wave2;
    }
    // Phase 0 = free chaos, no target

    // ===== FORCES =====
    // Formation pull (when in formation mode)
    if (formationPhase > 0) {
      const formPull = 0.03 * clamp(formationBlend, 0, 1);
      p.vx += (targetX - p.x) * formPull;
      p.vy += (targetY - p.y) * formPull;
    }

    // Vortex spiral (tangential + radial)
    const tangentX = -ny;
    const tangentY = nx;
    const spiralForce = 0.3 + energy * 0.8;
    p.vx += tangentX * spiralForce * 0.5;
    p.vy += tangentY * spiralForce * 0.5;

    // Radial: inward between beats, outward on beats
    const radialForce = vortexStrength * (0.1 + energy * 0.3);
    p.vx += nx * radialForce;
    p.vy += ny * radialForce;

    // Frequency push — individual bars drive specific particles
    const freqIdx = Math.floor(map(fi, 0, 1, 0, freqData.length - 1));
    const freqVal = freqData[freqIdx];
    const freqPush = map(freqVal, 0, 255, 0, 4);
    p.vx -= nx * freqPush * dt * 3;
    p.vy -= ny * freqPush * dt * 3;

    // Perlin flow field — organic movement
    const noiseScale = 0.003;
    const noiseAngle = perlinOctaves(p.x * noiseScale, p.y * noiseScale + time * 0.2, 2) * Math.PI * 4;
    p.vx += Math.cos(noiseAngle) * 0.15 * (1 + chaosLevel);
    p.vy += Math.sin(noiseAngle) * 0.15 * (1 + chaosLevel);

    // WARP BURST — radially outward like a star warp
    if (warpPower > 0.05) {
      const warpForce = warpPower * map(dist, 0, minDim * 0.5, 15, 3);
      p.vx -= nx * warpForce;
      p.vy -= ny * warpForce;
      p.ember = Math.max(p.ember, warpPower);
    }

    // Beat explosion
    if (isHardBeat && dist < minDim * 0.4) {
      const blastForce = map(bassDelta, 30, 100, 4, 18);
      p.vx -= nx * blastForce * (0.5 + Math.random());
      p.vy -= ny * blastForce * (0.5 + Math.random());
    }

    // Damping (less = more floaty)
    const damping = formationPhase > 0 ? 0.94 : 0.975;
    p.vx *= damping;
    p.vy *= damping;

    // Integrate
    p.x += p.vx * 60 * dt;
    p.y += p.vy * 60 * dt;

    // Soft boundary — push back from edges
    const margin = 30;
    if (p.x < margin) p.vx += 0.5;
    if (p.x > w - margin) p.vx -= 0.5;
    if (p.y < margin) p.vy += 0.5;
    if (p.y > h - margin) p.vy -= 0.5;

    // Hard wrap
    if (p.x < -50) p.x = w + 50;
    if (p.x > w + 50) p.x = -50;
    if (p.y < -50) p.y = h + 50;
    if (p.y > h + 50) p.y = -50;

    // Ember decay
    p.ember *= 0.95;

    // ===== SIZE =====
    const sizeBoost = map(bv, 0, 255, 0, 5) + p.ember * 4;
    p.size = lerp(p.size, p.baseSize + sizeBoost, 0.3);

    // ===== TRAIL =====
    const speed = Math.hypot(p.vx, p.vy);
    p.trail.push({ x: p.x, y: p.y, size: p.size * 0.7 });
    const maxTrail = speed > 3 ? TRAIL_LEN : Math.floor(TRAIL_LEN * 0.5);
    while (p.trail.length > maxTrail) p.trail.shift();

    // ===== RENDER =====
    const hue = (hueBase + p.hueOff + bv * 0.3) % 360;
    const lightness = map(bv, 0, 255, 0.35, 0.75);
    const pAlpha = map(bv, 0, 255, 0.4, 1.0);

    // Trail
    for (let t = 0; t < p.trail.length; t++) {
      const tp = p.trail[t];
      const tRatio = t / p.trail.length;
      const tAlpha = tRatio * pAlpha * 0.25;
      const tSize = tp.size * tRatio;
      if (tSize < 0.3) continue;

      ctx.fillStyle = hslString(hue, 0.8, lightness, tAlpha);
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, tSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Warp streak (when warping, draw elongated trail)
    if (p.ember > 0.15 && speed > 2) {
      const streakLen = speed * 3 * p.ember;
      const angle = Math.atan2(p.vy, p.vx);
      const sx = p.x - Math.cos(angle) * streakLen;
      const sy = p.y - Math.sin(angle) * streakLen;

      ctx.strokeStyle = hslString(hue, 0.9, 0.8, p.ember * 0.4);
      ctx.lineWidth = p.size * 0.8;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    // Outer glow
    ctx.fillStyle = hslString(hue, 0.9, lightness, pAlpha * 0.15);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size + 6 + p.ember * 8, 0, Math.PI * 2);
    ctx.fill();

    // Mid glow
    ctx.fillStyle = hslString(hue, 0.85, lightness + 0.1, pAlpha * 0.35);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size + 2 + p.ember * 3, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = hslString(hue, 0.7, lightness + 0.25, pAlpha);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();

    // Hot center on loud particles
    if (bv > 150) {
      ctx.fillStyle = hslString(hue, 0.3, 0.95, map(bv, 150, 255, 0.2, 0.9));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ===== PLASMA CONNECTIONS =====
  // Use spatial grid for perf
  const gridSize = 100;
  const grid = {};
  for (let i = 0; i < Math.min(particles.length, 300); i++) {
    const p = particles[i];
    const gx = Math.floor(p.x / gridSize);
    const gy = Math.floor(p.y / gridSize);
    const key = `${gx},${gy}`;
    if (!grid[key]) grid[key] = [];
    grid[key].push(i);
  }

  const connDist = 70 + energy * 40;
  const connAlphaBase = 0.04 + energy * 0.12;

  for (const key in grid) {
    const cell = grid[key];
    const [gx, gy] = key.split(',').map(Number);

    // Check neighbors
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const nKey = `${gx + ox},${gy + oy}`;
        const neighbor = grid[nKey];
        if (!neighbor) continue;

        for (const ai of cell) {
          const a = particles[ai];
          for (const bi of neighbor) {
            if (bi <= ai) continue;
            const b = particles[bi];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d > connDist) continue;

            const lineAlpha = map(d, 0, connDist, connAlphaBase, 0);
            const lineHue = (hueBase + (a.hueOff + b.hueOff) * 0.5) % 360;
            const lineWidth = map(d, 0, connDist, 1.5, 0.3) + beatPower * 2;

            ctx.strokeStyle = hslString(lineHue, 0.7, 0.6, lineAlpha);
            ctx.lineWidth = lineWidth;
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

  // ===== CENTER VORTEX CORE =====
  const coreSize = 15 + map(rawBass, 0, 255, 0, 50) + beatPower * 30;
  const coreHue = hueBase % 360;

  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize);
  coreGrad.addColorStop(0, hslString(coreHue, 0.9, 0.9, 0.5 + beatPower * 0.3));
  coreGrad.addColorStop(0.3, hslString(coreHue, 0.8, 0.6, 0.25));
  coreGrad.addColorStop(0.6, hslString((coreHue + 40) % 360, 0.6, 0.3, 0.1));
  coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, coreSize, 0, Math.PI * 2);
  ctx.fill();

  // Core ring
  ctx.strokeStyle = hslString(coreHue, 0.8, 0.7, 0.2 + beatPower * 0.5);
  ctx.lineWidth = 1.5 + beatPower * 3;
  ctx.beginPath();
  ctx.arc(cx, cy, coreSize * 0.6, 0, Math.PI * 2);
  ctx.stroke();

  // ===== BEAT SHOCKWAVE RING =====
  if (beatPower > 0.1) {
    const swRadius = minDim * 0.15 + (1 - beatPower) * minDim * 0.35;
    ctx.strokeStyle = hslString(coreHue, 0.7, 0.7, beatPower * 0.4);
    ctx.lineWidth = 2 + beatPower * 4;
    ctx.beginPath();
    ctx.arc(cx, cy, swRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function destroy() {
  particles = [];
  nebulaBlobs = [];
}
