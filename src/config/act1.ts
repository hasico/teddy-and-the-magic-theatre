// Act I "Lilac Garden" data-driven config: props in storyboard dispense order,
// static reactive environment, both staging outcomes, and every numeric
// constant fixed by the tech-spec decisions. Coordinates are hand-authored
// hardcode in the 1280x720 design space (user-spec "Как должно работать" #2).
import type { ActConfig } from '../types/placement';

// Act palette (docs/act-01-lilac-garden.md §2): night blue, deep purple,
// muted lilac, dark green, burgundy, old wood, limited gold.
const PALETTE = {
  nightBlue: 0x1a1a2e,
  deepPurple: 0x3d2b56,
  mutedLilac: 0x9f8ec4,
  darkGreen: 0x3a5a40,
  sand: 0xb59d78,
  stone: 0x8fa3ad,
  gold: 0xd9a441,
  warmGlow: 0xffd27f,
  oliveWood: 0x55503a,
  scooterYellow: 0xf2c230,
} as const;

export const ACT1_CONFIG: ActConfig = {
  id: 'act1',
  keyPropId: 'tall-bush',
  dependentPropIds: ['stone-cats'],
  props: [
    {
      id: 'path-segments',
      order: 1,
      role: 'common',
      required: true,
      hitboxSize: { width: 220, height: 100 },
      visual: {
        kind: 'placeholder',
        shape: 'rect',
        width: 220,
        height: 70,
        fill: PALETTE.sand,
        label: 'Дорожка',
      },
      points: [{ id: 'path-main', x: 640, y: 585, scheme: 'both', snapRadius: 70 }],
    },
    {
      id: 'fountain',
      order: 2,
      role: 'common',
      required: true,
      visual: {
        kind: 'placeholder',
        shape: 'ellipse',
        width: 180,
        height: 120,
        fill: PALETTE.stone,
        label: 'Фонтан',
      },
      points: [{ id: 'fountain-main', x: 640, y: 400, scheme: 'both', snapRadius: 70 }],
    },
    {
      id: 'low-bush',
      order: 3,
      role: 'common',
      required: true,
      hitboxSize: { width: 160, height: 100 },
      visual: {
        kind: 'placeholder',
        shape: 'ellipse',
        width: 160,
        height: 90,
        fill: PALETTE.darkGreen,
        label: 'Куст',
      },
      points: [{ id: 'low-bush-main', x: 1040, y: 560, scheme: 'both', snapRadius: 70 }],
    },
    {
      id: 'arch',
      order: 4,
      role: 'common',
      required: true,
      visual: {
        kind: 'placeholder',
        shape: 'rect',
        width: 120,
        height: 200,
        fill: PALETTE.mutedLilac,
        label: 'Арка',
      },
      points: [{ id: 'arch-main', x: 640, y: 215, scheme: 'both', snapRadius: 70 }],
    },
    {
      id: 'tall-bush',
      order: 5,
      role: 'key',
      required: true,
      holdToDragMs: 500, // Decision 2: re-drag hold, only after cats are placed
      visual: {
        kind: 'placeholder',
        shape: 'ellipse',
        width: 110,
        height: 160,
        fill: PALETTE.darkGreen,
        label: 'Высокий куст',
      },
      points: [
        { id: 'tall-bush-main', x: 845, y: 265, scheme: 'main', snapRadius: 70 },
        // Secret point: center behind the fountain, never pre-marked (Decision 13/18).
        {
          id: 'tall-bush-hidden',
          x: 640,
          y: 335,
          scheme: 'hidden',
          snapRadius: 70,
          isHidden: true,
        },
      ],
    },
    {
      id: 'lantern-a',
      order: 6,
      role: 'common',
      required: true,
      hitboxSize: { width: 100, height: 150 },
      visual: {
        kind: 'placeholder',
        shape: 'rect',
        width: 46,
        height: 150,
        fill: PALETTE.gold,
        label: 'Фонарь 1',
      },
      points: [{ id: 'lantern-a-main', x: 395, y: 470, scheme: 'both', snapRadius: 70 }],
    },
    {
      id: 'lantern-b',
      order: 7,
      role: 'common',
      required: true,
      hitboxSize: { width: 100, height: 150 },
      visual: {
        kind: 'placeholder',
        shape: 'rect',
        width: 46,
        height: 150,
        fill: PALETTE.gold,
        label: 'Фонарь 2',
      },
      points: [{ id: 'lantern-b-main', x: 895, y: 400, scheme: 'both', snapRadius: 70 }],
    },
    {
      id: 'stone-cats',
      order: 8,
      role: 'dependent',
      required: true,
      hitboxSize: { width: 150, height: 100 },
      visual: {
        kind: 'placeholder',
        shape: 'rect',
        width: 150,
        height: 90,
        fill: PALETTE.stone,
        label: 'Коты',
      },
      points: [
        { id: 'cats-main', x: 480, y: 500, scheme: 'main', snapRadius: 70 },
        { id: 'cats-hidden', x: 735, y: 415, scheme: 'hidden', snapRadius: 70 },
      ],
    },
  ],
  environment: [
    {
      id: 'bench',
      x: 1060,
      y: 520,
      visual: {
        kind: 'placeholder',
        shape: 'rect',
        width: 200,
        height: 64,
        fill: PALETTE.oliveWood,
        label: 'Лавочка',
      },
      reactions: {
        main: { swingRotationDeg: 0, swingCycleMs: 0 },
        hidden: { swingRotationDeg: 0, swingCycleMs: 0 },
      },
    },
    {
      id: 'swing',
      x: 170,
      y: 245,
      visual: {
        kind: 'placeholder',
        shape: 'rect',
        width: 120,
        height: 150,
        fill: PALETTE.oliveWood,
        label: 'Качеля-гнездо',
      },
      reactions: {
        // Decision 27: main = barely noticeable ±2°/600ms, hidden = stronger ±6°/700ms.
        main: { swingRotationDeg: 2, swingCycleMs: 600 },
        hidden: { swingRotationDeg: 6, swingCycleMs: 700 },
      },
    },
    {
      id: 'scooter',
      x: 1190,
      y: 545,
      visual: {
        kind: 'placeholder',
        shape: 'rect',
        width: 100,
        height: 46,
        fill: PALETTE.scooterYellow,
        label: 'Самокат',
      },
      reactions: {
        main: { swingRotationDeg: 0, swingCycleMs: 0 },
        hidden: {
          swingRotationDeg: 0,
          swingCycleMs: 0,
          scooter: { headlightMs: 1000, shiftPx: 70, shiftMs: 400 },
        },
      },
    },
  ],
  outcomes: {
    main: {
      scheme: 'main',
      title: 'Сад просыпается',
      durationMs: 5600,
      beats: [
        { atMs: 0, description: 'Фонари включаются один за другим' },
        { atMs: 800, description: 'Свет проходит по дорожке к фонтану' },
        { atMs: 1600, description: 'Сирень раскрывается' },
        { atMs: 2400, description: 'Фонтан начинает работать' },
        { atMs: 3200, description: 'В глубине арки появляется золотое свечение' },
        { atMs: 4000, description: 'Мишка делает несколько шагов вперёд' },
        { atMs: 4800, description: 'Красная ленточка слабо светится' },
      ],
    },
    hidden: {
      scheme: 'hidden',
      title: 'Куст получил главную роль',
      durationMs: 4300,
      // POV freeze-frame is cut from this slice (user-spec "Ограничения").
      beats: [
        { atMs: 0, description: 'Фонари поворачиваются к кусту как софиты' },
        { atMs: 700, description: 'Куст расправляет ветки перед поклоном' },
        { atMs: 1400, description: 'Каменные коты оживают на бортике фонтана' },
        { atMs: 2100, description: 'Фонтан брызгает в стороны' },
        { atMs: 2800, description: 'Мишка и Огонёк замирают' },
        { atMs: 3500, description: 'Куст осыпает сцену лепестками' },
      ],
    },
  },
  autoHintDelayMs: 12000, // Decision 20
  hintButtonRevealMs: 1250, // Decision 20
  hiddenSignalDelayMs: 400, // Decision 18
  hiddenMagnetDelayMs: 700, // Decision 18
  settleTweenMs: 150, // Decision 19
  catsReturnTweenMs: 300, // Decision 19
};
