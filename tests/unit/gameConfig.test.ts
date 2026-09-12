import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH, gameConfig } from '../../src/config/gameConfig';
import { Boot } from '../../src/scenes/Boot';
import { Preload } from '../../src/scenes/Preload';
import { Act1LilacGarden } from '../../src/scenes/Act1LilacGarden';

describe('gameConfig', () => {
  it('defines a valid render surface size', () => {
    expect(GAME_WIDTH).toBeGreaterThan(0);
    expect(GAME_HEIGHT).toBeGreaterThan(0);
  });

  it('pins the 1280x720 design space the 44-48 CSS px touch-target math depends on', () => {
    // Decision 16: hitboxes >=100 design px stay >=~47 CSS px at the minimal
    // 600x360 viewport only while the design space is 1280x720.
    expect(GAME_WIDTH).toBe(1280);
    expect(GAME_HEIGHT).toBe(720);
  });

  it('registers the Boot, Preload and Act1 scenes in start order', () => {
    expect(Array.isArray(gameConfig.scene)).toBe(true);
    expect(gameConfig.scene).toEqual([Boot, Preload, Act1LilacGarden]);
  });
});
