# Audio Visualizer V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Audio_visualizer into a modern, breathtaking multi-mode audio visualizer with YouTube integration, drag & drop, and fully responsive glassmorphism UI.

**Architecture:** Single-page app with ES modules (no bundler). AudioEngine wraps Web Audio API for local files; YouTubePlayer wraps IFrame API; Simulation generates fake frequency data for YouTube mode. Visualizer orchestrator delegates to 5 pluggable renderer modules. App.js coordinates everything.

**Tech Stack:** Vanilla JS (ES modules), Canvas 2D, Web Audio API, YouTube IFrame Player API, CSS custom properties + glassmorphism.

**Spec:** `docs/superpowers/specs/2026-03-18-audio-visualizer-v2-design.md`

---

## File Structure

```
index.html                    — single page, all UI structure
css/style.css                 — all styles, responsive, glassmorphism, animations
js/utils.js                   — shared math: lerp, clamp, map, hsl2rgb, Perlin noise
js/audio-engine.js            — Web Audio API wrapper, AnalyserNode, source management
js/simulation.js              — fake audio data for YouTube (Perlin noise + beats)
js/youtube-player.js          — YouTube IFrame API wrapper
js/playlist.js                — playlist state, shuffle, localStorage persistence
js/visualizers/radial.js      — radial visualizer (enhanced original)
js/visualizers/bars.js        — equalizer bars
js/visualizers/waveform.js    — oscilloscope waveform
js/visualizers/particles.js   — particle system
js/visualizers/spectrum.js    — waterfall spectrogram
js/visualizer.js              — canvas manager, mode switching, render loop
js/app.js                     — entry point, init, event wiring, state coordination
```

---

### Task 1: utils.js — Shared Math Utilities

**Files:**
- Create: `js/utils.js`

- [ ] **Step 1: Create utils.js with all shared math functions**

```js
// js/utils.js
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function map(value, inMin, inMax, outMin, outMax) {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

export function hsl2rgb(h, s, l) {
  // h: 0-360, s: 0-1, l: 0-1 → [r,g,b] 0-255
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

export function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

// Perlin noise (simplified 2D)
const PERM = new Uint8Array(512);
(function initPerm() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function grad(hash, x, y) {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}

export function perlin(x, y) {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);
  const aa = PERM[PERM[xi] + yi];
  const ab = PERM[PERM[xi] + yi + 1];
  const ba = PERM[PERM[xi + 1] + yi];
  const bb = PERM[PERM[xi + 1] + yi + 1];
  return lerp(
    lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
    lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
    v
  );
}

// Multi-octave Perlin
export function perlinOctaves(x, y, octaves = 3, persistence = 0.5) {
  let total = 0, frequency = 1, amplitude = 1, maxVal = 0;
  for (let i = 0; i < octaves; i++) {
    total += perlin(x * frequency, y * frequency) * amplitude;
    maxVal += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  return total / maxVal;
}
```

- [ ] **Step 2: Verify module loads**

Open browser dev console, import the module, test `lerp(0, 10, 0.5)` returns 5.

- [ ] **Step 3: Commit**

```bash
git add js/utils.js
git commit -m "feat: add shared math utilities (lerp, clamp, Perlin noise, HSL conversion)"
```

---

### Task 2: audio-engine.js — Web Audio API Wrapper

**Files:**
- Create: `js/audio-engine.js`

- [ ] **Step 1: Create AudioEngine class**

