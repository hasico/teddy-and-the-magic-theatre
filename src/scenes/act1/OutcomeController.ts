// Stage console + outcome playback + continue/reposition screens (tech-spec
// Task 10). The console lights up when the scene is ready (isSceneReady);
// a click locks the InputGate, plays the chosen scheme's caption beats with
// placeholder tweens (everything readable with sound off via captions), runs
// the numeric environment-reaction contract (Decision 27) and then shows the
// «продолжить»/«переставить» choice.
import Phaser from 'phaser';
import type { ActConfig, OutcomeDef, SchemeId } from '../../types/placement';
import type { InputGate } from '../../logic/inputGate';
import { saveAct1Result } from '../../save';
import type { Sfx } from '../../audio/sfx';
import { createGlow, spawnCrumbs, spawnPetal } from './visuals';

export interface OutcomeDeps {
  gate: InputGate;
  sfx: Sfx;
  getScheme(): SchemeId | null;
  getPropGo(propId: string): Phaser.GameObjects.Container | undefined;
  getEnvGo(envId: string): Phaser.GameObjects.Container | undefined;
  getTeddy(): Phaser.GameObjects.Sprite;
  getOgonek(): Phaser.GameObjects.Sprite;
  /** The freeze beat killed Ogonyok's idle bob — restart it at home. */
  onOgonekSettled(): void;
  /** «Переставить» was chosen — return key prop + cats to the box, keep common props. */
  onReposition(): void;
}

export class OutcomeController {
  private readonly scene: Phaser.Scene;
  private readonly config: ActConfig;
  private readonly deps: OutcomeDeps;

