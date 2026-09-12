// Act I "Lilac Garden" — thin orchestrator (tech-spec Task 6/11): owns the
// placements state, the InputGate and the three controllers, draws the static
// environment + characters, dispenses props from the theatre box one at a
// time in storyboard order, reacts to the key prop's re-drag, and wires the
// orientation guard into the gate. Every placement decision is delegated to
// the pure helpers in src/logic/placement.ts.
import Phaser from 'phaser';
import { ACT1_CONFIG } from '../config/act1';
import type { ActConfig, Placements } from '../types/placement';
import {
  isSceneReady,
  nextHintTarget,
  resetForReposition,
  resolveScheme,
} from '../logic/placement';
import { InputGate } from '../logic/inputGate';
import { createSfx } from '../audio/sfx';
import type { Sfx } from '../audio/sfx';
import { watchOrientation } from '../ui/orientationGuard';
import { PropDragController } from './act1/PropDragController';
import { HintController } from './act1/HintController';
import { OutcomeController } from './act1/OutcomeController';
import { createEnvironmentVisual, createPropBox } from './act1/visuals';

export const ACT1_SCENE_KEY = 'Act1LilacGarden';

const OGONEK_HOME = { x: 340, y: 300 };
const TEDDY_X = 255;
const TEDDY_DISPLAY_HEIGHT = 240;
const OGONEK_DISPLAY_HEIGHT = 110;

export class Act1LilacGarden extends Phaser.Scene {
  private readonly config: ActConfig = ACT1_CONFIG;
  private placements: Placements = {};
  private gate = new InputGate();
  private sfx!: Sfx;
  private drag!: PropDragController;
  private hint!: HintController;
  private outcome!: OutcomeController;
  private teddy!: Phaser.GameObjects.Sprite;
  private ogonek!: Phaser.GameObjects.Sprite;
  private ogonekBob: Phaser.Tweens.Tween | null = null;
  private readonly envGos = new Map<string, Phaser.GameObjects.Container>();
  private stopOrientation: (() => void) | null = null;
  private orientationLocked = false;

  constructor() {
    super(ACT1_SCENE_KEY);
  }