```js
// js/audio-engine.js
export class AudioEngine {
  constructor() {
    this.context = null;
    this.analyser = null;
    this.source = null;
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.frequencyData = null;
    this.timeDomainData = null;
    this._onEndedCb = null;
    this._initialized = false;
  }

  init() {
    if (this._initialized) {
      this.context.resume();
      return;
    }
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256; // 128 frequency bins
    this.analyser.smoothingTimeConstant = 0.8;
    this.source = this.context.createMediaElementSource(this.audio);
    this.source.connect(this.analyser);
    this.analyser.connect(this.context.destination);
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeDomainData = new Uint8Array(this.analyser.frequencyBinCount);
    this._initialized = true;
  }

  loadFile(src) {
    // src can be a URL string or blob URL from File
    this.audio.src = src;
    this.audio.load();
  }

  async play() {
    if (this.context && this.context.state === 'suspended') {
      await this.context.resume();
    }
    return this.audio.play();
  }

  pause() { this.audio.pause(); }

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  setVolume(v) { this.audio.volume = v; }
  getVolume() { return this.audio.volume; }
  get isPlaying() { return !this.audio.paused; }
  getCurrentTime() { return this.audio.currentTime; }
  getDuration() { return this.audio.duration || 0; }
  seekTo(time) { this.audio.currentTime = time; }

  getFrequencyData() {
    if (this.analyser) this.analyser.getByteFrequencyData(this.frequencyData);
    return this.frequencyData;
  }

  getTimeDomainData() {
    if (this.analyser) this.analyser.getByteTimeDomainData(this.timeDomainData);
    return this.timeDomainData;
  }

  onEnded(cb) {
    if (this._onEndedCb) this.audio.removeEventListener('ended', this._onEndedCb);
    this._onEndedCb = cb;
    this.audio.addEventListener('ended', cb);
  }
}
```

- [ ] **Step 2: Verify by loading a local mp3 and checking frequency data is non-zero**

- [ ] **Step 3: Commit**

```bash
git add js/audio-engine.js
git commit -m "feat: add AudioEngine - Web Audio API wrapper with analyser"
```

---

### Task 3: simulation.js — Fake Audio Data for YouTube

**Files:**
- Create: `js/simulation.js`

- [ ] **Step 1: Create AudioSimulation class**

```js
// js/simulation.js
import { perlinOctaves, clamp, lerp } from './utils.js';

export class AudioSimulation {
  constructor(bins = 128) {
    this.bins = bins;
    this.frequencyData = new Uint8Array(bins);
    this.timeDomainData = new Uint8Array(bins);
    this.time = 0;
    this.playing = false;
    this.beatTimer = 0;
    this.beatInterval = 0.5; // seconds between beats
    this.beatIntensity = 0;
    this.seed = Math.random() * 1000;
  }

  setState(state) {
    this.playing = state === 'playing';
  }

  reset() {
    this.time = 0;
    this.beatTimer = 0;
    this.beatIntensity = 0;
  }

  update(dt) {
    if (!this.playing) {
      // Decay to silence
      for (let i = 0; i < this.bins; i++) {
        this.frequencyData[i] = Math.max(0, this.frequencyData[i] - 8);
        this.timeDomainData[i] = lerp(this.timeDomainData[i], 128, 0.1);
      }
      return;
    }

    this.time += dt;
    this.beatTimer += dt;

    // Trigger beats
    if (this.beatTimer >= this.beatInterval) {
      this.beatTimer = 0;
      this.beatIntensity = 0.6 + Math.random() * 0.4;
      this.beatInterval = 0.35 + Math.random() * 0.45; // 0.35-0.8s
    }
    this.beatIntensity *= 0.92; // decay

    // Overall intensity envelope (slow wave)
    const envelope = 0.5 + 0.5 * Math.sin(this.time * 0.3);

    for (let i = 0; i < this.bins; i++) {
      const ratio = i / this.bins;
      const noise = perlinOctaves(
        i * 0.08 + this.seed,
        this.time * (0.5 + ratio * 3),
        3, 0.5
      );

      let value;
      if (ratio < 0.12) {
        // Bass: slow, strong, beat-reactive
        value = 120 + noise * 80 + this.beatIntensity * 150;
      } else if (ratio < 0.5) {
        // Mids: medium variation
        value = 80 + noise * 100 + this.beatIntensity * 60;
      } else {
        // Highs: fast sparkle
        value = 40 + noise * 80 + Math.random() * 30;
      }

      value *= envelope;
      this.frequencyData[i] = clamp(Math.round(value), 0, 255);
    }

    // Generate waveform (sine-based simulation)
    for (let i = 0; i < this.bins; i++) {
      const wave = Math.sin(i * 0.15 + this.time * 8) * (40 + this.beatIntensity * 60);
      const noise = perlinOctaves(i * 0.1, this.time * 2, 2) * 20;
      this.timeDomainData[i] = clamp(Math.round(128 + wave + noise), 0, 255);
    }
  }

  getFrequencyData() { return this.frequencyData; }
  getTimeDomainData() { return this.timeDomainData; }
}
```

