// js/hud.js — Futuristic HUD overlay: BPM, drop predictor, DNA, emotion, energy

import { lerp, map, clamp, hslString } from './utils.js';

const HUD_FONT = '500 11px monospace';
const HUD_FONT_BIG = '700 28px monospace';
const HUD_FONT_LABEL = '400 9px monospace';
const HISTORY_LEN = 200;

let hudAlpha = 0;

// Smart alert system
let alerts = [];
let alertCooldowns = {};
let prevEmotion = '';
let prevBpm = 0;
let screenFlashAlpha = 0;
let screenFlashHue = 0;
let edgeFlashAlpha = 0;
let edgeFlashHue = 0;

// Floating text system
let floatingTexts = [];
let lastWordCount = 0;
let floatSpawnTimer = 0;

function pushAlert(id, text, color, duration = 2.5) {
  // Cooldown check — same alert can't fire within cooldown period
  const now = Date.now();
  if (alertCooldowns[id] && now - alertCooldowns[id] < duration * 1000 + 500) return;
  alertCooldowns[id] = now;

  alerts.push({ text, color, timer: duration, maxTimer: duration, id });
  // Max 4 alerts visible
  while (alerts.length > 4) alerts.shift();
}

export function renderHud(ctx, w, h, mi, dt, visible) {
  // Smooth fade
  hudAlpha = lerp(hudAlpha, visible ? 1 : 0, 0.08);
  if (hudAlpha < 0.01) return;

  ctx.save();
  ctx.globalAlpha = hudAlpha;

  const pad = 20;
  const hue = (Date.now() * 0.02) % 360;
  const accentColor = hslString(hue, 0.7, 0.6, 0.9);
  const dimColor = hslString(hue, 0.4, 0.5, 0.4);
  const bgColor = 'rgba(0,0,0,0.35)';
  const textColor = 'rgba(255,255,255,0.85)';
  const textDim = 'rgba(255,255,255,0.4)';

  // ===== TOP-LEFT: BPM + BEAT SYNC =====
  const bpmX = pad;
  const bpmY = pad + 50;

  // BPM panel bg
  drawPanel(ctx, bpmX, bpmY, 140, 75, bgColor);

  // BPM number
  ctx.font = HUD_FONT_BIG;
  ctx.fillStyle = accentColor;
  ctx.textAlign = 'left';
  const bpmText = mi.bpm > 0 ? Math.round(mi.bpm).toString() : '---';
  ctx.fillText(bpmText, bpmX + 10, bpmY + 35);

  // BPM label
  ctx.font = HUD_FONT_LABEL;
  ctx.fillStyle = textDim;
  ctx.fillText('BPM', bpmX + 10, bpmY + 15);

  // Confidence bar
  ctx.fillStyle = dimColor;
  ctx.fillRect(bpmX + 10, bpmY + 50, 120, 3);
  ctx.fillStyle = accentColor;
  ctx.fillRect(bpmX + 10, bpmY + 50, 120 * mi.beatConfidence, 3);

  // Beat pulse indicator (circle that pulses on beat)
  const beatPulse = 1 - mi.beatPhase;
  const pulseR = 6 + beatPulse * 10;
  const pulseAlpha = 0.2 + beatPulse * 0.7;
  ctx.fillStyle = hslString(hue, 0.8, 0.7, pulseAlpha);
  ctx.beginPath();
  ctx.arc(bpmX + 120, bpmY + 30, pulseR, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(bpmX + 120, bpmY + 30, 6, 0, Math.PI * 2);
  ctx.stroke();

  // ===== TOP-LEFT BELOW: EMOTION =====
  const emoY = bpmY + 85;
  drawPanel(ctx, bpmX, emoY, 140, 35, bgColor);

  ctx.font = HUD_FONT;
  ctx.fillStyle = getEmotionColor(mi.emotion, hue);
  ctx.textAlign = 'left';
  ctx.fillText(mi.emotion, bpmX + 10, emoY + 23);

  ctx.font = HUD_FONT_LABEL;
  ctx.fillStyle = textDim;
  ctx.fillText('MOOD', bpmX + 10, emoY + 12);

  // ===== TOP-RIGHT: ENERGY BANDS =====
  const bandX = w - pad - 150;
  const bandY = pad + 50;
  drawPanel(ctx, bandX, bandY, 150, 90, bgColor);

  ctx.font = HUD_FONT_LABEL;
  ctx.fillStyle = textDim;
  ctx.textAlign = 'left';
  ctx.fillText('ENERGY DISTRIBUTION', bandX + 8, bandY + 12);

  // Band bars
  const bands = [
    { label: 'BASS', value: mi.bassPercent, color: hslString(0, 0.8, 0.5, 0.9) },
    { label: 'MID', value: mi.midPercent, color: hslString(120, 0.7, 0.5, 0.9) },
    { label: 'HIGH', value: mi.highPercent, color: hslString(220, 0.7, 0.6, 0.9) },
  ];

  for (let i = 0; i < bands.length; i++) {
    const by = bandY + 22 + i * 22;
    ctx.font = HUD_FONT_LABEL;
    ctx.fillStyle = textDim;
    ctx.fillText(bands[i].label, bandX + 8, by + 9);

    // Bar bg
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(bandX + 40, by, 90, 12);

    // Bar fill
    ctx.fillStyle = bands[i].color;
    ctx.fillRect(bandX + 40, by, 90 * clamp(bands[i].value, 0, 1), 12);

    // Percentage
    ctx.font = HUD_FONT_LABEL;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(bands[i].value * 100) + '%', bandX + 142, by + 9);
    ctx.textAlign = 'left';
  }

  // ===== TOP-RIGHT BELOW: BRIGHTNESS =====
  const brightY = bandY + 100;
  drawPanel(ctx, bandX, brightY, 150, 30, bgColor);

  ctx.font = HUD_FONT_LABEL;
  ctx.fillStyle = textDim;
  ctx.fillText('BRIGHTNESS', bandX + 8, brightY + 12);

  // Brightness bar (gradient from dark blue to white)
  const brightGrad = ctx.createLinearGradient(bandX + 8, 0, bandX + 140, 0);
  brightGrad.addColorStop(0, 'rgba(30,30,80,0.8)');
  brightGrad.addColorStop(1, 'rgba(255,255,240,0.8)');
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(bandX + 8, brightY + 18, 132, 6);
  ctx.fillStyle = brightGrad;
  ctx.fillRect(bandX + 8, brightY + 18, 132 * mi.brightness, 6);

  // Indicator dot
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(bandX + 8 + 132 * mi.brightness, brightY + 21, 3, 0, Math.PI * 2);
  ctx.fill();

  // ===== BOTTOM-LEFT: ENERGY SEISMOGRAPH =====
  const seisX = pad;
  const seisY = h - pad - 100;
  const seisW = Math.min(350, w * 0.4);
  const seisH = 60;
  drawPanel(ctx, seisX, seisY, seisW, seisH + 20, bgColor);

  ctx.font = HUD_FONT_LABEL;
  ctx.fillStyle = textDim;
  ctx.fillText('ENERGY // 10s', seisX + 8, seisY + 12);

  const energyHist = mi.getHistory(mi.energyHistory);
  const bassHist = mi.getHistory(mi.bassHistory);

  // Draw energy line
  const graphY = seisY + 18;
  const graphH = seisH - 2;
  const step = seisW / HISTORY_LEN;

  // Bass fill
  ctx.fillStyle = hslString(hue, 0.5, 0.4, 0.15);
  ctx.beginPath();
  ctx.moveTo(seisX + 4, graphY + graphH);
  for (let i = 0; i < HISTORY_LEN; i++) {
    const v = clamp(bassHist[i] / 255, 0, 1);
    ctx.lineTo(seisX + 4 + i * step, graphY + graphH - v * graphH);
  }
  ctx.lineTo(seisX + 4 + HISTORY_LEN * step, graphY + graphH);
  ctx.closePath();
  ctx.fill();

  // Energy line
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < HISTORY_LEN; i++) {
    const v = clamp(energyHist[i] / 200, 0, 1);
    const x = seisX + 4 + i * step;
    const y = graphY + graphH - v * graphH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Now marker
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(seisX + seisW - 4, graphY);
  ctx.lineTo(seisX + seisW - 4, graphY + graphH);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = HUD_FONT_LABEL;
  ctx.fillStyle = textDim;
  ctx.textAlign = 'right';
  ctx.fillText('NOW', seisX + seisW - 6, graphY + graphH + 10);
  ctx.textAlign = 'left';

  // ===== BOTTOM-RIGHT: MUSIC DNA =====
  const dnaX = w - pad - Math.min(300, w * 0.35);
  const dnaY = h - pad - 100;
  const dnaW = Math.min(300, w * 0.35);
  const dnaH = 80;
  drawPanel(ctx, dnaX, dnaY, dnaW, dnaH, bgColor);

  ctx.font = HUD_FONT_LABEL;
  ctx.fillStyle = textDim;
  ctx.fillText('MUSIC DNA', dnaX + 8, dnaY + 12);

  // Draw DNA as vertical colored bars (spectrogram-like but artistic)
  const dnaGraphY = dnaY + 16;
  const dnaGraphH = dnaH - 20;
  const dnaStep = dnaW / HISTORY_LEN;
  const bandH = dnaGraphH / 16;

  for (let i = 0; i < HISTORY_LEN; i++) {
    const slice = mi.getDnaSlice(i);
    const x = dnaX + 2 + i * dnaStep;

    for (let b = 0; b < 16; b++) {
      const val = slice[b];
      if (val < 5) continue;
      const y = dnaGraphY + (15 - b) * bandH; // flip so bass at bottom
      const bandHue = (hue + b * 20) % 360;
      const alpha = clamp(val / 255, 0.05, 0.9);
      ctx.fillStyle = hslString(bandHue, 0.7, 0.5, alpha);
      ctx.fillRect(x, y, Math.max(1, dnaStep), bandH);
    }
  }

  // ===== DROP PREDICTOR (center-top) — always checks =====
  const dropX = w / 2;
  const dropY = pad + 60;

  if (mi.isDropping || mi.dropTimer > 0) {
    // DROP! flash — stays visible for dropTimer duration
    const dropAlpha = clamp(mi.dropTimer / 0.5, 0, 1);
    const dropSize = 30 + (1 - dropAlpha) * 20; // grows as it fades

    ctx.font = `900 ${dropSize + 12}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = hslString((hue + 180) % 360, 0.9, 0.85, dropAlpha);
    ctx.fillText('DROP', dropX, dropY + 15);

    // Wide glow
    ctx.fillStyle = hslString((hue + 180) % 360, 0.8, 0.7, dropAlpha * 0.2);
    ctx.beginPath();
    ctx.arc(dropX, dropY, 80, 0, Math.PI * 2);
    ctx.fill();

    // Shockwave ring
    const swR = 30 + (1 - dropAlpha) * 120;
    ctx.strokeStyle = hslString((hue + 180) % 360, 0.7, 0.7, dropAlpha * 0.4);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(dropX, dropY, swR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.textAlign = 'left';
  } else if (mi.dropCharge > 0.03) {
    // Building up — "DROP INCOMING"
    drawPanel(ctx, dropX - 85, dropY - 15, 170, 42, 'rgba(255,50,50,0.15)');

    ctx.font = HUD_FONT;
    ctx.textAlign = 'center';
    const incomingAlpha = 0.4 + mi.dropCharge * 0.6;
    ctx.fillStyle = hslString(0, 0.8, 0.6, incomingAlpha);
    ctx.fillText('DROP INCOMING', dropX, dropY + 3);

    // Charge bar
    const chargeW = 150;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(dropX - chargeW / 2, dropY + 10, chargeW, 6);

    const chargeGrad = ctx.createLinearGradient(dropX - chargeW / 2, 0, dropX + chargeW / 2, 0);
    chargeGrad.addColorStop(0, hslString(60, 0.9, 0.5, 0.9));
    chargeGrad.addColorStop(1, hslString(0, 0.9, 0.5, 0.9));
    ctx.fillStyle = chargeGrad;
    ctx.fillRect(dropX - chargeW / 2, dropY + 10, chargeW * mi.dropCharge, 6);

    // Pulsing border when close to drop
    if (mi.dropCharge > 0.4) {
      const pulseA = 0.2 + Math.sin(Date.now() * 0.015) * 0.3;
      ctx.strokeStyle = `rgba(255,80,80,${pulseA})`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(dropX - 86, dropY - 16, 172, 44);
    }

    ctx.textAlign = 'left';
  }

  // ===== SMART ALERTS — trigger on events =====

  // Alert: emotion change
  if (mi.emotion !== prevEmotion && mi.emotion !== 'ANALYZING' && mi.emotion !== 'SILENT') {
    if (mi.emotion === 'HARD DROP') {
      pushAlert('drop', 'HARD DROP DETECTED', hslString(330, 0.9, 0.65, 1), 2);
      screenFlashAlpha = 0.3;
      screenFlashHue = 330;
    } else if (mi.emotion === 'BUILD UP') {
      pushAlert('buildup', 'ENERGY BUILD-UP', hslString(40, 0.9, 0.6, 1), 2);
      edgeFlashAlpha = 0.4;
      edgeFlashHue = 40;
    } else if (mi.emotion === 'AGGRESSIVE') {
      pushAlert('aggressive', 'MODE: AGGRESSIVE', hslString(0, 0.9, 0.6, 1), 2);
      edgeFlashAlpha = 0.3;
      edgeFlashHue = 0;
    } else if (mi.emotion === 'EUPHORIC') {
      pushAlert('euphoric', 'EUPHORIA DETECTED', hslString(50, 0.9, 0.7, 1), 2);
      edgeFlashAlpha = 0.25;
      edgeFlashHue = 50;
    } else {
      pushAlert('mood', `MOOD: ${mi.emotion}`, getEmotionColor(mi.emotion, hue), 1.5);
    }
    prevEmotion = mi.emotion;
  }

  // Alert: BPM locked
  if (mi.bpm > 0 && prevBpm === 0) {
    pushAlert('bpm', `BPM LOCKED: ${Math.round(mi.bpm)}`, accentColor, 2);
    edgeFlashAlpha = 0.2;
    edgeFlashHue = hue;
  }
  // Alert: BPM changed significantly
  if (mi.bpm > 0 && prevBpm > 0 && Math.abs(mi.bpm - prevBpm) > 10) {
    pushAlert('bpmchange', `BPM SHIFT: ${Math.round(mi.bpm)}`, hslString(180, 0.8, 0.6, 1), 1.5);
  }
  prevBpm = mi.bpm;

  // Alert: drop detected
  if (mi.isDropping && mi.dropTimer > 1.4) { // just triggered
    screenFlashAlpha = Math.max(screenFlashAlpha, 0.35);
    screenFlashHue = (hue + 180) % 360;
  }

  // Alert: high energy spike
  if (mi.totalEnergy > 180 && mi.spectralFlux > 12) {
    pushAlert('spike', 'ENERGY SPIKE', hslString(20, 0.9, 0.6, 1), 1.5);
    screenFlashAlpha = Math.max(screenFlashAlpha, 0.12);
    screenFlashHue = 20;
  }

  // Alert: silence after loud
  if (mi.emotion === 'SILENT' && prevEmotion !== 'SILENT' && prevEmotion !== 'ANALYZING') {
    pushAlert('silence', 'SIGNAL LOST', 'rgba(255,255,255,0.5)', 2);
  }

  // ===== SCREEN FLASH (full screen color wash) =====
  if (screenFlashAlpha > 0.005) {
    ctx.fillStyle = hslString(screenFlashHue, 0.7, 0.7, screenFlashAlpha);
    ctx.fillRect(0, 0, w, h);
    screenFlashAlpha *= 0.9;
  }

  // ===== EDGE FLASH (border glow on events) =====
  if (edgeFlashAlpha > 0.005) {
    const edgeW = 60;
    // Top
    const topGrad = ctx.createLinearGradient(0, 0, 0, edgeW);
    topGrad.addColorStop(0, hslString(edgeFlashHue, 0.8, 0.6, edgeFlashAlpha));
    topGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, edgeW);
    // Bottom
    const botGrad = ctx.createLinearGradient(0, h, 0, h - edgeW);
    botGrad.addColorStop(0, hslString(edgeFlashHue, 0.8, 0.6, edgeFlashAlpha));
    botGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, h - edgeW, w, edgeW);
    // Left
    const leftGrad = ctx.createLinearGradient(0, 0, edgeW, 0);
    leftGrad.addColorStop(0, hslString(edgeFlashHue, 0.8, 0.6, edgeFlashAlpha * 0.7));
    leftGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = leftGrad;
    ctx.fillRect(0, 0, edgeW, h);
    // Right
    const rightGrad = ctx.createLinearGradient(w, 0, w - edgeW, 0);
    rightGrad.addColorStop(0, hslString(edgeFlashHue, 0.8, 0.6, edgeFlashAlpha * 0.7));
    rightGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rightGrad;
    ctx.fillRect(w - edgeW, 0, edgeW, h);

    edgeFlashAlpha *= 0.92;
  }

  // ===== RENDER ALERTS (right side, stacked) =====
  const alertX = w - pad - 10;
  let alertY = h / 2 - (alerts.length * 30) / 2;

  for (let i = alerts.length - 1; i >= 0; i--) {
    const a = alerts[i];
    a.timer -= dt;
    if (a.timer <= 0) { alerts.splice(i, 1); continue; }

    const fadeIn = clamp((a.maxTimer - a.timer) / 0.2, 0, 1);
    const fadeOut = clamp(a.timer / 0.3, 0, 1);
    const alpha = Math.min(fadeIn, fadeOut);
    const slideX = (1 - fadeIn) * 50;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Alert bg
    ctx.textAlign = 'right';
    ctx.font = '600 12px monospace';
    const textW = ctx.measureText(a.text).width;

    drawPanel(ctx, alertX - textW - 24 + slideX, alertY - 10, textW + 20, 24, 'rgba(0,0,0,0.5)');

    // Colored left accent bar
    ctx.fillStyle = a.color;
    ctx.fillRect(alertX - textW - 24 + slideX, alertY - 10, 3, 24);

    // Text
    ctx.fillStyle = a.color;
    ctx.fillText(a.text, alertX - 8 + slideX, alertY + 5);

    ctx.restore();
    alertY += 30;
  }

  // ===== BEAT FLASH BORDER (pulses on every beat) =====
  if (mi.beatPhase < 0.15 && mi.bpm > 0) {
    const beatFlash = 1 - mi.beatPhase / 0.15;
    ctx.strokeStyle = hslString(hue, 0.5, 0.6, beatFlash * 0.08);
    ctx.lineWidth = 2;
    ctx.strokeRect(pad - 5, pad - 5, w - pad * 2 + 10, h - pad * 2 + 10);
  }

  // ===== SCAN LINES =====
  ctx.fillStyle = 'rgba(0,0,0,0.015)';
  for (let sy = 0; sy < h; sy += 3) {
    ctx.fillRect(0, sy, w, 1);
  }

  // ===== CORNER BRACKETS =====
  const bracketSize = 25;
  ctx.strokeStyle = hslString(hue, 0.5, 0.5, 0.2 + edgeFlashAlpha);
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(pad, pad + bracketSize); ctx.lineTo(pad, pad); ctx.lineTo(pad + bracketSize, pad);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w - pad - bracketSize, pad); ctx.lineTo(w - pad, pad); ctx.lineTo(w - pad, pad + bracketSize);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pad, h - pad - bracketSize); ctx.lineTo(pad, h - pad); ctx.lineTo(pad + bracketSize, h - pad);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w - pad - bracketSize, h - pad); ctx.lineTo(w - pad, h - pad); ctx.lineTo(w - pad, h - pad - bracketSize);
  ctx.stroke();

  // ===== STATUS LINE =====
  ctx.font = HUD_FONT_LABEL;
  ctx.fillStyle = textDim;
  ctx.textAlign = 'center';
  ctx.fillText(
    `FFT:128  //  E:${Math.round(mi.totalEnergy)}  //  FLUX:${mi.spectralFlux.toFixed(1)}  //  BRT:${(mi.brightness * 100).toFixed(0)}%`,
    w / 2, pad + 12
  );
  ctx.textAlign = 'left';

  // ===== FLOATING RECOGNIZED WORDS =====
  const recentWords = mi.getRecentWords ? mi.getRecentWords(5) : [];

  // Spawn new floating text for new words
  if (recentWords.length > lastWordCount) {
    for (let i = lastWordCount; i < recentWords.length; i++) {
      const word = recentWords[i];
      if (!word.final && word.text.length < 3) continue;
      floatingTexts.push({
        text: word.text,
        x: 0.1 + Math.random() * 0.8,
        y: 0.2 + Math.random() * 0.6,
        vx: (Math.random() - 0.5) * 0.02,
        vy: -0.01 - Math.random() * 0.02,
        size: 18 + Math.random() * 28,
        alpha: 1,
        hue: (hue + Math.random() * 120) % 360,
        rotation: (Math.random() - 0.5) * 0.3,
        type: 'word',
      });
    }
  }
  lastWordCount = recentWords.length;

  // Spawn energy-based floating effects on beats
  floatSpawnTimer += dt;
  if (mi.beatPhase < 0.05 && floatSpawnTimer > 0.3 && mi.totalEnergy > 50) {
    floatSpawnTimer = 0;
    const effectTexts = [
      '///PULSE', '>>SYNC', '◆◆◆', '★★★', '⚡⚡', '♪♫♪',
      '::BEAT::', '▶▶▶', '∞∞∞', '✦✦✦', '≋≋≋', '◈◈◈',
    ];
    if (Math.random() > 0.5) {
      floatingTexts.push({
        text: effectTexts[Math.floor(Math.random() * effectTexts.length)],
        x: Math.random(),
        y: 0.3 + Math.random() * 0.4,
        vx: (Math.random() - 0.5) * 0.03,
        vy: (Math.random() - 0.5) * 0.02,
        size: 10 + Math.random() * 14,
        alpha: 0.5 + Math.random() * 0.3,
        hue: (hue + Math.random() * 60) % 360,
        rotation: 0,
        type: 'effect',
      });
    }
  }

  // Drop-triggered big text
  if (mi.isDropping && mi.dropTimer > 1.3) {
    const dropTexts = ['BASS', 'DROP', 'BOOM', 'FIRE', '🔥', '💥'];
    floatingTexts.push({
      text: dropTexts[Math.floor(Math.random() * dropTexts.length)],
      x: 0.3 + Math.random() * 0.4,
      y: 0.3 + Math.random() * 0.4,
      vx: (Math.random() - 0.5) * 0.04,
      vy: (Math.random() - 0.5) * 0.03,
      size: 36 + Math.random() * 30,
      alpha: 1,
      hue: (hue + 180) % 360,
      rotation: (Math.random() - 0.5) * 0.5,
      type: 'drop',
    });
  }

  // Update & render floating texts
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];

    ft.x += ft.vx * dt;
    ft.y += ft.vy * dt;
    ft.rotation *= 0.98;

    // Decay speed based on type
    if (ft.type === 'word') ft.alpha -= dt * 0.25;
    else if (ft.type === 'drop') ft.alpha -= dt * 0.4;
    else ft.alpha -= dt * 0.35;

    // Scale effect: grows slightly then shrinks
    const lifeRatio = ft.alpha;
    const scale = ft.type === 'drop'
      ? 1 + (1 - lifeRatio) * 0.5
      : 1;

    if (ft.alpha <= 0) { floatingTexts.splice(i, 1); continue; }

    const fx = ft.x * w;
    const fy = ft.y * h;

    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(ft.rotation);
    ctx.scale(scale, scale);

    const ftSize = ft.size;
    ctx.font = `700 ${ftSize}px monospace`;
    ctx.textAlign = 'center';

    // Glow
    ctx.fillStyle = hslString(ft.hue, 0.8, 0.6, ft.alpha * 0.15);
    ctx.fillText(ft.text, 2, 2);
    ctx.fillText(ft.text, -2, -2);

    // Main text
    ctx.fillStyle = hslString(ft.hue, 0.7, 0.8, ft.alpha);
    ctx.fillText(ft.text, 0, 0);

    ctx.restore();
  }

  // Cap floating texts
  while (floatingTexts.length > 25) floatingTexts.shift();

  ctx.restore();
}

// ===== Helpers =====

function drawPanel(ctx, x, y, w, h, bg) {
  ctx.fillStyle = bg;
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();

  // Subtle border
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function getEmotionColor(emotion, hue) {
  switch (emotion) {
    case 'AGGRESSIVE': return hslString(0, 0.9, 0.6, 0.9);
    case 'HARD DROP': return hslString(330, 0.95, 0.65, 1);
    case 'BUILD UP': return hslString(40, 0.9, 0.6, 0.9);
    case 'EUPHORIC': return hslString(50, 0.9, 0.7, 0.9);
    case 'ENERGETIC': return hslString(30, 0.8, 0.6, 0.9);
    case 'MELODIC': return hslString(180, 0.7, 0.6, 0.9);
    case 'FLOWING': return hslString(210, 0.6, 0.6, 0.9);
    case 'AMBIENT': return hslString(240, 0.5, 0.6, 0.7);
    case 'SILENT': return 'rgba(255,255,255,0.3)';
    default: return hslString(hue, 0.5, 0.6, 0.7);
  }
}
