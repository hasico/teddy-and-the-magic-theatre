import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchOrientation } from '../../src/ui/orientationGuard';

/** Minimal MediaQueryList double: stores listeners, lets tests flip matches. */
class FakeMql {
  matches = false;
  receivedQueries: string[] = [];
  private listeners = new Set<(event: { matches: boolean }) => void>();

  addEventListener(type: string, cb: (event: { matches: boolean }) => void): void {
    if (type === 'change') this.listeners.add(cb);
  }

  removeEventListener(type: string, cb: (event: { matches: boolean }) => void): void {
    if (type === 'change') this.listeners.delete(cb);
  }

  /** Simulate the browser firing a change event. */
  flip(matches: boolean): void {
    this.matches = matches;
    for (const cb of this.listeners) cb({ matches });
  }
}

function stubMatchMedia(mql: FakeMql): void {
  const spy = vi.fn((query: string) => {
    mql.receivedQueries.push(query);
    return mql;
  });
  vi.stubGlobal('matchMedia', spy);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('watchOrientation', () => {
  it('fires onPortrait immediately when the device is already in portrait', () => {
    const mql = new FakeMql();
    mql.matches = true;
    stubMatchMedia(mql);
    const onPortrait = vi.fn();
    const onLandscape = vi.fn();
    watchOrientation({ onPortrait, onLandscape });
    expect(onPortrait).toHaveBeenCalledTimes(1);
    expect(onLandscape).not.toHaveBeenCalled();
  });

  it('fires onLandscape immediately when the device is already in landscape', () => {
    const mql = new FakeMql();
    stubMatchMedia(mql);
    const onPortrait = vi.fn();
    const onLandscape = vi.fn();
    watchOrientation({ onPortrait, onLandscape });
    expect(onLandscape).toHaveBeenCalledTimes(1);
    expect(onPortrait).not.toHaveBeenCalled();
  });

  it('subscribes to the orientation media query, not device size classes', () => {
    const mql = new FakeMql();
    stubMatchMedia(mql);
    watchOrientation({ onPortrait: vi.fn(), onLandscape: vi.fn() });
    expect(mql.receivedQueries).toEqual(['(orientation: portrait)']);
  });

  it('calls the matching handler on every orientation change', () => {
    const mql = new FakeMql();
    stubMatchMedia(mql);
    const onPortrait = vi.fn();
    const onLandscape = vi.fn();
    watchOrientation({ onPortrait, onLandscape });

    mql.flip(true);
    mql.flip(true); // duplicate event must not be swallowed either
    mql.flip(false);
    expect(onPortrait).toHaveBeenCalledTimes(2);
    expect(onLandscape).toHaveBeenCalledTimes(2);
  });

  it('stops receiving changes after the returned unsubscribe is called', () => {
    const mql = new FakeMql();
    stubMatchMedia(mql);
    const onPortrait = vi.fn();
    const onLandscape = vi.fn();
    const stop = watchOrientation({ onPortrait, onLandscape });

    stop();
    mql.flip(true);
    mql.flip(false);
    expect(onPortrait).toHaveBeenCalledTimes(0);
    expect(onLandscape).toHaveBeenCalledTimes(1); // only the initial call
  });
});
