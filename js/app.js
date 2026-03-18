// js/app.js — Entry point, state coordination, event wiring

import { AudioEngine } from './audio-engine.js';
import { AudioSimulation } from './simulation.js';
import { YouTubePlayer } from './youtube-player.js';
import { Playlist } from './playlist.js';
import { Visualizer } from './visualizer.js';

class App {
  constructor() {
    this.audioEngine = new AudioEngine();
    this.simulation = new AudioSimulation();
    this.ytPlayer = new YouTubePlayer();
    this.playlist = new Playlist();
    this.visualizer = new Visualizer('visualizer-canvas');

    this.activeSource = 'local'; // 'local' | 'youtube'
    this.started = false;
    this.ytReady = false;

    this._toastTimer = null;
    this._animFrame = null;

    this._cacheElements();
    this._bindEvents();
    this._buildModeButtons();
    this._renderPlaylist();
  }

  _cacheElements() {
    this.els = {
      intro: document.getElementById('intro-overlay'),
      controlBar: document.getElementById('control-bar'),
      btnPlay: document.getElementById('btn-play'),
      iconPlay: document.getElementById('icon-play'),
      iconPause: document.getElementById('icon-pause'),
      btnPrev: document.getElementById('btn-prev'),
      btnNext: document.getElementById('btn-next'),
      btnPlaylist: document.getElementById('btn-playlist'),
      btnClosePlaylist: document.getElementById('btn-close-playlist'),
      btnShuffle: document.getElementById('btn-shuffle'),
      btnRepeat: document.getElementById('btn-repeat'),
      btnAddFile: document.getElementById('btn-add-file'),
      btnVolume: document.getElementById('btn-volume'),
      iconVolOn: document.getElementById('icon-vol-on'),
      iconVolOff: document.getElementById('icon-vol-off'),
      volumeSlider: document.getElementById('volume-slider'),
      ytInput: document.getElementById('yt-url-input'),
      btnYtLoad: document.getElementById('btn-yt-load'),
      btnHud: document.getElementById('btn-hud'),
      songInfo: document.getElementById('song-info'),
      songName: document.querySelector('#song-info .song-name'),
      songSource: document.querySelector('#song-info .song-source'),
      progressBar: document.getElementById('progress-bar'),
      progressFill: document.querySelector('#progress-bar .fill'),
      playlistSidebar: document.getElementById('playlist-sidebar'),
      playlistOverlay: document.getElementById('playlist-overlay'),
      playlistTracks: document.getElementById('playlist-tracks'),
      modeBtns: document.getElementById('mode-btns'),
      dropOverlay: document.getElementById('drop-overlay'),
      fileInput: document.getElementById('file-input'),
      timeCurrent: document.getElementById('time-current'),
      toast: document.getElementById('toast'),
    };
  }

