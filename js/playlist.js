// js/playlist.js — Playlist management with localStorage persistence

const BUILT_IN_TRACKS = [
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
    this.repeat = 'all';
    this.shuffled = false;
    this._onTrackChangeCb = null;
    this._init();
  }

  _init() {
    for (const t of BUILT_IN_TRACKS) {
      this.tracks.push({
        type: 'local',
        src: `mp3s/${t.file}.mp3`,
        name: t.name,
        builtIn: true,
      });
    }
    try {
      const saved = JSON.parse(localStorage.getItem('av_user_tracks') || '[]');
      for (const t of saved) {
        if (t.type === 'youtube') this.tracks.push(t);
      }
    } catch (e) { /* ignore corrupt data */ }

    this.currentIndex = Math.floor(Math.random() * this.tracks.length);
  }

  _save() {
    const userTracks = this.tracks.filter((t) => !t.builtIn);
    try {
      localStorage.setItem('av_user_tracks', JSON.stringify(userTracks));
    } catch (e) { /* storage full */ }
  }

  add(track) {
    this.tracks.push(track);
    this._save();
    return this.tracks.length - 1;
  }

  remove(index) {
    if (index < 0 || index >= this.tracks.length) return;
    this.tracks.splice(index, 1);
    if (this.currentIndex >= this.tracks.length) {
      this.currentIndex = Math.max(0, this.tracks.length - 1);
    }
    this._save();
  }

  next() {
    if (this.tracks.length === 0) return false;
    if (this.repeat === 'one') {
      this._notify();
      return true;
    }
    if (this.currentIndex < this.tracks.length - 1) {
      this.currentIndex++;
    } else if (this.repeat === 'all') {
      this.currentIndex = 0;
    } else {
      return false;
    }
    this._notify();
    return true;
  }

  prev() {
    if (this.tracks.length === 0) return;
    if (this.currentIndex > 0) {
      this.currentIndex--;
    } else if (this.repeat === 'all') {
      this.currentIndex = this.tracks.length - 1;
    }
    this._notify();
  }

  goTo(index) {
    if (index >= 0 && index < this.tracks.length) {
      this.currentIndex = index;
      this._notify();
    }
  }

  shuffle() {
    const current = this.tracks[this.currentIndex];
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    }
    this.currentIndex = this.tracks.indexOf(current);
    this.shuffled = !this.shuffled;
  }

  cycleRepeat() {
    const modes = ['all', 'one', 'none'];
    const idx = modes.indexOf(this.repeat);
    this.repeat = modes[(idx + 1) % modes.length];
    return this.repeat;
  }

  getCurrent() {
    return this.tracks[this.currentIndex] || null;
  }

  getAll() {
    return this.tracks;
  }

  get length() {
    return this.tracks.length;
  }

  onTrackChange(cb) {
    this._onTrackChangeCb = cb;
  }

  _notify() {
    if (this._onTrackChangeCb) this._onTrackChangeCb(this.getCurrent());
  }
}
