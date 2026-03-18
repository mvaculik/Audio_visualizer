// js/youtube-player.js — YouTube IFrame API wrapper

export class YouTubePlayer {
  constructor() {
    this.player = null;
    this.ready = false;
    this._onStateChangeCb = null;
    this._containerId = null;
  }

  init(containerId) {
    this._containerId = containerId;
    return new Promise((resolve, reject) => {
      if (window.YT && window.YT.Player) {
        this._createPlayer(resolve);
        return;
      }
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.onerror = () => reject(new Error('YouTube API failed to load'));
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
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          this.ready = true;
          resolve();
        },
        onStateChange: (e) => {
          if (this._onStateChangeCb) this._onStateChangeCb(this._mapState(e.data));
        },
      },
    });
  }

  _mapState(ytState) {
    if (!window.YT) return 'paused';
    switch (ytState) {
      case YT.PlayerState.PLAYING: return 'playing';
      case YT.PlayerState.BUFFERING: return 'buffering';
      case YT.PlayerState.ENDED: return 'ended';
      default: return 'paused';
    }
  }

  static extractVideoId(url) {
    if (!url) return null;
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const p of patterns) {
      const m = url.trim().match(p);
      if (m) return m[1];
    }
    return null;
  }

  loadVideo(urlOrId) {
    const id = YouTubePlayer.extractVideoId(urlOrId) || urlOrId;
    if (this.player && this.ready) {
      this.player.loadVideoById(id);
    }
    return id;
  }

  play() {
    if (this.player) this.player.playVideo();
  }

  pause() {
    if (this.player) this.player.pauseVideo();
  }

  stop() {
    if (this.player) this.player.stopVideo();
  }

  setVolume(v) {
    if (this.player) this.player.setVolume(v);
  }

  getVolume() {
    return this.player ? this.player.getVolume() : 50;
  }

  getCurrentTime() {
    return this.player ? this.player.getCurrentTime() : 0;
  }

  getDuration() {
    return this.player ? this.player.getDuration() : 0;
  }

  get isPlaying() {
    return this.player && window.YT && this.player.getPlayerState() === YT.PlayerState.PLAYING;
  }

  getState() {
    if (!this.player || !window.YT) return 'paused';
    return this._mapState(this.player.getPlayerState());
  }

  onStateChange(cb) {
    this._onStateChangeCb = cb;
  }
}
