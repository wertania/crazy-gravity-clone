/**
 * Procedural audio. No sample files - every sound is synthesised in WebAudio,
 * which keeps the build asset-free and lets the engine note bend continuously
 * with the throttle instead of looping a clip.
 *
 * Browsers refuse to start an AudioContext before a gesture, so everything is
 * lazily constructed on the first `resume()` and silently no-ops before that.
 */

import type { SimEventType } from '../sim/types';

function noiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    // Brown-ish noise: warmer than white, reads as a rocket rather than static.
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }
  return buf;
}

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineSrc: AudioBufferSourceNode | null = null;
  private droneGain: GainNode | null = null;
  private started = false;

  muted = false;

  /** Called on the first user gesture. */
  resume() {
    if (!this.started) this.init();
    void this.ctx?.resume();
  }

  private init() {
    const Ctor = window.AudioContext ?? (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return;
    }
    this.ctx = ctx;
    this.started = true;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    // --- engine: filtered noise whose cutoff and level follow the throttle ---
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 320;
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.engineSrc = src;
    this.engineFilter = filter;
    this.engineGain = gain;

    // --- ambience: two detuned low oscillators, barely audible ---
    const drone = ctx.createGain();
    drone.gain.value = 0.05;
    drone.connect(this.master);
    for (const f of [55, 82.5]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.06 + Math.random() * 0.05;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 1.4;
      lfo.connect(lfoGain).connect(o.frequency);
      lfo.start();
      o.connect(drone);
      o.start();
    }
    this.droneGain = drone;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  /** Continuous engine state, called once per rendered frame. */
  engine(throttle: number, speedFraction: number) {
    if (!this.ctx || !this.engineGain || !this.engineFilter) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(throttle * 0.16, t, 0.04);
    this.engineFilter.frequency.setTargetAtTime(240 + speedFraction * 900, t, 0.08);
  }

  /** Duck the ambience during menus. */
  ambience(level: number) {
    if (!this.ctx || !this.droneGain) return;
    this.droneGain.gain.setTargetAtTime(level * 0.05, this.ctx.currentTime, 0.3);
  }

  private blip(freq: number, dur: number, type: OscillatorType, gain = 0.18, slide = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, gain: number, from: number, to: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, Math.max(0.3, dur));
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(from, t);
    filt.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  event(type: SimEventType, value = 0) {
    if (!this.ctx) return;
    switch (type) {
      case 'pickup':
        this.blip(520, 0.12, 'triangle', 0.16, 1.6);
        break;
      case 'deliver':
        this.blip(392, 0.1, 'square', 0.13);
        window.setTimeout(() => this.blip(587, 0.18, 'square', 0.13), 90);
        break;
      case 'key':
        this.blip(740, 0.09, 'triangle', 0.15, 1.4);
        window.setTimeout(() => this.blip(988, 0.16, 'triangle', 0.13), 70);
        break;
      case 'gate-open':
        this.burst(0.45, 0.16, 900, 120);
        break;
      case 'land':
        this.burst(0.16, 0.08 + Math.min(0.12, value * 0.03), 500, 90);
        break;
      case 'liftoff':
        this.burst(0.25, 0.1, 300, 1200);
        break;
      case 'crash':
        this.burst(0.9, 0.4, 1800, 60);
        this.blip(90, 0.5, 'sawtooth', 0.2, 0.4);
        break;
      case 'shoot':
        this.blip(220, 0.07, 'sawtooth', 0.05, 0.5);
        break;
      case 'bullet-hit':
        this.burst(0.1, 0.05, 1400, 300);
        break;
      case 'refuel':
        this.blip(300 + Math.min(400, value * 3), 0.05, 'sine', 0.06);
        break;
      case 'flow-peak':
        this.blip(880, 0.14, 'sine', 0.12, 1.5);
        break;
      case 'out-of-fuel':
        this.blip(180, 0.5, 'sawtooth', 0.12, 0.5);
        break;
      case 'timeout':
        this.blip(140, 0.8, 'square', 0.14, 0.5);
        break;
      case 'level-clear':
        [523, 659, 784, 1047].forEach((f, i) =>
          window.setTimeout(() => this.blip(f, 0.24, 'triangle', 0.14), i * 110),
        );
        break;
    }
  }

  /** Menu feedback. */
  ui(kind: 'move' | 'select' | 'deny') {
    if (kind === 'move') this.blip(440, 0.05, 'square', 0.05);
    if (kind === 'select') this.blip(660, 0.09, 'square', 0.08, 1.3);
    if (kind === 'deny') this.blip(160, 0.14, 'square', 0.08, 0.7);
  }

  dispose() {
    this.engineSrc?.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.started = false;
  }
}