  create(): void {
    this.placements = {};
    this.gate = new InputGate();
    this.sfx = createSfx(() => {
      const manager = this.sound;
      return manager instanceof Phaser.Sound.WebAudioSoundManager ? manager.context : null;
    });

    for (const def of this.config.environment) {
      this.envGos.set(def.id, createEnvironmentVisual(this, def));
    }
    createPropBox(this);

    // Teddy enters from the left; Ogonyok is a warm blob of light.
    this.teddy = this.add.sprite(-120, 530, 'teddy').setDepth(6);
    this.teddy.setScale(TEDDY_DISPLAY_HEIGHT / this.teddy.height);
    this.tweens.add({ targets: this.teddy, x: TEDDY_X, duration: 1200, ease: 'Sine.easeOut' });

    this.ogonek = this.add.sprite(OGONEK_HOME.x, OGONEK_HOME.y, 'ogonek').setDepth(6);
    this.ogonek.setScale(OGONEK_DISPLAY_HEIGHT / this.ogonek.height);
    this.startOgonekBob();

    this.drag = new PropDragController(this, this.config, this.gate, this.sfx, {
      onPlaced: (propId, pointId) => this.onPropPlaced(propId, pointId),
      onKeyPropLiftedFromStage: () => this.onKeyPropLifted(),
      getScheme: () => resolveScheme(this.config, this.placements),
      areDependentsPlaced: () =>
        this.config.dependentPropIds.every((id) => Boolean(this.placements[id])),
      reactToHiddenSignal: () => this.reactToHiddenSignal(),
    });
    this.hint = new HintController(this, this.config, {
      gate: this.gate,
      sfx: this.sfx,
      getCurrentProp: () => this.drag.currentPropDef,
      getCurrentPropGo: () => this.drag.currentPropGo,
      getHintPoint: () => nextHintTarget(this.config, this.placements),
      isPropHeld: () => this.drag.isPropHeld,
      getOgonek: () => this.ogonek,
      getOgonekHome: () => OGONEK_HOME,
      onOgonekSettled: () => this.startOgonekBob(),
    });
    this.outcome = new OutcomeController(this, this.config, {
      gate: this.gate,
      sfx: this.sfx,
      getScheme: () => resolveScheme(this.config, this.placements),
      getPropGo: (propId) => this.drag.getPropGo(propId),
      getEnvGo: (envId) => this.envGos.get(envId),
      getTeddy: () => this.teddy,
      getOgonek: () => this.ogonek,
      onOgonekSettled: () => this.startOgonekBob(),
      onReposition: () => this.repositionFromChoice(),
    });

    // Scene-level half of the orientation guard: lock the gate while the DOM
    // overlay covers the screen, cancel any in-flight drag like a refresh would.
    this.stopOrientation = watchOrientation({
      onPortrait: () => {
        this.gate.lock();
        this.orientationLocked = true;
        this.drag.cancelActiveDrag();
      },
      onLandscape: () => {
        if (this.orientationLocked) {
          this.gate.unlock();
          this.orientationLocked = false;
        }
      },
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.dispenseNext();
  }

  update(_time: number, delta: number): void {
    this.drag.update(delta);
    this.hint.update(delta);
  }

  // --- placement flow -------------------------------------------------------

  private dispenseNext(): void {
    const next = this.config.props.find((prop) => prop.required && !this.placements[prop.id]);
    if (next) this.drag.dispense(next);
    else if (isSceneReady(this.config, this.placements)) this.outcome.lightConsole();
  }

  private onPropPlaced(propId: string, pointId: string): void {
    this.placements[propId] = { pointId };
    if (isSceneReady(this.config, this.placements)) this.outcome.lightConsole();
    else this.dispenseNext();
  }

  /** The placed bush was lifted after the hold: cats fly back, scheme reopens. */
  private onKeyPropLifted(): void {
    this.gate.lock(); // Decision 28: cats-return tween blocks input.
    this.placements = resetForReposition(
      this.placements,
      this.config.keyPropId,
      this.config.dependentPropIds,
    );
    this.outcome.dimConsole();
    const cats = this.getCatsProp();
    if (cats) {
      this.drag.returnPropToBox(cats, () => this.gate.unlock());
    } else {
      this.gate.unlock();
    }
  }

  /** «Переставить»: common props stay, the bush and the cats go back to the box. */
  private repositionFromChoice(): void {
    this.gate.lock();
    this.placements = resetForReposition(
      this.placements,
      this.config.keyPropId,
      this.config.dependentPropIds,
    );
    this.outcome.dimConsole();
    const props = [this.getKeyProp(), this.getCatsProp()].filter(
      (prop): prop is NonNullable<typeof prop> => prop !== null,
    );
    let pending = props.length;
    if (pending === 0) {
      this.gate.unlock();
      this.dispenseNext();
      return;
    }
    for (const prop of props) {
      this.drag.returnPropToBox(prop, () => {
        pending -= 1;
        if (pending === 0) {
          this.gate.unlock();
          this.dispenseNext(); // the bush is first in storyboard order again
        }
      });
    }
  }

  private getKeyProp(): (typeof this.config.props)[number] | null {
    return this.config.props.find((prop) => prop.id === this.config.keyPropId) ?? null;
  }

  private getCatsProp(): (typeof this.config.props)[number] | null {
    const id = this.config.dependentPropIds[0];
    return id ? (this.config.props.find((prop) => prop.id === id) ?? null) : null;
  }

  // --- characters -------------------------------------------------------------

  private startOgonekBob(): void {
    this.ogonekBob?.remove();
    this.ogonek.setPosition(OGONEK_HOME.x, OGONEK_HOME.y);
    this.ogonekBob = this.tweens.add({
      targets: this.ogonek,
      y: OGONEK_HOME.y - 14,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Ogonyok's one-second reaction to the hidden-point signal (scale-only, keeps the bob alive). */
  private reactToHiddenSignal(): void {
    const base = this.ogonek.scaleX;
    this.tweens.add({
      targets: this.ogonek,
      scale: base * 1.35,
      duration: 160,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  private cleanup(): void {
    this.stopOrientation?.();
    this.stopOrientation = null;
    if (this.orientationLocked) {
      this.gate.unlock();
      this.orientationLocked = false;
    }
    this.drag.destroy();
    this.hint.destroy();
    this.outcome.destroy();
    this.ogonekBob?.remove();
    this.ogonekBob = null;
  }
}
