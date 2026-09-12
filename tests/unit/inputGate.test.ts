import { describe, expect, it } from 'vitest';
import { InputGate } from '../../src/logic/inputGate';

describe('InputGate', () => {
  it('starts unlocked', () => {
    expect(new InputGate().isLocked).toBe(false);
  });

  it('lock() blocks input and unlock() releases it', () => {
    const gate = new InputGate();
    gate.lock();
    expect(gate.isLocked).toBe(true);
    gate.unlock();
    expect(gate.isLocked).toBe(false);
  });

  it('keeps input blocked while any lock holder is still in a transition (nested locks)', () => {
    const gate = new InputGate();
    gate.lock(); // e.g. outcome playback starts
    gate.lock(); // user also flips to portrait mid-playback
    gate.unlock(); // back to landscape — playback still running
    expect(gate.isLocked).toBe(true);
    gate.unlock(); // playback finished
    expect(gate.isLocked).toBe(false);
  });

  it('tolerates unlock() without a matching lock()', () => {
    const gate = new InputGate();
    gate.unlock();
    expect(gate.isLocked).toBe(false);
  });
});
