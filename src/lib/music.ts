// Procedural ambient music with the Web Audio API: no files, no network, no copyright.
// Each mood is a small recipe (scale, tempo, pad, arpeggio, drums, noise bed, extras)
// played by a lookahead scheduler; switching moods crossfades.
import type { Mood } from './types';

type Drum = 'battle' | 'boss' | 'tavern' | 'heartbeat';
type Bed = 'wind' | 'waves' | 'fire' | 'cave';
type Extra = 'birds' | 'drips' | 'bells' | 'glissando' | 'ticks';

interface Recipe {
  root: number; // MIDI note
  scale: number[];
  bpm: number;
  progression: number[]; // scale degrees, one chord per 2 bars
  pad: { wave: OscillatorType; cutoff: number; gain: number };
  arp?: { wave: OscillatorType; density: number; octave: number; gain: number; decay: number };
  bass?: { steps: number[]; wave: OscillatorType; gain: number };
  drums?: Drum;
  bed?: Bed;
  extras?: Extra[];
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MIXO = [0, 2, 4, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const PENTA = [0, 2, 4, 7, 9];

export const RECIPES: Record<Mood, Recipe> = {
  tavern: { root: 62, scale: MIXO, bpm: 112, progression: [0, 3, 6, 0, 4, 3], pad: { wave: 'triangle', cutoff: 1400, gain: 0.05 }, arp: { wave: 'triangle', density: 0.7, octave: 1, gain: 0.08, decay: 0.25 }, bass: { steps: [0, 4], wave: 'triangle', gain: 0.1 }, drums: 'tavern', bed: 'fire' },
  town: { root: 60, scale: PENTA, bpm: 88, progression: [0, 3, 1, 4], pad: { wave: 'sine', cutoff: 1800, gain: 0.06 }, arp: { wave: 'sine', density: 0.35, octave: 1, gain: 0.07, decay: 0.6 }, bass: { steps: [0], wave: 'sine', gain: 0.08 }, extras: ['bells'] },
  travel: { root: 55, scale: DORIAN, bpm: 84, progression: [0, 6, 3, 4], pad: { wave: 'sawtooth', cutoff: 900, gain: 0.04 }, arp: { wave: 'triangle', density: 0.5, octave: 1, gain: 0.07, decay: 0.35 }, bass: { steps: [0, 3, 6], wave: 'sine', gain: 0.1 }, bed: 'wind' },
  forest: { root: 57, scale: PENTA, bpm: 68, progression: [0, 2, 3, 1], pad: { wave: 'sine', cutoff: 1200, gain: 0.05 }, arp: { wave: 'sine', density: 0.22, octave: 1, gain: 0.06, decay: 0.9 }, bed: 'wind', extras: ['birds'] },
  dungeon: { root: 50, scale: PHRYGIAN, bpm: 54, progression: [0, 1, 0, 5], pad: { wave: 'sawtooth', cutoff: 420, gain: 0.06 }, arp: { wave: 'sine', density: 0.12, octave: 0, gain: 0.06, decay: 1.2 }, bass: { steps: [0], wave: 'sine', gain: 0.12 }, bed: 'cave', extras: ['drips'] },
  battle: { root: 52, scale: HARMONIC, bpm: 138, progression: [0, 5, 3, 4], pad: { wave: 'sawtooth', cutoff: 1500, gain: 0.05 }, arp: { wave: 'sawtooth', density: 0.55, octave: 1, gain: 0.045, decay: 0.15 }, bass: { steps: [0, 1, 2, 3, 4, 5, 6, 7], wave: 'sawtooth', gain: 0.07 }, drums: 'battle' },
  boss: { root: 49, scale: PHRYGIAN, bpm: 150, progression: [0, 1, 5, 4], pad: { wave: 'sawtooth', cutoff: 1100, gain: 0.07 }, arp: { wave: 'square', density: 0.4, octave: 1, gain: 0.03, decay: 0.12 }, bass: { steps: [0, 1, 3, 4, 6, 7], wave: 'sawtooth', gain: 0.09 }, drums: 'boss' },
  horror: { root: 46, scale: [0, 1, 6, 7, 11], bpm: 44, progression: [0, 1, 0, 2], pad: { wave: 'sawtooth', cutoff: 320, gain: 0.07 }, arp: { wave: 'sine', density: 0.08, octave: 2, gain: 0.04, decay: 2.5 }, drums: 'heartbeat', bed: 'cave', extras: ['glissando'] },
  mystery: { root: 57, scale: MINOR, bpm: 66, progression: [0, 5, 3, 4], pad: { wave: 'triangle', cutoff: 800, gain: 0.05 }, arp: { wave: 'sine', density: 0.28, octave: 2, gain: 0.05, decay: 1.1 }, bass: { steps: [0], wave: 'sine', gain: 0.08 }, extras: ['ticks'] },
  sea: { root: 53, scale: MAJOR, bpm: 58, progression: [0, 4, 5, 3], pad: { wave: 'sine', cutoff: 1000, gain: 0.07 }, arp: { wave: 'triangle', density: 0.18, octave: 1, gain: 0.06, decay: 1.0 }, bed: 'waves' },
  sacred: { root: 60, scale: LYDIAN, bpm: 48, progression: [0, 1, 4, 0], pad: { wave: 'sawtooth', cutoff: 700, gain: 0.06 }, arp: { wave: 'sine', density: 0.1, octave: 2, gain: 0.06, decay: 2.2 }, extras: ['bells'] },
  calm: { root: 53, scale: LYDIAN, bpm: 60, progression: [0, 4, 1, 4], pad: { wave: 'sine', cutoff: 900, gain: 0.06 }, arp: { wave: 'triangle', density: 0.25, octave: 1, gain: 0.06, decay: 0.9 }, bed: 'fire' },
};

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

class Voice {
  out: GainNode;
  private timer?: number;
  private step = 0;
  private next = 0;
  private stopped = false;
  private bedNodes: AudioNode[] = [];

  constructor(private ctx: AudioContext, private r: Recipe, dest: AudioNode, private reverb: AudioNode, private noise: AudioBuffer) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
  }

  start(fade: number) {
    const t = this.ctx.currentTime;
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.linearRampToValueAtTime(1, t + fade);
    this.next = t + 0.05;
    this.startBed();
    this.timer = window.setInterval(() => this.tick(), 50);
  }

  stop(fade: number) {
    this.stopped = true;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + fade);
    window.clearInterval(this.timer);
    setTimeout(() => {
      this.bedNodes.forEach((n) => { try { (n as AudioScheduledSourceNode).stop?.(); } catch { /* already stopped */ } n.disconnect(); });
      this.out.disconnect();
    }, fade * 1000 + 200);
  }

