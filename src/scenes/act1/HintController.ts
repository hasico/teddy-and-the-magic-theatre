// Auto-hint timer + the always-visible hint button (tech-spec Task 9).
// The auto hint fires once per prop after 12s of idleness — never while the
// prop is held and never while input is gated — and Ogonyok flies only to
// the MAIN point (nextHintTarget excludes hidden points). The button shows
// a partial reveal for 1.25s and is inactive during a drag or when nothing
// is left to place.
import Phaser from 'phaser';
import type { ActConfig, DropPoint, PropDef } from '../../types/placement';
import { shouldFireAutoHint } from '../../logic/placement';
import type { InputGate } from '../../logic/inputGate';
import type { Sfx } from '../../audio/sfx';
import { spawnCrumbs } from './visuals';

export interface HintDeps {
  gate: InputGate;
  sfx: Sfx;
  /** The prop currently waiting in the box / in the player's hand, if any. */
  getCurrentProp(): PropDef | null;
  getCurrentPropGo(): Phaser.GameObjects.Container | null;
  /** nextHintTarget() result for the current placements — main points only. */
  getHintPoint(): DropPoint | null;
  isPropHeld(): boolean;
  getOgonek(): Phaser.GameObjects.Sprite;
  getOgonekHome(): { x: number; y: number };
  /** The flight killed Ogonyok's idle bob — restart it at home. */
  onOgonekSettled(): void;
}

export class HintController {
  private readonly scene: Phaser.Scene;
  private readonly config: ActConfig;
  private readonly deps: HintDeps;

  private idleMs = 0;
  private lastPropId: string | null = null;
  /** Props that already used their single auto hint (survives repositioning). */
  private readonly hintedPropIds = new Set<string>();

  private readonly button: Phaser.GameObjects.Container;
  private buttonEnabled = true;

  constructor(scene: Phaser.Scene, config: ActConfig, deps: HintDeps) {
    this.scene = scene;
    this.config = config;
    this.deps = deps;
    this.button = this.createButton();
  }

  update(delta: number): void {
    const prop = this.deps.getCurrentProp();
    if (prop?.id !== this.lastPropId) {
      this.lastPropId = prop?.id ?? null;
      this.idleMs = 0; // fresh prop — fresh patience window
    }

    const held = this.deps.isPropHeld();
    if (held || this.deps.gate.isLocked) {
      this.idleMs = 0;
    } else {
      this.idleMs += delta;
    }

    if (
      prop &&
      !this.hintedPropIds.has(prop.id) &&
      shouldFireAutoHint(this.idleMs, held, this.config.autoHintDelayMs)
    ) {
      this.hintedPropIds.add(prop.id);
      this.idleMs = 0;
      this.fireHint({ withReveal: false });
    }

    this.refreshButton(prop, held);
  }

  destroy(): void {
    this.button.destroy();
  }

  // --- internals ----------------------------------------------------------

  private createButton(): Phaser.GameObjects.Container {
    const width = 170;
    const height = 52;
    const g = this.scene.add.graphics();
    g.fillStyle(0x3d2b56, 0.95);
    g.lineStyle(3, 0xd9a441, 1);
    g.fillRoundedRect(-width / 2, -height / 2, width, height, 12);
    g.strokeRoundedRect(-width / 2, -height / 2, width, height, 12);
    const label = this.scene.add
      .text(0, 0, 'Подсказка', {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: '#f0eaff',
      })
      .setOrigin(0.5);
    const container = this.scene.add
      .container(1180, 55, [g, label])
      .setDepth(10)
      .setInteractive({
        hitArea: new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      });
    container.on(Phaser.Input.Events.POINTER_DOWN, () => this.onButtonPressed());
    return container;
  }

  private refreshButton(prop: PropDef | null, held: boolean): void {
    const enabled = prop !== null && !held && !this.deps.gate.isLocked;
    if (enabled === this.buttonEnabled) return;
    this.buttonEnabled = enabled;
    this.button.setAlpha(enabled ? 1 : 0.4);
    if (enabled) this.button.setInteractive();
    else this.button.disableInteractive();
  }

  private onButtonPressed(): void {
    if (this.deps.gate.isLocked) return;
    const prop = this.deps.getCurrentProp();
    if (!prop || this.deps.isPropHeld()) return;
    this.fireHint({ withReveal: true });
  }

  /** Ogonyok flies to the main point leaving sparks; the button also pulses a partial mark. */
  private fireHint(options: { withReveal: boolean }): void {
    const point = this.deps.getHintPoint();
    if (!point) return;

    this.deps.sfx.playHintChime();

    // The waiting prop bounces in the box.
    const go = this.deps.getCurrentPropGo();
    if (go) {
      this.scene.tweens.add({
        targets: go,
        y: go.y - 24,
        duration: 180,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }

    // Ogonyok flies out and returns home after leaving sparks.
    const ogonek = this.deps.getOgonek();
    const home = this.deps.getOgonekHome();
    this.scene.tweens.killTweensOf(ogonek);
    ogonek.setScale(1.3); // slightly larger in flight
    this.scene.tweens.chain({
      targets: ogonek,
      tweens: [
        { x: point.x, y: point.y - 40, duration: 700, ease: 'Sine.easeInOut' },
        { x: home.x, y: home.y, duration: 700, ease: 'Sine.easeInOut' },
      ],
      onComplete: () => {
        ogonek.setScale(1);
        this.deps.onOgonekSettled();
      },
    });
    this.scene.time.delayedCall(700, () => {
      spawnCrumbs(this.scene, point.x, point.y - 30, 0xffd27f);
    });

    // Partial reveal (button only): a pulsing arc for hintButtonRevealMs,
    // never an exact silhouette and never the hidden scheme.
    if (options.withReveal) {
      const arc = this.scene.add
        .ellipse(point.x, point.y, 130, 48)
        .setStrokeStyle(4, 0xffd27f, 0.8)
        .setDepth(9);
      this.scene.tweens.add({
        targets: arc,
        alpha: { from: 0.8, to: 0.2 },
        scaleX: 1.15,
        duration: this.config.hintButtonRevealMs / 3,
        yoyo: true,
        repeat: 2,
        onComplete: () => arc.destroy(),
      });
    }
  }
}
