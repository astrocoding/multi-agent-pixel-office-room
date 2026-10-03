import * as Phaser from 'phaser';
import { PreloadScene } from './scenes/PreloadScene.js';
import { OfficeScene } from './scenes/OfficeScene.js';
import { OfficeLayout } from '@agent-office/game-core';

export const createGameConfig = (parent: HTMLElement): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  parent,
  width: OfficeLayout.WIDTH,
  height: OfficeLayout.HEIGHT,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#0F172A',
  input: {
    keyboard: {
      target: window,
      capture: [], // Empty array = NEVER capture or preventDefault() keys globally!
    },
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [PreloadScene, OfficeScene],
});
