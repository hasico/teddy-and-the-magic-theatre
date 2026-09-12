// Single source of truth for "is gameplay input blocked right now"
// (tech-spec Decision 28). One instance per scene; every input handler checks
// `isLocked` first and bails out without side effects, instead of each
// controller implementing its own flag ("единое правило для всех переходов").
//
// Locks are counted rather than boolean: transitions can legitimately overlap
// (e.g. the user flips to portrait mid-performance — the orientation lock and
// the outcome-playback lock are both held), and one holder unlocking must not
// release the other's block. The public surface stays lock/unlock/isLocked.

export class InputGate {
  private lockCount = 0;

  lock(): void {
    this.lockCount += 1;
  }

  unlock(): void {
    // Clamp so an unbalanced unlock can never go negative.
    this.lockCount = Math.max(0, this.lockCount - 1);
  }

  get isLocked(): boolean {
    return this.lockCount > 0;
  }
}
