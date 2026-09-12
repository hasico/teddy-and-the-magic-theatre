import Phaser from 'phaser';
import { ACT1_SCENE_KEY } from './Act1LilacGarden';

export class Preload extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    // The only file assets of the slice: the two character sprites prepared
    // from the artbook sheets (tech-spec Decision 9). BASE_URL keeps the
    // paths working under the GitHub Pages base path (Decision 6).
    const base = import.meta.env.BASE_URL;
    this.load.image('teddy', `${base}assets/teddy.png`);
    this.load.image('ogonek', `${base}assets/ogonek.png`);
  }

  create(): void {
    this.scene.start(ACT1_SCENE_KEY);
  }
}
