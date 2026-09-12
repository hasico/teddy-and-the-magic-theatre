// Phaser-free game rules for the placement mechanic (tech-spec Decision 3):
// every function here is unit-testable without a running engine, so the
// distance math uses plain Math.hypot instead of Phaser.Math.
import type { ActConfig, DropPoint, Placements, PropDef, SchemeId } from '../types/placement';

function propById(config: ActConfig, propId: string): PropDef | undefined {
  return config.props.find((prop) => prop.id === propId);
}

/** Which staging scheme the key prop's current position selects, or null. */
export function resolveScheme(config: ActConfig, placements: Placements): SchemeId | null {
  const keyPlacement = placements[config.keyPropId];
  if (!keyPlacement) return null;
  const keyProp = propById(config, config.keyPropId);
  if (!keyProp) return null;
  const point = keyProp.points.find((candidate) => candidate.id === keyPlacement.pointId);
  // Key-prop points are always scheme-specific; 'both' would select nothing.
  if (!point || point.scheme === 'both') return null;
  return point.scheme;
}

/**
 * Points of a prop that currently attract it. Common/dependent props only get
 * 'both' points before a scheme is chosen and scheme points afterwards, which
 * makes a mixed staging impossible (placement-mechanics.md §5). The key prop
 * keeps all of its points active — its landing position is what *defines* the
 * scheme, so restricting it would make the choice itself unplaceable.
 */
export function activePointsFor(
  config: ActConfig,
  propId: string,
  activeScheme: SchemeId | null,
): DropPoint[] {
  const prop = propById(config, propId);
  if (!prop) return [];
  if (prop.role === 'key') return prop.points;
  if (activeScheme === null) return prop.points.filter((point) => point.scheme === 'both');
  return prop.points.filter((point) => point.scheme === 'both' || point.scheme === activeScheme);
}

/** Nearest active point within its snap radius, or null. Deterministic: on an
 * exact distance tie the earlier point in the array wins, so the same
 * coordinates always produce the same target — no flicker at the boundary. */
export function findSnapTarget(
  points: DropPoint[],
  x: number,
  y: number,
): { point: DropPoint; distance: number } | null {
  let best: { point: DropPoint; distance: number } | null = null;
  for (const point of points) {
    const distance = Math.hypot(x - point.x, y - point.y);
    if (distance <= point.snapRadius && (best === null || distance < best.distance)) {
      best = { point, distance };
    }
  }
  return best;
}

/** True when every required prop sits on a point — gates the stage console. */
export function isSceneReady(config: ActConfig, placements: Placements): boolean {
  return config.props.filter((prop) => prop.required).every((prop) => placements[prop.id]);
}

/**
 * Main (non-hidden) point of the next unset required prop for hints; null when
 * nothing is left to place. Hints never target the hidden point.
 */
export function nextHintTarget(config: ActConfig, placements: Placements): DropPoint | null {
  const scheme = resolveScheme(config, placements);
  const next = config.props
    .filter((prop) => prop.required && !placements[prop.id])
    .sort((a, b) => a.order - b.order)[0];
  if (!next) return null;
  const candidates = activePointsFor(config, next.id, scheme);
  return candidates.find((point) => !point.isHidden) ?? null;
}

export type HiddenDwellState = 'none' | 'signal' | 'magnet';

/**
 * Tactile-signal state for lingering near the tall bush's hidden point
 * (Decision 18): 'none' on a quick pass-by, 'signal' (bush shake, petals,
 * Ogonyok reacts) from 400ms, magnetic pull only from 700ms.
 */
export function hiddenPointDwellState(
  elapsedMs: number,
  signalDelayMs: number,
  magnetDelayMs: number,
): HiddenDwellState {
  if (elapsedMs >= magnetDelayMs) return 'magnet';
  if (elapsedMs >= signalDelayMs) return 'signal';
  return 'none';
}

/** Hold-to-drag of the key prop is only needed once dependents are placed. */
export function canDragKeyProp(catsPlaced: boolean): boolean {
  return catsPlaced;
}

/**
 * Auto-hint fires once per prop after `delayMs` of idling and never while the
 * prop is already in the player's hand (user-spec "Как должно работать" #6).
 */
export function shouldFireAutoHint(idleMs: number, isHeld: boolean, delayMs: number): boolean {
  return !isHeld && idleMs >= delayMs;
}

/** "Переставить": clear only the key prop and its dependents, keep the rest. */
export function resetForReposition(
  placements: Placements,
  keyPropId: string,
  dependentPropIds: string[],
): Placements {
  const next: Placements = { ...placements };
  delete next[keyPropId];
  for (const id of dependentPropIds) delete next[id];
  return next;
}
