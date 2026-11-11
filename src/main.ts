import Phaser from 'phaser';
import { HEIGHT, WIDTH } from './config';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';

async function loadFonts(): Promise<void> {
  // Textures are drawn with canvas text at boot, so the web fonts must be ready first.
  const load = Promise.all([
    document.fonts.load('16px "Share Tech Mono"'),
    document.fonts.load('900 32px Orbitron'),
  ]);
  const timeout = new Promise((resolve) => setTimeout(resolve, 2500));
  await Promise.race([load, timeout]).catch(() => undefined);
}

await loadFonts();

new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#05010f',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 2 },
  scene: [BootScene, GameScene],
});
