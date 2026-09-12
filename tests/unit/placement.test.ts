import { describe, expect, it } from 'vitest';
import { ACT1_CONFIG } from '../../src/config/act1';
import {
  activePointsFor,
  canDragKeyProp,
  findSnapTarget,
  hiddenPointDwellState,
  isSceneReady,
  nextHintTarget,
  resetForReposition,
  resolveScheme,
  shouldFireAutoHint,
} from '../../src/logic/placement';
import type { Placements, SchemeId } from '../../src/types/placement';

/** Place every required prop except the given ids (bush lands on `scheme`). */
function placeAllExcept(scheme: SchemeId = 'main', ...skip: string[]): Placements {
  const placements: Placements = {};
  for (const prop of ACT1_CONFIG.props) {
    if (!prop.required || skip.includes(prop.id)) continue;
    const point =
      prop.id === 'tall-bush' || prop.id === 'stone-cats'
        ? prop.points.find((p) => p.scheme === scheme)
        : prop.points[0];
    if (point) placements[prop.id] = { pointId: point.id };
  }
  return placements;
}

describe('ACT1_CONFIG sanity', () => {
  it('dispenses props in the storyboard order (Decision 4)', () => {
    expect(ACT1_CONFIG.props.map((p) => p.id)).toEqual([
      'path-segments',
      'fountain',
      'low-bush',
      'arch',
      'tall-bush',
      'lantern-a',
      'lantern-b',
      'stone-cats',
    ]);
  });

  it('every drop point has snapRadius 70 (Decision 17)', () => {
    for (const prop of ACT1_CONFIG.props) {
      for (const point of prop.points) {
        expect(point.snapRadius, `${point.id}`).toBe(70);
      }
    }
  });

  it('every prop has an effective hitbox of at least 100x100 design px (Decision 16)', () => {
    for (const prop of ACT1_CONFIG.props) {
      const visual = prop.visual.kind === 'placeholder' ? prop.visual : null;
      const width = prop.hitboxSize?.width ?? visual?.width ?? 0;
      const height = prop.hitboxSize?.height ?? visual?.height ?? 0;
      expect(width, `${prop.id} width`).toBeGreaterThanOrEqual(100);
      expect(height, `${prop.id} height`).toBeGreaterThanOrEqual(100);
    }
  });

  it('timing constants match Decisions 18-20', () => {
    expect(ACT1_CONFIG.autoHintDelayMs).toBe(12000);
    expect(ACT1_CONFIG.hintButtonRevealMs).toBe(1250);
    expect(ACT1_CONFIG.hiddenSignalDelayMs).toBe(400);
    expect(ACT1_CONFIG.hiddenMagnetDelayMs).toBe(700);
    expect(ACT1_CONFIG.settleTweenMs).toBe(150);
    expect(ACT1_CONFIG.catsReturnTweenMs).toBe(300);
  });

  it('tall-bush is the key prop with exactly one hidden point of its two (Decision 5/13)', () => {
    const bush = ACT1_CONFIG.props.find((p) => p.id === 'tall-bush');
    expect(bush?.role).toBe('key');
    expect(bush?.points).toHaveLength(2);
    expect(bush?.points.filter((p) => p.isHidden).length).toBe(1);
    expect(bush?.holdToDragMs).toBe(500);
  });

  it('stone-cats is a single dependent prop with main/hidden points (Decision 5)', () => {
    const cats = ACT1_CONFIG.props.find((p) => p.id === 'stone-cats');
    expect(cats?.role).toBe('dependent');
    expect(cats?.points).toHaveLength(2);
    expect(new Set(cats?.points.map((p) => p.scheme))).toEqual(new Set(['main', 'hidden']));
    expect(ACT1_CONFIG.dependentPropIds).toEqual(['stone-cats']);
    expect(ACT1_CONFIG.keyPropId).toBe('tall-bush');
  });

  it('environment reactions match the numeric contract (Decision 27)', () => {
    const byId = (id: string) => ACT1_CONFIG.environment.find((e) => e.id === id);
    const swing = byId('swing');
    expect(swing?.reactions.main.swingRotationDeg).toBe(2);
    expect(swing?.reactions.main.swingCycleMs).toBe(600);
    expect(swing?.reactions.main.scooter).toBeUndefined();
    expect(swing?.reactions.hidden.swingRotationDeg).toBe(6);
    expect(swing?.reactions.hidden.swingCycleMs).toBe(700);
    expect(swing?.reactions.hidden.scooter).toBeUndefined();

    const scooter = byId('scooter');
    expect(scooter?.reactions.main.scooter).toBeUndefined();
    expect(scooter?.reactions.hidden.scooter).toEqual({
      headlightMs: 1000,
      shiftPx: 70,
      shiftMs: 400,
    });
  });

  it('defines both outcomes with readable beats (no POV frame in the hidden one)', () => {
    for (const scheme of ['main', 'hidden'] as const) {
      const outcome = ACT1_CONFIG.outcomes[scheme];
      expect(outcome.scheme).toBe(scheme);
      expect(outcome.beats.length).toBeGreaterThan(0);
      const last = outcome.beats[outcome.beats.length - 1];
      expect(last.atMs).toBeLessThanOrEqual(outcome.durationMs);
    }
    const hiddenText = ACT1_CONFIG.outcomes.hidden.beats.map((b) => b.description).join(' ');
    expect(hiddenText).not.toContain('POV');
  });

  it('order fields match the array order (hints sort by order, dispensing walks the array)', () => {
    expect(ACT1_CONFIG.props.map((p) => p.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('resolveScheme', () => {
  it('returns null while the key prop is unset', () => {
    expect(resolveScheme(ACT1_CONFIG, {})).toBeNull();
  });

  it('returns the scheme of the point the key prop landed on', () => {
    expect(resolveScheme(ACT1_CONFIG, { 'tall-bush': { pointId: 'tall-bush-main' } })).toBe('main');
    expect(resolveScheme(ACT1_CONFIG, { 'tall-bush': { pointId: 'tall-bush-hidden' } })).toBe(
      'hidden',
    );
  });

  it('ignores placements of non-key props', () => {
    const placements = placeAllExcept('main', 'tall-bush');
    expect(resolveScheme(ACT1_CONFIG, placements)).toBeNull();
  });
});

describe('activePointsFor', () => {
  it('before a scheme is chosen only "both" points are active for common props', () => {
    expect(activePointsFor(ACT1_CONFIG, 'fountain', null)).toHaveLength(1);
    expect(activePointsFor(ACT1_CONFIG, 'fountain', null)[0].scheme).toBe('both');
  });

  it('the key prop keeps both its points active before placement (it defines the scheme)', () => {
    expect(
      activePointsFor(ACT1_CONFIG, 'tall-bush', null)
        .map((p) => p.id)
        .sort(),
    ).toEqual(['tall-bush-hidden', 'tall-bush-main']);
  });

  it('dependent prop points of the inactive scheme never attract (no mixed state)', () => {
    expect(activePointsFor(ACT1_CONFIG, 'stone-cats', null)).toHaveLength(0);
    const mainPoints = activePointsFor(ACT1_CONFIG, 'stone-cats', 'main');
    expect(mainPoints.map((p) => p.id)).toEqual(['cats-main']);
    const hiddenPoints = activePointsFor(ACT1_CONFIG, 'stone-cats', 'hidden');
    expect(hiddenPoints.map((p) => p.id)).toEqual(['cats-hidden']);
  });

  it('common prop points stay active under either scheme', () => {
    expect(activePointsFor(ACT1_CONFIG, 'path-segments', 'hidden')).toHaveLength(1);
  });
});

describe('findSnapTarget', () => {
  const a = { id: 'a', x: 0, y: 0, scheme: 'both' as const, snapRadius: 70 };
  const b = { id: 'b', x: 200, y: 0, scheme: 'both' as const, snapRadius: 70 };

  it('returns the nearest point within its radius', () => {
    const hit = findSnapTarget([a, b], 30, 0);
    expect(hit?.point.id).toBe('a');
    expect(hit?.distance).toBeCloseTo(30);
  });

  it('returns null when no point is within radius', () => {
    expect(findSnapTarget([a, b], 100, 0)).toBeNull();
  });

  it('is deterministic at the radius boundary (no flicker between sides)', () => {
    expect(findSnapTarget([a], 70, 0)?.point.id).toBe('a');
    expect(findSnapTarget([a], 70.5, 0)).toBeNull();
  });

  it('prefers the first point on an exact distance tie', () => {
    const left = { ...a, x: 0 };
    const right = { ...a, id: 'tie', x: 120 };
    const hit = findSnapTarget([left, right], 60, 0);
    expect(hit?.point.id).toBe('a');
  });

  it('prefers the nearer point even when it comes later in the array', () => {
    const far = { ...a, x: 0 };
    const near = { ...a, id: 'near', x: 50 };
    expect(findSnapTarget([far, near], 50, 0)?.point.id).toBe('near');
  });
});

describe('hiddenPointDwellState', () => {
  it("is 'none' below the signal delay", () => {
    expect(hiddenPointDwellState(0, 400, 700)).toBe('none');
    expect(hiddenPointDwellState(399, 400, 700)).toBe('none');
  });

  it("'signal' starts at 400ms and lasts until the magnet delay", () => {
    expect(hiddenPointDwellState(400, 400, 700)).toBe('signal');
    expect(hiddenPointDwellState(699, 400, 700)).toBe('signal');
  });

  it("'magnet' from 700ms", () => {
    expect(hiddenPointDwellState(700, 400, 700)).toBe('magnet');
    expect(hiddenPointDwellState(5000, 400, 700)).toBe('magnet');
  });
});

describe('isSceneReady', () => {
  it('is false with no placements and with a partially filled scene', () => {
    expect(isSceneReady(ACT1_CONFIG, {})).toBe(false);
    expect(isSceneReady(ACT1_CONFIG, placeAllExcept('main', 'stone-cats'))).toBe(false);
    expect(isSceneReady(ACT1_CONFIG, placeAllExcept('hidden', 'lantern-b', 'stone-cats'))).toBe(
      false,
    );
  });

  it('is true when every required prop sits on a point (both schemes)', () => {
    expect(isSceneReady(ACT1_CONFIG, placeAllExcept('main'))).toBe(true);
    expect(isSceneReady(ACT1_CONFIG, placeAllExcept('hidden'))).toBe(true);
  });
});

describe('nextHintTarget', () => {
  it('points at the main (non-hidden) point of the next unset required prop', () => {
    const placements = placeAllExcept('main', 'tall-bush');
    const target = nextHintTarget(ACT1_CONFIG, placements);
    expect(target?.id).toBe('tall-bush-main');
    expect(target?.isHidden).toBeFalsy();
  });

  it('targets the earliest unplaced prop in dispense order when several are out', () => {
    // Reposition window: bush (5), lantern-a (6) and cats (8) can all be out.
    const placements = placeAllExcept('main', 'lantern-a', 'stone-cats', 'tall-bush');
    expect(nextHintTarget(ACT1_CONFIG, placements)?.id).toBe('tall-bush-main');
  });

  it('uses the active scheme point for dependent props', () => {
    const placements = placeAllExcept('main', 'stone-cats');
    expect(nextHintTarget(ACT1_CONFIG, placements)?.id).toBe('cats-main');
  });

  it('returns null when nothing is left to place', () => {
    expect(nextHintTarget(ACT1_CONFIG, placeAllExcept('main'))).toBeNull();
  });
});

describe('canDragKeyProp', () => {
  it('allows re-dragging the key prop only after dependents are placed', () => {
    expect(canDragKeyProp(false)).toBe(false);
    expect(canDragKeyProp(true)).toBe(true);
  });
});

describe('shouldFireAutoHint', () => {
  it('never fires while the prop is held', () => {
    expect(shouldFireAutoHint(60000, true, 12000)).toBe(false);
  });

  it('does not fire before the delay elapses, boundary-inclusive at the delay', () => {
    expect(shouldFireAutoHint(11999, false, 12000)).toBe(false);
    expect(shouldFireAutoHint(12000, false, 12000)).toBe(true);
    expect(shouldFireAutoHint(13000, false, 12000)).toBe(true);
  });
});

describe('resetForReposition', () => {
  it('clears only the key and dependent props, keeping common props placed', () => {
    const before = placeAllExcept('main');
    const after = resetForReposition(before, ACT1_CONFIG.keyPropId, ACT1_CONFIG.dependentPropIds);
    expect(after['tall-bush']).toBeUndefined();
    expect(after['stone-cats']).toBeUndefined();
    expect(after['fountain']).toEqual({ pointId: 'fountain-main' });
    expect(after['path-segments']).toEqual({ pointId: 'path-main' });
  });

  it('does not mutate the input placements', () => {
    const before = placeAllExcept('main');
    const snapshot = JSON.stringify(before);
    resetForReposition(before, ACT1_CONFIG.keyPropId, ACT1_CONFIG.dependentPropIds);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
