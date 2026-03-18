# Audio Visualizer V2 — Design Spec

## Overview
Complete rewrite of Audio_visualizer from jQuery-based single-mode visualizer to a modern, zero-framework, multi-mode audio visualizer with YouTube integration, drag & drop, responsive design, and breathtaking visual effects.

## Tech Stack
- Vanilla JS (ES modules, no bundler)
- Canvas 2D + requestAnimationFrame
- Web Audio API (AnalyserNode)
- YouTube IFrame Player API (external API, loaded dynamically)
- CSS custom properties + glassmorphism + animations
- Zero JS frameworks/libraries (YouTube API is the only external load)

## Architecture

```
index.html
css/style.css
js/
  app.js              — entry point, init, event routing, state coordinator
  audio-engine.js     — Web Audio API, AnalyserNode, source mgmt
  youtube-player.js   — YouTube IFrame API wrapper
  simulation.js       — fake audio data generator for YouTube mode
  playlist.js         — playlist state, shuffle, file handling
  visualizer.js       — canvas setup, mode switching, render loop
  utils.js            — shared math (lerp, clamp, map, HSL, distance, Perlin)
  visualizers/
    radial.js         — enhanced radial (glow, particles, color cycle)
    bars.js           — equalizer bars (reflections, bloom, gradient)
    waveform.js       — oscilloscope (neon glow, trail persistence)
    particles.js      — particle system (frequency-driven physics)
    spectrum.js       — waterfall spectrogram (heatmap)
mp3s/                 — existing local tracks
assets/               — logos, icons
```

## Module Interfaces

### audio-engine.js
```js
export class AudioEngine {
  init()                          // create AudioContext (must be called on user gesture)
  loadFile(file: File|string)     // load from File object or URL
  play(), pause(), stop()
  setVolume(0-1)
  getFrequencyData(): Uint8Array  // 128-band frequency data
  getTimeDomainData(): Uint8Array // waveform data
  getCurrentTime(): number
  getDuration(): number
  onEnded(callback)
  isPlaying: boolean
}
```

### youtube-player.js
```js
export class YouTubePlayer {
  init(containerId)               // load IFrame API, create player
  loadVideo(urlOrId)              // parse YouTube URL, extract ID, cue video
  play(), pause(), stop()
  setVolume(0-100)
  getState(): 'playing'|'paused'|'ended'|'buffering'
  getCurrentTime(): number
  getDuration(): number
  onStateChange(callback)
  isPlaying: boolean
}
```

### simulation.js — YouTube Fake Audio Engine
```js
export class AudioSimulation {
  constructor()
  // Generates Uint8Array(128) mimicking frequency data
  // Algorithm:
  //   - 3 octaves of hand-written Perlin noise (~80 lines, no library)
  //   - Bass range (0-15): slow oscillation (0.5-2 Hz) + random beat spikes
  //   - Mids range (16-63): medium oscillation (2-8 Hz) + Perlin variation
  //   - Highs range (64-127): fast oscillation (8-20 Hz) + sparkle noise
  //   - "Beat" events: every 0.4-0.8s (configurable), spike bass bins by 80-150
  //   - Overall intensity envelope: sine wave at ~0.05 Hz (slow builds/drops)
  //   - State-aware: pause=decay to zero, play=ramp up, seek=reset phase
  getFrequencyData(): Uint8Array
  getTimeDomainData(): Uint8Array
  setState(state: 'playing'|'paused')
  reset()
}
```

### visualizer.js
```js
// Each visualizer module must export:
export function init(canvas, ctx) {}
export function render(frequencyData, timeDomainData, dt) {}
export function destroy() {} // cleanup
```

### playlist.js
```js
export class Playlist {
  constructor(initialTracks)
  add(track: {type:'local'|'youtube', src, name})
  remove(index)
  next(), prev()
  shuffle()                      // Fisher-Yates
  setRepeat('none'|'one'|'all')
  getCurrent(): Track
  getAll(): Track[]
  onTrackChange(callback)
  // Persistence: localStorage for user-added tracks
  // Original mp3s[] array migrated to Track format on init
}
```

