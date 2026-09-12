import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { watchOrientation } from './ui/orientationGuard';

new Phaser.Game(gameConfig);

// The DOM-level half of the orientation guard (the scene-level half locks
// the InputGate): flip phones get a friendly full-screen ask to rotate.
const overlay = document.getElementById('orientation-overlay');
watchOrientation({
  onPortrait: () => overlay?.classList.add('visible'),
  onLandscape: () => overlay?.classList.remove('visible'),
});
