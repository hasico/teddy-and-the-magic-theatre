// Save/load logic against localStorage. This slice implements write-only
// saving (tech-spec Decision 14): the scene always starts from a clean slate,
// nothing reads the save yet — Act II / the Finale will be the first readers.
import type { SchemeId } from '../types/placement';

export const SAVE_FORMAT_VERSION = 1;

const SAVE_KEY = 'teddy-save'; // Decision 24

export interface SaveData {
  version: number;
  acts: {
    act1?: { completed: boolean; scheme: SchemeId };
  };
}

export function defaultSave(): SaveData {
  return { version: SAVE_FORMAT_VERSION, acts: {} };
}

function isSaveData(value: unknown): value is SaveData {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { version?: unknown; acts?: unknown };
  return (
    typeof candidate.version === 'number' &&
    typeof candidate.acts === 'object' &&
    candidate.acts !== null
  );
}

/** Read the existing blob to merge into; a corrupted or foreign blob is
 * replaced by a fresh save rather than erroring ("no punishment for the player"). */
function readBaseForMerge(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw === null) return defaultSave();
    const parsed: unknown = JSON.parse(raw);
    if (isSaveData(parsed) && parsed.version === SAVE_FORMAT_VERSION) return parsed;
  } catch {
    // Unreadable/absent storage behaves like a missing key.
  }
  return defaultSave();
}

/** Record the accepted Act I performance. Merge-and-write: re-staging
 * overwrites the previous scheme only after the player accepts again.
 * Never throws: in private mode / blocked storage losing progress is
 * acceptable, crashing the game is not. */
export function saveAct1Result(scheme: SchemeId): void {
  const save = readBaseForMerge();
  save.acts.act1 = { completed: true, scheme };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // localStorage.setItem can throw (quota, private mode) — swallow it.
  }
}