## Audio Sources
1. **Local MP3s** — existing playlist, auto-advances
2. **Drag & Drop / File Picker** — drop zone is the entire page, files added to playlist and play immediately. Accepted: audio/* MIME types. Uses `URL.createObjectURL()`.
3. **YouTube** — paste URL in input field, extracts video ID, plays via hidden IFrame. Visualization via simulation.js.

## AudioContext Autoplay Policy
- AudioContext created lazily on first user gesture (click/tap)
- "Click to Start" overlay shown on page load (replaces old preloader)
- `context.resume()` called on every play action as safety net
- YouTube IFrame also requires user gesture for autoplay on mobile

## Visualization Modes (5)
All implement the same interface: `init(canvas, ctx)`, `render(freqData, timeData, dt)`, `destroy()`.

1. **Radial** — bars around circle, center logo pulses with bass, HSL color cycling based on dominant frequency, particle orbit on highs
2. **Bars** — 64-band equalizer, rounded tops, mirror reflection, neon glow via additive blending (NOT shadowBlur), warm→cool gradient
3. **Waveform** — full-width oscilloscope from timeDomainData, neon trail (previous frames at reduced alpha), line thickness = RMS volume
4. **Particles** — object-pooled (pre-allocated 600 particles, reuse), bass=big+slow, highs=small+fast, bass-drop explosion, gravity to center
5. **Spectrum** — vertical scrolling spectrogram, heatmap palette, uses offscreen canvas for history buffer

**Per-song themes from original code are dropped** — replaced by automatic HSL color cycling that adapts to any song.

## Performance Strategy
- **Glow/bloom via additive blending** (`globalCompositeOperation: 'lighter'`) and multi-pass drawing at reduced alpha — NOT `shadowBlur` (too expensive)
- **Object pooling** for particles — no GC pressure
- **Mobile detection**: reduce particle count to 200, disable background dust, simplify glow to single pass
- **`devicePixelRatio` aware** but capped at 2x to prevent GPU overload on 3x screens
- **Offscreen canvas** for spectrum history buffer

## UI/UX Design
- **Full-screen canvas** as background (viewport-filling, no scrollbars)
- **Floating glass control bar** at bottom center — `backdrop-filter: blur(20px)`, `background: rgba(255,255,255,0.05)`, rounded corners, subtle border
- **Playlist sidebar** — slides in from left on click/swipe, same glass style, scrollable track list
- **YouTube input** — in control bar, input field with "Paste YouTube URL" placeholder
- **Song info** — top center, animated fade in/out on track change, modern sans-serif font
- **Mode selector** — 5 small icons in control bar, or keys 1-5
- **Volume** — horizontal slider in control bar with purple gradient fill
- **Progress bar** — 2px line at very top of viewport, click to seek (local files only)
- **Intro** — full-screen "Click anywhere to start" with floating particles, fades out on interaction
- **Background** — subtle radial gradient that slowly shifts hue, always visible behind canvas

## Responsive Strategy
- CSS `min()` / `clamp()` / `vw`/`vh` units, no fixed pixel widths
- Canvas: `width/height = window.innerWidth/Height`, resize on window resize
- Control bar: horizontal on desktop (>768px), stacked vertical on mobile
- Playlist: sidebar on desktop, full-screen overlay on mobile
- Touch: swipe left/right to change mode, tap controls have 44px min target
- `<meta viewport>` with `width=device-width, initial-scale=1.0`

## Error Handling
- AudioContext creation failure → show message, still allow YouTube playback
- YouTube API load failure → hide YouTube input, show toast "YouTube unavailable"
- Invalid audio file dropped → toast notification "Unsupported file format"
- Missing MP3 from playlist → skip to next, remove from list
- Network offline → local files still work, YouTube disabled

## Data Flow
```
[Local Audio] → AudioContext → AnalyserNode → getFrequencyData()
                                             → getTimeDomainData()
                                             ↓
                                     visualizer.js render loop
                                             ↓
                                   active visualizer module.render()

[YouTube] → IFrame API → state events → simulation.js → fake frequency/time data
                                             ↓
                                     visualizer.js render loop (same path)

app.js coordinates: which source is active, routes data to visualizer
```