  private readonly consoleGroup: Phaser.GameObjects.Container;
  private consoleReady = false;
  private caption: Phaser.GameObjects.Text;
  /** Long-lived beat-effect objects (glows) — destroyed when playback ends. */
  private readonly effectObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, config: ActConfig, deps: OutcomeDeps) {
    this.scene = scene;
    this.config = config;
    this.deps = deps;
    this.consoleGroup = this.createConsole();
    this.caption = scene.add
      .text(640, 688, '', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#f0eaff',
        align: 'center',
        stroke: '#1a1a2e',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(12)
      .setVisible(false);
  }

  /** All required props are placed — light the console and make it clickable. */
  lightConsole(): void {
    this.consoleReady = true;
    this.consoleGroup.setAlpha(1);
    this.consoleGroup.setInteractive();
    this.scene.tweens.add({
      targets: this.consoleGroup,
      scale: { from: 1, to: 1.06 },
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  dimConsole(): void {
    this.consoleReady = false;
    this.scene.tweens.killTweensOf(this.consoleGroup);
    this.consoleGroup.setScale(1);
    this.consoleGroup.setAlpha(0.45);
    this.consoleGroup.disableInteractive();
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.consoleGroup);
    this.consoleGroup.destroy();
    this.caption.destroy();
    this.destroyEffectObjects();
  }

  // --- console ------------------------------------------------------------

  private createConsole(): Phaser.GameObjects.Container {
    const x = 1140;
    const y = 655;
    const g = this.scene.add.graphics();
    g.fillStyle(0x3d2b56, 0.95);
    g.lineStyle(3, 0x55503a, 1);
    g.fillRoundedRect(-110, -36, 220, 72, 10);
    g.strokeRoundedRect(-110, -36, 220, 72, 10);

    // Three sockets: light (rays), water (waves), moon (crescent).
    this.drawSymbol(g, -64, 0, 'light');
    this.drawSymbol(g, 0, 0, 'water');
    this.drawSymbol(g, 64, 0, 'moon');

    const container = this.scene.add.container(x, y, [g]).setDepth(10).setAlpha(0.45);
    container.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-110, -36, 220, 72),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    container.on(Phaser.Input.Events.POINTER_DOWN, () => this.onConsolePressed());
    return container;
  }

  private drawSymbol(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    kind: 'light' | 'water' | 'moon',
  ): void {
    const gold = 0xd9a441;
    g.lineStyle(3, gold, 1);
    g.fillStyle(gold, 1);
    g.strokeCircle(x, y, 20);
    if (kind === 'light') {
      g.fillCircle(x, y, 7);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.lineBetween(
          x + Math.cos(a) * 10,
          y + Math.sin(a) * 10,
          x + Math.cos(a) * 16,
          y + Math.sin(a) * 16,
        );
      }
    } else if (kind === 'water') {
      for (let row = 0; row < 2; row++) {
        const yy = y - 4 + row * 8;
        g.beginPath();
        g.moveTo(x - 12, yy);
        g.lineTo(x - 4, yy - 5);
        g.lineTo(x + 4, yy + 5);
        g.lineTo(x + 12, yy);
        g.strokePath();
      }
    } else {
      g.fillCircle(x - 2, y, 11);
      g.fillStyle(0x3d2b56, 1); // cut out a crescent with the socket colour
      g.fillCircle(x + 3, y - 3, 10);
    }
  }

  private onConsolePressed(): void {
    if (!this.consoleReady || this.deps.gate.isLocked) return;
    const scheme = this.deps.getScheme();
    if (!scheme) return;
    this.dimConsole();
    this.playOutcome(scheme);
  }

  // --- playback ------------------------------------------------------------

  private playOutcome(scheme: SchemeId): void {
    const outcome = this.config.outcomes[scheme];
    this.deps.gate.lock(); // Decision 28: playback blocks input.

    this.caption.setVisible(true).setText('');
    const events: Phaser.Time.TimerEvent[] = [];
    for (const beat of outcome.beats) {
      events.push(
        this.scene.time.delayedCall(beat.atMs, () => {
          this.caption.setText(beat.description);
          this.playBeatEffect(scheme, beat.atMs, outcome);
        }),
      );
    }

    this.startReactions(scheme);

    this.scene.time.delayedCall(outcome.durationMs, () => {
      for (const event of events) event.remove(false);
      this.stopReactions();
      this.caption.setVisible(false).setText('');
      this.deps.gate.unlock(); // last beat done
      this.showChoiceScreen(outcome);
    });
  }

  /** Placeholder beat effects — captions carry the story, tweens add life. */
  private playBeatEffect(scheme: SchemeId, atMs: number, outcome: OutcomeDef): void {
    const beatIndex = outcome.beats.findIndex((b) => b.atMs === atMs);
    const lanternA = this.deps.getPropGo('lantern-a');
    const lanternB = this.deps.getPropGo('lantern-b');
    const pulse = (go: Phaser.GameObjects.Container | undefined, scale = 1.1) => {
      if (!go) return;
      this.scene.tweens.add({
        targets: go,
        scale,
        duration: 350,
        yoyo: true,
        ease: 'Sine.easeInOut',
      });
    };

    if (scheme === 'main') {
      if (beatIndex === 0) {
        this.switchLanternGlow(lanternA, 250);
        this.scene.time.delayedCall(300, () => this.switchLanternGlow(lanternB, 250));
      } else if (beatIndex === 1) {
        this.travelingLight(640, 585, 640, 400);
      } else if (beatIndex === 2) {
        pulse(this.deps.getPropGo('low-bush'), 1.12);
        pulse(this.deps.getPropGo('tall-bush'), 1.08);
        const bush = this.deps.getPropGo('tall-bush');
        if (bush) spawnPetal(this.scene, bush.x, bush.y - 60, bush.x - 30, bush.y + 20, 0x9f8ec4);
      } else if (beatIndex === 3) {
        const fountain = this.deps.getPropGo('fountain');
        if (fountain) {
          this.scene.tweens.add({
            targets: fountain,
            scaleY: 1.08,
            duration: 300,
            yoyo: true,
            repeat: 2,
            ease: 'Sine.easeInOut',
          });
          spawnCrumbs(this.scene, fountain.x, fountain.y - 40, 0x8fa3ad);
        }
      } else if (beatIndex === 4) {
        const arch = this.deps.getPropGo('arch');
        if (arch) {
          const glow = createGlow(this.scene, arch.x, arch.y, 140, 200);
          this.effectObjects.push(glow);
          this.scene.tweens.add({ targets: glow, fillAlpha: 0.35, duration: 600 });
        }
      } else if (beatIndex === 5) {
        const teddy = this.deps.getTeddy();
        this.scene.tweens.add({
          targets: teddy,
          x: teddy.x + 40,
          duration: 800,
          yoyo: true,
          ease: 'Sine.easeInOut',
        });
      } else if (beatIndex === 6) {
        const teddy = this.deps.getTeddy();
        this.scene.tweens.add({
          targets: teddy,
          tint: 0xffd9a0,
          duration: 400,
          yoyo: true,
        });
      }
    } else {
      // hidden scheme
      const bush = this.deps.getPropGo('tall-bush');
      if (beatIndex === 0) {
        for (const lantern of [lanternA, lanternB]) {
          if (!lantern || !bush) continue;
          const dir = Math.sign(bush.x - lantern.x);
          this.scene.tweens.add({
            targets: lantern,
            angle: dir * 8,
            duration: 500,
            ease: 'Sine.easeOut',
          });
          this.switchLanternGlow(lantern, 400);
        }
      } else if (beatIndex === 1 && bush) {
        this.scene.tweens.add({
          targets: bush,
          scaleX: 1.14,
          duration: 450,
          yoyo: true,
          ease: 'Sine.easeInOut',
        });
      } else if (beatIndex === 2) {
        const cats = this.deps.getPropGo('stone-cats');
        if (cats) {
          this.scene.tweens.add({
            targets: cats,
            angle: { from: -5, to: 5 },
            duration: 220,
            yoyo: true,
            repeat: 3,
          });
        }
      } else if (beatIndex === 3) {
        const fountain = this.deps.getPropGo('fountain');
        if (fountain) {
          for (let i = 0; i < 6; i++) {
            this.scene.time.delayedCall(i * 90, () =>
              spawnCrumbs(this.scene, fountain.x + (i - 3) * 15, fountain.y - 30, 0x8fa3ad),
            );
          }
        }
      } else if (beatIndex === 4) {
        const ogonek = this.deps.getOgonek();
        this.scene.tweens.killTweensOf(ogonek);
        const teddy = this.deps.getTeddy();
        this.scene.tweens.add({
          targets: [teddy, ogonek],
          alpha: 0.75,
          duration: 300,
          yoyo: true,
        });
      } else if (beatIndex === 5) {
        for (let i = 0; i < 8; i++) {
          const x = 200 + Math.random() * 880;
          this.scene.time.delayedCall(i * 160, () =>
            spawnPetal(this.scene, x, 80, x + 40, 360, 0x9f8ec4),
          );
        }
      }
    }
  }

  private switchLanternGlow(
    lantern: Phaser.GameObjects.Container | undefined,
    durationMs: number,
  ): void {
    if (!lantern) return;
    const glow = createGlow(this.scene, lantern.x, lantern.y - 30, 70, 110);
    this.effectObjects.push(glow);
    this.scene.tweens.add({ targets: glow, fillAlpha: 0.4, duration: durationMs });
  }

  /** A bright dot travelling between two points (the "light walks the path" beat). */
  private travelingLight(fromX: number, fromY: number, toX: number, toY: number): void {
    const dot = this.scene.add.circle(fromX, fromY, 8, 0xffd27f).setDepth(9);
    this.scene.tweens.add({
      targets: dot,
      x: toX,
      y: toY,
      duration: 700,
      ease: 'Sine.easeInOut',
      onComplete: () => dot.destroy(),
    });
  }

  // --- environment reactions (Decision 27 numeric contract) ----------------

  private startReactions(scheme: SchemeId): void {
    const swing = this.deps.getEnvGo('swing');
    if (swing) {
      const reaction = this.config.environment.find((e) => e.id === 'swing')?.reactions[scheme];
      if (reaction && reaction.swingRotationDeg > 0) {
        this.scene.tweens.add({
          targets: swing,
          angle: { from: -reaction.swingRotationDeg, to: reaction.swingRotationDeg },
          duration: reaction.swingCycleMs / 2,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }

    const scooter = this.deps.getEnvGo('scooter');
    const scooterReaction = this.config.environment.find((e) => e.id === 'scooter')?.reactions[
      scheme
    ].scooter;
    if (scooter && scooterReaction) {
      const headlight = this.scene.add
        .circle(scooter.x - 50, scooter.y, 10, 0xffd27f, 0)
        .setDepth(2);
      this.scene.tweens.add({
        targets: headlight,
        fillAlpha: 0.9,
        duration: 200,
        yoyo: true,
        repeat: Math.floor(scooterReaction.headlightMs / 400),
      });
      this.deps.sfx.playScooterBeep();
      // A short noticeable nudge toward the bench, then back.
      const bench = this.config.environment.find((e) => e.id === 'bench');
      const dir = bench ? Math.sign(bench.x - scooter.x) : -1;
      this.scene.tweens.add({
        targets: scooter,
        x: scooter.x + dir * scooterReaction.shiftPx,
        duration: scooterReaction.shiftMs,
        yoyo: true,
        ease: 'Quad.easeInOut',
        hold: 300,
        onComplete: () => headlight.destroy(),
      });
    }
  }

  private stopReactions(): void {
    for (const env of this.config.environment) {
      const go = this.deps.getEnvGo(env.id);
      if (go) {
        this.scene.tweens.killTweensOf(go);
        go.setAngle(0);
        go.setX(env.x); // undo the scooter shift
      }
    }
    // Beat tweens touched placed props too (lantern angles, cat wiggle, bush
    // scale) — reset them so a replay via «Переставить» starts from a clean stage.
    for (const prop of this.config.props) {
      const go = this.deps.getPropGo(prop.id);
      if (go) {
        this.scene.tweens.killTweensOf(go);
        go.setAngle(0);
        go.setScale(1);
      }
    }
    this.destroyEffectObjects();
    this.deps.onOgonekSettled();
  }

  private destroyEffectObjects(): void {
    for (const object of this.effectObjects) object.destroy();
    this.effectObjects.length = 0;
  }

  // --- choice / end screens -------------------------------------------------

  private showChoiceScreen(outcome: OutcomeDef): void {
    // Decision 28 #4: gameplay input stays blocked for the whole lifetime of
    // this screen — the screen's own buttons don't consult the gate, but the
    // placed bush behind the translucent overlay must not be liftable.
    // The lock is released by «Переставить» (which re-locks for its own
    // transition); «Продолжить» keeps it for the end screen until restart.
    this.deps.gate.lock();
    const screenObjects: Phaser.GameObjects.GameObject[] = [
      this.scene.add.rectangle(640, 360, 1280, 720, 0x1a1a2e, 0.75).setDepth(20),
    ];
    const panel = this.scene.add.container(640, 360).setDepth(21);
    screenObjects.push(panel);
    const g = this.scene.add.graphics();
    g.fillStyle(0x3d2b56, 1);
    g.lineStyle(3, 0xd9a441, 1);
    g.fillRoundedRect(-280, -150, 560, 300, 16);
    g.strokeRoundedRect(-280, -150, 560, 300, 16);
    const title = this.scene.add
      .text(0, -100, outcome.title, {
        fontFamily: 'sans-serif',
        fontSize: '30px',
        color: '#f0eaff',
      })
      .setOrigin(0.5);
    const stub = this.scene.add
      .text(0, -40, 'Воспоминание Мишки появится\nв следующей версии игры', {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#d9c9ef',
        align: 'center',
      })
      .setOrigin(0.5);
    panel.add([g, title, stub]);

    const makeButton = (x: number, label: string, onClick: () => void): void => {
      const bg = this.scene.add.graphics();
      bg.fillStyle(0x55503a, 1);
      bg.lineStyle(2, 0xd9a441, 0.8);
      bg.fillRoundedRect(-110, -30, 220, 60, 10);
      bg.strokeRoundedRect(-110, -30, 220, 60, 10);
      const text = this.scene.add
        .text(0, 0, label, { fontFamily: 'sans-serif', fontSize: '24px', color: '#f0eaff' })
        .setOrigin(0.5);
      const button = this.scene.add
        // World coordinates: the panel sits at (640, 360), so its button row
        // is (640 ± 130, 420). A bare (x, 60) would pin the buttons to the
        // top-left corner — «Продолжить» fully off-screen.
        .container(640 + x, 420, [bg, text])
        .setDepth(22)
        .setInteractive({
          hitArea: new Phaser.Geom.Rectangle(-110, -30, 220, 60),
          hitAreaCallback: Phaser.Geom.Rectangle.Contains,
          useHandCursor: true,
        });
      button.on(Phaser.Input.Events.POINTER_DOWN, onClick);
      screenObjects.push(button);
    };

    const closeScreen = (): void => {
      for (const object of screenObjects) object.destroy();
    };

    makeButton(-130, 'Продолжить', () => {
      saveAct1Result(outcome.scheme);
      closeScreen();
      this.showEndScreen();
    });
    makeButton(130, 'Переставить', () => {
      closeScreen();
      this.deps.gate.unlock(); // hand control back before the reposition transition
      this.deps.onReposition();
    });
  }

  private showEndScreen(): void {
    this.scene.add.rectangle(640, 360, 1280, 720, 0x1a1a2e, 0.9).setDepth(20);
    this.scene.add
      .text(640, 300, 'Акт I пройден!', {
        fontFamily: 'sans-serif',
        fontSize: '42px',
        color: '#f0eaff',
      })
      .setOrigin(0.5)
      .setDepth(21);
    const g = this.scene.add.graphics().setDepth(21);
    g.fillStyle(0x55503a, 1);
    g.lineStyle(2, 0xd9a441, 0.8);
    g.fillRoundedRect(640 - 130, 380, 260, 60, 10);
    g.strokeRoundedRect(640 - 130, 380, 260, 60, 10);
    this.scene.add
      .text(640, 410, 'Сыграть ещё раз', {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: '#f0eaff',
      })
      .setOrigin(0.5)
      .setDepth(22)
      .setInteractive({
        // Match the drawn 260x60 button, not the text strip inside it.
        hitArea: new Phaser.Geom.Rectangle(-130, -30, 260, 60),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      })
      .on(Phaser.Input.Events.POINTER_DOWN, () => this.scene.scene.restart());
  }
}
