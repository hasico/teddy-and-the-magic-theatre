// Runtime-drawn placeholder visuals (user-spec "Ограничения"): props and
// environment are Phaser shapes with labels, not image assets, so the whole
// slice ships with only two sprite files and final art later replaces these
// draws without touching game logic. Draggable props and static environment
// are deliberately styled differently (gold rim vs. dark muted outline) so a
// child can tell "this comes to me" from "this is scenery" at a glance.
import Phaser from 'phaser';
import type { EnvironmentDef, PropDef } from '../../types/placement';

/** Where the theatre box sits and where every dispensed/missed prop returns. */
export const BOX_POSITION = { x: 150, y: 620 } as const;

/** Perceived luminance decides the label colour so text is readable on any fill. */
function isLightFill(fill: number): boolean {
  const r = (fill >> 16) & 0xff;
  const g = (fill >> 8) & 0xff;
  const b = fill & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b > 140;
}

/** Draggable prop placeholder: act-palette fill, gold rim, label, explicit hitbox. */
export function createPropVisual(scene: Phaser.Scene, prop: PropDef): Phaser.GameObjects.Container {
  const visual = prop.visual;
  if (visual.kind !== 'placeholder') {
    throw new Error(`sprite prop visuals are not supported in this slice: ${prop.id}`);
  }
  const g = scene.add.graphics();
  g.fillStyle(visual.fill, 1);
  g.lineStyle(3, 0xd9a441, 0.9);
  if (visual.shape === 'ellipse') {
    g.fillEllipse(0, 0, visual.width, visual.height);
    g.strokeEllipse(0, 0, visual.width, visual.height);
  } else {
    g.fillRect(-visual.width / 2, -visual.height / 2, visual.width, visual.height);
    g.strokeRect(-visual.width / 2, -visual.height / 2, visual.width, visual.height);
  }
  const label = scene.add
    .text(0, 0, visual.label, {
      fontFamily: 'sans-serif',
      fontSize: '18px',
      color: isLightFill(visual.fill) ? '#1a1a2e' : '#f0eaff',
    })
    .setOrigin(0.5);
  const container = scene.add.container(0, 0, [g, label]).setDepth(5);

  // Decision 16: the grab zone is the explicit hitbox, never smaller than the
  // shrunken visual of wide/flat props like the path.
  const hit = prop.hitboxSize ?? { width: visual.width, height: visual.height };
  container.setInteractive({
    hitArea: new Phaser.Geom.Rectangle(-hit.width / 2, -hit.height / 2, hit.width, hit.height),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  });
  return container;
}

/** Static environment placeholder: muted fill, thin dark rim, no interaction. */
export function createEnvironmentVisual(
  scene: Phaser.Scene,
  def: EnvironmentDef,
): Phaser.GameObjects.Container {
  const visual = def.visual;
  if (visual.kind !== 'placeholder') {
    throw new Error(`sprite environment visuals are not supported in this slice: ${def.id}`);
  }
  const g = scene.add.graphics();
  g.fillStyle(visual.fill, 0.85);
  g.lineStyle(2, 0x1a1a2e, 0.5);
  if (visual.shape === 'ellipse') {
    g.fillEllipse(0, 0, visual.width, visual.height);
    g.strokeEllipse(0, 0, visual.width, visual.height);
  } else {
    g.fillRect(-visual.width / 2, -visual.height / 2, visual.width, visual.height);
    g.strokeRect(-visual.width / 2, -visual.height / 2, visual.width, visual.height);
  }
  const label = scene.add
    .text(0, 0, visual.label, {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      color: isLightFill(visual.fill) ? '#1a1a2e' : '#d9c9ef',
    })
    .setOrigin(0.5)
    .setAlpha(0.8);
  return scene.add.container(def.x, def.y, [g, label]).setDepth(0);
}

/** Chalk-dashed ground mark for an active drop point: visible before any hint. */
export function drawPointMark(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.lineStyle(3, 0x9f8ec4, 0.55);
  const rx = 62;
  const ry = 22;
  const segments = 12;
  const dashFraction = 0.55;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = a0 + ((Math.PI * 2) / segments) * dashFraction;
    g.beginPath();
    g.moveTo(x + rx * Math.cos(a0), y + ry * Math.sin(a0));
    g.lineTo(x + rx * Math.cos(a1), y + ry * Math.sin(a1));
    g.strokePath();
  }
  g.fillStyle(0xd9c9ef, 0.5);
  g.fillCircle(x, y, 4);
}

/** The theatre prop box: fixed reference point for dispensing and returns. */
export function createPropBox(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  g.fillStyle(0x55503a, 1); // old wood
  g.lineStyle(3, 0x2e2a1e, 1);
  g.fillRoundedRect(-90, -55, 180, 110, 8);
  g.strokeRoundedRect(-90, -55, 180, 110, 8);
  g.lineStyle(2, 0x2e2a1e, 0.8);
  g.strokeRoundedRect(-90, -55, 180, 26, { tl: 8, tr: 8, bl: 0, br: 0 });
  const label = scene.add
    .text(0, 10, 'Ящик', { fontFamily: 'sans-serif', fontSize: '16px', color: '#d9c9ef' })
    .setOrigin(0.5);
  return scene.add.container(BOX_POSITION.x, BOX_POSITION.y, [g, label]).setDepth(4);
}

/** 2-3 crumb/spark pips on a successful landing (user-spec "Как должно работать" #4). */
export function spawnCrumbs(scene: Phaser.Scene, x: number, y: number, colour = 0xd9a441): void {
  for (let i = 0; i < 3; i++) {
    const crumb = scene.add.circle(x, y, 3 + Math.random() * 2, colour).setDepth(8);
    const angle = -Math.PI / 2 + (i - 1) * 0.7;
    scene.tweens.add({
      targets: crumb,
      x: x + Math.cos(angle) * (30 + Math.random() * 20),
      y: y + Math.sin(angle) * (30 + Math.random() * 20),
      alpha: 0,
      duration: 400,
      ease: 'Quad.easeOut',
      onComplete: () => crumb.destroy(),
    });
  }
}

/** A lilac petal placeholder flying from one point to another. */
export function spawnPetal(
  scene: Phaser.Scene,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  colour = 0xb59d78,
): void {
  const petal = scene.add.ellipse(fromX, fromY, 10, 6, colour).setDepth(8);
  scene.tweens.add({
    targets: petal,
    x: toX,
    y: toY,
    alpha: { from: 0.9, to: 0 },
    scale: 0.5,
    duration: 500,
    onComplete: () => petal.destroy(),
  });
}

/** Soft warm glow blob used for lantern light / arch light beats. */
export function createGlow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
): Phaser.GameObjects.Ellipse {
  return scene.add.ellipse(x, y, width, height, 0xffd27f, 0).setDepth(3);
}
