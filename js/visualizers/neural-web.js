// js/visualizers/neural-web.js — Chord diagram: threads inside a circle, reactive to rhythm

import { lerp, map, clamp, hslString, perlin } from '../utils.js';

// ===== CONFIG =====
const NUM_NODES = 10;           // segments around the ring
const THREADS_PER_FRAME = 8;    // new threads drawn per frame
const MAX_THREADS = 400;        // max stored threads
const TRAIL_ALPHA = 0.04;       // background fade speed (lower = longer trails)

// ===== STATE =====
let nodes = [];
let threads = [];
let hueBase = 0;
let time = 0;
let prevBass = 0;
let bassHistory = new Float32Array(16);
let bassIdx = 0;
let beatPower = 0;
let dropPower = 0;
let energy = 0;
let rotationAngle = 0;
let pulseRadius = 0;

// For drop detection
let quietFrames = 0;
let loudHistory = new Float32Array(30);
let loudIdx = 0;

export function destroy() {
  nodes = [];
  threads = [];
}

export function init(canvas, ctx) {
  nodes = [];
  threads = [];
  hueBase = Math.random() * 360;
  time = 0;
  prevBass = 0;
  bassHistory.fill(0);
  bassIdx = 0;
  beatPower = 0;
  dropPower = 0;
  energy = 0;
  rotationAngle = 0;
  pulseRadius = 0;
  quietFrames = 0;
  loudHistory.fill(0);
  loudIdx = 0;
}

function createNodes(cx, cy, radius) {
  nodes = [];
  for (let i = 0; i < NUM_NODES; i++) {
    const angle = (i / NUM_NODES) * Math.PI * 2 - Math.PI / 2;
    const segStart = angle - (Math.PI / NUM_NODES) * 0.8;
    const segEnd = angle + (Math.PI / NUM_NODES) * 0.8;
    nodes.push({
      index: i,
      angle,
      segStart,
      segEnd,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      hue: (360 / NUM_NODES) * i,
      energy: 0,
    });
  }
}

