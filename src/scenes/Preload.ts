import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';

export class Preload extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    // Real assets are loaded here once Act scenes are implemented (see docs/act-01-storyboard-playground.md).
  }

  create(): void {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Teddy and the Magic Theatre', {
        fontFamily: 'sans-serif',
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }
}
