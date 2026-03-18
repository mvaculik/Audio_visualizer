// js/audio-engine.js — Web Audio API wrapper with mic capture for YouTube

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

    // Mic capture for YouTube mode
    this._micSource = null;
    this._micStream = null;
    this._micAnalyser = null;
    this._micFreqData = null;
    this._micTimeData = null;
    this._micActive = false;
  }

  init() {
    if (this._initialized) {
      this.context.resume();
      return;
    }
    this.context = new (window.AudioContext || window.webkitAudioContext)();

    // Main analyser for local audio — FAST response
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.6; // was 0.82, now much snappier
    this.source = this.context.createMediaElementSource(this.audio);
    this.source.connect(this.analyser);
    this.analyser.connect(this.context.destination);
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeDomainData = new Uint8Array(this.analyser.frequencyBinCount);
    this._initialized = true;
  }

  // Capture microphone audio → separate analyser for YouTube visualization
  async startMicCapture() {
    if (this._micActive) return true;
    try {
      this._micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      if (!this.context) this.init();

      this._micAnalyser = this.context.createAnalyser();
      this._micAnalyser.fftSize = 256;
      this._micAnalyser.smoothingTimeConstant = 0.5; // very fast
      this._micSource = this.context.createMediaStreamSource(this._micStream);
      this._micSource.connect(this._micAnalyser);
      // Do NOT connect to destination (would create feedback loop)

      this._micFreqData = new Uint8Array(this._micAnalyser.frequencyBinCount);
      this._micTimeData = new Uint8Array(this._micAnalyser.frequencyBinCount);
      this._micActive = true;
      return true;
    } catch (e) {
      console.warn('Mic capture denied or failed:', e);
      this._micActive = false;
      return false;
    }
  }

  stopMicCapture() {
    if (this._micStream) {
      this._micStream.getTracks().forEach((t) => t.stop());
      this._micStream = null;
    }
    if (this._micSource) {
      this._micSource.disconnect();
      this._micSource = null;
    }
    this._micAnalyser = null;
    this._micActive = false;
  }

  get isMicActive() {
    return this._micActive;
  }

  getMicFrequencyData() {
    if (this._micAnalyser && this._micActive) {
      this._micAnalyser.getByteFrequencyData(this._micFreqData);
      return this._micFreqData;
    }
    return null;
  }

  getMicTimeDomainData() {
    if (this._micAnalyser && this._micActive) {
      this._micAnalyser.getByteTimeDomainData(this._micTimeData);
      return this._micTimeData;
    }
    return null;
  }

  loadFile(src) {
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
