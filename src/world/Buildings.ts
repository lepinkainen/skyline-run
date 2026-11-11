import Phaser from 'phaser';
import { FONT_MONO, NEON, NEON_CSS, RUN, SIGN_WORDS, pick, randomGlyphs } from '../config';

export interface Building {
  x: number;
  top: number;
  w: number;
  objects: Phaser.GameObjects.GameObject[];
}

export interface Crate {
  x: number;
  /** World y of the crate's bottom edge (the roof it sits on). */
  y: number;
  size: number;
  sprite: Phaser.GameObjects.Image;
  hit: boolean;
}

const FACE_COLORS = [0x0d0a1c, 0x100c24, 0x0a0f1f, 0x120a1a];
const BUILDING_DEPTH = 10;
/** Facades are drawn down to this world y; the camera never shows lower. */
const FACADE_BOTTOM = 720;

const between = Phaser.Math.Between;
const fbetween = Phaser.Math.FloatBetween;

/**
 * Lays out rooftops ahead of the player so every gap stays jumpable at the current speed.
 */
export class BuildingGenerator {
  readonly buildings: Building[] = [];
  readonly crates: Crate[] = [];

  constructor(private scene: Phaser.Scene) {}

  /** Creates the starting rooftop under the player. */
  start(x: number, top: number, w: number) {
    this.add(x, top, w, false);
  }

  /** Spawns buildings until the world is filled up to `rightEdge`. */
  fill(rightEdge: number, speed: number) {
    while (this.lastRight() < rightEdge) this.spawnNext(speed);
  }

  /** Destroys buildings and crates that have scrolled off the left edge. */
  cull(leftEdge: number) {
    while (this.buildings.length && this.buildings[0].x + this.buildings[0].w < leftEdge) {
      const b = this.buildings.shift()!;
      b.objects.forEach((o) => o.destroy());
    }
    for (let i = this.crates.length - 1; i >= 0; i--) {
      const c = this.crates[i];
      if (c.x + c.size < leftEdge) {
        c.sprite.destroy();
        this.crates.splice(i, 1);
      }
    }
  }

  private lastRight() {
    const b = this.buildings[this.buildings.length - 1];
    return b ? b.x + b.w : -Infinity;
  }

  private spawnNext(speed: number) {
    const last = this.buildings[this.buildings.length - 1];
    const v = Math.max(speed, RUN.startSpeed);

    // Rising more than ~100px needs nearly a full held jump, so keep rises modest and their gaps shorter.
    const rise = Phaser.Math.Clamp(between(-150, 100), last.top - 460, last.top - 220);
    const top = last.top - rise;
    const gapFactor = rise > 40 ? fbetween(0.16, 0.4) : fbetween(0.18, 0.55);
    const gap = Phaser.Math.Clamp(v * gapFactor, 60, 460);
    const w = between(420, 1000) + v * 0.6;
    this.add(last.x + last.w + gap, top, w, true);
  }

  private add(x: number, top: number, w: number, withCrates: boolean) {
    const b: Building = { x, top, w, objects: [] };
    this.decorate(b);
    if (withCrates) this.addCrates(b);
    this.buildings.push(b);
  }

  private addCrates(b: Building) {
    const count = Math.random() < 0.55 ? between(1, 2) : 0;
    for (let i = 0; i < count; i++) {
      const size = 30;
      const x = fbetween(b.x + 160, b.x + b.w - 220);
      const sprite = this.scene.add.image(x + size / 2, b.top - size / 2, 'crate').setDepth(BUILDING_DEPTH + 1);
      this.crates.push({ x, y: b.top, size, sprite, hit: false });
    }
  }

  private decorate(b: Building) {
    const s = this.scene;
    const H = FACADE_BOTTOM - b.top;
    const trim = pick(NEON);
    const g = s.add.graphics({ x: b.x, y: b.top }).setDepth(BUILDING_DEPTH);
    b.objects.push(g);

    // Facade and shaded right edge.
    g.fillStyle(pick(FACE_COLORS), 1).fillRect(0, 0, b.w, H);
    g.fillStyle(0x000000, 0.4).fillRect(b.w - 12, 0, 12, H);
    g.fillStyle(0xffffff, 0.04).fillRect(0, 0, 3, H);

    // Window grid, mostly dark with a few lit apartments.
    const litColors = [0x7ae2ff, 0xffd27a, 0xff7ad9, 0xb0ffdf];
    for (let y = 34; y < H - 10; y += 30) {
      for (let x = 16; x < b.w - 28; x += 26) {
        if (Math.random() < 0.13) g.fillStyle(pick(litColors), fbetween(0.35, 0.8));
        else g.fillStyle(0x161432, 1);
        g.fillRect(x, y, 13, 17);
      }
    }

    // Horizontal neon band across a floor.
    if (Math.random() < 0.35) {
      const y = between(60, 200);
      const c = pick(NEON);
      g.fillStyle(c, 0.18).fillRect(0, y - 3, b.w, 8);
      g.fillStyle(c, 0.9).fillRect(0, y, b.w, 2);
    }

    // Rooftop ledge with a neon trim line.
    g.fillStyle(0x221c3d, 1).fillRect(-4, 0, b.w + 8, 9);
    g.fillStyle(trim, 0.22).fillRect(-4, -3, b.w + 8, 7);
    g.fillStyle(trim, 1).fillRect(-4, 0, b.w + 8, 2);

    this.addRoofProps(b, g);
    if (Math.random() < 0.6) this.addVerticalSign(b);
  }

