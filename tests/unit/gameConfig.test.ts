import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH, gameConfig } from '../../src/config/gameConfig';

describe('gameConfig', () => {
  it('defines a valid render surface size', () => {
    expect(GAME_WIDTH).toBeGreaterThan(0);
    expect(GAME_HEIGHT).toBeGreaterThan(0);
  });

  it('registers the Boot and Preload scenes', () => {
    expect(Array.isArray(gameConfig.scene)).toBe(true);
    expect(gameConfig.scene).toHaveLength(2);
  });
});