  _bindEvents() {
    // Intro click → start
    this.els.intro.addEventListener('click', () => this._start());

    // Transport controls
    this.els.btnPlay.addEventListener('click', () => this._togglePlay());
    this.els.btnNext.addEventListener('click', () => this._nextTrack());
    this.els.btnPrev.addEventListener('click', () => this._prevTrack());

    // Volume
    this.els.volumeSlider.addEventListener('input', (e) => {
      const v = parseInt(e.target.value);
      this._setVolume(v / 100);
    });
    this.els.btnVolume.addEventListener('click', () => this._toggleMute());

    // Playlist
    this.els.btnPlaylist.addEventListener('click', () => this._togglePlaylist());
    this.els.btnClosePlaylist.addEventListener('click', () => this._closePlaylist());
    this.els.playlistOverlay.addEventListener('click', () => this._closePlaylist());
    this.els.btnShuffle.addEventListener('click', () => {
      this.playlist.shuffle();
      this._renderPlaylist();
      this._showToast('Playlist shuffled');
    });
    this.els.btnRepeat.addEventListener('click', () => {
      const mode = this.playlist.cycleRepeat();
      this.els.btnRepeat.classList.toggle('active', mode !== 'none');
      this._showToast(`Repeat: ${mode}`);
    });
    this.els.btnAddFile.addEventListener('click', () => this.els.fileInput.click());

    // File input
    this.els.fileInput.addEventListener('change', (e) => {
      this._handleFiles(e.target.files);
      e.target.value = '';
    });

    // YouTube
    this.els.btnYtLoad.addEventListener('click', () => this._loadYouTube());
    this.els.btnHud.addEventListener('click', () => {
      const on = this.visualizer.toggleHud();
      this.els.btnHud.classList.toggle('active', on);
      this._showToast(on ? 'HUD: ON' : 'HUD: OFF');
    });
    this.els.ytInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._loadYouTube();
    });

    // Progress bar seek
    this.els.progressBar.addEventListener('click', (e) => {
      if (this.activeSource !== 'local') return;
      const rect = this.els.progressBar.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      const dur = this.audioEngine.getDuration();
      if (dur) this.audioEngine.seekTo(ratio * dur);
    });

    // Track ended
    this.audioEngine.onEnded(() => this._nextTrack());

    // Playlist track change
    this.playlist.onTrackChange(() => {
      if (this.started) this._playCurrentTrack();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      switch (e.key.toLowerCase()) {
        case ' ': e.preventDefault(); this._togglePlay(); break;
        case 'n': this._nextTrack(); break;
        case 'p': this._prevTrack(); break;
        case 'm': this._toggleMute(); break;
        case 'l': this._togglePlaylist(); break;
        case 'h': {
          const on = this.visualizer.toggleHud();
          this._showToast(on ? 'HUD: ON' : 'HUD: OFF');
          break;
        }
        case '1': case '2': case '3': case '4': case '5':
          this._setMode(parseInt(e.key) - 1); break;
        case 'arrowup': e.preventDefault(); this._adjustVolume(5); break;
        case 'arrowdown': e.preventDefault(); this._adjustVolume(-5); break;
      }
    });

    // Drag & drop (whole page)
    document.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.els.dropOverlay.classList.add('visible');
    });
    document.addEventListener('dragleave', (e) => {
      if (e.relatedTarget === null || !document.contains(e.relatedTarget)) {
        this.els.dropOverlay.classList.remove('visible');
      }
    });
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      this.els.dropOverlay.classList.remove('visible');
      if (e.dataTransfer.files.length) {
        if (!this.started) this._start();
        this._handleFiles(e.dataTransfer.files);
      }
    });
  }

  _buildModeButtons() {
    const count = this.visualizer.modeCount;
    this.els.modeBtns.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const btn = document.createElement('button');
      btn.className = 'mode-btn' + (i === 0 ? ' active' : '');
      btn.title = `${this.visualizer.getModeName(i)} (${i + 1})`;
      btn.textContent = this.visualizer.getModeIcon(i);
      btn.addEventListener('click', () => this._setMode(i));
      this.els.modeBtns.appendChild(btn);
    }
  }

  _setMode(index) {
    this.visualizer.setMode(index);
    const btns = this.els.modeBtns.querySelectorAll('.mode-btn');
    btns.forEach((b, i) => b.classList.toggle('active', i === index));
  }

  // ===== Start =====
  async _start() {
    if (this.started) return;
    this.started = true;

    // Init audio context (requires user gesture)
    this.audioEngine.init();
    this.audioEngine.setVolume(parseInt(this.els.volumeSlider.value) / 100);

    // Init YouTube (fire & forget)
    this._initYouTube();

    // Hide intro
    this.els.intro.classList.add('hidden');

    // Start visualizer
    this.visualizer.start();
    this._renderLoop();

    // Play first track
    this._playCurrentTrack();
  }

  async _initYouTube() {
    try {
      await this.ytPlayer.init('yt-player');
      this.ytReady = true;
      this.ytPlayer.onStateChange((state) => {
        this.simulation.setState(state);
        if (state === 'ended') this._nextTrack();
      });
    } catch (e) {
      console.warn('YouTube API unavailable:', e);
      this._showToast('YouTube unavailable');
    }
  }

  // ===== Playback =====
  async _playCurrentTrack() {
    const track = this.playlist.getCurrent();
    if (!track) return;

    // Stop current
    if (this.activeSource === 'youtube') {
      this.ytPlayer.stop();
      this.simulation.reset();
    } else {
      this.audioEngine.stop();
    }

    // Play new
    if (track.type === 'youtube') {
      this.activeSource = 'youtube';
      if (this.ytReady) {
        this.ytPlayer.loadVideo(track.src);
        this.ytPlayer.setVolume(parseInt(this.els.volumeSlider.value));
        this.simulation.setState('playing');
        // Try to capture mic for real audio analysis
        this._enableMicForYouTube();
      }
    } else {
      this.activeSource = 'local';
      this.audioEngine.stopMicCapture(); // stop mic when playing local
      this.audioEngine.loadFile(track.src);
      try {
        await this.audioEngine.play();
      } catch (e) {
        console.warn('Playback failed:', e);
        this._showToast('Cannot play this file');
        return;
      }
    }

    this._updateSongInfo(track);
    this._updatePlayPauseIcon(true);
    this._renderPlaylist();
  }

  _togglePlay() {
    if (!this.started) { this._start(); return; }

    if (this.activeSource === 'youtube') {
      if (this.ytPlayer.isPlaying) {
        this.ytPlayer.pause();
        this.simulation.setState('paused');
        this._updatePlayPauseIcon(false);
      } else {
        this.ytPlayer.play();
        this.simulation.setState('playing');
        this._updatePlayPauseIcon(true);
      }
    } else {
      if (this.audioEngine.isPlaying) {
        this.audioEngine.pause();
        this._updatePlayPauseIcon(false);
      } else {
        this.audioEngine.play();
        this._updatePlayPauseIcon(true);
      }
    }
  }

  _nextTrack() {
    this.playlist.next();
  }

  _prevTrack() {
    this.playlist.prev();
  }

  // ===== Volume =====
  _setVolume(v) {
    v = Math.max(0, Math.min(1, v));
    this.audioEngine.setVolume(v);
    if (this.ytReady) this.ytPlayer.setVolume(Math.round(v * 100));
    this.els.volumeSlider.value = Math.round(v * 100);
    this._updateVolumeIcon(v > 0);
  }

  _adjustVolume(delta) {
    const current = parseInt(this.els.volumeSlider.value);
    this._setVolume((current + delta) / 100);
  }

  _toggleMute() {
    const current = this.audioEngine.getVolume();
    if (current > 0) {
      this._lastVolume = current;
      this._setVolume(0);
    } else {
      this._setVolume(this._lastVolume || 0.4);
    }
  }

  _updateVolumeIcon(on) {
    this.els.iconVolOn.style.display = on ? '' : 'none';
    this.els.iconVolOff.style.display = on ? 'none' : '';
  }

  // ===== YouTube =====
  _loadYouTube() {
    const url = this.els.ytInput.value.trim();
    if (!url) return;

    const videoId = YouTubePlayer.extractVideoId(url);
    if (!videoId) {
      this._showToast('Invalid YouTube URL');
      return;
    }

    if (!this.started) this._start();

    // Add to playlist and play
    const track = {
      type: 'youtube',
      src: videoId,
      name: `YouTube: ${videoId}`,
    };

    const idx = this.playlist.add(track);
    this.playlist.goTo(idx);
    this.els.ytInput.value = '';
    this._showToast('YouTube video added');
  }

  // ===== File handling =====
  _handleFiles(fileList) {
    for (const file of fileList) {
      if (!file.type.startsWith('audio/')) {
        this._showToast(`Unsupported: ${file.name}`);
        continue;
      }
      const blobUrl = URL.createObjectURL(file);
      const idx = this.playlist.add({
        type: 'file',
        src: blobUrl,
        name: file.name.replace(/\.[^/.]+$/, ''),
      });

      // Play the first dropped file immediately
      if (idx === this.playlist.length - 1) {
        this.playlist.goTo(idx);
      }
    }
    this._renderPlaylist();
    this._showToast(`${fileList.length} file(s) added`);
  }

  // ===== UI Updates =====
  _updatePlayPauseIcon(playing) {
    this.els.iconPlay.style.display = playing ? 'none' : '';
    this.els.iconPause.style.display = playing ? '' : 'none';
  }

  _updateSongInfo(track) {
    this.els.songName.textContent = track.name;
    this.els.songSource.textContent = track.type === 'youtube' ? 'YouTube' : track.type === 'file' ? 'Local File' : 'Library';
    this.els.songInfo.classList.add('visible');

    // Auto-hide after 5s (except keeps showing on hover logic could be added)
    clearTimeout(this._songInfoTimer);
    this._songInfoTimer = setTimeout(() => {
      this.els.songInfo.classList.remove('visible');
    }, 5000);
  }

  _updateProgress() {
    let current = 0, duration = 0;
    if (this.activeSource === 'youtube' && this.ytReady) {
      current = this.ytPlayer.getCurrentTime();
      duration = this.ytPlayer.getDuration();
    } else {
      current = this.audioEngine.getCurrentTime();
      duration = this.audioEngine.getDuration();
    }

    if (duration > 0) {
      const pct = (current / duration) * 100;
      this.els.progressFill.style.width = pct + '%';
    } else {
      this.els.progressFill.style.width = '0%';
    }

    // Time display
    this.els.timeCurrent.textContent = this._formatTime(current);
  }

  _formatTime(seconds) {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ===== Playlist UI =====
  _togglePlaylist() {
    const open = this.els.playlistSidebar.classList.toggle('open');
    this.els.playlistOverlay.classList.toggle('visible', open);
    this.els.btnPlaylist.classList.toggle('active', open);
  }

  _closePlaylist() {
    this.els.playlistSidebar.classList.remove('open');
    this.els.playlistOverlay.classList.remove('visible');
    this.els.btnPlaylist.classList.remove('active');
  }

  _renderPlaylist() {
    const tracks = this.playlist.getAll();
    const currentIdx = this.playlist.currentIndex;
    const container = this.els.playlistTracks;

    container.innerHTML = '';
    tracks.forEach((track, i) => {
      const div = document.createElement('div');
      div.className = 'track-item' + (i === currentIdx ? ' active' : '');
      div.innerHTML = `
        <span class="track-num">${i + 1}</span>
        <span class="track-name">${this._escapeHtml(track.name)}</span>
        <span class="track-type ${track.type}">${track.type === 'youtube' ? 'YT' : track.type === 'file' ? 'FILE' : 'MP3'}</span>
      `;
      div.addEventListener('click', () => {
        this.playlist.goTo(i);
      });
      container.appendChild(div);
    });

    // Scroll active into view
    const activeEl = container.querySelector('.track-item.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  _escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ===== Toast =====
  _showToast(msg) {
    this.els.toast.textContent = msg;
    this.els.toast.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.els.toast.classList.remove('visible');
    }, 2500);
  }

  // ===== Mic Capture for YouTube =====
  async _enableMicForYouTube() {
    if (this.audioEngine.isMicActive) return; // already active
    this._showToast('Enable mic for real-time visualization? (allow in browser prompt)');
    const ok = await this.audioEngine.startMicCapture();
    if (ok) {
      this._showToast('Mic active — real-time audio visualization enabled');
    } else {
      this._showToast('Mic denied — using simulated visualization');
    }
  }

  // ===== Render Loop =====
  _renderLoop() {
    let freqData, timeData;

    if (this.activeSource === 'youtube') {
      // Prefer mic capture (real audio) over simulation
      const micFreq = this.audioEngine.getMicFrequencyData();
      const micTime = this.audioEngine.getMicTimeDomainData();

      if (micFreq && micTime) {
        freqData = micFreq;
        timeData = micTime;
      } else {
        // Fallback to simulation
        this.simulation.update(1 / 60);
        freqData = this.simulation.getFrequencyData();
        timeData = this.simulation.getTimeDomainData();
      }
    } else {
      freqData = this.audioEngine.getFrequencyData();
      timeData = this.audioEngine.getTimeDomainData();
    }

    this.visualizer.render(freqData, timeData);
    this._updateProgress();

    this._animFrame = requestAnimationFrame(() => this._renderLoop());
  }
}

// Boot
const app = new App();
