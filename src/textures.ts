import Phaser from 'phaser';
import { CSS, FONT_MONO, HEIGHT, NEON_CSS, RUNNER_STYLE, SIGN_WORDS, WIDTH, pick, randomGlyphs } from './config';
import { FRAME, PALETTES, drawRunner, sheetFrames } from './runner';

/**
 * Every texture in the game is generated here at boot, so the project ships with no image assets.
 */

type Ctx = CanvasRenderingContext2D;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void) {
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) throw new Error(`could not create canvas texture ${key}`);
  draw(tex.context);
  tex.refresh();
  return tex;
}

export function generateTextures(scene: Phaser.Scene): void {
  makeSky(scene);
  makeSkylines(scene);
  makeFog(scene);
  makeRunner(scene);
  makeSmallSprites(scene);
  makeCar(scene);
  makeHolos(scene);
}

// ---------------------------------------------------------------- sky

function makeSky(scene: Phaser.Scene) {
  canvasTexture(scene, 'sky', WIDTH, HEIGHT, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#04010c');
    g.addColorStop(0.35, '#140630');
    g.addColorStop(0.62, '#3d0b4f');
    g.addColorStop(0.8, '#8a1457');
    g.addColorStop(1, '#2a0838');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Smog clouds lit from below by the city.
    for (let i = 0; i < 14; i++) {
      const x = rand(-100, WIDTH + 100);
      const y = rand(40, HEIGHT * 0.6);
      const r = rand(120, 320);
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      const tint = Math.random() < 0.5 ? '255,42,109' : '120,40,200';
      rg.addColorStop(0, `rgba(${tint},0.16)`);
      rg.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = rg;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(2.4, 0.5);
      ctx.translate(-x, -y);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Searchlight beams sweeping up into the smog.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = rand(80, WIDTH - 80);
      const angle = rand(-0.35, 0.35);
      ctx.save();
      ctx.translate(x, HEIGHT);
      ctx.rotate(angle);
      const bg = ctx.createLinearGradient(0, 0, 0, -HEIGHT);
      bg.addColorStop(0, 'rgba(120,220,255,0.10)');
      bg.addColorStop(1, 'rgba(120,220,255,0)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(6, 0);
      ctx.lineTo(50, -HEIGHT);
      ctx.lineTo(-50, -HEIGHT);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  });
}

// ---------------------------------------------------------------- parallax skylines

interface SkylineOpts {
  key: string;
  width: number;
  height: number;
  base: string;
  rim: string;
  h: [number, number];
  w: [number, number];
  gap: [number, number];
  win: { size: [number, number]; step: [number, number]; chance: number; colors: string[] };
  neonChance: number;
  antennaChance: number;
  billboardChance: number;
  megaTowers?: number;
}

function drawTower(ctx: Ctx, x: number, y: number, w: number, h: number, o: SkylineOpts) {
  const setback = Math.random() < 0.45;
  const capH = setback ? h * rand(0.12, 0.3) : 0;
  const capW = w * rand(0.45, 0.75);
  const capX = x + (w - capW) / 2;

  ctx.fillStyle = o.base;
  ctx.fillRect(x, y + capH, w, h - capH);
  if (setback) ctx.fillRect(capX, y, capW, capH + 1);

  // Rim light from the glowing city on the left edge.
  ctx.fillStyle = o.rim;
  ctx.fillRect(x, y + capH, 1, h - capH);
  if (setback) ctx.fillRect(capX, y, 1, capH);

  // Windows.
  const [ww, wh] = o.win.size;
  const [sx, sy] = o.win.step;
  for (let yy = y + capH + 6; yy < y + h - wh; yy += sy) {
    for (let xx = x + 3; xx < x + w - ww - 2; xx += sx) {
      if (Math.random() < o.win.chance) {
        ctx.globalAlpha = rand(0.35, 1);
        ctx.fillStyle = pick(o.win.colors);
        ctx.fillRect(xx, yy, ww, wh);
      }
    }
  }
  ctx.globalAlpha = 1;

  // Vertical neon strip.
  if (Math.random() < o.neonChance) {
    const c = pick(NEON_CSS);
    const nx = x + rand(4, w - 4);
    ctx.save();
    ctx.shadowColor = c;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(nx, y + capH + 8);
    ctx.lineTo(nx, y + capH + 8 + rand(20, h * 0.45));
    ctx.stroke();
    ctx.restore();
  }

  // Rooftop billboard.
  if (Math.random() < o.billboardChance && w > 50) {
    const c = pick(NEON_CSS);
    const bw = Math.min(w - 6, rand(40, 90));
    const bh = bw * 0.4;
    const bx = x + (w - bw) / 2;
    const by = y + capH - bh - 6;
    ctx.save();
    ctx.fillStyle = '#0a0518';
    ctx.fillRect(bx, by, bw, bh);
    ctx.shadowColor = c;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = c;
    ctx.font = `${Math.floor(bh * 0.55)}px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.random() < 0.5 ? randomGlyphs(3) : pick(SIGN_WORDS), bx + bw / 2, by + bh / 2, bw - 6);
    ctx.restore();
  }

  // Antenna with a warning light.
  if (Math.random() < o.antennaChance) {
    const ax = setback ? capX + capW / 2 : x + w / 2;
    const ah = rand(10, 40);
    ctx.strokeStyle = o.base;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, y);
    ctx.lineTo(ax, y - ah);
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = CSS.red;
    ctx.shadowBlur = 8;
    ctx.fillStyle = CSS.red;
    ctx.fillRect(ax - 1.5, y - ah - 2, 3, 3);
    ctx.restore();
  }
}

function makeSkyline(scene: Phaser.Scene, o: SkylineOpts) {
  canvasTexture(scene, o.key, o.width, o.height, (ctx) => {
    const towers: Array<[number, number, number, number]> = [];
    let x = 0;
    while (x < o.width) {
      const w = rand(...o.w);
      const h = rand(...o.h);
      towers.push([x, o.height - h, w, h]);
      x += w + rand(...o.gap);
    }
    for (let i = 0; i < (o.megaTowers ?? 0); i++) {
      const w = rand(140, 220);
      const h = o.height * rand(0.85, 0.97);
      towers.splice(randInt(0, towers.length), 0, [rand(0, o.width - w), o.height - h, w, h]);
    }
    // Draw each tower twice when it crosses the right edge, so the strip tiles seamlessly.
    for (const [tx, ty, tw, th] of towers) {
      drawTower(ctx, tx, ty, tw, th, o);
      if (tx + tw > o.width) drawTower(ctx, tx - o.width, ty, tw, th, o);
    }
  });
}

function makeSkylines(scene: Phaser.Scene) {
  makeSkyline(scene, {
    key: 'skyline-far',
    width: 2048,
    height: 540,
    base: '#1d0e36',
    rim: '#4a2580',
    h: [180, 430],
    w: [40, 120],
    gap: [-20, 10],
    win: { size: [1, 2], step: [4, 6], chance: 0.14, colors: ['#ff7ad9', '#7ae2ff', '#ffd27a'] },
    neonChance: 0.12,
    antennaChance: 0.4,
    billboardChance: 0,
    megaTowers: 3,
  });
  makeSkyline(scene, {
    key: 'skyline-mid',
    width: 1792,
    height: 420,
    base: '#130a26',
    rim: '#6b2fa3',
    h: [120, 360],
    w: [50, 140],
    gap: [-10, 24],
    win: { size: [2, 3], step: [6, 8], chance: 0.18, colors: [CSS.cyan, CSS.yellow, '#ff7ad9'] },
    neonChance: 0.35,
    antennaChance: 0.35,
    billboardChance: 0.2,
  });
  makeSkyline(scene, {
    key: 'skyline-near',
    width: 1536,
    height: 340,
    base: '#0a0617',
    rim: '#8a2be2',
    h: [90, 280],
    w: [70, 180],
    gap: [0, 50],
    win: { size: [3, 4], step: [9, 12], chance: 0.12, colors: [CSS.cyan, CSS.yellow, CSS.magenta] },
    neonChance: 0.5,
    antennaChance: 0.3,
    billboardChance: 0.3,
  });
}

function makeFog(scene: Phaser.Scene) {
  canvasTexture(scene, 'fog', 4, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,60,140,0)');
    g.addColorStop(0.55, 'rgba(255,60,140,0.22)');
    g.addColorStop(1, 'rgba(120,30,160,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 128);
  });
}

// ---------------------------------------------------------------- runner

const SHEET_COLS = 16;

/** One sprite sheet per clothing palette (`runner0`, `runner1`, …), all with the same frame names. */
function makeRunner(scene: Phaser.Scene) {
  const { w, h, originX, groundY } = FRAME;
  const frames = sheetFrames(RUNNER_STYLE.run);
  const rows = Math.ceil(frames.length / SHEET_COLS);
  PALETTES.forEach((pal, p) => {
    const tex = canvasTexture(scene, `runner${p}`, w * SHEET_COLS, h * rows, (ctx) => {
      frames.forEach((f, i) => {
        ctx.save();
        ctx.translate((i % SHEET_COLS) * w + originX, Math.floor(i / SHEET_COLS) * h + groundY);
        drawRunner(ctx, f.pose, pal);
        ctx.restore();
      });
    });
    frames.forEach((f, i) => tex.add(f.name, 0, (i % SHEET_COLS) * w, Math.floor(i / SHEET_COLS) * h, w, h));
  });
}

// ---------------------------------------------------------------- small sprites

function makeSmallSprites(scene: Phaser.Scene) {
  canvasTexture(scene, 'rain', 2, 22, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 22);
    g.addColorStop(0, 'rgba(180,230,255,0)');
    g.addColorStop(1, 'rgba(200,240,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 22);
  });

  canvasTexture(scene, 'spark', 8, 8, (ctx) => {
    const g = ctx.createRadialGradient(4, 4, 0, 4, 4, 4);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 8);
  });

  canvasTexture(scene, 'shard', 6, 4, (ctx) => {
    ctx.fillStyle = 'rgba(200,250,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(6, 1);
    ctx.lineTo(2, 4);
    ctx.closePath();
    ctx.fill();
  });

  canvasTexture(scene, 'crate', 30, 30, (ctx) => {
    ctx.fillStyle = '#1a1530';
    ctx.fillRect(0, 0, 30, 30);
    // Hazard stripe band.
    ctx.save();
    ctx.beginPath();
    ctx.rect(2, 11, 26, 8);
    ctx.clip();
    for (let x = -10; x < 40; x += 8) {
      ctx.fillStyle = CSS.yellow;
      ctx.beginPath();
      ctx.moveTo(x, 19);
      ctx.lineTo(x + 4, 19);
      ctx.lineTo(x + 8, 11);
      ctx.lineTo(x + 4, 11);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = CSS.cyan;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 28, 28);
  });

  // Scanline overlay tile.
  canvasTexture(scene, 'scanlines', 4, 4, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 4, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, 1, 4, 1);
  });

  canvasTexture(scene, 'blink', 10, 10, (ctx) => {
    const g = ctx.createRadialGradient(5, 5, 0, 5, 5, 5);
    g.addColorStop(0, 'rgba(255,60,60,1)');
    g.addColorStop(0.4, 'rgba(255,23,68,0.8)');
    g.addColorStop(1, 'rgba(255,23,68,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 10, 10);
  });
}

function makeCar(scene: Phaser.Scene) {
  // Faces right; flipped for cars flying left.
  canvasTexture(scene, 'car', 40, 14, (ctx) => {
    ctx.fillStyle = '#1b1430';
    ctx.beginPath();
    ctx.moveTo(4, 8);
    ctx.lineTo(10, 3);
    ctx.lineTo(26, 3);
    ctx.lineTo(34, 7);
    ctx.lineTo(34, 10);
    ctx.lineTo(4, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3d2f6b';
    ctx.fillRect(12, 4, 12, 3);
    ctx.save();
    ctx.shadowColor = CSS.red;
    ctx.shadowBlur = 6;
    ctx.fillStyle = CSS.red;
    ctx.fillRect(2, 7, 4, 2);
    ctx.shadowColor = '#ffffff';
    ctx.fillStyle = '#eaffff';
    ctx.fillRect(33, 7, 4, 2);
    ctx.shadowColor = CSS.cyan;
    ctx.fillStyle = CSS.cyan;
    ctx.fillRect(8, 11, 22, 1.5);
    ctx.restore();
  });
}

export const HOLO_COUNT = 4;

function makeHolos(scene: Phaser.Scene) {
  for (let i = 0; i < HOLO_COUNT; i++) {
    const c = [CSS.cyan, CSS.pink, CSS.yellow, CSS.cyan][i];
    canvasTexture(scene, `holo${i}`, 160, 96, (ctx) => {
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.1;
      ctx.fillRect(4, 4, 152, 88);
      ctx.globalAlpha = 1;
      ctx.shadowColor = c;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 4, 152, 88);
      ctx.fillStyle = c;
      ctx.strokeStyle = c;
      ctx.lineWidth = 3;
      switch (i) {
        case 0: // Eye.
          ctx.beginPath();
          ctx.ellipse(48, 48, 30, 16, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(48, 48, 8, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 1: // Fish-like swoosh.
          ctx.beginPath();
          ctx.moveTo(20, 50);
          ctx.quadraticCurveTo(50, 18, 78, 48);
          ctx.quadraticCurveTo(50, 76, 20, 50);
          ctx.moveTo(78, 48);
          ctx.lineTo(90, 36);
          ctx.lineTo(90, 60);
          ctx.closePath();
          ctx.stroke();
          break;
        case 2: // Triangle mark.
          ctx.beginPath();
          ctx.moveTo(48, 20);
          ctx.lineTo(76, 72);
          ctx.lineTo(20, 72);
          ctx.closePath();
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(48, 54, 6, 0, Math.PI * 2);
          ctx.fill();
          break;
        default: // Bar chart.
          for (let b = 0; b < 5; b++) {
            const bh = rand(14, 56);
            ctx.fillRect(18 + b * 14, 76 - bh, 8, bh);
          }
      }
      ctx.font = `20px ${FONT_MONO}`;
      ctx.textBaseline = 'top';
      const word = pick(SIGN_WORDS);
      ctx.fillText(word.slice(0, 6), 98, 20, 54);
      ctx.font = `16px ${FONT_MONO}`;
      ctx.fillText(randomGlyphs(3), 100, 48, 52);
      ctx.fillText(randomGlyphs(3), 100, 68, 52);
      // Hologram interference lines.
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'destination-out';
      for (let y = 0; y < 96; y += 3) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, y, 160, 1);
      }
      ctx.globalCompositeOperation = 'source-over';
    });
  }
}
