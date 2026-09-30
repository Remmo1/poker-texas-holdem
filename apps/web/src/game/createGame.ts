import Phaser from 'phaser';
import { WORLD } from './layout';
import type { RenderModel } from './plan';
import { TableScene } from './TableScene';
import type { SceneCallbacks } from './TableScene';

export interface TableGame {
  update(model: RenderModel, now: () => number): void;
  destroy(): void;
}

/** Boots Phaser inside `parent`. React drives it through `update`; the scene reports clicks via `callbacks`. */
export function createTableGame(parent: HTMLElement, callbacks: SceneCallbacks): TableGame {
  const scene = new TableScene(callbacks);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: WORLD.width,
    height: WORLD.height,
    backgroundColor: '#0b1620',
    scene,
    banner: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  });

  // A model set before the scene finished booting is kept and drawn from create().
  return {
    update(model, now) {
      scene.setModel(model, now);
    },
    destroy() {
      game.destroy(true);
    },
  };
}
