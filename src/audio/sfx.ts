// Synthesised sound effects (tech-spec Decision 11): oscillators created
// straight on Phaser's WebAudio context, no audio files to load. Every
// effect degrades to a silent no-op when WebAudio is unavailable (older
// Safari / blocked autoplay / NoAudio sound manager), because a missing
// click sound must never break the placement game for a child.
//
// The context is injected as a getter so tests can pass a double and the
// scene can hand in its live manager context.

export interface Sfx {
  playSnap(): void;
  playHintChime(): void;
  playScooterBeep(): void;
}

interface ToneOptions {
  type: OscillatorType;
  fromHz: number;
  toHz: number;
  durationSec: number;
  peakGain: number;
  /** Offset from "now" so multi-note figures can be scheduled at once. */
  delaySec?: number;
}

const SILENCE = 0.0001;
const ATTACK_SEC = 0.01;

function tone(ctx: AudioContext, options: ToneOptions): void {
  const startAt = ctx.currentTime + (options.delaySec ?? 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = options.type;
  osc.frequency.setValueAtTime(options.fromHz, startAt);
  if (options.toHz !== options.fromHz) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, options.toHz),
      startAt + options.durationSec,
    );
  }

  gain.gain.setValueAtTime(SILENCE, startAt);
  gain.gain.exponentialRampToValueAtTime(options.peakGain, startAt + ATTACK_SEC);
  gain.gain.exponentialRampToValueAtTime(SILENCE, startAt + options.durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + options.durationSec + ATTACK_SEC);
}

export function createSfx(getContext: () => AudioContext | null): Sfx {
  return {
    // Landing a prop: a short downward pluck.
    playSnap(): void {
      const ctx = getContext();
      if (!ctx) return;
      tone(ctx, { type: 'triangle', fromHz: 540, toHz: 180, durationSec: 0.12, peakGain: 0.22 });
    },
    // Hint reveal: a gentle rising two-note chime.
    playHintChime(): void {
      const ctx = getContext();
      if (!ctx) return;
      tone(ctx, { type: 'sine', fromHz: 660, toHz: 660, durationSec: 0.16, peakGain: 0.12 });
      tone(ctx, {
        type: 'sine',
        fromHz: 990,
        toHz: 990,
        durationSec: 0.2,
        peakGain: 0.1,
        delaySec: 0.14,
      });
    },
    // Scooter headlight (hidden-scheme outcome): two quick cartoon beeps.
    playScooterBeep(): void {
      const ctx = getContext();
      if (!ctx) return;
      tone(ctx, { type: 'square', fromHz: 392, toHz: 392, durationSec: 0.08, peakGain: 0.07 });
      tone(ctx, {
        type: 'square',
        fromHz: 392,
        toHz: 392,
        durationSec: 0.08,
        peakGain: 0.07,
        delaySec: 0.16,
      });
    },
  };
}
