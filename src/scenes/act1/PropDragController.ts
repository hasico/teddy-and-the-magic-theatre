// Drag + magnetic snap for dispensed props, plus the key-prop special case
// (tech-spec Tasks 7-8). All placement decisions go through the pure helpers
// in src/logic/placement.ts; this class is the Phaser glue: it owns the
// current prop's game object, the chalk marks for its active points, the
// settle/return tweens and the InputGate lock during the settle tween.
//
// Soft magnet (no flicker): the pull weight is a continuous function of the
// distance to the nearest point, so a fast finger crossing the snap radius
// boundary never toggles between discrete states.
//
// The placed key prop is lifted with a 500ms hold and then follows the
// pointer manually — Phaser's own drag would have started at pointerdown,
// before the hold elapsed.
import Phaser from 'phaser';
import type { ActConfig, DropPoint, PropDef } from '../../types/placement';
import {
  activePointsFor,
  canDragKeyProp,
  findSnapTarget,
  hiddenPointDwellState,
} from '../../logic/placement';
import type { InputGate } from '../../logic/inputGate';
import type { Sfx } from '../../audio/sfx';
import { BOX_POSITION, createPropVisual, drawPointMark, spawnCrumbs, spawnPetal } from './visuals';

export interface PropDragCallbacks {
  /** A prop finished its settle tween on a point. */
  onPlaced(propId: string, pointId: string): void;
  /** The placed key prop was lifted after the hold — return cats, reset placements, dim the console. */
  onKeyPropLiftedFromStage(): void;
  getScheme(): 'main' | 'hidden' | null;
  areDependentsPlaced(): boolean;
  /** Ogonyok's one-second reaction to the hidden-point signal. */
  reactToHiddenSignal(): void;
}

export class PropDragController {
  private readonly scene: Phaser.Scene;
  private readonly config: ActConfig;
  private readonly gate: InputGate;
  private readonly sfx: Sfx;
  private readonly cb: PropDragCallbacks;

  private currentProp: PropDef | null = null;
  private currentGo: Phaser.GameObjects.Container | null = null;
  private readonly propGos = new Map<string, Phaser.GameObjects.Container>();
  private readonly markLayer: Phaser.GameObjects.Graphics;

  private held = false;
  private dragSuppressed = false;

  // Key-prop stage lift.
  private keyHoldTimer: Phaser.Time.TimerEvent | null = null;
  private manualDrag = false;
  private readonly grabOffset = new Phaser.Math.Vector2();

  // Hidden-point dwell state (Decision 18), reset on every episode change.
  private hiddenDwellMs = 0;
  private hiddenSignalShown = false;
  private magnetEngaged = false;

  // The settle tween target, kept so an orientation flip mid-settle can
  // complete the placement instead of leaving a locked gate behind.
  private pendingPoint: DropPoint | null = null;
  private settleTween: Phaser.Tweens.Tween | null = null;
  private returnTween: Phaser.Tweens.Tween | null = null;