- [ ] **Step 2: Commit**

```bash
git add js/simulation.js
git commit -m "feat: add AudioSimulation - Perlin noise fake audio for YouTube mode"
```

---

### Task 4: youtube-player.js — YouTube IFrame API

**Files:**
- Create: `js/youtube-player.js`

- [ ] **Step 1: Create YouTubePlayer class**

```js
// js/youtube-player.js
export class YouTubePlayer {
  constructor() {
    this.player = null;
    this.ready = false;
    this._onStateChangeCb = null;
    this._containerId = null;
  }

  init(containerId) {
    this._containerId = containerId;
    return new Promise((resolve) => {
      if (window.YT && window.YT.Player) {
        this._createPlayer(resolve);
        return;
      }
      // Load YouTube IFrame API
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
      window.onYouTubeIframeAPIReady = () => this._createPlayer(resolve);
    });
  }

  _createPlayer(resolve) {
    this.player = new YT.Player(this._containerId, {
      height: '0',
      width: '0',
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
      },
      events: {
        onReady: () => { this.ready = true; resolve(); },
        onStateChange: (e) => {
          if (this._onStateChangeCb) this._onStateChangeCb(e.data);
        },
      },
    });
  }

  static extractVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  }

  loadVideo(urlOrId) {
    const id = YouTubePlayer.extractVideoId(urlOrId) || urlOrId;
    if (this.player && this.ready) {
      this.player.loadVideoById(id);
    }
  }

  play() { if (this.player) this.player.playVideo(); }
  pause() { if (this.player) this.player.pauseVideo(); }
  stop() { if (this.player) this.player.stopVideo(); }
  setVolume(v) { if (this.player) this.player.setVolume(v); } // 0-100
  getVolume() { return this.player ? this.player.getVolume() : 50; }
  getCurrentTime() { return this.player ? this.player.getCurrentTime() : 0; }
  getDuration() { return this.player ? this.player.getDuration() : 0; }

  get isPlaying() {
    return this.player && this.player.getPlayerState() === YT.PlayerState.PLAYING;
  }

  getState() {
    if (!this.player) return 'paused';
    const s = this.player.getPlayerState();
    if (s === YT.PlayerState.PLAYING) return 'playing';
    if (s === YT.PlayerState.BUFFERING) return 'buffering';
    if (s === YT.PlayerState.ENDED) return 'ended';
    return 'paused';
  }

  onStateChange(cb) { this._onStateChangeCb = cb; }
}
```

- [ ] **Step 2: Commit**

```bash
git add js/youtube-player.js
git commit -m "feat: add YouTubePlayer - IFrame API wrapper with URL parsing"
```

---

### Task 5: playlist.js — Playlist Management

**Files:**
- Create: `js/playlist.js`

- [ ] **Step 1: Create Playlist class**

