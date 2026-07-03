import type { City } from '../sim/city';
import { cityPopulation } from '../sim/evaluation';

export type SfxName = 'place' | 'bulldoze' | 'error' | 'alarm' | 'chime';

const STORAGE_KEY = 'tilesburg:audio';

/**
 * All sound is synthesized with the Web Audio API — no audio assets, matching
 * the no-binary-assets rule. The context starts lazily on the first user
 * gesture (browser autoplay policy). Three voices: UI/sim SFX, an ambient
 * city hum whose level tracks population, and two alternating procedural
 * music patterns in a calm pentatonic mood.
 */
export class AudioEngine {
  sfxMuted = false;
  musicMuted = false;

  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private humGain: GainNode | null = null;
  private humOsc: OscillatorNode[] = [];
  private nextNoteTime = 0;
  private step = 0;
  private pattern = 0;
  private timer = 0;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<AudioEngine>;
      this.sfxMuted = !!saved.sfxMuted;
      this.musicMuted = !!saved.musicMuted;
    } catch {
      /* fresh defaults */
    }
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sfxMuted: this.sfxMuted, musicMuted: this.musicMuted }));
  }

  toggleSfx(): boolean {
    this.sfxMuted = !this.sfxMuted;
    this.persist();
    return this.sfxMuted;
  }

  toggleMusic(): boolean {
    this.musicMuted = !this.musicMuted;
    this.persist();
    this.syncMusicGain();
    return this.musicMuted;
  }

  /** Call on the first user gesture; safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) return;
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.startHum();
    this.startMusic();
  }

  // --- SFX -----------------------------------------------------------------

  play(name: SfxName): void {
    if (!this.ctx || this.sfxMuted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'place':
        this.blip(660, 0.06, 'triangle', 0.12, t);
        this.blip(880, 0.05, 'triangle', 0.08, t + 0.05);
        break;
      case 'bulldoze':
        this.noiseBurst(0.12, 300, t);
        break;
      case 'error':
        this.blip(180, 0.12, 'square', 0.06, t);
        break;
      case 'alarm':
        for (let i = 0; i < 3; i++) this.blip(523, 0.14, 'square', 0.08, t + i * 0.22);
        break;
      case 'chime':
        this.blip(784, 0.2, 'sine', 0.1, t);
        this.blip(1175, 0.25, 'sine', 0.08, t + 0.12);
        break;
    }
  }

  private blip(freq: number, dur: number, type: OscillatorType, gain: number, at: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private noiseBurst(dur: number, filterHz: number, at: number): void {
    if (!this.ctx) return;
    const frames = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterHz;
    const g = this.ctx.createGain();
    g.gain.value = 0.15;
    src.connect(filter).connect(g).connect(this.ctx.destination);
    src.start(at);
  }

  // --- ambient hum -----------------------------------------------------------

  private startHum(): void {
    if (!this.ctx) return;
    this.humGain = this.ctx.createGain();
    this.humGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    for (const freq of [55, 110, 164.8]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.connect(filter);
      osc.start();
      this.humOsc.push(osc);
    }
    filter.connect(this.humGain).connect(this.ctx.destination);
  }

  /** Ambient level tracks the living city. */
  updateAmbience(city: City): void {
    if (!this.ctx || !this.humGain) return;
    const pop = cityPopulation(city);
    const target = this.sfxMuted ? 0 : Math.min(0.05, pop / 400_000);
    this.humGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.5);
  }

  // --- procedural music --------------------------------------------------------

  // Two 16-step patterns over a calm A-pentatonic; -1 = rest.
  private static PATTERNS: number[][] = [
    [0, -1, 2, -1, 4, -1, 2, -1, 1, -1, 3, -1, 2, -1, 0, -1],
    [4, -1, -1, 2, 3, -1, 1, -1, 2, -1, -1, 0, 1, -1, 2, -1],
  ];
  private static SCALE = [220, 261.63, 293.66, 329.63, 392]; // A minor pentatonic-ish

  private startMusic(): void {
    if (!this.ctx) return;
    this.musicGain = this.ctx.createGain();
    this.syncMusicGain();
    this.musicGain.connect(this.ctx.destination);
    this.nextNoteTime = this.ctx.currentTime + 0.5;
    this.timer = window.setInterval(() => this.schedule(), 120);
  }

  private syncMusicGain(): void {
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicMuted ? 0 : 0.09, this.ctx.currentTime, 0.2);
    }
  }

  private schedule(): void {
    if (!this.ctx || !this.musicGain) return;
    const SECONDS_PER_STEP = 0.42;
    while (this.nextNoteTime < this.ctx.currentTime + 0.4) {
      const pat = AudioEngine.PATTERNS[this.pattern];
      const note = pat[this.step];
      if (note >= 0) {
        this.note(AudioEngine.SCALE[note], this.nextNoteTime, SECONDS_PER_STEP * 1.8);
        // A soft fifth below, every other bar.
        if (this.step % 8 === 0) this.note(AudioEngine.SCALE[note] / 2, this.nextNoteTime, SECONDS_PER_STEP * 3);
      }
      this.step++;
      if (this.step >= pat.length) {
        this.step = 0;
        // Alternate patterns every two bars for a little variety.
        this.pattern = (this.pattern + 1) % AudioEngine.PATTERNS.length;
      }
      this.nextNoteTime += SECONDS_PER_STEP;
    }
  }

  private note(freq: number, at: number, dur: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.6, at + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g).connect(this.musicGain);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  dispose(): void {
    window.clearInterval(this.timer);
  }
}
