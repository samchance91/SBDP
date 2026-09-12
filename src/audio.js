// Voice-note recorder. Real microphone capture via MediaRecorder when supported.
// Records only after Record is pressed (permission requested then, not before).
// Two-minute hard limit. Tracks are stopped on exit. No transcription is implied
// or performed — this records and plays an audio note only.

export const MAX_MS = 120000;

export function isSupported() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof window !== 'undefined' && 'MediaRecorder' in window;
}

export class Recorder {
  constructor() {
    this.stream = null; this.mr = null; this.chunks = [];
    this.blob = null; this.url = null; this.startedAt = 0;
    this.state = 'idle'; // idle | recording | recorded | denied | unsupported | error
    this.onTick = null; this.onState = null;
    this._timer = null;
  }
  _set(s) { this.state = s; this.onState && this.onState(s); }

  async start() {
    if (!isSupported()) { this._set('unsupported'); return { ok: false, reason: 'unsupported' }; }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      this._set(e && e.name === 'NotAllowedError' ? 'denied' : 'error');
      return { ok: false, reason: this.state };
    }
    this.chunks = [];
    try {
      this.mr = new MediaRecorder(this.stream);
    } catch (e) { this._set('error'); this._stopTracks(); return { ok: false, reason: 'error' }; }
    this.mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) this.chunks.push(ev.data); };
    this.mr.onstop = () => {
      this.blob = new Blob(this.chunks, { type: this.mr.mimeType || 'audio/webm' });
      if (this.url) URL.revokeObjectURL(this.url);
      this.url = URL.createObjectURL(this.blob);
      this._stopTracks();
      this._set('recorded');
    };
    this.startedAt = Date.now();
    this.mr.start();
    this._set('recording');
    this._timer = setInterval(() => {
      const ms = Date.now() - this.startedAt;
      this.onTick && this.onTick(Math.min(ms, MAX_MS));
      if (ms >= MAX_MS) this.stop();
    }, 200);
    return { ok: true };
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this.mr && this.mr.state !== 'inactive') this.mr.stop();
  }
  elapsed() { return this.state === 'recording' ? Date.now() - this.startedAt : (this.blob ? this._dur || 0 : 0); }

  discard() {
    this.stop();
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    this.blob = null; this.chunks = [];
    this._set('idle');
  }
  _stopTracks() { if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; } }
  dispose() { this.stop(); this._stopTracks(); if (this.url) URL.revokeObjectURL(this.url); }
}

export function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
