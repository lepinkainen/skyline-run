import Phaser from 'phaser';
import { CSS, FONT_DISPLAY, FONT_MONO, HEIGHT, PAL, RUN, RUNNER_STYLE, WIDTH } from '../config';
import { AIR_FRAMES, FRAME, JUMP_KEYS, type JumpStyle, LAND_EXIT_PHASE, LAND_FRAMES, LAND_TIME, PALETTES, RUN_FRAMES, cadence } from '../runner';
import { HOLO_COUNT } from '../textures';
import { BuildingGenerator } from '../world/Buildings';

type State = 'ready' | 'running' | 'dying' | 'over';

interface ParallaxLayer {
  obj: Phaser.GameObjects.TileSprite | Phaser.GameObjects.Image;
  factor: number;
  baseY: number;
}

interface Flyer {
  img: Phaser.GameObjects.Image;
  factor: number;
  /** Own screen-space velocity in px/s, before parallax drift. */
  vx: number;
}

const BEST_KEY = 'skyline-run.best';
const START_TOP = 380;
const BASE_LEAD = 230;

export class GameScene extends Phaser.Scene {
  private gen!: BuildingGenerator;
  private player!: Phaser.GameObjects.Sprite;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;

  private state: State = 'ready';
  private px = 0;
  private py = START_TOP;
  private vy = 0;
  private speed = RUN.startSpeed;
  private grounded = true;
  private clock = 0;
  private lastGroundedAt = 0;
  private jumpPressedAt = -Infinity;
  private jumpHeld = false;
  private jumpTime = 0;
  private slammed = false;
  private runPhase = 0;
  private landT = Infinity;
  private skin = -1;
  private jumpStyle: JumpStyle = 'leap';
  private camLead = BASE_LEAD;
  private prevScrollX = 0;
  private canRestart = false;

  private layers: ParallaxLayer[] = [];
  private cars: Flyer[] = [];
  private holos: Flyer[] = [];
  private carTimer = 0;
  private holoAcc = 0;
  private nextHoloGap = 400;

  private distText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private titleGroup!: Phaser.GameObjects.Container;

  constructor() {
    super('game');
  }

