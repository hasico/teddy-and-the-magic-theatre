// Domain types for the decoration-placement mechanic (docs/placement-mechanics.md).
// Data-driven so placeholder art can later be swapped for real art without
// touching game logic (user-spec "Ограничения").

export type SchemeId = 'main' | 'hidden';

export type PropRole = 'common' | 'key' | 'dependent';

/**
 * Placeholder props are drawn at runtime with Graphics; sprite props reference
 * a texture loaded in Preload. The only file assets of this slice are the two
 * character sprites (tech-spec Decision 9).
 */
export type PropVisual =
  | {
      kind: 'placeholder';
      shape: 'rect' | 'ellipse';
      width: number;
      height: number;
      fill: number;
      label: string;
    }
  | { kind: 'sprite'; texture: string; scale?: number };

/** A valid installation spot for a prop. Coordinates are design-space 1280x720. */
export interface DropPoint {
  id: string;
  x: number;
  y: number;
  /** Which staging scheme this point belongs to; 'both' is scheme-independent. */
  scheme: SchemeId | 'both';
  /** Decision 17: 70 design px for every point. */
  snapRadius: number;
  /** Marks the tall bush's secret point — never pre-marked, never an auto-hint target. */
  isHidden?: boolean;
}

export interface PropDef {
  id: string;
  /** Dispense order from the storyboard (Decision 4). */
  order: number;
  visual: PropVisual;
  role: PropRole;
  required: boolean;
  points: DropPoint[];
  /** Decision 16: effective grab zone must be at least 100x100 design px. */
  hitboxSize?: { width: number; height: number };
  /** Decision 2: hold-to-drag threshold, key prop only, active only after cats are placed. */
  holdToDragMs?: number;
}

/**
 * Per-scheme reaction of a static environment object (Decision 27).
 * Zeros mean "no visible reaction"; the scooter block is only set for the
 * scooter in the hidden scheme.
 */
export interface EnvironmentReaction {
  swingRotationDeg: number;
  swingCycleMs: number;
  scooter?: { headlightMs: number; shiftPx: number; shiftMs: number };
}

export interface EnvironmentDef {
  id: string;
  x: number;
  y: number;
  visual: PropVisual;
  reactions: Record<SchemeId, EnvironmentReaction>;
}

/** Placeholder staging outcome: caption beats drive simple tweens (tech-spec). */
export interface OutcomeDef {
  scheme: SchemeId;
  title: string;
  durationMs: number;
  beats: { atMs: number; description: string }[];
}

/** propId -> the point it occupies, or undefined while unset. */
export type Placements = Record<string, { pointId: string } | undefined>;

export interface ActConfig {
  id: 'act1';
  keyPropId: string;
  dependentPropIds: string[];
  props: PropDef[];
  environment: EnvironmentDef[];
  outcomes: Record<SchemeId, OutcomeDef>;
  autoHintDelayMs: number; // Decision 20
  hintButtonRevealMs: number; // Decision 20
  hiddenSignalDelayMs: number; // Decision 18
  hiddenMagnetDelayMs: number; // Decision 18
  settleTweenMs: number; // Decision 19
  catsReturnTweenMs: number; // Decision 19
}
