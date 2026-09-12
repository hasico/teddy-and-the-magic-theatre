import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAVE_FORMAT_VERSION, defaultSave, saveAct1Result } from '../../src/save/index';

const SAVE_KEY = 'teddy-save';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('defaultSave', () => {
  it('returns the current format version with no act results', () => {
    expect(defaultSave()).toEqual({ version: SAVE_FORMAT_VERSION, acts: {} });
    expect(SAVE_FORMAT_VERSION).toBe(1);
  });
});

describe('saveAct1Result', () => {
  it('writes a correct blob for the hidden scheme', () => {
    saveAct1Result('hidden');
    const raw = localStorage.getItem(SAVE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({
      version: SAVE_FORMAT_VERSION,
      acts: { act1: { completed: true, scheme: 'hidden' } },
    });
  });

  it('writes a correct blob for the main scheme', () => {
    saveAct1Result('main');
    expect(JSON.parse(localStorage.getItem(SAVE_KEY) as string)).toEqual({
      version: SAVE_FORMAT_VERSION,
      acts: { act1: { completed: true, scheme: 'main' } },
    });
  });

  it('overwrites a previous act1 result on re-staging', () => {
    saveAct1Result('main');
    saveAct1Result('hidden');
    expect(JSON.parse(localStorage.getItem(SAVE_KEY) as string).acts.act1.scheme).toBe('hidden');
  });

  it('replaces a corrupted existing blob instead of crashing', () => {
    localStorage.setItem(SAVE_KEY, '{not json');
    saveAct1Result('main');
    expect(JSON.parse(localStorage.getItem(SAVE_KEY) as string).version).toBe(SAVE_FORMAT_VERSION);
  });

  it('replaces a readable but foreign JSON blob instead of merging into it', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ foo: 1 }));
    saveAct1Result('main');
    expect(JSON.parse(localStorage.getItem(SAVE_KEY) as string)).toEqual({
      version: SAVE_FORMAT_VERSION,
      acts: { act1: { completed: true, scheme: 'main' } },
    });
  });

  it('replaces a save from a future format version instead of trusting it', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 99, acts: { act2: { x: 1 } } }));
    saveAct1Result('hidden');
    expect(JSON.parse(localStorage.getItem(SAVE_KEY) as string)).toEqual({
      version: SAVE_FORMAT_VERSION,
      acts: { act1: { completed: true, scheme: 'hidden' } },
    });
  });

  it('does not throw when localStorage access fails (private mode)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded', 'QuotaExceededError');
    });
    expect(() => saveAct1Result('hidden')).not.toThrow();
    expect(spy).toHaveBeenCalled();
  });
});