export function render(freqData, timeData, dt, w, h, ctx) {
  time += dt;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.38;

  // Rebuild nodes if needed (resize)
  if (nodes.length === 0 || Math.abs(nodes[0].x - (cx + Math.cos(nodes[0].angle) * radius)) > 5) {
    createNodes(cx, cy, radius);
  } else {
    // Update node positions
    for (const n of nodes) {
      n.x = cx + Math.cos(n.angle) * radius;
      n.y = cy + Math.sin(n.angle) * radius;
    }
  }

  // ===== AUDIO ANALYSIS =====
  const len = freqData.length;
  let bassSum = 0, midSum = 0, highSum = 0, totalSum = 0;
  const bassEnd = Math.floor(len * 0.08);
  const midEnd = Math.floor(len * 0.35);

  for (let i = 0; i < len; i++) {
    const v = freqData[i];
    totalSum += v;
    if (i < bassEnd) bassSum += v;
    else if (i < midEnd) midSum += v;
    else highSum += v;
  }

  const bassNow = bassSum / Math.max(bassEnd, 1);
  const midNow = midSum / Math.max(midEnd - bassEnd, 1);
  const highNow = highSum / Math.max(len - midEnd, 1);
  energy = lerp(energy, totalSum / len / 255, 0.15);

  const bassDelta = bassNow - prevBass;
  prevBass = lerp(prevBass, bassNow, 0.3);

  bassHistory[bassIdx % bassHistory.length] = bassNow;
  bassIdx++;
  let bassAvg = 0;
  for (let i = 0; i < bassHistory.length; i++) bassAvg += bassHistory[i];
  bassAvg /= bassHistory.length;

  const isBeat = bassDelta > 15 && bassNow > bassAvg * 1.2;
  const isHardBeat = bassDelta > 30 && bassNow > bassAvg * 1.4;

  // Drop detection: quiet → loud transition
  const loudness = totalSum / len;
  loudHistory[loudIdx % loudHistory.length] = loudness;
  loudIdx++;
  let recentLoud = 0;
  for (let i = 0; i < 10; i++) recentLoud += loudHistory[(loudIdx - 1 - i + loudHistory.length) % loudHistory.length];
  recentLoud /= 10;
  let olderLoud = 0;
  for (let i = 10; i < 30; i++) olderLoud += loudHistory[(loudIdx - 1 - i + loudHistory.length) % loudHistory.length];
  olderLoud /= 20;

  if (recentLoud < 30) quietFrames++;
  else quietFrames = Math.max(quietFrames - 2, 0);

  const isDrop = quietFrames > 20 && recentLoud > olderLoud * 2.5 && bassNow > 80;
  if (isDrop) {
    dropPower = 1.0;
    quietFrames = 0;
  }

  // Beat power
  if (isHardBeat) beatPower = Math.max(beatPower, 0.9);
  else if (isBeat) beatPower = Math.max(beatPower, 0.5);
  beatPower *= 0.92;
  dropPower *= 0.96;
  pulseRadius = lerp(pulseRadius, beatPower * 30 + dropPower * 60, 0.2);

  // Hue shift
  hueBase += dt * 15 + beatPower * 40;
  rotationAngle += dt * (0.15 + energy * 0.5 + beatPower * 1.5);

  // Map freq bands to node energy
  for (let i = 0; i < NUM_NODES; i++) {
    const fi = Math.floor(map(i, 0, NUM_NODES - 1, 0, len - 1));
    const bandSize = Math.max(Math.floor(len / NUM_NODES), 1);
    let sum = 0;
    for (let j = fi; j < Math.min(fi + bandSize, len); j++) sum += freqData[j];
    const nodeEnergy = sum / bandSize / 255;
    nodes[i].energy = lerp(nodes[i].energy, nodeEnergy, 0.25);
  }

  // ===== BACKGROUND — dark fade =====
  const fadeAlpha = dropPower > 0.3 ? 0.08 : TRAIL_ALPHA;
  ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotationAngle);
  ctx.translate(-cx, -cy);

  // ===== GENERATE NEW THREADS =====
  const threadCount = Math.floor(THREADS_PER_FRAME + beatPower * 15 + dropPower * 30);
  for (let t = 0; t < threadCount; t++) {
    // Pick two different nodes, weighted by energy
    let totalEnergy = 0;
    for (const n of nodes) totalEnergy += n.energy + 0.05;

    const pickNode = () => {
      let r = Math.random() * totalEnergy;
      for (const n of nodes) {
        r -= n.energy + 0.05;
        if (r <= 0) return n;
      }
      return nodes[nodes.length - 1];
    };

    const a = pickNode();
    let b = pickNode();
    let attempts = 0;
    while (b.index === a.index && attempts < 5) { b = pickNode(); attempts++; }
    if (b.index === a.index) continue;

    // Thread start/end positions: random point on each node's arc segment
    const angleA = a.segStart + Math.random() * (a.segEnd - a.segStart);
    const angleB = b.segStart + Math.random() * (b.segEnd - b.segStart);

    const startX = cx + Math.cos(angleA) * radius;
    const startY = cy + Math.sin(angleA) * radius;
    const endX = cx + Math.cos(angleB) * radius;
    const endY = cy + Math.sin(angleB) * radius;

    // Curve control point — pulled toward center with some randomness
    const midAngle = (angleA + angleB) / 2;
    const dist = Math.abs(angleB - angleA);
    const pull = 0.2 + Math.random() * 0.5 + beatPower * 0.3;
    const cpR = radius * (1 - pull);
    const cpX = cx + Math.cos(midAngle + (Math.random() - 0.5) * 0.5) * cpR;
    const cpY = cy + Math.sin(midAngle + (Math.random() - 0.5) * 0.5) * cpR;

    // Thread color — blend between the two node hues
    const blendHue = (a.hue + b.hue) / 2 + hueBase;
    const alpha = 0.03 + (a.energy + b.energy) * 0.15 + dropPower * 0.2;

    threads.push({
      sx: startX, sy: startY,
      ex: endX, ey: endY,
      cpx: cpX, cpy: cpY,
      hue: blendHue % 360,
      sat: 0.6 + energy * 0.3,
      light: 0.4 + beatPower * 0.2 + dropPower * 0.3,
      alpha: clamp(alpha, 0.02, 0.35),
      width: 0.5 + (a.energy + b.energy) * 1.5 + dropPower * 2,
      life: 1.0,
    });
  }

  // Cap threads
  if (threads.length > MAX_THREADS) {
    threads = threads.slice(threads.length - MAX_THREADS);
  }

  // ===== DRAW THREADS =====
  for (let i = threads.length - 1; i >= 0; i--) {
    const t = threads[i];
    t.life -= dt * (0.3 + energy * 0.5);
    if (t.life <= 0) {
      threads.splice(i, 1);
      continue;
    }

    const a = t.alpha * t.life;
    if (a < 0.003) { threads.splice(i, 1); continue; }

    ctx.beginPath();
    ctx.moveTo(t.sx, t.sy);
    ctx.quadraticCurveTo(t.cpx, t.cpy, t.ex, t.ey);
    ctx.strokeStyle = hslString(t.hue, t.sat, t.light, a);
    ctx.lineWidth = t.width * t.life;
    ctx.stroke();
  }

  // ===== OUTER RING SEGMENTS =====
  const ringWidth = radius * 0.06;
  const ringR = radius + ringWidth * 0.8;

  for (const n of nodes) {
    const segLen = n.segEnd - n.segStart;
    const gapRatio = 0.15;
    const drawStart = n.segStart + segLen * gapRatio;
    const drawEnd = n.segEnd - segLen * gapRatio;

    // Segment background
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, drawStart, drawEnd);
    ctx.lineWidth = ringWidth;
    ctx.strokeStyle = hslString((n.hue + hueBase) % 360, 0.5, 0.15, 0.4);
    ctx.stroke();

    // Segment energy fill
    const fillEnd = drawStart + (drawEnd - drawStart) * clamp(n.energy * 1.5 + dropPower * 0.5, 0, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, drawStart, fillEnd);
    ctx.lineWidth = ringWidth;
    ctx.strokeStyle = hslString((n.hue + hueBase) % 360, 0.7, 0.5 + n.energy * 0.3, 0.7 + n.energy * 0.3);
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Segment label
    const labelAngle = (drawStart + drawEnd) / 2;
    const labelR = ringR + ringWidth * 1.2;
    const lx = cx + Math.cos(labelAngle) * labelR;
    const ly = cy + Math.sin(labelAngle) * labelR;
    ctx.font = `${Math.max(9, radius * 0.04)}px monospace`;
    ctx.fillStyle = hslString((n.hue + hueBase) % 360, 0.5, 0.6, 0.5 + n.energy * 0.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`//${n.index}`, lx, ly);
  }

  // ===== INNER CIRCLE (dark hole) =====
  const innerR = radius * 0.08 + pulseRadius * 0.3;
  const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR * 3);
  innerGrad.addColorStop(0, hslString((hueBase + 180) % 360, 0.8, 0.6, 0.15 + dropPower * 0.4));
  innerGrad.addColorStop(0.4, hslString(hueBase % 360, 0.5, 0.3, 0.05 + beatPower * 0.1));
  innerGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = innerGrad;
  ctx.fillRect(cx - innerR * 3, cy - innerR * 3, innerR * 6, innerR * 6);

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0, 0, 0, 0.8)`;
  ctx.fill();
  ctx.strokeStyle = hslString(hueBase % 360, 0.6, 0.5, 0.3 + beatPower * 0.4);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ===== THIN CIRCLE OUTLINE =====
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(255,255,255,${0.05 + beatPower * 0.08})`;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // ===== DROP BURST — extra dense threads from all nodes to center =====
  if (dropPower > 0.5) {
    const burstCount = Math.floor(dropPower * 50);
    for (let i = 0; i < burstCount; i++) {
      const n = nodes[Math.floor(Math.random() * NUM_NODES)];
      const angle = n.segStart + Math.random() * (n.segEnd - n.segStart);
      const sx = cx + Math.cos(angle) * radius;
      const sy = cy + Math.sin(angle) * radius;

      // Spiral toward center
      const spiralAngle = angle + Math.random() * 2 - 1;
      const spiralR = radius * (0.1 + Math.random() * 0.4);
      const cpx = cx + Math.cos(spiralAngle) * spiralR;
      const cpy = cy + Math.sin(spiralAngle) * spiralR;

      // End near center
      const endR = Math.random() * radius * 0.15;
      const endAngle = Math.random() * Math.PI * 2;
      const ex = cx + Math.cos(endAngle) * endR;
      const ey = cy + Math.sin(endAngle) * endR;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(cpx, cpy, ex, ey);
      ctx.strokeStyle = hslString((n.hue + hueBase) % 360, 0.9, 0.7, dropPower * 0.15);
      ctx.lineWidth = 0.5 + dropPower * 1.5;
      ctx.stroke();
    }
  }

  // ===== BEAT PULSE RINGS =====
  if (beatPower > 0.2) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * (0.3 + beatPower * 0.7), 0, Math.PI * 2);
    ctx.strokeStyle = hslString(hueBase % 360, 0.6, 0.6, beatPower * 0.08);
    ctx.lineWidth = 1 + beatPower * 2;
    ctx.stroke();
  }

  // ===== SUBTLE SCREEN FLASH =====
  if (dropPower > 0.3) {
    ctx.restore();
    ctx.fillStyle = hslString(hueBase % 360, 0.5, 0.7, dropPower * 0.05);
    ctx.fillRect(0, 0, w, h);
    return;
  }

  ctx.restore();
}
