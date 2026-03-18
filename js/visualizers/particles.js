// js/visualizers/particles.js — Frequency-driven particle system with object pooling

import { lerp, map, clamp, hslString, distance } from '../utils.js';

const MAX_PARTICLES = 600;
const MOBILE_PARTICLES = 200;

let particles = [];
let hueBase = 0;
let prevBassAvg = 0;
let particleCount = MAX_PARTICLES;

function createParticle(cx, cy, i) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 50 + Math.random() * 200;
  return {
    x: cx + Math.cos(angle) * dist,
    y: cy + Math.sin(angle) * dist,
    vx: (Math.random() - 0.5) * 2,
    vy: (Math.random() - 0.5) * 2,
    size: 1 + Math.random() * 3,
    baseSize: 1 + Math.random() * 3,
    hueOff: (i / MAX_PARTICLES) * 360,
    alpha: 0.5 + Math.random() * 0.5,
    freqBand: Math.floor(Math.random() * 3), // 0=bass, 1=mid, 2=high
    life: 1,
  };
}

export function init(canvas, ctx) {
  // Detect mobile
  particleCount = window.innerWidth < 768 ? MOBILE_PARTICLES : MAX_PARTICLES;

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  particles = [];
  for (let i = 0; i < particleCount; i++) {
    particles.push(createParticle(cx, cy, i));
  }
  prevBassAvg = 0;
  hueBase = 0;
}

export function render(freqData, timeData, dt, w, h, ctx) {
  if (!ctx) return;

  hueBase += dt * 20;
  const cx = w / 2;
  const cy = h / 2;

  // Calculate band averages
  let bassAvg = 0, midAvg = 0, highAvg = 0;
  const bassEnd = Math.floor(freqData.length * 0.12);
  const midEnd = Math.floor(freqData.length * 0.5);

  for (let i = 0; i < freqData.length; i++) {
    if (i < bassEnd) bassAvg += freqData[i];
    else if (i < midEnd) midAvg += freqData[i];
    else highAvg += freqData[i];
  }
  bassAvg /= bassEnd;
  midAvg /= (midEnd - bassEnd);
  highAvg /= (freqData.length - midEnd);

  // Bass drop detection
  const bassDelta = bassAvg - prevBassAvg;
  const isBassDrop = bassDelta > 40;
  prevBassAvg = lerp(prevBassAvg, bassAvg, 0.3);

  // Update and render particles
  const bandValues = [bassAvg, midAvg, highAvg];
  const bandSpeeds = [0.3, 1.0, 2.5]; // bass=slow, mid=medium, high=fast

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const bandVal = bandValues[p.freqBand];
    const bandSpeed = bandSpeeds[p.freqBand];

    // Gravity toward center
    const dx = cx - p.x;
    const dy = cy - p.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const gravityStrength = 0.02;

    p.vx += (dx / dist) * gravityStrength;
    p.vy += (dy / dist) * gravityStrength;

    // Frequency-driven push (outward when loud)
    const pushStrength = map(bandVal, 0, 255, 0, 3) * bandSpeed;
    if (dist > 10) {
      p.vx -= (dx / dist) * pushStrength * dt;
      p.vy -= (dy / dist) * pushStrength * dt;
    }

    // Bass drop explosion
    if (isBassDrop && dist < 300) {
      const explosionForce = map(bassDelta, 40, 150, 3, 12);
      p.vx -= (dx / dist) * explosionForce;
      p.vy -= (dy / dist) * explosionForce;
    }

    // Apply velocity with damping
    p.vx *= 0.97;
    p.vy *= 0.97;
    p.x += p.vx * bandSpeed * 60 * dt;
    p.y += p.vy * bandSpeed * 60 * dt;

    // Wrap around edges
    if (p.x < -20) p.x = w + 20;
    if (p.x > w + 20) p.x = -20;
    if (p.y < -20) p.y = h + 20;
    if (p.y > h + 20) p.y = -20;

    // Size reacts to frequency
    const targetSize = p.baseSize + map(bandVal, 0, 255, 0, p.freqBand === 0 ? 6 : 3);
    p.size = lerp(p.size, targetSize, 0.15);

    // Draw particle
    const hue = (hueBase + p.hueOff) % 360;
    const brightness = map(bandVal, 0, 255, 0.3, 0.8);

    // Glow (additive)
    const saved = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';

    ctx.fillStyle = hslString(hue, 0.85, brightness, p.alpha * 0.2);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size + 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = saved;

    // Core
    ctx.fillStyle = hslString(hue, 0.8, brightness + 0.15, p.alpha);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();

    // Connection lines between nearby particles (only for first 100 to save perf)
    if (i < 100) {
      for (let j = i + 1; j < Math.min(i + 10, particles.length); j++) {
        const p2 = particles[j];
        const d = distance(p.x, p.y, p2.x, p2.y);
        if (d < 80) {
          const lineAlpha = map(d, 0, 80, 0.15, 0);
          ctx.strokeStyle = hslString(hue, 0.5, 0.5, lineAlpha);
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    }
  }

  // Bass drop flash
  if (isBassDrop) {
    const flashAlpha = clamp(bassDelta * 0.002, 0, 0.12);
    ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
    ctx.fillRect(0, 0, w, h);
  }

  // Center gravity well indicator
  const centerGlow = map(bassAvg, 0, 255, 5, 40);
  const cHue = hueBase % 360;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, centerGlow);
  grad.addColorStop(0, hslString(cHue, 0.8, 0.7, 0.3));
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, centerGlow, 0, Math.PI * 2);
  ctx.fill();
}

export function destroy() {
  particles = [];
}
