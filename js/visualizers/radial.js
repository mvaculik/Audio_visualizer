// js/visualizers/radial.js — FIRED radial visualizer with aggressive reactivity

import { lerp, map, clamp, hslString, perlin } from '../utils.js';

const BARS = 220;
const ORBIT_PARTICLES = 80;
const MAX_SHOCKWAVES = 5;

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

// Sacred geometry portal
let portalPhase = 0;      // morphs between shapes
let portalGlitch = 0;
let portalPulse = 0;
let innerEyeOpen = 0;     // 0=closed, 1=open
let lightningBolts = [];
let portalRings = [];      // concentric rotating rings

export function init(canvas, ctx) {
  orbitParticles = [];
  for (let i = 0; i < ORBIT_PARTICLES; i++) {
    orbitParticles.push({
      angle: (Math.PI * 2 * i) / ORBIT_PARTICLES,
      dist: 0,
      size: 1.5 + Math.random() * 3,
      speed: 0.3 + Math.random() * 0.8,
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
  portalPhase = 0;
  portalGlitch = 0;
  portalPulse = 0;
  innerEyeOpen = 0;
  lightningBolts = [];
  portalRings = [];
  for (let i = 0; i < 5; i++) {
    portalRings.push({
      radius: 0.3 + i * 0.15,
      speed: (0.4 + i * 0.2) * (i % 2 === 0 ? 1 : -1),
      sides: [6, 8, 3, 12, 5][i],
      angle: 0,
      alpha: 0,
    });
  }
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

  // ===== RADIAL BARS — full circle, mirrored, no gaps =====
  const radsPerBar = (Math.PI * 2) / BARS;
  const halfBars = Math.floor(BARS / 2);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < BARS; i++) {
    // Mirror: first half 0→max freq, second half max→0 (symmetric circle)
    const mirrorIdx = i < halfBars ? i : BARS - 1 - i;
    const freqIndex = Math.floor(map(mirrorIdx, 0, halfBars, 0, freqData.length - 1));
    const rawValue = freqData[clamp(freqIndex, 0, freqData.length - 1)];

    // Always draw — minimum tiny bar so circle is always full
    const value = Math.max(rawValue, 8);

    const maxBarH = minDim * 0.35;
    const barHeight = map(value, 0, 255, 2, maxBarH);
    const barWidth = Math.max(1.5, map(value, 0, 255, 1.2, 4.5));

    const angle = radsPerBar * i + beatAccum;
    const x1 = cx + Math.cos(angle) * (smoothRadius + 5);
    const y1 = cy + Math.sin(angle) * (smoothRadius + 5);
    const x2 = cx + Math.cos(angle) * (smoothRadius + 5 + barHeight);
    const y2 = cy + Math.sin(angle) * (smoothRadius + 5 + barHeight);

    // Color: bass bars = hot (red/orange), mid = accent, high = cool (cyan/blue)
    const ratio = freqIndex / freqData.length;
    let barHue;
    if (ratio < 0.15) {
      barHue = map(value, 0, 255, 10, 40); // red → orange, HOTTER when louder
    } else if (ratio < 0.5) {
      barHue = (hueOffset + i * 0.8) % 360; // cycling accent
    } else {
      barHue = map(ratio, 0.5, 1, 180, 260); // cyan → blue
    }

    const alpha = map(value, 0, 255, 0.15, 1.0);
    const lightness = map(value, 0, 255, 0.35, 0.75);

    // Outer glow (wide, soft)
    ctx.strokeStyle = hslString(barHue, 0.95, lightness, alpha * 0.2);
    ctx.lineWidth = barWidth + 8;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Mid glow
    ctx.strokeStyle = hslString(barHue, 0.9, lightness, alpha * 0.5);
    ctx.lineWidth = barWidth + 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Core bar (bright)
    ctx.strokeStyle = hslString(barHue, 0.85, lightness + 0.15, alpha);
    ctx.lineWidth = barWidth;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Hot tip spark on loud bars
    if (value > 180) {
      const sparkSize = map(value, 180, 255, 1, 5);
      ctx.fillStyle = hslString(barHue, 0.5, 0.9, alpha * 0.8);
      ctx.beginPath();
      ctx.arc(x2, y2, sparkSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();

  // ===== CENTER — SACRED GEOMETRY PORTAL =====
  const centerHue = hueOffset % 360;

  portalPhase += dt * 0.15;
  portalPulse = lerp(portalPulse, map(rawBass, 0, 255, 0, 1), 0.35);
  innerEyeOpen = lerp(innerEyeOpen, map(rawBass, 0, 255, 0.2, 1), 0.2);

  // Glitch on beats
  if (isHardBeat) portalGlitch = 0.8 + Math.random() * 0.2;
  else if (isBeat) portalGlitch = Math.max(portalGlitch, 0.3);
  portalGlitch *= 0.88;

  // Lightning bolts on hard beats
  if (isHardBeat) {
    const numBolts = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < numBolts; i++) {
      const angle = Math.random() * Math.PI * 2;
      const segments = [];
      let bx = 0, by = 0;
      const segCount = 5 + Math.floor(Math.random() * 6);
      for (let s = 0; s < segCount; s++) {
        const len = 8 + Math.random() * 20;
        bx += Math.cos(angle + (Math.random() - 0.5) * 1.5) * len;
        by += Math.sin(angle + (Math.random() - 0.5) * 1.5) * len;
        segments.push({ x: bx, y: by });
      }
      lightningBolts.push({ segments, alpha: 1, hue: centerHue + Math.random() * 40 });
    }
  }

  const portalR = smoothRadius * 0.9;

  // === DEEP PORTAL GLOW (abyss) ===
  const abyssR = portalR + portalPulse * 25;
  const abyssGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, abyssR + 30);
  abyssGrad.addColorStop(0, hslString(centerHue, 0.9, 0.08, 0.95));
  abyssGrad.addColorStop(0.3, hslString(centerHue, 0.7, 0.04, 0.8));
  abyssGrad.addColorStop(0.6, hslString((centerHue + 180) % 360, 0.8, 0.15, 0.3 + portalPulse * 0.3));
  abyssGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = abyssGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, abyssR + 30, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // === ROTATING GEOMETRIC RINGS ===
  for (let ri = 0; ri < portalRings.length; ri++) {
    const ring = portalRings[ri];
    ring.angle += ring.speed * dt * (1 + portalPulse * 2);
    ring.alpha = lerp(ring.alpha, 0.15 + portalPulse * 0.4 + (ri === 0 ? beatPower * 0.3 : 0), 0.1);

    const rr = portalR * ring.radius * (1 + portalPulse * 0.15);
    const sides = ring.sides;
    const glitchOff = portalGlitch > 0.1 ? (Math.random() - 0.5) * portalGlitch * 8 : 0;

    const ringHue = (centerHue + ri * 35) % 360;

    // Draw polygon
    ctx.strokeStyle = hslString(ringHue, 0.8, 0.6, ring.alpha);
    ctx.lineWidth = 1 + portalPulse * 1.5;
    ctx.beginPath();
    for (let s = 0; s <= sides; s++) {
      const a = ring.angle + (Math.PI * 2 * s) / sides;
      const px = cx + Math.cos(a) * rr + glitchOff;
      const py = cy + Math.sin(a) * rr;
      if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

    // Inner connecting lines (sacred geometry feel)
    if (sides >= 5 && ring.alpha > 0.08) {
      ctx.strokeStyle = hslString(ringHue, 0.6, 0.5, ring.alpha * 0.3);
      ctx.lineWidth = 0.5;
      for (let s = 0; s < sides; s++) {
        const a1 = ring.angle + (Math.PI * 2 * s) / sides;
        const skip = Math.floor(sides / 2);
        const a2 = ring.angle + (Math.PI * 2 * ((s + skip) % sides)) / sides;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr);
        ctx.lineTo(cx + Math.cos(a2) * rr, cy + Math.sin(a2) * rr);
        ctx.stroke();
      }
    }

    // Vertex dots
    for (let s = 0; s < sides; s++) {
      const a = ring.angle + (Math.PI * 2 * s) / sides;
      const vx = cx + Math.cos(a) * rr + glitchOff;
      const vy = cy + Math.sin(a) * rr;
      ctx.fillStyle = hslString(ringHue, 0.7, 0.8, ring.alpha * 1.5);
      ctx.beginPath();
      ctx.arc(vx, vy, 1.5 + portalPulse * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // === INNER EYE — ellipse that opens/closes with bass ===
  const eyeW = portalR * 0.5 * innerEyeOpen;
  const eyeH = portalR * 0.2 * innerEyeOpen;
  if (eyeW > 2) {
    // Outer eye glow
    const eyeGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, eyeW);
    eyeGrad.addColorStop(0, hslString((centerHue + 180) % 360, 0.9, 0.8, 0.5 * innerEyeOpen));
    eyeGrad.addColorStop(0.5, hslString(centerHue, 0.8, 0.5, 0.2 * innerEyeOpen));
    eyeGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = eyeGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, eyeW * 1.3, eyeH * 1.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye shape (almond)
    ctx.strokeStyle = hslString((centerHue + 180) % 360, 0.9, 0.7, 0.4 + portalPulse * 0.4);
    ctx.lineWidth = 1.5 + beatPower * 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, eyeW, eyeH, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Iris
    const irisR = Math.min(eyeW, eyeH) * 0.6;
    if (irisR > 1) {
      const irisGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, irisR);
      irisGrad.addColorStop(0, hslString((centerHue + 180) % 360, 0.9, 0.9, 0.9));
      irisGrad.addColorStop(0.3, hslString((centerHue + 180) % 360, 0.8, 0.5, 0.6));
      irisGrad.addColorStop(0.7, hslString(centerHue, 0.7, 0.3, 0.3));
      irisGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = irisGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, irisR, 0, Math.PI * 2);
      ctx.fill();

      // Pupil
      ctx.fillStyle = `rgba(0,0,0,${0.8 * innerEyeOpen})`;
      ctx.beginPath();
      ctx.arc(cx, cy, irisR * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // === FLOWER OF LIFE pattern (subtle, rotating) ===
  const flowerR = portalR * 0.35;
  const flowerAlpha = 0.04 + portalPulse * 0.08;
  ctx.strokeStyle = hslString(centerHue, 0.5, 0.6, flowerAlpha);
  ctx.lineWidth = 0.5;
  const flowerAngle = hueOffset * 0.003;
  for (let i = 0; i < 6; i++) {
    const a = flowerAngle + (Math.PI * 2 * i) / 6;
    const fx = cx + Math.cos(a) * flowerR;
    const fy = cy + Math.sin(a) * flowerR;
    ctx.beginPath();
    ctx.arc(fx, fy, flowerR, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Center circle
  ctx.beginPath();
  ctx.arc(cx, cy, flowerR, 0, Math.PI * 2);
  ctx.stroke();

  // === LIGHTNING BOLTS ===
  for (let li = lightningBolts.length - 1; li >= 0; li--) {
    const bolt = lightningBolts[li];
    bolt.alpha *= 0.85;
    if (bolt.alpha < 0.02) { lightningBolts.splice(li, 1); continue; }

    ctx.strokeStyle = hslString(bolt.hue, 0.8, 0.8, bolt.alpha);
    ctx.lineWidth = 1 + bolt.alpha * 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (const seg of bolt.segments) {
      ctx.lineTo(cx + seg.x, cy + seg.y);
    }
    ctx.stroke();

    // Glow pass
    ctx.strokeStyle = hslString(bolt.hue, 0.6, 0.6, bolt.alpha * 0.3);
    ctx.lineWidth = 4 + bolt.alpha * 6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (const seg of bolt.segments) {
      ctx.lineTo(cx + seg.x, cy + seg.y);
    }
    ctx.stroke();
  }

  // === GLITCH DISTORTION BARS ===
  if (portalGlitch > 0.1) {
    const numBars = Math.floor(portalGlitch * 8);
    for (let i = 0; i < numBars; i++) {
      const barY = cy - portalR + Math.random() * portalR * 2;
      const barW = portalR * (0.5 + Math.random());
      const barH = 1 + Math.random() * 3;
      ctx.fillStyle = hslString((centerHue + Math.random() * 90) % 360, 0.9, 0.7, portalGlitch * 0.2);
      ctx.fillRect(cx - barW / 2 + (Math.random() - 0.5) * 15, barY, barW, barH);
    }
  }

  ctx.restore();

  // === OUTER PORTAL RING ===
  const outerAlpha = 0.12 + portalPulse * 0.3 + beatPower * 0.3;
  ctx.strokeStyle = hslString(centerHue, 0.9, 0.6, outerAlpha);
  ctx.lineWidth = 1.5 + beatPower * 3;
  ctx.beginPath();
  ctx.arc(cx, cy, portalR + 5, 0, Math.PI * 2);
  ctx.stroke();

  // ===== ORBIT PARTICLES — with trails =====
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const p of orbitParticles) {
    // Speed reacts to highs
    const freqIdx = Math.floor(map(p.hueOff, 0, 120, 50, freqData.length - 1));
    const highVal = freqData[clamp(freqIdx, 0, freqData.length - 1)] || 0;

    p.angle += (p.speed + map(highVal, 0, 255, 0, 2)) * dt;

    // Distance reacts to frequency
    const targetDist = smoothRadius + 15 + map(highVal, 0, 255, 5, 120);
    p.dist = lerp(p.dist, targetDist, 0.15);

    // Beat explosion
    if (isHardBeat) p.dist += 30 + Math.random() * 20;

    const px = cx + Math.cos(p.angle) * p.dist;
    const py = cy + Math.sin(p.angle) * p.dist;
    const pHue = (hueOffset + p.hueOff * 2) % 360;
    const pSize = p.size + map(highVal, 0, 255, 0, 5);
    const pAlpha = map(highVal, 0, 255, 0.3, 0.9);

    // Trail
    p.trail.push({ x: px, y: py, alpha: pAlpha });
    if (p.trail.length > 6) p.trail.shift();

    for (let t = 0; t < p.trail.length; t++) {
      const tp = p.trail[t];
      const tAlpha = (t / p.trail.length) * pAlpha * 0.3;
      const tSize = pSize * (t / p.trail.length) * 0.6;
      ctx.fillStyle = hslString(pHue, 0.8, 0.6, tAlpha);
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, tSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Glow
    ctx.fillStyle = hslString(pHue, 0.9, 0.65, pAlpha * 0.25);
    ctx.beginPath();
    ctx.arc(px, py, pSize + 6, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = hslString(pHue, 0.85, 0.8, pAlpha);
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
