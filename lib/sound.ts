// Browser-only chiptune music and sound effects, synthesized with Web Audio (no audio files).
const MUTE_KEY = "dayquest:muted";
const STEP = 0.3; // seconds per eighth note (~100 bpm)
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

// Four bars of C · Am · F · G, eight steps each. null is a rest.
const MELODY: (number | null)[] = [76, null, 79, null, 76, null, 74, null, 72, null, 76, null, 69, null, null, null, 69, null, 72, null, 77, null, 76, null, 74, null, 79, null, 71, null, null, null];
const CHORDS = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
const BASS = [48, 45, 41, 43];

let ctx: AudioContext | undefined;
let musicBus: GainNode | undefined;
let sfxBus: GainNode | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let nextStep = 0;
let nextTime = 0;
let muted = false;
let started = false;

function tone(freq: number, when: number, length: number, type: OscillatorType, peak: number, bus: GainNode) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
  osc.connect(gain).connect(bus);
  osc.start(when);
  osc.stop(when + length + 0.05);
}

function schedule() {
  if (!ctx || !musicBus) return;
  while (nextTime < ctx.currentTime + 0.6) {
    const step = nextStep % 32, bar = Math.floor(step / 8), beat = step % 8;
    const melody = MELODY[step];
    if (melody) tone(midi(melody), nextTime, STEP * 1.6, "square", 0.05, musicBus);
    tone(midi(CHORDS[bar][beat % 3] + 12), nextTime, STEP * 0.9, "triangle", 0.07, musicBus);
    if (beat % 4 === 0) tone(midi(BASS[bar]), nextTime, STEP * 3, "triangle", 0.14, musicBus);
    nextTime += STEP;
    nextStep++;
  }
  timer = setTimeout(schedule, 150);
}

function setup() {
  if (ctx) return;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ctx = new Ctor();
  musicBus = ctx.createGain(); musicBus.gain.value = muted ? 0 : 0.5; musicBus.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = muted ? 0 : 0.8; sfxBus.connect(ctx.destination);
}

/** Call from a user gesture: browsers only allow audio after one. */
export function startAudio() {
  if (typeof window === "undefined") return;
  setup();
  if (!ctx) return;
  void ctx.resume();
  if (started) return;
  started = true;
  nextTime = ctx.currentTime + 0.1;
  schedule();
}

export function loadMuted(): boolean {
  try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch { /* ignore */ }
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try { localStorage.setItem(MUTE_KEY, value ? "1" : "0"); } catch { /* ignore */ }
  if (!ctx || !musicBus || !sfxBus) return;
  const now = ctx.currentTime;
  musicBus.gain.setTargetAtTime(value ? 0 : 0.5, now, 0.05);
  sfxBus.gain.setTargetAtTime(value ? 0 : 0.8, now, 0.05);
}

/** Pause the loop while the tab is hidden. */
export function setPaused(paused: boolean) {
  if (!ctx) return;
  if (paused) void ctx.suspend(); else if (started) void ctx.resume();
}

function play(notes: [number, number, number?][], type: OscillatorType = "square", peak = 0.12) {
  if (!ctx || !sfxBus || muted || ctx.state !== "running") return;
  const t = ctx.currentTime;
  for (const [note, at, length = 0.12] of notes) tone(midi(note), t + at, length, type, peak, sfxBus);
}

export const sfx = {
  tap: () => play([[84, 0, 0.06]], "square", 0.07),
  pop: () => play([[72, 0, 0.07], [79, 0.07, 0.09]]),
  success: () => play([[72, 0], [76, 0.09], [79, 0.18], [84, 0.27, 0.2]]),
  error: () => play([[52, 0, 0.12], [48, 0.12, 0.2]], "sawtooth", 0.08),
  fanfare: () => play([[72, 0], [72, 0.1], [76, 0.2], [79, 0.3], [84, 0.45, 0.35], [79, 0.7, 0.1], [84, 0.8, 0.45]], "square", 0.1),
};