  constructor(
    scene: Phaser.Scene,
    config: ActConfig,
    gate: InputGate,
    sfx: Sfx,
    callbacks: PropDragCallbacks,
  ) {
    this.scene = scene;
    this.config = config;
    this.gate = gate;
    this.sfx = sfx;
    this.cb = callbacks;
    this.markLayer = scene.add.graphics().setDepth(1);

    scene.input.on(Phaser.Input.Events.DRAG_START, this.onDragStart, this);
    scene.input.on(Phaser.Input.Events.DRAG, this.onDrag, this);
    scene.input.on(Phaser.Input.Events.DRAG_END, this.onDragEnd, this);
    scene.input.on(Phaser.Input.Events.GAMEOBJECT_DOWN, this.onGameObjectDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
  }

  get isPropHeld(): boolean {
    return this.held;
  }

  /** The prop currently waiting in the box / in the player's hand, if any. */
  get currentPropDef(): PropDef | null {
    return this.currentProp;
  }

  get currentPropGo(): Phaser.GameObjects.Container | null {
    return this.currentGo;
  }

  getPropGo(propId: string): Phaser.GameObjects.Container | undefined {
    return this.propGos.get(propId);
  }

  /** Dispense the next prop at the box and mark its active points. */
  dispense(prop: PropDef): void {
    this.currentProp = prop;
    const go = createPropVisual(this.scene, prop);
    this.currentGo = go;
    this.propGos.set(prop.id, go);
    go.setPosition(BOX_POSITION.x, BOX_POSITION.y - 60);
    this.scene.input.setDraggable(go);
    this.resetDwell();
    this.redrawMarks();
    // A short pop-in so a freshly dispensed prop draws the eye.
    go.setScale(0.6);
    this.scene.tweens.add({ targets: go, scale: 1, duration: 200, ease: 'Back.easeOut' });
  }

  update(delta: number): void {
    if (this.manualDrag && this.currentGo) {
      const pointer = this.scene.input.activePointer;
      if (pointer.isDown) {
        this.applyPointerPosition(
          pointer.worldX + this.grabOffset.x,
          pointer.worldY + this.grabOffset.y,
        );
      }
    }
    this.updateHiddenDwell(delta);
  }

  /**
   * Portrait flip / shutdown: abort the in-flight interaction the same way a
   * page refresh would — the prop is back at the box, nothing half-placed.
   */
  cancelActiveDrag(): void {
    this.cancelKeyHold();
    // The pointer may still be down through the portrait flip: Phaser keeps
    // the GO in its drag list and keeps emitting DRAG without re-checking
    // draggable, so the cancelled session must not resume once the gate
    // reopens. DRAG_END (window-level) or a fresh DRAG_START clears the flag.
    this.dragSuppressed = true;
    if (this.pendingPoint) {
      this.finishPlacement();
      return;
    }
    if (!this.currentGo) return;
    this.scene.tweens.killTweensOf(this.currentGo);
    this.returnTween = null;
    this.held = false;
    this.manualDrag = false;
    this.resetDwell();
    this.returnCurrentToBox(false);
  }

  /** Tween a placed prop back into the box and destroy it (cats / reposition). */
  returnPropToBox(prop: PropDef, onDone?: () => void): void {
    const go = this.propGos.get(prop.id);
    if (!go) {
      onDone?.();
      return;
    }
    this.propGos.delete(prop.id);
    go.disableInteractive();
    this.scene.tweens.killTweensOf(go);
    this.scene.tweens.add({
      targets: go,
      x: BOX_POSITION.x,
      y: BOX_POSITION.y - 60,
      duration: this.config.catsReturnTweenMs,
      ease: 'Quad.easeIn',
      onComplete: () => {
        go.destroy();
        onDone?.();
      },
    });
  }

  destroy(): void {
    this.cancelKeyHold();
    const input = this.scene.input;
    input.off(Phaser.Input.Events.DRAG_START, this.onDragStart, this);
    input.off(Phaser.Input.Events.DRAG, this.onDrag, this);
    input.off(Phaser.Input.Events.DRAG_END, this.onDragEnd, this);
    input.off(Phaser.Input.Events.GAMEOBJECT_DOWN, this.onGameObjectDown, this);
    input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.markLayer.destroy();
    this.propGos.clear();
  }

  // --- event handlers -----------------------------------------------------

  private onDragStart(_pointer: Phaser.Input.Pointer, go: Phaser.GameObjects.GameObject): void {
    if (go !== this.currentGo) return;
    if (this.gate.isLocked) {
      this.dragSuppressed = true;
      return;
    }
    this.dragSuppressed = false;
    this.held = true;
    // A fresh grab wins over a still-running miss-return tween.
    if (this.returnTween) {
      this.returnTween.remove();
      this.returnTween = null;
    }
  }

  private onDrag(
    _pointer: Phaser.Input.Pointer,
    go: Phaser.GameObjects.GameObject,
    dragX: number,
    dragY: number,
  ): void {
    if (go !== this.currentGo || this.dragSuppressed || this.gate.isLocked) return;
    this.held = true;
    this.applyPointerPosition(dragX, dragY);
  }

  private onDragEnd(_pointer: Phaser.Input.Pointer, go: Phaser.GameObjects.GameObject): void {
    if (go !== this.currentGo) return;
    if (this.dragSuppressed || this.gate.isLocked || !this.held) {
      this.dragSuppressed = false;
      this.held = false;
      this.manualDrag = false;
      this.returnCurrentToBox(false);
      return;
    }
    this.releaseCurrentProp();
  }

  private onPointerUp(): void {
    if (this.keyHoldTimer) this.cancelKeyHold();
    if (this.manualDrag && this.held) {
      this.manualDrag = false;
      if (this.gate.isLocked) {
        // Cats are still flying back to the box — releasing the bush now must
        // not re-place it behind the transition; abort like a page refresh would.
        this.held = false;
        this.returnCurrentToBox(false);
      } else {
        this.releaseCurrentProp();
      }
    }
  }

  private onGameObjectDown(
    _pointer: Phaser.Input.Pointer,
    go: Phaser.GameObjects.GameObject,
  ): void {
    const bush = this.propGos.get(this.config.keyPropId);
    if (!bush || go !== bush || this.currentProp) return;
    if (!canDragKeyProp(this.cb.areDependentsPlaced()) || this.gate.isLocked) return;
    this.startKeyHold(bush);
  }

  // --- internals ----------------------------------------------------------

  /** Snap candidates of the current prop; the hidden point joins only once its magnet engaged. */
  private snapCandidates(): DropPoint[] {
    if (!this.currentProp) return [];
    return activePointsFor(this.config, this.currentProp.id, this.cb.getScheme()).filter(
      (point) => !point.isHidden || this.magnetEngaged,
    );
  }

  /** Continuous soft pull toward the nearest point inside its radius. */
  private applyPointerPosition(x: number, y: number): void {
    if (!this.currentGo) return;
    let px = x;
    let py = y;
    const hit = findSnapTarget(this.snapCandidates(), px, py);
    if (hit) {
      const pull = Math.max(0, 1 - hit.distance / hit.point.snapRadius) * 0.55;
      px = Phaser.Math.Linear(px, hit.point.x, pull);
      py = Phaser.Math.Linear(py, hit.point.y, pull);
    }
    this.currentGo.setPosition(px, py);
  }

  private releaseCurrentProp(): void {
    if (!this.currentGo || !this.currentProp) return;
    this.held = false;
    const hit = findSnapTarget(this.snapCandidates(), this.currentGo.x, this.currentGo.y);
    this.resetDwell();
    if (hit) this.settleTo(hit.point);
    else this.returnCurrentToBox(true);
  }

  private settleTo(point: DropPoint): void {
    const go = this.currentGo;
    if (!go) return;
    this.pendingPoint = point;
    this.gate.lock(); // Decision 28: settle tween blocks input.
    go.disableInteractive();
    this.clearMarks();
    this.scene.tweens.killTweensOf(go);
    this.settleTween = this.scene.tweens.add({
      targets: go,
      x: point.x,
      y: point.y,
      scaleY: 0.92, // лёгкое сжатие
      duration: this.config.settleTweenMs,
      ease: 'Quad.easeOut',
      onComplete: () => this.finishPlacement(),
    });
  }

  /** Shared confirmation for BOTH bush points — the hidden scheme is never marked as an error. */
  private finishPlacement(): void {
    const point = this.pendingPoint;
    const go = this.currentGo;
    const prop = this.currentProp;
    if (!point || !go || !prop) return;
    this.pendingPoint = null;
    this.settleTween?.remove();
    this.settleTween = null;
    this.scene.tweens.killTweensOf(go);
    go.setPosition(point.x, point.y);
    go.setScale(1);
    go.setAngle(0);
    spawnCrumbs(this.scene, point.x, point.y);
    this.sfx.playSnap();
    this.gate.unlock();
    // Placed non-key props stay fixed: not draggable, no reaction to touches.
    if (prop.id === this.config.keyPropId) {
      this.scene.input.setDraggable(go, false);
      go.setInteractive(); // re-enable for the 500ms hold-to-lift after cats are placed
    }
    this.currentProp = null;
    this.currentGo = null;
    this.cb.onPlaced(prop.id, point.id);
  }

  private returnCurrentToBox(animated: boolean): void {
    const go = this.currentGo;
    if (!go) return;
    this.scene.tweens.killTweensOf(go);
    this.returnTween = null;
    // The lifted key prop returns here too: finishPlacement disabled its drag,
    // so re-enable it — sitting at the box it must be grabbable again like a
    // fresh dispense (neutral miss, the child can retry). No-op for regular
    // props, which are already draggable.
    this.scene.input.setDraggable(go, true);
    if (animated) {
      this.returnTween = this.scene.tweens.add({
        targets: go,
        x: BOX_POSITION.x,
        y: BOX_POSITION.y - 60,
        duration: 250,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.returnTween = null;
        },
      });
    } else {
      go.setPosition(BOX_POSITION.x, BOX_POSITION.y - 60);
    }
  }