```js
// js/playlist.js
const EXISTING_TRACKS = [
  { file: 'allTheTime', name: 'Zara Larsson - All the Time (Don Diablo Remix)' },
  { file: 'supersmash', name: 'Super Smash Bros Brawl Drill Remix' },
  { file: 'Armin_LYH', name: 'Armin van Buuren - Lifting You Higher' },
  { file: 'Don Diablo - Momentum', name: 'Don Diablo - Momentum' },
  { file: 'RASPUTIN', name: 'Rasputin - Vladimir Putin Funk Overload' },
  { file: 'free', name: 'TWOLOUD & MureKian - Free' },
  { file: 'House You', name: 'Don Diablo - I will House You' },
  { file: 'Stonebank1', name: 'Stonebank - Be Alright (Au5 Remix)' },
  { file: 'au5', name: 'Au5 - Snowblind (Darren Styles Remix)' },
  { file: 'Darrenstyles', name: 'Darren Styles - Us Against The World' },
  { file: 'infinitepower', name: 'TheFatRat - Infinite Power!' },
  { file: 'Pentakill', name: 'Different Heaven - Pentakill' },
  { file: 'andiamo', name: 'Fabio Rovazzi - Andiamo A Comandare' },
  { file: 'Alok', name: 'Alok VIZE - Love Again' },
  { file: 'hardbass', name: 'Hard Bass School - Narkotik Kal' },
  { file: 'higher', name: 'Ummet Ozcan x Lucas & Steve - Higher' },
  { file: 'virus', name: 'Martin Garrix & MOTi - Virus' },
  { file: 'Prismo', name: 'Prismo' },
  { file: 'Hellberg', name: 'Hellberg' },
  { file: 'Halsey', name: 'Halsey' },
  { file: 'INZO', name: 'INZO' },
  { file: 'ED_MOTN', name: 'Elley Duhé - Middle of the Night (Starix Remix)' },
];

export class Playlist {
  constructor() {
    this.tracks = [];
    this.currentIndex = -1;
    this.repeat = 'all'; // 'none' | 'one' | 'all'
    this.shuffled = false;
    this._onTrackChangeCb = null;
    this._init();
  }

  _init() {
    // Load built-in tracks
    for (const t of EXISTING_TRACKS) {
      this.tracks.push({
        type: 'local',
        src: `mp3s/${t.file}.mp3`,
        name: t.name,
      });
    }
    // Load user tracks from localStorage
    try {
      const saved = JSON.parse(localStorage.getItem('av_user_tracks') || '[]');
      for (const t of saved) this.tracks.push(t);
    } catch (e) { /* ignore */ }

    // Start at random position
    this.currentIndex = Math.floor(Math.random() * this.tracks.length);
  }

  _save() {
    const userTracks = this.tracks.filter(
      (t) => !EXISTING_TRACKS.some((e) => `mp3s/${e.file}.mp3` === t.src)
    );
    localStorage.setItem('av_user_tracks', JSON.stringify(userTracks));
  }

  add(track) {
    this.tracks.push(track);
    this._save();
  }

  remove(index) {
    this.tracks.splice(index, 1);
    if (this.currentIndex >= this.tracks.length) this.currentIndex = 0;
    this._save();
  }

  next() {
    if (this.repeat === 'one') { /* stay */ }
    else if (this.currentIndex < this.tracks.length - 1) this.currentIndex++;
    else if (this.repeat === 'all') this.currentIndex = 0;
    else return false;
    if (this._onTrackChangeCb) this._onTrackChangeCb(this.getCurrent());
    return true;
  }

  prev() {
    if (this.currentIndex > 0) this.currentIndex--;
    else if (this.repeat === 'all') this.currentIndex = this.tracks.length - 1;
    if (this._onTrackChangeCb) this._onTrackChangeCb(this.getCurrent());
  }

  goTo(index) {
    if (index >= 0 && index < this.tracks.length) {
      this.currentIndex = index;
      if (this._onTrackChangeCb) this._onTrackChangeCb(this.getCurrent());
    }
  }

  shuffle() {
    // Fisher-Yates, keep current track at index 0
    const current = this.tracks[this.currentIndex];
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    }
    this.currentIndex = this.tracks.indexOf(current);
    this.shuffled = !this.shuffled;
  }

  getCurrent() { return this.tracks[this.currentIndex] || null; }
  getAll() { return this.tracks; }
  get length() { return this.tracks.length; }

  onTrackChange(cb) { this._onTrackChangeCb = cb; }
}
```

- [ ] **Step 2: Commit**

```bash
git add js/playlist.js
git commit -m "feat: add Playlist - track management, shuffle, localStorage persistence"
```

---

### Task 6: Visualizers — All 5 Modules

**Files:**
- Create: `js/visualizers/radial.js`
- Create: `js/visualizers/bars.js`
- Create: `js/visualizers/waveform.js`
- Create: `js/visualizers/particles.js`
- Create: `js/visualizers/spectrum.js`

Each module exports: `init(canvas, ctx)`, `render(frequencyData, timeDomainData, dt, w, h)`, `destroy()`.

- [ ] **Step 1: Create radial.js**

Enhanced version of original: bars around circle, center pulses with bass, HSL color cycling, particle orbit. Full code in implementation (200+ lines).

- [ ] **Step 2: Create bars.js**

64-band equalizer with rounded tops, mirror reflection, glow via additive blending, bass-warm to highs-cool gradient.

- [ ] **Step 3: Create waveform.js**

Full-width oscilloscope from timeDomainData, neon trail effect (persistence of vision via reduced-alpha fillRect), line thickness = RMS volume.