  private addRoofProps(b: Building, g: Phaser.GameObjects.Graphics) {
    const s = this.scene;
    // Props are decorative and never collide, so they stay low enough not to look like obstacles.
    let x = between(40, 160);
    while (x < b.w - 120) {
      const kind = Math.random();
      if (kind < 0.35) {
        // AC unit with a fan.
        g.fillStyle(0x2a2346, 1).fillRect(x, -16, 34, 16);
        g.lineStyle(1.5, 0x4a3f75, 1).strokeCircle(x + 17, -8, 5);
        x += 34;
      } else if (kind < 0.55) {
        // Antenna with a blinking warning light.
        const h = between(40, 90);
        g.lineStyle(2, 0x2f2850, 1).lineBetween(x, 0, x, -h);
        g.lineBetween(x, -h * 0.6, x + 8, -h * 0.6);
        const light = s.add.image(b.x + x, b.top - h, 'blink').setDepth(BUILDING_DEPTH);
        s.tweens.add({ targets: light, alpha: 0.15, duration: between(500, 900), yoyo: true, repeat: -1, delay: between(0, 600) });
        b.objects.push(light);
        x += 10;
      } else if (kind < 0.7 && b.w > 600) {
        this.addBillboard(b, x);
        x += 150;
      } else {
        // Water tank.
        g.fillStyle(0x1d1835, 1).fillRect(x, -26, 22, 20);
        g.lineStyle(2, 0x2f2850, 1).lineBetween(x + 3, -6, x + 3, 0).lineBetween(x + 19, -6, x + 19, 0);
        x += 22;
      }
      x += between(120, 320);
    }
  }

  private addBillboard(b: Building, x: number) {
    const s = this.scene;
    const ci = between(0, NEON.length - 1);
    const w = 130;
    const h = 46;
    const bx = b.x + x;
    const by = b.top - h - 34;
    const g = s.add.graphics({ x: bx, y: by }).setDepth(BUILDING_DEPTH - 1);
    g.lineStyle(3, 0x2a2346, 1).lineBetween(16, h, 16, h + 34).lineBetween(w - 16, h, w - 16, h + 34);
    g.fillStyle(0x08051a, 0.95).fillRect(0, 0, w, h);
    g.fillStyle(NEON[ci], 0.18).fillRect(-3, -3, w + 6, h + 6);
    g.lineStyle(2, NEON[ci], 1).strokeRect(0, 0, w, h);
    const text = Math.random() < 0.5 ? pick(SIGN_WORDS) : randomGlyphs(4);
    const t = s.add
      .text(bx + w / 2, by + h / 2, text, { fontFamily: FONT_MONO, fontSize: '22px', color: NEON_CSS[ci] })
      .setOrigin(0.5)
      .setDepth(BUILDING_DEPTH - 1)
      .setShadow(0, 0, NEON_CSS[ci], 10, false, true);
    if (Math.random() < 0.4) this.flicker(t);
    b.objects.push(g, t);
  }

  private addVerticalSign(b: Building) {
    const s = this.scene;
    const ci = between(0, NEON.length - 1);
    const chars = between(3, 5);
    const w = 30;
    const h = chars * 24 + 12;
    const x = b.x + between(24, 90);
    const y = b.top + between(26, 60);
    const g = s.add.graphics({ x, y }).setDepth(BUILDING_DEPTH);
    g.fillStyle(0x07041a, 1).fillRect(0, 0, w, h);
    g.fillStyle(NEON[ci], 0.15).fillRect(-3, -3, w + 6, h + 6);
    g.lineStyle(2, NEON[ci], 1).strokeRect(0, 0, w, h);
    const t = s.add
      .text(x + w / 2, y + 7, randomGlyphs(chars).split('').join('\n'), {
        fontFamily: FONT_MONO,
        fontSize: '20px',
        color: NEON_CSS[ci],
        align: 'center',
        lineSpacing: 1,
      })
      .setOrigin(0.5, 0)
      .setDepth(BUILDING_DEPTH)
      .setShadow(0, 0, NEON_CSS[ci], 10, false, true);
    if (Math.random() < 0.3) this.flicker(t);
    b.objects.push(g, t);
  }

  private flicker(target: Phaser.GameObjects.GameObject & { setAlpha(a: number): unknown }) {
    const s = this.scene;
    const ev = s.time.addEvent({
      delay: between(1200, 4000),
      loop: true,
      callback: () => {
        target.setAlpha(0.2);
        s.time.delayedCall(between(40, 120), () => target.setAlpha(1));
        s.time.delayedCall(between(160, 220), () => target.setAlpha(0.3));
        s.time.delayedCall(between(240, 300), () => target.setAlpha(1));
      },
    });
    target.once(Phaser.GameObjects.Events.DESTROY, () => ev.remove());
  }
}
