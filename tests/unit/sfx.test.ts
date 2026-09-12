import { describe, expect, it, vi } from 'vitest';
import { createSfx } from '../../src/audio/sfx';

/** Oscillator double recording its schedule for assertions. */
class FakeOsc {
  type = '';
  frequency = {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeGain {
  gain = {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
}

function fakeAudioContext() {
  const oscillators: FakeOsc[] = [];
  const gains: FakeGain[] = [];
  const ctx = {
    currentTime: 3,
    destination: { toString: () => 'destination' },
    createOscillator: vi.fn(() => {
      const osc = new FakeOsc();
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => {
      const gain = new FakeGain();
      gains.push(gain);
      return gain;
    }),
  };
  // The double only implements the surface createSfx touches; cast past the
  // ~35 other AudioContext members the real interface requires.
  return { ctx: ctx as unknown as AudioContext, oscillators, gains };
}

describe('createSfx with no WebAudio context', () => {
  it('every effect is a silent no-op and does not throw', () => {
    const sfx = createSfx(() => null);
    expect(() => {
      sfx.playSnap();
      sfx.playHintChime();
      sfx.playScooterBeep();
    }).not.toThrow();
  });
});

describe('playSnap', () => {
  it('plays one short pluck routed through a gain to the destination', () => {
    const { ctx, oscillators, gains } = fakeAudioContext();
    const sfx = createSfx(() => ctx);
    sfx.playSnap();

    expect(oscillators).toHaveLength(1);
    expect(gains).toHaveLength(1);
    const osc = oscillators[0];
    expect(osc.connect).toHaveBeenCalledWith(gains[0]);
    expect(gains[0].connect).toHaveBeenCalledWith(ctx.destination);
    expect(osc.start).toHaveBeenCalledWith(ctx.currentTime);
    // Stopped shortly after — a snap is a pluck, not a sustained tone.
    expect(osc.stop.mock.calls[0][0]).toBeGreaterThan(ctx.currentTime);
    expect(osc.stop.mock.calls[0][0]).toBeLessThan(ctx.currentTime + 0.3);
  });

  it('fades the gain to silence so the cut is never audible', () => {
    const { ctx, gains } = fakeAudioContext();
    const sfx = createSfx(() => ctx);
    sfx.playSnap();

    const ramps = gains[0].gain.exponentialRampToValueAtTime.mock.calls;
    const finalVolumes = ramps.map(([value]) => value as number);
    expect(Math.min(...finalVolumes)).toBeLessThan(0.01);
  });
});

describe('playHintChime', () => {
  it('plays a gentle two-note figure', () => {
    const { ctx, oscillators, gains } = fakeAudioContext();
    const sfx = createSfx(() => ctx);
    sfx.playHintChime();

    expect(oscillators).toHaveLength(2);
    expect(gains).toHaveLength(2);
    for (const osc of oscillators) {
      expect(osc.type).toBe('sine');
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
    }
    // Second note starts after the first begins.
    const secondStart = oscillators[1].start.mock.calls[0][0] as number;
    const firstStart = oscillators[0].start.mock.calls[0][0] as number;
    expect(secondStart).toBeGreaterThan(firstStart);
  });
});

describe('playScooterBeep', () => {
  it('plays two quick square-wave beeps', () => {
    const { ctx, oscillators } = fakeAudioContext();
    const sfx = createSfx(() => ctx);
    sfx.playScooterBeep();

    expect(oscillators).toHaveLength(2);
    for (const osc of oscillators) {
      expect(osc.type).toBe('square');
      expect(osc.stop.mock.calls[0][0]).toBeLessThan(ctx.currentTime + 0.4);
    }
  });
});
