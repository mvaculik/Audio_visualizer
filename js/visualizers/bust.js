// js/visualizers/bust.js — Procedural 3D sliced bust head with glitch effects
// Cyber/wireframe aesthetic, rotates in center, glitches on beats

import { lerp, map, clamp, hslString, perlin } from '../utils.js';

// Bust profile: [relativeY (0=neck, 1=crown), width, depth]
// Inspired by classical sculpture proportions
const PROFILE = [
  // Shoulders/base
  [0.00, 0.70, 0.30],
  [0.02, 0.65, 0.28],
  [0.05, 0.55, 0.25],
  // Neck
  [0.08, 0.28, 0.22],
  [0.11, 0.26, 0.21],
  [0.14, 0.25, 0.20],
  [0.17, 0.27, 0.22],
  // Chin
  [0.20, 0.32, 0.26],
  [0.23, 0.38, 0.30],
  // Jaw
  [0.26, 0.46, 0.34],
  [0.30, 0.52, 0.37],
  [0.34, 0.55, 0.39],
  // Cheeks
  [0.37, 0.56, 0.40],
  [0.40, 0.55, 0.41],
  // Nose/mouth area
  [0.43, 0.53, 0.44],
  [0.46, 0.50, 0.46],
  // Eyes
  [0.49, 0.52, 0.43],
  [0.52, 0.54, 0.42],
  // Brow
  [0.55, 0.56, 0.41],
  [0.58, 0.57, 0.40],
  // Forehead
  [0.62, 0.55, 0.39],
  [0.66, 0.54, 0.38],
  [0.70, 0.52, 0.37],
  [0.74, 0.50, 0.35],
  // Crown
  [0.78, 0.48, 0.34],
  [0.82, 0.46, 0.32],
  // Hair (curly, wider)
  [0.85, 0.52, 0.38],
  [0.88, 0.56, 0.40],
  [0.90, 0.58, 0.42],
  [0.92, 0.56, 0.40],
  [0.95, 0.50, 0.36],
  [0.97, 0.40, 0.28],
  [1.00, 0.25, 0.18],
];

// Slice groups (for the "cut" effect like in the image)
// Each group is a range of profile indices with a gap between groups
const SLICE_GROUPS = [
  { start: 0, end: 7, offsetX: 0, offsetY: 0 },   // Base + neck
  { start: 7, end: 15, offsetX: 0, offsetY: 0 },   // Chin to cheeks
  { start: 15, end: 22, offsetX: 0, offsetY: 0 },  // Eyes to forehead
  { start: 22, end: PROFILE.length, offsetX: 0, offsetY: 0 }, // Crown + hair
];

const GAP_SIZE = 6; // pixel gap between slice groups

// State
let rotation = 0;
let glitchTimer = 0;
let glitchActive = false;
let glitchSlices = []; // which slices are glitched
let glitchIntensity = 0;
let scanLineOffset = 0;
let dataFragments = [];
let breathe = 0;
let prevBeatPower = 0;

// Floating data fragments around the head
const FRAG_TEXTS = [
  'V.A.C.A', 'NEURAL//NET', '0x4F5A', 'SYNC',
  'λ=440Hz', 'FFT::128', '>>PULSE', 'VACA.SYS',
  'RENDER', '∞ LOOP', 'FREQ:OK', 'BPM:???',
  'AUDIO_IN', '//GLITCH', 'CYBER', 'NODE::7',
];

export function initBust() {
  glitchTimer = 0;
  glitchActive = false;
  glitchSlices = [];
  glitchIntensity = 0;
  rotation = 0;
  scanLineOffset = 0;
  prevBeatPower = 0;
  breathe = 0;

  dataFragments = [];
  for (let i = 0; i < 12; i++) {
    dataFragments.push({
      text: FRAG_TEXTS[i % FRAG_TEXTS.length],
      angle: (Math.PI * 2 * i) / 12,
      dist: 1.2 + Math.random() * 0.5,
      speed: 0.1 + Math.random() * 0.3,
      alpha: 0,
      targetAlpha: 0,
      size: 8 + Math.random() * 4,
      yOff: (Math.random() - 0.5) * 0.3,
    });
  }
}

