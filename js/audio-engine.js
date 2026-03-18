// js/audio-engine.js — Web Audio API wrapper

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
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.82;
    this.source = this.context.createMediaElementSource(this.audio);
    this.source.connect(this.analyser);
    this.analyser.connect(this.context.destination);
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeDomainData = new Uint8Array(this.analyser.frequencyBinCount);
    this._initialized = true;
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

  pause() {
    this.audio.pause();
  }

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  setVolume(v) {
    this.audio.volume = v;
  }

  getVolume() {
    return this.audio.volume;
  }

  get isPlaying() {
    return !this.audio.paused;
  }

  getCurrentTime() {
    return this.audio.currentTime;
  }

  getDuration() {
    return this.audio.duration || 0;
  }

  seekTo(time) {
    this.audio.currentTime = time;
  }

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