  private startKeyHold(bush: Phaser.GameObjects.Container): void {
    this.cancelKeyHold();
    const def = this.config.props.find((p) => p.id === this.config.keyPropId);
    if (!def) return;
    this.keyHoldTimer = this.scene.time.delayedCall(def.holdToDragMs ?? 500, () => {
      this.keyHoldTimer = null;
      this.liftKeyProp(bush, def);
    });
    // A subtle tremble hints that holding does something.
    this.scene.tweens.add({
      targets: bush,
      angle: { from: -2, to: 2 },
      duration: 90,
      yoyo: true,
      repeat: 5,
    });
  }

  private liftKeyProp(bush: Phaser.GameObjects.Container, def: PropDef): void {
    if (this.gate.isLocked || this.currentProp) return;
    this.scene.tweens.killTweensOf(bush);
    bush.setAngle(0);
    const pointer = this.scene.input.activePointer;
    this.grabOffset.set(bush.x - pointer.worldX, bush.y - pointer.worldY);
    this.currentProp = def;
    this.currentGo = bush;
    this.manualDrag = true;
    this.held = true;
    this.resetDwell();
    this.redrawMarks();
    this.cb.onKeyPropLiftedFromStage();
  }

  private cancelKeyHold(): void {
    if (this.keyHoldTimer) {
      this.keyHoldTimer.remove(false);
      this.keyHoldTimer = null;
    }
    const bush = this.propGos.get(this.config.keyPropId);
    if (bush) {
      this.scene.tweens.killTweensOf(bush);
      bush.setAngle(0);
    }
  }