export function renderBust(ctx, cx, cy, bustHeight, dt, hue, bassVal, beatPower, isBeat, isHardBeat) {
  const bustWidth = bustHeight * 0.65;

  rotation += dt * 0.4 + beatPower * dt * 2;
  breathe += dt * 1.5;
  scanLineOffset += dt * 30;

  const sinRot = Math.sin(rotation);
  const cosRot = Math.cos(rotation);

  // ===== GLITCH TRIGGER =====
  if (isHardBeat || (isBeat && Math.random() > 0.5)) {
    glitchActive = true;
    glitchTimer = 0.08 + Math.random() * 0.15;
    glitchIntensity = isHardBeat ? 0.8 + Math.random() * 0.2 : 0.3 + Math.random() * 0.3;

    // Randomize slice group offsets
    for (const g of SLICE_GROUPS) {
      g.offsetX = (Math.random() - 0.5) * bustWidth * glitchIntensity * 0.5;
      g.offsetY = (Math.random() - 0.5) * 8 * glitchIntensity;
    }

    // Random individual slice glitches
    glitchSlices = [];
    const numGlitch = Math.floor(3 + Math.random() * 8);
    for (let i = 0; i < numGlitch; i++) {
      glitchSlices.push({
        index: Math.floor(Math.random() * PROFILE.length),
        offset: (Math.random() - 0.5) * bustWidth * 0.6,
        chromatic: (Math.random() - 0.5) * 12,
      });
    }
  }

  if (glitchActive) {
    glitchTimer -= dt;
    if (glitchTimer <= 0) {
      glitchActive = false;
      glitchIntensity *= 0.5;
      for (const g of SLICE_GROUPS) {
        g.offsetX = 0;
        g.offsetY = 0;
      }
    }
  }

  // Smooth decay of group offsets when not glitching
  if (!glitchActive) {
    for (const g of SLICE_GROUPS) {
      g.offsetX *= 0.85;
      g.offsetY *= 0.85;
    }
    glitchIntensity *= 0.9;
  }

  // ===== DRAW SLICED BUST =====
  const startY = cy + bustHeight * 0.45; // bottom of bust
  const breathOffset = Math.sin(breathe) * 2;

  ctx.save();

  for (let gi = 0; gi < SLICE_GROUPS.length; gi++) {
    const group = SLICE_GROUPS[gi];
    const groupGap = gi * GAP_SIZE + (glitchActive ? group.offsetY : 0);

    for (let pi = group.start; pi < group.end && pi < PROFILE.length; pi++) {
      const [relY, relW, depth] = PROFILE[pi];

      // Y position (bottom to top)
      const y = startY - relY * bustHeight - groupGap + breathOffset;

      // 3D rotation: offset by sin(rotation) * depth
      const xOffset3D = sinRot * depth * bustWidth * 0.5;

      // Width adjusted by perspective
      const perspectiveW = relW * bustWidth * (0.85 + cosRot * 0.15);

      // Slice height
      const sliceH = (bustHeight / PROFILE.length) * 1.1;

      // Individual glitch offset
      let sliceGlitchX = glitchActive ? group.offsetX : 0;
      let chromaticOff = 0;
      for (const gs of glitchSlices) {
        if (gs.index === pi && glitchActive) {
          sliceGlitchX += gs.offset;
          chromaticOff = gs.chromatic;
        }
      }

      const sliceX = cx + xOffset3D + sliceGlitchX;

      // ===== DRAW SLICE =====
      // Shadow/depth side (darker)
      const shadowSide = sinRot > 0 ? -1 : 1;
      ctx.fillStyle = hslString(hue, 0.15, 0.08, 0.6);
      ctx.fillRect(sliceX - perspectiveW / 2 + shadowSide * 2, y, perspectiveW, sliceH);

      // Main slice body (marble-like with hue tint)
      const sliceLight = map(Math.abs(cosRot), 0, 1, 0.15, 0.35);
      const sliceAlpha = 0.85;
      ctx.fillStyle = hslString(hue, 0.08, sliceLight, sliceAlpha);
      ctx.fillRect(sliceX - perspectiveW / 2, y, perspectiveW, sliceH);

      // Lit edge (top of each slice)
      const edgeLight = map(cosRot, -1, 1, 0.2, 0.5);
      ctx.fillStyle = hslString(hue, 0.12, edgeLight, 0.5);
      ctx.fillRect(sliceX - perspectiveW / 2, y, perspectiveW, 1.5);

      // Cross-section visible in gaps (inner "meat" of the slice)
      if (gi > 0 && pi === group.start) {
        ctx.fillStyle = hslString(hue, 0.1, 0.12, 0.7);
        ctx.fillRect(sliceX - perspectiveW / 2, y + sliceH, perspectiveW, GAP_SIZE - 1);
      }

      // Wireframe overlay
      ctx.strokeStyle = hslString(hue, 0.6, 0.5, 0.08 + bassVal * 0.0003);
      ctx.lineWidth = 0.5;
      ctx.strokeRect(sliceX - perspectiveW / 2, y, perspectiveW, sliceH);

      // Chromatic aberration on glitched slices
      if (chromaticOff !== 0 && glitchActive) {
        ctx.fillStyle = `rgba(255,0,0,${glitchIntensity * 0.15})`;
        ctx.fillRect(sliceX - perspectiveW / 2 + chromaticOff, y, perspectiveW, sliceH);
        ctx.fillStyle = `rgba(0,255,255,${glitchIntensity * 0.15})`;
        ctx.fillRect(sliceX - perspectiveW / 2 - chromaticOff, y, perspectiveW, sliceH);
      }
    }
  }

  // ===== NEON OUTLINE (edge detection fake) =====
  ctx.beginPath();
  const outlineAlpha = 0.15 + bassVal * 0.002 + beatPower * 0.3;

  for (let pi = 0; pi < PROFILE.length; pi++) {
    const [relY, relW, depth] = PROFILE[pi];
    const gi = SLICE_GROUPS.findIndex(g => pi >= g.start && pi < g.end);
    const groupGap = gi * GAP_SIZE;
    const y = startY - relY * bustHeight - groupGap + breathOffset;
    const xOffset3D = sinRot * depth * bustWidth * 0.5;
    const perspectiveW = relW * bustWidth * (0.85 + cosRot * 0.15);
    const sliceX = cx + xOffset3D + (glitchActive ? (SLICE_GROUPS[gi]?.offsetX || 0) : 0);

    // Right edge
    if (pi === 0) ctx.moveTo(sliceX + perspectiveW / 2, y);
    else ctx.lineTo(sliceX + perspectiveW / 2, y);
  }
  // Back down left side
  for (let pi = PROFILE.length - 1; pi >= 0; pi--) {
    const [relY, relW, depth] = PROFILE[pi];
    const gi = SLICE_GROUPS.findIndex(g => pi >= g.start && pi < g.end);
    const groupGap = gi * GAP_SIZE;
    const y = startY - relY * bustHeight - groupGap + breathOffset;
    const xOffset3D = sinRot * depth * bustWidth * 0.5;
    const perspectiveW = relW * bustWidth * (0.85 + cosRot * 0.15);
    const sliceX = cx + xOffset3D + (glitchActive ? (SLICE_GROUPS[gi]?.offsetX || 0) : 0);
    ctx.lineTo(sliceX - perspectiveW / 2, y);
  }
  ctx.closePath();
  ctx.strokeStyle = hslString(hue, 0.8, 0.6, outlineAlpha);
  ctx.lineWidth = 1.5 + beatPower * 2;
  ctx.stroke();

  // ===== SCAN LINES =====
  const scanSpacing = 3;
  ctx.strokeStyle = hslString(hue, 0.5, 0.6, 0.03 + beatPower * 0.04);
  ctx.lineWidth = 0.5;
  for (let sy = startY - bustHeight - GAP_SIZE * 4; sy < startY + 10; sy += scanSpacing) {
    const scanY = sy + (scanLineOffset % scanSpacing);
    ctx.beginPath();
    ctx.moveTo(cx - bustWidth * 0.4, scanY);
    ctx.lineTo(cx + bustWidth * 0.4, scanY);
    ctx.stroke();
  }

  // ===== HORIZONTAL GLITCH BARS =====
  if (glitchActive) {
    const numBars = Math.floor(2 + glitchIntensity * 6);
    for (let i = 0; i < numBars; i++) {
      const barY = startY - Math.random() * bustHeight;
      const barH = 1 + Math.random() * 4;
      const barW = bustWidth * (0.3 + Math.random() * 0.7);
      const barX = cx - barW / 2 + (Math.random() - 0.5) * bustWidth * 0.3;

      ctx.fillStyle = hslString(
        (hue + Math.random() * 60) % 360,
        0.8, 0.7, 0.1 + glitchIntensity * 0.2
      );
      ctx.fillRect(barX, barY, barW, barH);
    }
  }

  // ===== FLOATING DATA FRAGMENTS =====
  const fragRadius = bustHeight * 0.55;
  ctx.font = '500 10px monospace';
  ctx.textAlign = 'center';

  for (const frag of dataFragments) {
    frag.angle += frag.speed * dt;
    frag.targetAlpha = 0.15 + bassVal * 0.002 + (glitchActive ? 0.3 : 0);
    frag.alpha = lerp(frag.alpha, frag.targetAlpha, 0.05);

    if (frag.alpha < 0.01) continue;

    const fx = cx + Math.cos(frag.angle) * fragRadius * frag.dist;
    const fy = cy + frag.yOff * bustHeight + Math.sin(frag.angle * 0.7) * 20;

    // Glitch offset
    const gOff = glitchActive ? (Math.random() - 0.5) * 5 : 0;

    ctx.fillStyle = hslString(hue, 0.6, 0.6, frag.alpha);
    ctx.fillText(frag.text, fx + gOff, fy);

    // Connection line to bust
    ctx.strokeStyle = hslString(hue, 0.5, 0.5, frag.alpha * 0.2);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(fx + gOff, fy);
    ctx.lineTo(cx, cy);
    ctx.stroke();
  }

  // ===== "V A C A" text at base =====
  const baseY = startY + 15;
  ctx.font = '600 11px monospace';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '4px';
  const vacaAlpha = 0.2 + beatPower * 0.3;
  ctx.fillStyle = hslString(hue, 0.5, 0.7, vacaAlpha);
  ctx.fillText('V  A  C  A', cx, baseY);

  // Underline
  ctx.strokeStyle = hslString(hue, 0.6, 0.5, vacaAlpha * 0.5);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(cx - 30, baseY + 5);
  ctx.lineTo(cx + 30, baseY + 5);
  ctx.stroke();

  ctx.restore();
}