- [ ] **Step 4: Create particles.js**

Object-pooled 600 particles. Bass=big+slow, highs=small+fast. Bass-drop explosion from center. Gravity pull to center, push on peak.

- [ ] **Step 5: Create spectrum.js**

Vertical scrolling spectrogram using offscreen canvas for history. Heatmap palette: black→purple→red→yellow→white.

- [ ] **Step 6: Commit all visualizers**

```bash
git add js/visualizers/
git commit -m "feat: add 5 visualizer modes - radial, bars, waveform, particles, spectrum"
```

---

### Task 7: visualizer.js — Canvas Orchestrator

**Files:**
- Create: `js/visualizer.js`

- [ ] **Step 1: Create Visualizer class**

Manages canvas sizing, mode switching with crossfade, delegates render() to active module. Handles devicePixelRatio (capped at 2x). Background gradient that shifts hue. Floating dust particles always visible.

- [ ] **Step 2: Commit**

```bash
git add js/visualizer.js
git commit -m "feat: add Visualizer orchestrator - canvas management, mode switching, background effects"
```

---

### Task 8: index.html + style.css — UI Shell

**Files:**
- Create (overwrite): `index.html`
- Create (overwrite): `css/style.css`

- [ ] **Step 1: Write index.html**

Full-screen layout, canvas background, glassmorphism control bar (bottom), playlist sidebar (left), YouTube URL input, hidden YouTube player container, mode selector, volume slider, progress bar, song info, intro overlay.

- [ ] **Step 2: Write style.css**

Dark theme, glassmorphism panels (`backdrop-filter: blur(20px)`), CSS custom properties for accent color, responsive breakpoints (768px), animations (fade, slide, pulse), custom scrollbar, 44px touch targets on mobile.

- [ ] **Step 3: Commit**

```bash
git add index.html css/style.css
git commit -m "feat: add glassmorphism UI shell - responsive layout, control bar, playlist sidebar"
```

---

### Task 9: app.js — Entry Point & State Coordination

**Files:**
- Create: `js/app.js`

- [ ] **Step 1: Create App class**

Wires everything together:
- Click-to-start overlay (AudioContext init on user gesture)
- Creates AudioEngine, YouTubePlayer, Simulation, Playlist, Visualizer
- Routes audio data (real or simulated) to visualizer render loop
- Event handlers: play/pause, next/prev, volume, seek, mode switch, YouTube URL submit
- Drag & drop handler (whole page as drop zone, creates blob URL, adds to playlist)
- Keyboard shortcuts (Space=play/pause, 1-5=modes, N=next, P=prev)
- Responsive: detects mobile, adjusts particle count

- [ ] **Step 2: Commit**

```bash
git add js/app.js
git commit -m "feat: add App entry point - state coordination, drag&drop, keyboard shortcuts"
```

---

### Task 10: Cleanup & Polish

**Files:**
- Remove: `js/script.js` (old code)
- Remove: `js/console.image.min.js` (unused)
- Remove: `js/countup.js` (unused)
- Remove: `ajax.googleapis.com/` (local jQuery copy)
- Remove: `cdnjs.cloudflare.com/` (local font-awesome copy)
- Keep: `mp3s/`, `logo.png`, `css/cursor.png`

- [ ] **Step 1: Remove old files**

```bash
rm js/script.js js/console.image.min.js
rm -rf "ajax.googleapis.com" "cdnjs.cloudflare.com"
```

Note: `js/countup.js` doesn't exist in repo (was loaded but missing).

- [ ] **Step 2: Test full flow in browser**

1. Open index.html in browser
2. Click to start → music plays, visualizer renders
3. Press 1-5 to switch modes
4. Paste YouTube URL → video plays, simulation visualizes
5. Drag & drop local audio file → adds to playlist, plays
6. Resize browser → responsive layout adjusts
7. Test on mobile viewport

- [ ] **Step 3: Commit cleanup**

```bash
git add -A
git commit -m "chore: remove legacy jQuery code and unused dependencies"
```

---

### Task 11: Push to GitHub

- [ ] **Step 1: Verify all changes**

```bash
git log --oneline
git status
```

- [ ] **Step 2: Push**

```bash
git push origin main
```