  private updateHiddenDwell(delta: number): void {
    const prop = this.currentProp;
    const go = this.currentGo;
    if (!prop || !go || !this.held || prop.id !== this.config.keyPropId) {
      this.resetDwell();
      return;
    }
    const hidden = prop.points.find((point) => point.isHidden);
    if (!hidden) return;
    const dist = Math.hypot(go.x - hidden.x, go.y - hidden.y);
    if (dist > hidden.snapRadius) {
      this.resetDwell();
      return;
    }
    this.hiddenDwellMs += delta;
    const state = hiddenPointDwellState(
      this.hiddenDwellMs,
      this.config.hiddenSignalDelayMs,
      this.config.hiddenMagnetDelayMs,
    );
    if (state === 'signal' && !this.hiddenSignalShown) {
      this.hiddenSignalShown = true;
      this.fireHiddenSignal(go, hidden);
    }
    this.magnetEngaged = state === 'magnet';
  }

  /** Tactile tell near the secret point: tremble, petals toward the mounting, Ogonyok reacts. */
  private fireHiddenSignal(go: Phaser.GameObjects.Container, hidden: DropPoint): void {
    this.scene.tweens.killTweensOf(go);
    this.scene.tweens.add({
      targets: go,
      angle: { from: -3, to: 3 },
      duration: 70,
      yoyo: true,
      repeat: 4,
    });
    spawnPetal(this.scene, go.x, go.y, hidden.x, hidden.y);
    spawnPetal(this.scene, go.x, go.y + 10, hidden.x, hidden.y, 0x9f8ec4);
    this.cb.reactToHiddenSignal();
  }

  private resetDwell(): void {
    this.hiddenDwellMs = 0;
    this.hiddenSignalShown = false;
    this.magnetEngaged = false;
  }

  private redrawMarks(): void {
    this.markLayer.clear();
    if (!this.currentProp) return;
    for (const point of activePointsFor(this.config, this.currentProp.id, this.cb.getScheme())) {
      if (point.isHidden) continue; // the secret point is never pre-marked
      drawPointMark(this.markLayer, point.x, point.y);
    }
  }

  private clearMarks(): void {
    this.markLayer.clear();
  }
}
