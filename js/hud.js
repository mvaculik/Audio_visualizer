// js/hud.js — Futuristic HUD overlay: BPM, drop predictor, DNA, emotion, energy

import { lerp, map, clamp, hslString } from './utils.js';

const HUD_FONT = '500 11px monospace';
const HUD_FONT_BIG = '700 28px monospace';
const HUD_FONT_LABEL = '400 9px monospace';
const HISTORY_LEN = 200; // matches music-intelligence

let hudAlpha = 0; // fade in/out

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

  // ===== SCAN LINES (subtle CRT effect over entire HUD area) =====
  ctx.fillStyle = 'rgba(0,0,0,0.02)';
  for (let sy = 0; sy < h; sy += 3) {
    ctx.fillRect(0, sy, w, 1);
  }

  // ===== CORNER BRACKETS (sci-fi frame) =====
  const bracketSize = 25;
  const bracketWidth = 1;
  ctx.strokeStyle = hslString(hue, 0.5, 0.5, 0.2);
  ctx.lineWidth = bracketWidth;

  // Top-left
  ctx.beginPath();
  ctx.moveTo(pad, pad + bracketSize);
  ctx.lineTo(pad, pad);
  ctx.lineTo(pad + bracketSize, pad);
  ctx.stroke();

  // Top-right
  ctx.beginPath();
  ctx.moveTo(w - pad - bracketSize, pad);
  ctx.lineTo(w - pad, pad);
  ctx.lineTo(w - pad, pad + bracketSize);
  ctx.stroke();

  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(pad, h - pad - bracketSize);
  ctx.lineTo(pad, h - pad);
  ctx.lineTo(pad + bracketSize, h - pad);
  ctx.stroke();

  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(w - pad - bracketSize, h - pad);
  ctx.lineTo(w - pad, h - pad);
  ctx.lineTo(w - pad, h - pad - bracketSize);
  ctx.stroke();

  // ===== TOP CENTER: tiny status line =====
  ctx.font = HUD_FONT_LABEL;
  ctx.fillStyle = textDim;
  ctx.textAlign = 'center';
  const statusParts = [
    `FFT:${128}`,
    `E:${Math.round(mi.totalEnergy)}`,
    `FLUX:${mi.spectralFlux.toFixed(1)}`,
  ];
  ctx.fillText(statusParts.join('  //  '), w / 2, pad + 12);
  ctx.textAlign = 'left';

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