  private tick() {
    const stepDur = 60 / this.r.bpm / 2; // eighth notes
    while (!this.stopped && this.next < this.ctx.currentTime + 0.25) {
      this.playStep(this.step, this.next, stepDur);
      this.next += stepDur;
      this.step++;
    }
  }

  private note(deg: number, octave: number) {
    const sc = this.r.scale;
    const o = Math.floor(deg / sc.length);
    return this.r.root + sc[((deg % sc.length) + sc.length) % sc.length] + 12 * (o + octave);
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(f: number, t: number, wave: OscillatorType, peak: number, attack: number, decay: number, opts: { cutoff?: number; wet?: number; detune?: number } = {}) {
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = f;
    if (opts.detune) osc.detune.value = opts.detune;
    const g = this.ctx.createGain();
    this.env(g, t, peak, attack, decay);
    let node: AudioNode = osc;
    if (opts.cutoff) {
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = opts.cutoff;
      osc.connect(flt);
      node = flt;
    }
    node.connect(g);
    g.connect(this.out);
    if (opts.wet) {
      const w = this.ctx.createGain();
      w.gain.value = opts.wet;
      g.connect(w);
      w.connect(this.reverb);
    }
    osc.start(t);
    osc.stop(t + attack + decay + 0.1);
  }

  private noiseHit(t: number, peak: number, decay: number, type: BiquadFilterType, f: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const flt = this.ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    const g = this.ctx.createGain();
    this.env(g, t, peak, 0.002, decay);
    src.connect(flt).connect(g).connect(this.out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + decay + 0.05);
  }

  private kick(t: number, peak: number, from = 150, to = 45) {
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + 0.15);
    const g = this.ctx.createGain();
    this.env(g, t, peak, 0.003, 0.3);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  private playStep(step: number, t: number, dur: number) {
    const r = this.r;
    const inBar = step % 8;
    const chordDeg = r.progression[Math.floor(step / 16) % r.progression.length];

    // Pad: a sustained chord every 2 bars
    if (step % 16 === 0) {
      const len = dur * 16;
      for (const [i, off] of [0, 2, 4].entries()) {
        const f = freq(this.note(chordDeg + off, 0));
        this.tone(f, t, r.pad.wave, r.pad.gain, len * 0.3, len * 0.9, { cutoff: r.pad.cutoff, wet: 0.6, detune: (i - 1) * 7 });
      }
    }
    // Bass
    if (r.bass && r.bass.steps.includes(inBar)) {
      this.tone(freq(this.note(chordDeg, -1)), t, r.bass.wave, r.bass.gain, 0.01, dur * 1.6, { cutoff: 600 });
    }
    // Arpeggio / melody
    if (r.arp && Math.random() < r.arp.density) {
      const deg = chordDeg + [0, 2, 4, 7, 1, 5][Math.floor(Math.random() * 6)];
      this.tone(freq(this.note(deg, r.arp.octave)), t, r.arp.wave, r.arp.gain, 0.005, r.arp.decay, { cutoff: 3500, wet: 0.4 });
    }
    // Drums
    switch (r.drums) {
      case 'tavern':
        if (inBar === 0 || inBar === 4) this.kick(t, 0.25, 120, 60);
        if (inBar % 2 === 1) this.noiseHit(t, 0.05, 0.06, 'highpass', 7000);
        if (inBar === 2 || inBar === 6) this.noiseHit(t, 0.08, 0.12, 'bandpass', 2500);
        break;
      case 'battle':
        if (inBar === 0 || inBar === 3 || inBar === 4) this.kick(t, 0.45);
        if (inBar === 2 || inBar === 6) this.noiseHit(t, 0.22, 0.18, 'bandpass', 1800);
        if (inBar === 7) this.kick(t, 0.2, 220, 110);
        this.noiseHit(t, 0.025, 0.03, 'highpass', 8000);
        break;
      case 'boss':
        if (inBar % 2 === 0) this.kick(t, 0.5, 130, 40);
        if (inBar === 2 || inBar === 6) this.noiseHit(t, 0.28, 0.25, 'bandpass', 1500);
        if (step % 32 === 0) this.noiseHit(t, 0.18, 1.8, 'highpass', 3000); // crash
        break;
      case 'heartbeat':
        if (step % 8 === 0) { this.kick(t, 0.35, 70, 40); this.kick(t + 0.22, 0.25, 65, 38); }
        break;
    }
    // Extras
    const ex = r.extras ?? [];
    if (ex.includes('birds') && Math.random() < 0.05) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const base = 2200 + Math.random() * 1800;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.5, t + 0.08);
      o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.16);
      this.env(g, t, 0.03, 0.01, 0.18);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + 0.25);
    }
    if (ex.includes('drips') && Math.random() < 0.06) this.tone(1400 + Math.random() * 900, t, 'sine', 0.05, 0.002, 0.12, { wet: 0.9 });
    if (ex.includes('bells') && step % 32 === 8 && Math.random() < 0.6) this.tone(freq(this.note(chordDeg + 7, 1)), t, 'sine', 0.06, 0.002, 3, { wet: 0.8 });
    if (ex.includes('ticks') && inBar % 2 === 0) this.noiseHit(t, 0.02, 0.02, 'highpass', 6000);
    if (ex.includes('glissando') && Math.random() < 0.015) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(1800, t);
      o.frequency.exponentialRampToValueAtTime(600 + Math.random() * 400, t + 3);
      this.env(g, t, 0.025, 1, 3);
      o.connect(g);
      g.connect(this.reverb);
      g.connect(this.out);
      o.start(t);
      o.stop(t + 4.2);
    }
  }

  private startBed() {
    if (!this.r.bed) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const flt = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.connect(lfoGain);
    switch (this.r.bed) {
      case 'wind':
        flt.type = 'bandpass'; flt.frequency.value = 500; flt.Q.value = 0.8; g.gain.value = 0.05;
        lfo.frequency.value = 0.07; lfoGain.gain.value = 300; lfoGain.connect(flt.frequency);
        break;
      case 'waves':
        flt.type = 'lowpass'; flt.frequency.value = 700; g.gain.value = 0.06;
        lfo.frequency.value = 0.12; lfoGain.gain.value = 0.05; lfoGain.connect(g.gain);
        break;
      case 'cave':
        flt.type = 'lowpass'; flt.frequency.value = 220; g.gain.value = 0.07;
        lfo.frequency.value = 0.05; lfoGain.gain.value = 80; lfoGain.connect(flt.frequency);
        break;
      case 'fire':
        flt.type = 'bandpass'; flt.frequency.value = 1200; flt.Q.value = 0.5; g.gain.value = 0.015;
        lfo.frequency.value = 7; lfoGain.gain.value = 0.012; lfoGain.connect(g.gain);
        break;
    }
    src.connect(flt).connect(g).connect(this.out);
    src.start();
    lfo.start();
    this.bedNodes.push(src, lfo, flt, g, lfoGain);
    if (this.r.bed === 'fire') {
      // occasional crackles
      const crackle = () => {
        if (this.stopped) return;
        this.noiseHit(this.ctx.currentTime + 0.01, 0.06 + Math.random() * 0.06, 0.02, 'highpass', 2500);
        setTimeout(crackle, 150 + Math.random() * 900);
      };
      crackle();
    }
  }
}

export class MusicEngine {
  private ctx?: AudioContext;
  private master?: GainNode;
  private reverb?: ConvolverNode;
  private noise?: AudioBuffer;
  private current?: Voice;
  mood?: Mood;
  volume = 0.6;

  private ensure() {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    // Synthetic reverb impulse: decaying stereo noise
    const len = ctx.sampleRate * 3.5;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.reverb.connect(wet).connect(this.master);
    // Shared noise source
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;
    return ctx;
  }

  play(mood: Mood, fade = 2.5) {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') ctx.resume();
    if (this.mood === mood && this.current) return;
    this.current?.stop(fade);
    this.current = new Voice(ctx, RECIPES[mood], this.master!, this.reverb!, this.noise!);
    this.current.start(fade);
    this.mood = mood;
  }

  stop(fade = 1.5) {
    this.current?.stop(fade);
    this.current = undefined;
    this.mood = undefined;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }
}

export const music = new MusicEngine();