  create() {
    // Scene.restart reuses this instance, so reset all run state.
    Object.assign(this, {
      state: 'ready', px: 0, py: START_TOP, vy: 0, speed: RUN.startSpeed, grounded: true, clock: 0,
      lastGroundedAt: 0, jumpPressedAt: -Infinity, jumpHeld: false, jumpTime: 0, slammed: false, runPhase: 0, landT: Infinity,
      camLead: BASE_LEAD, canRestart: false, layers: [], cars: [], holos: [], carTimer: 0, holoAcc: 0,
    });

    this.createBackground();
    this.gen = new BuildingGenerator(this);
    this.gen.start(-400, START_TOP, 1500);

    this.pickJumpStyle();
    // New outfit every run, never the same one twice in a row.
    this.skin = (this.skin + Phaser.Math.Between(1, PALETTES.length - 1) + PALETTES.length) % PALETTES.length;
    this.player = this.add.sprite(this.px, this.py, `runner${this.skin}`, 'stand')
      .setOrigin(FRAME.originX / FRAME.w, FRAME.groundY / FRAME.h).setDepth(12);

    this.dust = this.add.particles(0, 0, 'spark', {
      emitting: false,
      lifespan: 450,
      speed: { min: 40, max: 160 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.9, end: 0 },
      gravityY: 400,
      tint: [PAL.cyan, PAL.magenta, 0xffffff],
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(13);

    this.sparks = this.add.particles(0, 0, 'shard', {
      emitting: false,
      lifespan: 700,
      speed: { min: 120, max: 380 },
      angle: { min: 220, max: 330 },
      rotate: { min: 0, max: 360 },
      gravityY: 900,
      tint: [PAL.yellow, PAL.cyan],
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(13);

    this.createRain();
    this.createOverlay();
    this.createHud();
    this.setupCamera();
    this.setupInput();

    this.gen.fill(WIDTH + 600, this.speed);
    this.updateCamera(0);
    this.prevScrollX = this.cameras.main.scrollX;
  }

  // ------------------------------------------------------------ setup

  private createBackground() {
    this.add.image(0, 0, 'sky').setOrigin(0).setScrollFactor(0).setDepth(0);

    const tile = (key: string, factor: number, baseY: number, depth: number) => {
      const src = this.textures.get(key).getSourceImage();
      const obj = this.add.tileSprite(0, baseY, WIDTH, src.height, key).setOrigin(0, 1).setScrollFactor(0).setDepth(depth);
      this.layers.push({ obj, factor, baseY });
    };
    const fog = (y: number, factor: number, depth: number, alpha: number) => {
      const obj = this.add.image(0, y, 'fog').setOrigin(0, 0.5).setDisplaySize(WIDTH, 170).setScrollFactor(0).setDepth(depth).setAlpha(alpha);
      this.layers.push({ obj, factor, baseY: y });
    };

    tile('skyline-far', 0.05, 600, 1);
    fog(420, 0.1, 2.5, 1);
    tile('skyline-mid', 0.15, 615, 3);
    fog(480, 0.25, 4.5, 0.8);
    tile('skyline-near', 0.33, 650, 5);
    fog(560, 0.4, 6, 0.6);

    // A few flyers and a hologram on screen from the first frame.
    for (let i = 0; i < 5; i++) this.spawnCar(Phaser.Math.Between(0, WIDTH));
    this.spawnHolo(Phaser.Math.Between(400, 800));
  }

  private createRain() {
    const angle = Phaser.Math.RadToDeg(Math.atan2(1150, -260)) - 90;
    this.add
      .particles(0, 0, 'rain', {
        x: { min: -100, max: WIDTH + 250 },
        y: -30,
        lifespan: 650,
        speedX: { min: -280, max: -240 },
        speedY: { min: 1050, max: 1250 },
        rotate: angle,
        alpha: { start: 0.45, end: 0.15 },
        scaleY: { min: 0.6, max: 1.3 },
        quantity: 3,
        frequency: 14,
        tint: 0xa8dcff,
      })
      .setScrollFactor(0)
      .setDepth(20);
  }

  private createHud() {
    const style = { fontFamily: FONT_MONO, fontSize: '28px', color: CSS.cyan };
    this.distText = this.add.text(WIDTH - 24, 18, '00000 M', style).setOrigin(1, 0).setScrollFactor(0).setDepth(40)
      .setShadow(0, 0, CSS.cyan, 10, false, true);
    this.bestText = this.add.text(WIDTH - 24, 52, `BEST ${this.formatMetres(this.loadBest())}`, { ...style, fontSize: '16px', color: CSS.magenta })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(40).setShadow(0, 0, CSS.magenta, 8, false, true);
    this.add.tileSprite(0, 0, WIDTH, HEIGHT, 'scanlines').setOrigin(0).setScrollFactor(0).setDepth(30).setAlpha(0.35);
  }

  private createOverlay() {
    const title = this.add.text(WIDTH / 2, 150, 'SKYLINE//RUN', {
      fontFamily: FONT_DISPLAY, fontStyle: '900', fontSize: '68px', color: CSS.yellow,
    }).setOrigin(0.5).setShadow(4, 0, CSS.magenta, 0, false, true);
    const sub = this.add.text(WIDTH / 2, 218, 'SPACE · CLICK · TAP  —  HOLD TO JUMP HIGHER', {
      fontFamily: FONT_MONO, fontSize: '20px', color: CSS.cyan,
    }).setOrigin(0.5).setShadow(0, 0, CSS.cyan, 8, false, true);
    this.tweens.add({ targets: sub, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    this.titleGroup = this.add.container(0, 0, [title, sub]).setScrollFactor(0).setDepth(40);
  }

  private setupCamera() {
    const cam = this.cameras.main;
    // Bloom: blur only the bright neon parts of the frame and add them back on top.
    const bloom = cam.filters.external.addParallelFilters();
    bloom.top.addThreshold(0.5, 0.95);
    bloom.top.addBlur(1, 2, 2, 1.3);
    bloom.blend.blendMode = Phaser.BlendModes.ADD;
    bloom.blend.amount = 0.85;
    cam.filters.external.addVignette(0.5, 0.5, 0.95, 0.35);
  }

  private setupInput() {
    const jumpKeys = new Set(['Space', 'ArrowUp', 'KeyW', 'KeyZ', 'KeyX']);
    const kb = this.input.keyboard!;
    kb.on('keydown', (e: KeyboardEvent) => {
      if (!jumpKeys.has(e.code) || e.repeat) return;
      e.preventDefault();
      this.press();
    });
    kb.on('keyup', (e: KeyboardEvent) => {
      if (jumpKeys.has(e.code)) this.jumpHeld = false;
    });
    this.input.on('pointerdown', () => this.press());
    this.input.on('pointerup', () => (this.jumpHeld = false));
  }

  private press() {
    this.jumpHeld = true;
    if (this.state === 'ready') {
      this.state = 'running';
      this.tweens.add({ targets: this.titleGroup, alpha: 0, y: -40, duration: 300, onComplete: () => this.titleGroup.setVisible(false) });
    } else if (this.state === 'over' && this.canRestart) {
      this.scene.restart();
      return;
    }
    this.jumpPressedAt = this.clock;
  }

  // ------------------------------------------------------------ loop

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 1 / 30);
    this.clock += dt;

    if (this.state === 'running') {
      this.speed = Math.min(this.speed + RUN.accel * dt, RUN.maxSpeed);
      this.tryJump();
    }
    if (this.state === 'running' || this.state === 'dying') {
      this.stepPhysics(dt);
      this.checkCrates();
      this.updatePlayerAnim(dt);
    }

    this.updateCamera(dt);
    const cam = this.cameras.main;
    const camDX = cam.scrollX - this.prevScrollX;
    this.prevScrollX = cam.scrollX;

    this.gen.fill(cam.scrollX + WIDTH + 600, this.speed);
    this.gen.cull(cam.scrollX - 300);
    this.updateBackground(dt, camDX);

    if ((this.state === 'running' || this.state === 'dying') && this.py > cam.scrollY + HEIGHT + 60) {
      this.gameOver();
    }
    if (this.state === 'running') this.distText.setText(this.formatMetres(this.distance()));
  }

  private tryJump() {
    const buffered = this.clock - this.jumpPressedAt <= RUN.jumpBuffer;
    const onGround = this.grounded || this.clock - this.lastGroundedAt <= RUN.coyoteTime;
    if (!buffered || !onGround || this.vy < 0) return;
    this.vy = -RUN.jumpVelocity;
    this.pickJumpStyle();
    this.jumpTime = 0;
    this.grounded = false;
    this.lastGroundedAt = -Infinity;
    this.jumpPressedAt = -Infinity;
    this.dust.explode(6, this.px, this.py);
  }

  private pickJumpStyle() {
    this.jumpStyle = RUNNER_STYLE.jump === 'random' ? Phaser.Math.RND.pick(JUMP_KEYS) : RUNNER_STYLE.jump;
  }

  private stepPhysics(dt: number) {
    const hw = RUN.halfWidth;
    const prevX = this.px;
    const prevY = this.py;
    const prevVy = this.vy;

    this.px += (this.slammed ? 0 : this.speed) * dt;

    const rising = this.vy < 0 && this.jumpHeld && this.jumpTime < RUN.holdMax;
    this.vy = Math.min(this.vy + (rising ? RUN.holdGravity : RUN.gravity) * dt, RUN.maxFall);
    this.jumpTime += dt;
    this.py += this.vy * dt;

    const wasGrounded = this.grounded;
    this.grounded = false;
    for (const b of this.gen.buildings) {
      const overlapsX = this.px + hw > b.x && this.px - hw < b.x + b.w;
      if (this.vy >= 0 && overlapsX && prevY <= b.top && this.py >= b.top) {
        this.py = b.top;
        this.vy = 0;
        this.grounded = true;
        this.lastGroundedAt = this.clock;
        if (!wasGrounded) this.onLand(prevVy);
      }
      // Running into the side of a taller building.
      if (!this.slammed && prevX + hw <= b.x && this.px + hw > b.x && this.py > b.top + 4) {
        this.px = b.x - hw;
        this.slam();
      }
    }
  }

  private onLand(impactVy: number) {
    if (this.state !== 'running') return;
    this.landT = 0;
    const hard = impactVy > 900;
    this.dust.explode(hard ? 14 : 6, this.px, this.py);
    if (hard) this.cameras.main.shake(120, 0.004);
  }

  private slam() {
    this.slammed = true;
    this.state = 'dying';
    this.vy = Math.max(this.vy, 0);
    this.player.setFrame(`${this.jumpStyle}-air${AIR_FRAMES - 3}`).setTint(0xff6b9a);
    this.tweens.add({ targets: this.player, angle: -25, duration: 200 });
    this.sparks.explode(18, this.px + RUN.halfWidth, this.py - RUN.height / 2);
    this.glitch();
  }

  private checkCrates() {
    const hw = RUN.halfWidth;
    const left = this.px - hw;
    const right = this.px + hw;
    const top = this.py - RUN.height;
    for (const c of this.gen.crates) {
      if (c.hit) continue;
      if (right > c.x && left < c.x + c.size && this.py > c.y - c.size && top < c.y) {
        c.hit = true;
        this.speed = Math.max(this.speed * RUN.crateSlowdown, RUN.startSpeed * 0.7);
        this.sparks.explode(12, c.x, c.y - c.size / 2);
        this.cameras.main.shake(90, 0.003);
        this.tweens.add({
          targets: c.sprite,
          x: c.sprite.x + Phaser.Math.Between(180, 300),
          y: c.sprite.y - Phaser.Math.Between(40, 110),
          angle: Phaser.Math.Between(200, 500),
          alpha: 0,
          duration: 650,
          ease: 'Quad.easeOut',
        });
      }
    }
  }

  private updatePlayerAnim(dt: number) {
    this.player.setPosition(this.px, this.py);
    if (this.state !== 'running') return;
    if (!this.grounded) {
      // The pose follows vertical speed: take-off → apex → fall.
      const t = Phaser.Math.Clamp(0.5 + this.vy / (2 * RUN.jumpVelocity), 0, 1);
      this.player.setFrame(`${this.jumpStyle}-air${Math.round(t * (AIR_FRAMES - 1))}`);
    } else if (this.landT < LAND_TIME) {
      this.landT += dt;
      this.runPhase = LAND_EXIT_PHASE;
      this.player.setFrame(`${this.jumpStyle}-land${Math.min(LAND_FRAMES - 1, Math.floor((this.landT / LAND_TIME) * LAND_FRAMES))}`);
    } else {
      this.runPhase = (this.runPhase + cadence(RUNNER_STYLE.run, this.speed / RUN.startSpeed) * dt) % 1;
      this.player.setFrame(`run${Math.floor(this.runPhase * RUN_FRAMES)}`);
    }
  }

  private updateCamera(dt: number) {
    const cam = this.cameras.main;
    // Pull the camera ahead as the run gets faster so there is more time to see gaps.
    const targetLead = BASE_LEAD - (this.speed - RUN.startSpeed) * 0.15;
    this.camLead += (targetLead - this.camLead) * Math.min(1, dt * 2);
    if (!this.slammed) cam.scrollX = this.px - this.camLead;
    const targetY = Phaser.Math.Clamp(this.py - 330, -140, 80);
    cam.scrollY = dt === 0 ? targetY : cam.scrollY + (targetY - cam.scrollY) * Math.min(1, dt * 4);
  }

  private updateBackground(dt: number, camDX: number) {
    const cam = this.cameras.main;
    for (const l of this.layers) {
      if (l.obj instanceof Phaser.GameObjects.TileSprite) l.obj.tilePositionX = cam.scrollX * l.factor;
      l.obj.y = l.baseY - cam.scrollY * l.factor;
    }

    this.carTimer -= dt;
    if (this.carTimer <= 0) {
      this.spawnCar();
      this.carTimer = Phaser.Math.FloatBetween(0.4, 1.4);
    }
    this.cars = this.cars.filter((c) => {
      c.img.x += c.vx * dt - camDX * c.factor;
      if (c.img.x < -120 || c.img.x > WIDTH + 120) {
        c.img.destroy();
        return false;
      }
      return true;
    });

    this.holoAcc += camDX * 0.22;
    if (this.holoAcc > this.nextHoloGap) {
      this.holoAcc = 0;
      this.nextHoloGap = Phaser.Math.Between(500, 1100);
      this.spawnHolo(WIDTH + 120);
    }
    this.holos = this.holos.filter((h) => {
      h.img.x -= camDX * h.factor;
      if (h.img.x < -150) {
        h.img.destroy();
        return false;
      }
      return true;
    });
  }

  private spawnCar(x?: number) {
    const factor = Phaser.Math.FloatBetween(0.08, 0.45);
    let vx = Phaser.Math.Between(140, 420) * (Math.random() < 0.5 ? -1 : 1);
    const drift = this.speed * factor;
    if (x === undefined) x = vx - drift > 0 ? -60 : WIDTH + 60;
    // Cars far behind cannot fly fast enough to overtake the parallax drift; flip them.
    if (x < 0 && vx - drift <= 0) vx = -vx;
    const depth = factor < 0.15 ? 2 : factor < 0.3 ? 4 : 5.5;
    const img = this.add
      .image(x, Phaser.Math.Between(50, 300) - this.cameras.main.scrollY * factor, 'car')
      .setScrollFactor(0)
      .setDepth(depth)
      .setScale(0.4 + factor * 1.6)
      .setAlpha(0.55 + factor)
      .setFlipX(vx < 0);
    this.cars.push({ img, factor, vx });
  }

  private spawnHolo(x: number) {
    const factor = 0.22;
    const img = this.add
      .image(x, Phaser.Math.Between(150, 260), `holo${Phaser.Math.Between(0, HOLO_COUNT - 1)}`)
      .setScrollFactor(0)
      .setDepth(4)
      .setScale(Phaser.Math.FloatBetween(0.8, 1.15))
      .setAlpha(0.8)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: img, y: img.y - 8, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const ev = this.time.addEvent({
      delay: Phaser.Math.Between(900, 2600),
      loop: true,
      callback: () => {
        img.setAlpha(0.25);
        this.time.delayedCall(60, () => img.active && img.setAlpha(0.8));
      },
    });
    img.once(Phaser.GameObjects.Events.DESTROY, () => ev.remove());
    this.holos.push({ img, factor, vx: 0 });
  }

  // ------------------------------------------------------------ game over

  private glitch() {
    const cam = this.cameras.main;
    cam.shake(280, 0.012);
    cam.flash(160, 255, 42, 109);
    const blocky = cam.filters.external.addBlocky({ size: 7 });
    this.time.delayedCall(260, () => cam.filters.external.remove(blocky));
  }

  private gameOver() {
    if (!this.slammed) this.glitch();
    this.state = 'over';
    this.player.setVisible(false);

    const dist = this.distance();
    const best = Math.max(dist, this.loadBest());
    this.saveBest(best);
    this.distText.setText(this.formatMetres(dist));
    this.bestText.setText(`BEST ${this.formatMetres(best)}`);

    const band = this.add.rectangle(WIDTH / 2, HEIGHT / 2 - 20, WIDTH, 210, 0x05010f, 0.72);
    const head = this.add.text(WIDTH / 2, HEIGHT / 2 - 80, 'FLATLINED', {
      fontFamily: FONT_DISPLAY, fontStyle: '900', fontSize: '60px', color: CSS.magenta,
    }).setOrigin(0.5).setShadow(-4, 0, CSS.cyan, 0, false, true);
    const how = this.slammed ? 'HIT A WALL' : 'FELL';
    const stats = this.add.text(WIDTH / 2, HEIGHT / 2 - 10, `${how} AFTER ${dist} M${dist >= best && dist > 0 ? '  ·  NEW BEST' : ''}`, {
      fontFamily: FONT_MONO, fontSize: '24px', color: CSS.yellow,
    }).setOrigin(0.5).setShadow(0, 0, CSS.yellow, 8, false, true);
    const retry = this.add.text(WIDTH / 2, HEIGHT / 2 + 40, 'PRESS TO REBOOT', {
      fontFamily: FONT_MONO, fontSize: '20px', color: CSS.cyan,
    }).setOrigin(0.5).setAlpha(0);
    const group = this.add.container(0, 0, [band, head, stats, retry]).setScrollFactor(0).setDepth(40).setAlpha(0);
    this.tweens.add({ targets: group, alpha: 1, duration: 250 });
    this.time.delayedCall(700, () => {
      this.canRestart = true;
      retry.setAlpha(1);
      this.tweens.add({ targets: retry, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
    });
  }

  private distance() {
    return Math.max(0, Math.floor(this.px / RUN.pxPerMetre));
  }

  private formatMetres(m: number) {
    return `${String(m).padStart(5, '0')} M`;
  }

  private loadBest(): number {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  private saveBest(m: number) {
    try {
      localStorage.setItem(BEST_KEY, String(m));
    } catch {
      // Storage may be unavailable (private mode); the best score just won't persist.
    }
  }
}
